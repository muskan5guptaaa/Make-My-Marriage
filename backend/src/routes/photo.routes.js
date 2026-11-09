import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import * as photos from '../controllers/photo.controller.js';
import * as moments from '../controllers/photoMoments.controller.js';
import * as photoSearch from '../controllers/photoSearch.controller.js';
import { aiLimit } from '../middleware/aiLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { createAlbumSchema, momentBestSchema, momentKeySchema, updateAlbumSchema, updatePhotoSchema } from '../validators/photo.schemas.js';

export const photoRouter = Router();

// Owners and co-admins manage the gallery; archived weddings are read-only.
const member = [requireAuth, loadWedding];
const write = [...member, requireActive];
const W = '/weddings/:weddingId';

// Describing photos is one AI request each, sent one after another by the page; the free plan
// allows about 15 a minute, so each person is kept a little under that.
const describeLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  keyGenerator: (req) => String(req.user._id),
  skip: () => env.isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: 'ai_busy', message: 'Describing photos quickly. Waiting a moment before the next one.' } }),
});

// Photo search (AI): any member can search; describing photos needs an active wedding.
photoRouter.get(`${W}/photos/search-status`, ...member, photoSearch.status);
photoRouter.get(`${W}/photos/search`, ...member, aiLimit, photoSearch.search);
photoRouter.post(`${W}/photos/describe-next`, ...write, describeLimit, photoSearch.describe);

// Photo moments: look-alike shots grouped by code (free); the AI picks a best shot on request.
const M = `${W}/albums/:albumId/moments`;
photoRouter.get(M, ...member, moments.list);
photoRouter.post(`${M}/pick`, ...write, aiLimit, validateBody(momentKeySchema), moments.pick);
photoRouter.put(`${M}/best`, ...write, validateBody(momentBestSchema), moments.choose);
photoRouter.post(`${M}/hide-rest`, ...write, validateBody(momentKeySchema), moments.hideRest);

photoRouter.get(`${W}/albums`, ...member, photos.listAlbums);
photoRouter.post(`${W}/albums`, ...write, validateBody(createAlbumSchema), photos.createAlbum);
photoRouter.patch(`${W}/albums/:albumId`, ...write, validateBody(updateAlbumSchema), photos.updateAlbum);
photoRouter.delete(`${W}/albums/:albumId`, ...write, photos.deleteAlbum);

photoRouter.get(`${W}/albums/:albumId/photos`, ...member, photos.listPhotos);
photoRouter.post(`${W}/albums/:albumId/photos/sign`, ...write, photos.signUpload);
photoRouter.post(`${W}/photos/:photoId/complete`, ...write, photos.completeUpload);
photoRouter.patch(`${W}/photos/:photoId`, ...write, validateBody(updatePhotoSchema), photos.updatePhoto);
photoRouter.delete(`${W}/photos/:photoId`, ...write, photos.deletePhoto);
