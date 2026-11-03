import mongoose from 'mongoose';
import { z } from 'zod';

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optionalText = (max) => z.preprocess(blankToNull, z.string().trim().max(max, `Use at most ${max} characters.`).nullish());

// PUT /day-plans/:date: the steps the couple kept, possibly edited. Function starts aren't sent.
export const saveDayPlanSchema = z.object({
  items: z
    .array(
      z.object({
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter a time like 07:30.'),
        title: z.string().trim().min(1, 'Enter what happens.').max(120, 'Use at most 120 characters.'),
        function: z.preprocess(blankToNull, z.string().refine((v) => mongoose.isValidObjectId(v), 'Choose a function from this day.').nullish()),
        who: optionalText(80),
        notes: optionalText(300),
      }),
    )
    .max(60, 'Keep the run sheet to 60 steps.'),
});
