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
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change.' });

export const deleteWeddingSchema = z.object({
  confirmSlug: z.string().trim().min(1, "Type the wedding's slug to confirm."),
});
