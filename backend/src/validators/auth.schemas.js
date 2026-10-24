import { z } from 'zod';
import { phoneField } from './guest.schemas.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.');
const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use at most 72 characters.'); // bcrypt ignores bytes past 72

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100),
  email,
  phone: phoneField.optional(),
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'The reset link is missing its token.'),
  password,
});
