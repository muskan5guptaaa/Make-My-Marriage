import mongoose from 'mongoose';
import { z } from 'zod';
import { MAX_PROPOSALS, MESSAGE_AUDIENCES } from '../utils/askActions.js';
import { updateExpenseSchema } from './expense.schemas.js';
import { updateFunctionSchema } from './function.schemas.js';
import { rsvpSchema } from './guest.schemas.js';
import { createTaskSchema, updateTaskSchema } from './task.schemas.js';

const id = z.string().refine((v) => mongoose.isValidObjectId(v), 'Unknown record.');

// What the page showed for each step, kept with the plan so its history reads the same.
const shown = {
  title: z.string().trim().min(1).max(200),
  changes: z.array(z.string().max(300)).max(10).default([]),
};

// Each step's body is checked by the same schema as the matching API route.
const step = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('createTask'), ...shown, body: createTaskSchema }),
  z.object({ kind: z.literal('updateTask'), ...shown, ids: z.object({ task: id }), body: updateTaskSchema }),
  z.object({ kind: z.literal('updateExpense'), ...shown, ids: z.object({ expense: id }), body: updateExpenseSchema }),
  z.object({ kind: z.literal('setRsvp'), ...shown, ids: z.object({ guest: id, function: id }), body: rsvpSchema }),
  z.object({ kind: z.literal('updateFunction'), ...shown, ids: z.object({ function: id }), body: updateFunctionSchema }),
  z.object({
    kind: z.literal('messageGuests'),
    ...shown,
    ids: z.object({ function: id }),
    body: z.object({
      audience: z.enum(MESSAGE_AUDIENCES),
      message: z.string().trim().min(1, 'Write the message.').max(1000, 'Keep the message under 1,000 characters.'),
    }),
  }),
]);

export const applyPlanSchema = z.object({
  question: z.string().trim().max(500).optional(),
  steps: z.array(step).min(1, 'Choose at least one change.').max(MAX_PROPOSALS, `At most ${MAX_PROPOSALS} changes at once.`),
});
