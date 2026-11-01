import { z } from 'zod';

const isTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const brideName = z.string().trim().min(1, "Enter the bride's name.").max(60, 'Use at most 60 characters.');
const groomName = z.string().trim().min(1, "Enter the groom's name.").max(60, 'Use at most 60 characters.');
const timezone = z.string().trim().refine(isTimezone, 'Choose a valid timezone, for example Asia/Kolkata.');
const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
// Blank clears it, so the app goes back to its standard wording.
const invitationText = (max) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `Use at most ${max} characters.`).nullable());

// Unknown keys (status, slug, createdBy...) are dropped, so they can't be set from the client.
export const createWeddingSchema = z.object({
  brideName,
  groomName,
  timezone: timezone.optional(),
});

export const updateWeddingSchema = z
  .object({
    brideName: brideName.optional(),
    groomName: groomName.optional(),
    timezone: timezone.optional(),
    invitation: z
      .object({
        email: invitationText(1500).optional(),
        whatsapp: invitationText(500).optional(),
      })
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change.' });

// POST /invitation/draft: the tone to write in, and anything the couple wants mentioned.
export const INVITATION_TONES = ['warm', 'formal', 'fun'];
export const draftInvitationSchema = z.object({
  tone: z.enum(INVITATION_TONES, { message: 'Choose warm, formal or fun.' }),
  notes: z.preprocess(blankToNull, z.string().trim().max(300, 'Keep notes under 300 characters.').nullable().optional()),
});

export const deleteWeddingSchema = z.object({
  confirmSlug: z.string().trim().min(1, "Type the wedding's slug to confirm."),
});
