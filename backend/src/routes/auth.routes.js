import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.schemas.js';

// 20 attempts per 15 minutes per IP on the routes people could brute-force or spam.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => env.isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'rate_limited', message: 'Too many attempts. Wait 15 minutes and try again.' } }),
});

export const authRouter = Router();

authRouter.post('/auth/register', limiter, validateBody(registerSchema), auth.register);
authRouter.post('/auth/login', limiter, validateBody(loginSchema), auth.login);
authRouter.post('/auth/logout', auth.logout);
authRouter.post('/auth/forgot-password', limiter, validateBody(forgotPasswordSchema), auth.forgotPassword);
authRouter.post('/auth/reset-password', limiter, validateBody(resetPasswordSchema), auth.resetPassword);
authRouter.get('/me', requireAuth, auth.me);
