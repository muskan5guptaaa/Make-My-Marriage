import { WeddingFunction } from '../models/Function.js';
import { Guest } from '../models/Guest.js';
import { generateJson, requireAi } from '../utils/ai.js';
import { AppError } from '../utils/AppError.js';
import { buildImportPrompt, IMPORT_SCHEMA, IMPORT_SYSTEM_PROMPT, importReply, maskPhones, toRows } from '../utils/guestImport.js';

// POST /weddings/:weddingId/guests/extract { text } or { image: { mimeType, data } }
// Reads a pasted list or a photo of one into guest rows. Saves nothing: the page shows the rows,
// the couple fixes or drops them, then sends the ones they keep to /guests/import.
export async function extractGuests(req, res) {
  requireAi();
  const { text, image } = req.body;
  const [functions, existing] = await Promise.all([
    WeddingFunction.find({ wedding: req.wedding._id, archivedAt: null }).sort({ startsAt: 1, order: 1 }).select('name localDate').lean(),
    Guest.find({ wedding: req.wedding._id }).select('name phone').lean(),
  ]);

  const { masked, phones } = text ? maskPhones(text) : { masked: null, phones: new Map() };
  const raw = await generateJson({
    system: IMPORT_SYSTEM_PROMPT,
    prompt: buildImportPrompt({ functions, text: masked }),
    schema: IMPORT_SCHEMA,
    images: image ? [image] : undefined,
  });
  const reply = importReply.safeParse(raw);
  if (!reply.success) {
    console.error('Guest import reply failed validation:', reply.error.issues.slice(0, 3));
    throw new AppError(502, 'ai_bad_output', "The assistant couldn't read that list. Try again, or paste it as text.");
  }

  const data = toRows(reply.data, { phones, fromPhoto: Boolean(image), functions, existing });
  res.json({ data, meta: { functions: functions.map((f) => f.name) } });
}
