import mongoose from 'mongoose';
import { z } from 'zod';
import { isRealDate } from '../utils/time.js';

const id = z.string().refine((v) => mongoose.isValidObjectId(v), 'Choose a function from this wedding.');

// POST /tasks/plan: which functions to plan for (none listed: every upcoming one).
export const planTasksSchema = z.object({
  functions: z.array(id).max(30).optional(),
  wholeWedding: z.boolean().optional().default(true),
});

// POST /tasks/bulk: the drafts the couple kept, possibly edited.
export const saveTasksSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Enter what needs doing.').max(120, 'Use at most 120 characters.'),
        description: z.string().trim().max(1000, 'Use at most 1000 characters.').nullish(),
        function: id.nullish(),
        dueDate: z.string().refine(isRealDate, 'Enter a valid date.').nullish(),
      }),
    )
    .min(1, 'Choose at least one task to save.')
    .max(80, 'Save at most 80 tasks at a time.'),
});
