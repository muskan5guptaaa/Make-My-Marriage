import mongoose from 'mongoose';
import { z } from 'zod';

const name = z.string().trim().min(1, 'Enter an album name.').max(60, 'Use at most 60 characters.');

export const createAlbumSchema = z.object({ name });

export const updateAlbumSchema = z
  .object({
    name: name.optional(),
    coverPhoto: z.string().refine((v) => mongoose.isValidObjectId(v), 'Choose a photo from this album.').nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Send at least one field to change.' });

export const updatePhotoSchema = z.object({ hidden: z.boolean({ message: 'hidden must be true or false.' }) });
