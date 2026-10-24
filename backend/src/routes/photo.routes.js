import { Router } from 'express';
import * as photos from '../controllers/photo.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { createAlbumSchema, updateAlbumSchema, updatePhotoSchema } from '../validators/photo.schemas.js';

export const photoRouter = Router();

// Owners and co-admins manage the gallery; archived weddings are read-only.
const member = [requireAuth, loadWedding];
const write = [...member, requireActive];
const W = '/weddings/:weddingId';

photoRouter.get(`${W}/albums`, ...member, photos.listAlbums);
photoRouter.post(`${W}/albums`, ...write, validateBody(createAlbumSchema), photos.createAlbum);
photoRouter.patch(`${W}/albums/:albumId`, ...write, validateBody(updateAlbumSchema), photos.updateAlbum);
photoRouter.delete(`${W}/albums/:albumId`, ...write, photos.deleteAlbum);

photoRouter.get(`${W}/albums/:albumId/photos`, ...member, photos.listPhotos);
photoRouter.post(`${W}/albums/:albumId/photos/sign`, ...write, photos.signUpload);
photoRouter.post(`${W}/photos/:photoId/complete`, ...write, photos.completeUpload);
photoRouter.patch(`${W}/photos/:photoId`, ...write, validateBody(updatePhotoSchema), photos.updatePhoto);
photoRouter.delete(`${W}/photos/:photoId`, ...write, photos.deletePhoto);
