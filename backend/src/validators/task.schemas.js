import mongoose from 'mongoose';
import { z } from 'zod';
import { isRealDate } from '../utils/time.js';

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const objectId = (message) =>
  z.preprocess(blankToNull, z.string().refine((v) => mongoose.isValidObjectId(v), message).nullable().optional());

export const TASK_STATUSES = ['todo', 'in-progress', 'done'];

const fields = {
  title: z.string().trim().min(1, 'Enter what needs doing.').max(120, 'Use at most 120 characters.'),
  description: z.preprocess(blankToNull, z.string().trim().max(1000, 'Use at most 1000 characters.').nullable().optional()),
  function: objectId('Choose a function from this wedding.'),
  assignee: objectId('Choose a member of this wedding.'),
  dueDate: z.preprocess(blankToNull, z.string().refine(isRealDate, 'Enter a valid date.').nullable().optional()),
  status: z.enum(TASK_STATUSES, { message: 'Status must be To do, In progress or Done.' }).optional(),
};

export const createTaskSchema = z.object(fields);

export const updateTaskSchema = z
  .object(fields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change.' });
