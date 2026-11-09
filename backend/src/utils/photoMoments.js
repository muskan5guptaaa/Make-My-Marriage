// Photo moments: look-alike shots of the same moment grouped together, with the best one picked.
//
//   1. group (code, free): Cloudinary gives each photo a perceptual hash, 64 bits that barely
//      change between photos that look alike. Photos whose hashes differ in only a few bits are
//      joined into one group, and a group keeps growing through its look-alikes.
//   2. pick (AI, on request): Gemini sees all photos of one group side by side and picks the
//      best shot (sharp, eyes open, good light, nobody cut off), with a short reason. One
//      request per group, remembered in `photomoments`.
//   3. until then, or when the AI isn't available, the largest photo stands in as the best.
// No face data: hashes describe how the whole picture looks, not who is in it.

import { z } from 'zod';
import { env } from '../config/env.js';
import { Photo } from '../models/Photo.js';
import { PhotoDescription } from '../models/PhotoDescription.js';
import { PhotoMoment } from '../models/PhotoMoment.js';
import { generateJson } from './ai.js';
import { AppError } from './AppError.js';
import { findUpload, imageForAi } from './cloudinary.js';

export const MAX_PER_PICK = 6; // photos the AI compares in one request
const HASHES_PER_REQUEST = 30; // older photos get their hash a few at a time

// Bits that differ between two 16-hex-digit hashes.
export function distance(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/**
 * Joins photos that look alike into groups (union-find): A and B are one group if their hashes
 * differ in at most `maxBits`, and so is anything that looks like either of them.
 * @returns groups of 2 or more photos, each in upload order; photos without a hash are left out.
 */
export function groupLookAlikes(photos, maxBits = env.ai.photoSameMoment) {
  const hashed = photos.filter((p) => /^[0-9a-f]{16}$/i.test(p.phash ?? ''));
  const parent = hashed.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < hashed.length; i++) {
    for (let j = i + 1; j < hashed.length; j++) {
      if (distance(hashed[i].phash, hashed[j].phash) <= maxBits) parent[root(j)] = root(i);
    }
  }
  const groups = new Map();
  hashed.forEach((p, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), p]));
  return [...groups.values()].filter((g) => g.length > 1);
}

export const keyOf = (photos) => photos.map((p) => String(p._id)).sort().join(',');
const largest = (photos) => photos.reduce((best, p) => ((p.width ?? 0) * (p.height ?? 0) > (best.width ?? 0) * (best.height ?? 0) ? p : best));

// Photos uploaded before moments existed have no hash yet: ask Cloudinary, a few per request.
// Returns how many in the album still have none.
export async function addMissingHashes(album) {
  const missing = await Photo.find({ album: album._id, status: 'complete', phash: null }).limit(HASHES_PER_REQUEST);
  for (const p of missing) {
    const file = await findUpload(p.publicId).catch(() => null);
    p.phash = file?.phash || 'none'; // 'none': Cloudinary had no hash, so don't ask again
    await p.save();
  }
  return Photo.countDocuments({ album: album._id, status: 'complete', phash: null });
}

/**
 * The album's moments: each group of look-alikes with its best shot and the AI's captions.
 * @returns { groups: [{ key, photos, best, by: 'ai' | 'you' | 'size', reason }], grouped, total }
 *   photos are the stored Photo documents; the controller turns them into API photos.
 */
export async function albumMoments(album) {
  const photos = await Photo.find({ album: album._id, status: 'complete' }).sort({ uploadedAt: 1, _id: 1 });
  const groups = groupLookAlikes(photos);
  const keys = groups.map(keyOf);
  const [saved, descriptions] = await Promise.all([
    PhotoMoment.find({ album: album._id, key: { $in: keys } }).lean(),
    PhotoDescription.find({ photo: { $in: groups.flat().map((p) => p._id) }, status: 'done' }).select('photo caption').lean(),
  ]);
  const picks = new Map(saved.map((m) => [m.key, m]));
  const captions = new Map(descriptions.map((d) => [String(d.photo), d.caption]));
  return {
    total: photos.length,
    grouped: groups.reduce((n, g) => n + g.length, 0),
    captions,
    groups: groups.map((g, i) => {
      const pick = picks.get(keys[i]);
      const best = (pick && g.find((p) => String(p._id) === String(pick.best))) ?? largest(g);
      return { key: keys[i], photos: g, best, by: pick ? pick.by : 'size', reason: pick?.reason ?? null };
    }),
  };
}

export const PICK_SYSTEM_PROMPT = `You help a couple choose photos from their Indian wedding. The photos in the message are several shots of the same moment, numbered in order.

Pick the single best shot: in focus, eyes open, people facing the camera or each other naturally, good light, nobody cut off at the edges, natural expressions, nothing blocking the view.
best: the number of the best photo.
reason: one short sentence about what makes it the best compared with the others, like "Sharpest shot, and everyone's eyes are open." Never name or guess who anyone is.`;

export const PICK_SCHEMA = {
  type: 'OBJECT',
  properties: { best: { type: 'INTEGER' }, reason: { type: 'STRING' } },
  required: ['best', 'reason'],
};

const pickReply = z.object({ best: z.number().int(), reason: z.string().trim().min(1).max(300) });

/**
 * Asks the AI for the best shot of one group (the largest MAX_PER_PICK photos if it's bigger)
 * and remembers it. One AI request.
 */
export async function pickBest(album, group) {
  const candidates = [...group.photos].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)).slice(0, MAX_PER_PICK);
  const images = await Promise.all(candidates.map((p) => imageForAi(p.publicId, p.version)));
  const raw = await generateJson({
    system: PICK_SYSTEM_PROMPT,
    prompt: `Here are ${candidates.length} shots of the same moment, numbered 1 to ${candidates.length} in the order shown. Which is the best?`,
    schema: PICK_SCHEMA,
    images,
  });
  const reply = pickReply.safeParse(raw);
  if (!reply.success || reply.data.best < 1 || reply.data.best > candidates.length) {
    throw new AppError(502, 'ai_bad_output', "The AI's pick didn't make sense. Try again.");
  }
  return savePick(album, group, candidates[reply.data.best - 1]._id, 'ai', reply.data.reason);
}

export async function savePick(album, group, bestId, by, reason = null) {
  await PhotoMoment.updateOne(
    { album: album._id, key: group.key },
    { $set: { wedding: album.wedding, photos: group.photos.map((p) => p._id), best: bestId, by, reason } },
    { upsert: true },
  );
}
