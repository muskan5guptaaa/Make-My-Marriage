import { z } from 'zod';
import { isRealDate, youtubeVideoId } from '../utils/time.js';

// Empty strings from form inputs mean "no value".
const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = (max) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `Use at most ${max} characters.`).nullable().optional());

const fields = {
  name: z.string().trim().min(1, 'Enter a name, for example Sangeet.').max(60, 'Use at most 60 characters.'),
  localDate: z.string().refine(isRealDate, 'Enter a valid date.'),
  startTime: z.preprocess(
    blankToNull,
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time like 19:00.').nullable().optional(),
  ),
  venue: optionalText(120),
  address: optionalText(200),
  dressCode: optionalText(120),
  description: optionalText(1000),
  livestreamUrl: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .refine((v) => youtubeVideoId(v) !== null, 'Paste a YouTube video or live link.')
      .nullable()
      .optional(),
  ),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  placeId: optionalText(300),
};

export const createFunctionSchema = z.object(fields);

export const updateFunctionSchema = z
  .object(fields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change.' });
