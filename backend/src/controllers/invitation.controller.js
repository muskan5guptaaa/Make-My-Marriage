import { WeddingFunction } from '../models/Function.js';
import { generateJson, requireAi } from '../utils/ai.js';
import { AppError } from '../utils/AppError.js';
import { buildInvitationPrompt, INVITATION_SCHEMA, INVITATION_SYSTEM_PROMPT, invitationReply } from '../utils/invitationWriter.js';

// POST /weddings/:weddingId/invitation/draft { tone, notes? }
// Drafts the email and WhatsApp invitation words. Saves nothing: the couple edits the draft and
// saves it with PATCH /weddings/:weddingId { invitation: { email, whatsapp } }.
export async function draftInvitation(req, res) {
  requireAi();
  const functions = await WeddingFunction.find({ wedding: req.wedding._id, archivedAt: null })
    .sort({ startsAt: 1, order: 1 })
    .select('name dressCode description')
    .lean();

  const raw = await generateJson({
    system: INVITATION_SYSTEM_PROMPT,
    prompt: buildInvitationPrompt({ wedding: req.wedding, functions, tone: req.body.tone, notes: req.body.notes }),
    schema: INVITATION_SCHEMA,
  });
  const reply = invitationReply.safeParse(raw);
  if (!reply.success) {
    console.error('Invitation reply failed validation:', reply.error.issues.slice(0, 3));
    throw new AppError(502, 'ai_bad_output', "The assistant's draft didn't make sense. Try again.");
  }
  res.json({ draft: reply.data });
}
