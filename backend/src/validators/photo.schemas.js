import mongoose from 'mongoose';
import { z } from 'zod';

const name = z.string().trim().min(1, 'Enter an album name.').max(60, 'Use at most 60 characters.');

// Photo moments: a group is named by its key (its photo ids, sorted and joined).
const momentKey = z.string().min(1).max(1000 * 25, 'Unknown group.'); // up to 1,000 look-alikes
export const momentKeySchema = z.object({ key: momentKey });
export const momentBestSchema = z.object({
  key: momentKey,
  best: z.string().refine((v) => mongoose.isValidObjectId(v), 'Choose a photo from this group.'),
});

export const createAlbumSchema = z.object({ name });

export const updateAlbumSchema = z
  .object({
    name: name.optional(),
    coverPhoto: z.string().refine((v) => mongoose.isValidObjectId(v), 'Choose a photo from this album.').nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Send at least one field to change.' });

export const updatePhotoSchema = z.object({ hidden: z.boolean({ message: 'hidden must be true or false.' }) });
