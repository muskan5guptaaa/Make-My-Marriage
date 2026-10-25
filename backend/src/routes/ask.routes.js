import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import * as askController from '../controllers/ask.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { askSchema } from '../validators/ask.schemas.js';

export const askRouter = Router();

// The free AI plan allows only a few requests a minute for the whole app, so each person
// gets a small share. Counted per signed-in user, not per network.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  keyGenerator: (req) => String(req.user._id),
  skip: () => env.isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'rate_limited', message: "You're asking quickly. Wait a minute and try again." } }),
});

// Any member can ask, including on archived weddings: answering changes nothing.
askRouter.post('/weddings/:weddingId/ask', requireAuth, loadWedding, limiter, validateBody(askSchema), askController.ask);
