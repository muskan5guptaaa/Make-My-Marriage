import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// The free AI plan allows only a few requests a minute for the whole app, so each person
// gets a small share across every AI feature. Counted per signed-in user, not per network.
export const aiLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  keyGenerator: (req) => String(req.user._id),
  skip: () => env.isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'rate_limited', message: "You're asking quickly. Wait a minute and try again." } }),
});
