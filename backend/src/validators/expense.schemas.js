import mongoose from 'mongoose';
import { z } from 'zod';
import { isRealDate } from '../utils/time.js';

const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const id = (message) => z.string().refine((v) => mongoose.isValidObjectId(v), message);

export const PAID_BY = ['bride-side', 'groom-side', 'shared'];
export const PAYMENT_STATUSES = ['pending', 'partial', 'paid'];

// Up to ₹1,000 crore, in whole paise.
const paise = z.coerce
  .number({ message: 'Enter an amount.' })
  .int('Amounts are whole paise.')
  .min(0, 'Use 0 or more.')
  .max(1_000_000_000_000, 'That amount is too large.');

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a category name.').max(40, 'Use at most 40 characters.'),
});

const fields = {
  vendorName: z.string().trim().min(1, 'Enter who is being paid, for example Taj Caterers.').max(100, 'Use at most 100 characters.'),
  category: id('Choose a category.'),
  function: z.preprocess(blankToNull, id('Choose a function from this wedding.').nullable().optional()),
  budgetedAmountPaise: paise,
  actualAmountPaise: paise.optional(),
  paidBy: z.enum(PAID_BY, { message: "Choose bride's side, groom's side or shared." }).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES, { message: 'Status must be pending, partial or paid.' }).optional(),
  dueDate: z.preprocess(blankToNull, z.string().refine(isRealDate, 'Enter a valid date.').nullable().optional()),
  notes: z.preprocess(blankToNull, z.string().trim().max(1000, 'Use at most 1000 characters.').nullable().optional()),
};

export const createExpenseSchema = z.object(fields);

export const updateExpenseSchema = z
  .object(fields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change.' });
