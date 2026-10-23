import mongoose from 'mongoose';
import { z } from 'zod';

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optionalText = (max) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `Use at most ${max} characters.`).nullable().optional());

export const SIDES = ['bride', 'groom', 'both'];
export const GROUPS = ['family', 'friends', 'colleagues', 'other'];
export const RSVP_STATUSES = ['pending', 'yes', 'no'];
export const MAX_PLUS_ONES = 10;

const fields = {
  name: z.string().trim().min(1, "Enter the guest's name.").max(100, 'Use at most 100 characters.'),
  phone: z.preprocess(
    blankToNull,
    z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number.').nullable().optional(),
  ),
  email: z.preprocess(blankToNull, z.string().trim().toLowerCase().email('Enter a valid email address.').nullable().optional()),
  side: z.enum(SIDES, { message: 'Side must be bride, groom or both.' }).optional(),
  groupTag: z.enum(GROUPS, { message: 'Group must be family, friends, colleagues or other.' }).optional(),
  invitedFunctions: z
    .array(z.string().refine((v) => mongoose.isValidObjectId(v), 'Choose functions from this wedding.'))
    .max(50)
    .optional(),
  plusOnesAllowed: z.coerce
    .number({ message: 'Enter a number.' })
    .int('Use a whole number.')
    .min(0, 'Use 0 or more.')
    .max(MAX_PLUS_ONES, `Use at most ${MAX_PLUS_ONES}.`)
    .optional(),
  accommodationNeeded: z.boolean().optional(),
  travelNotes: optionalText(500),
  notes: optionalText(1000),
};

export const createGuestSchema = z.object(fields);

export const updateGuestSchema = z
  .object(fields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change.' });

// An answer for one function, recorded by a planner (and, later, by the guest on the portal).
export const rsvpSchema = z.object({
  status: z.enum(RSVP_STATUSES, { message: 'Answer must be pending, yes or no.' }),
  plusOnes: z.coerce.number().int('Use a whole number.').min(0, 'Use 0 or more.').optional(),
  mealPreference: optionalText(60),
  note: optionalText(500),
});

export const importSchema = z.object({
  csv: z.string().min(1, 'Choose a CSV file.').max(1_000_000, 'The file is too large. Split it into smaller files.'),
});

// A guest answering on their own link: yes or no (planners can also set pending).
export const portalRsvpSchema = z.object({
  status: z.enum(['yes', 'no'], { message: 'Choose yes or no.' }),
  plusOnes: z.coerce.number().int('Use a whole number.').min(0, 'Use 0 or more.').optional(),
  mealPreference: optionalText(60),
  note: optionalText(500),
});

export const sendInvitationsSchema = z.object({
  audience: z.enum(['not-sent', 'pending'], { message: 'Choose who to email.' }),
  dryRun: z.boolean().optional(),
});

export const deleteGuestsSchema = z.object({
  ids: z
    .array(z.string().refine((v) => mongoose.isValidObjectId(v), 'Unknown guest.'))
    .min(1, 'Choose at least one guest.')
    .max(2000, 'Delete at most 2000 guests at a time.'),
});
