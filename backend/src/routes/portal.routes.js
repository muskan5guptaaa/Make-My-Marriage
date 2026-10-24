import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import * as portal from '../controllers/portal.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { portalRsvpSchema } from '../validators/guest.schemas.js';

export const portalRouter = Router();

// No account: the token in the path is the guest's access, so guessing is rate-limited.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  skip: () => env.isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'rate_limited', message: 'Too many attempts. Wait 15 minutes and try again.' } }),
});

portalRouter.get('/portal/:token', limiter, optionalAuth, portal.getPortal);
portalRouter.put('/portal/:token/rsvps/:functionId', limiter, optionalAuth, validateBody(portalRsvpSchema), portal.answerRsvp);
portalRouter.get('/portal/:token/albums', limiter, optionalAuth, portal.getAlbums);
portalRouter.get('/portal/:token/albums/:albumId/photos', limiter, optionalAuth, portal.getAlbumPhotos);
portalRouter.post('/portal/:token/albums/:albumId/photos/sign', limiter, optionalAuth, portal.signPhoto);
portalRouter.post('/portal/:token/photos/:photoId/complete', limiter, optionalAuth, portal.completePhoto);
