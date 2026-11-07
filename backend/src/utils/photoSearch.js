// Photo search: find wedding photos by what is in them ("bride with grandmother at the Mehendi").
//
//   1. describe: Gemini looks at a small copy of each photo and writes what it sees, as JSON
//      (people by role and clothing, never by name; what's happening; the setting; tags)
//   2. embed: that description becomes a vector, stored in `photodescriptions`
//   3. search: the words typed become a vector too, and the closest photos are found, with
//      Atlas Vector Search (index "photos_vector") or, if that isn't set up, the same ranking in code
//
// A function named in the search ("at the Mehendi") is matched by code to its album, so the
// album is a filter rather than something the AI has to guess from the picture.
// Photos are described one at a time, so each request stays short and the free AI allowance
// (a few requests a minute, about 20 a day per model) is spent only on photos not yet described.

import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Album, Photo } from '../models/Photo.js';
import { PhotoDescription } from '../models/PhotoDescription.js';
import { embedTexts, generateJson } from './ai.js';
import { AppError } from './AppError.js';
import { imageForAi } from './cloudinary.js';
import { namesOf, said } from './functionNames.js';

export const PHOTO_INDEX = 'photos_vector';
export const MAX_RESULTS = 24;
const CLOSE_ENOUGH = 0.1; // keep matches within this much of the best one

export const PHOTO_SYSTEM_PROMPT = `You describe one photo from an Indian wedding so the couple can find it later by searching.

Describe only what you can see:
- caption: one plain sentence, under 25 words, like "The bride in a red lehenga hugs an elderly woman in a white saree on a decorated stage."
- people: who is in it by role and appearance (bride, groom, elderly woman, children, a group of friends, a dhol player), with clothing colours. Write "no people" if there are none.
- setting: where it is and what is happening (mehendi being applied, haldi ceremony, dancing, pheras around the fire, cake cutting, stage photos, food, decor, outdoors at night).
- tags: up to 12 short words someone might search for (colours, objects, rituals, emotions like laughing or emotional).
Never name or guess who a person is, and never guess religion, caste, age in years or anything private about them. Describe clothing and actions, not bodies.
If text appears in the photo (a sign, a name board), you may include it.`;

export const PHOTO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    caption: { type: 'STRING' },
    people: { type: 'STRING' },
    setting: { type: 'STRING' },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['caption', 'people', 'setting', 'tags'],
};

export const photoReply = z.object({
  caption: z.string().trim().min(1).max(300),
  people: z.string().trim().max(400),
  setting: z.string().trim().max(400),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
});

// The text a photo is searched by: only what was seen, no labels like "People:", which would
// make every photo look a little like any search with that word in it.
export const searchText = (d) =>
  [d.caption, d.people, d.setting, d.tags.join(', ')].map((s) => s.trim().replace(/[.\s]+$/, '')).filter(Boolean).join('. ').concat('.');

// Uploaded photos with no description yet (pending uploads are never described).
const waiting = async (weddingId) => {
  const described = await PhotoDescription.find({ wedding: weddingId }).select('photo').lean();
  return { wedding: weddingId, status: 'complete', _id: { $nin: described.map((d) => d.photo) } };
};

// How many of the wedding's photos are searchable, waiting, or couldn't be described.
export async function searchStatus(weddingId) {
  const [total, done, failed] = await Promise.all([
    Photo.countDocuments({ wedding: weddingId, status: 'complete' }),
    PhotoDescription.countDocuments({ wedding: weddingId, status: 'done' }),
    PhotoDescription.countDocuments({ wedding: weddingId, status: 'failed' }),
  ]);
  // A description can outlive a photo by a moment; never report more than there are.
  const searchable = Math.min(done, total);
  return { total, searchable, failed, waiting: Math.max(0, total - searchable - failed) };
}

/**
 * Describes the oldest photo not described yet: 1 vision request and 1 embedding request.
 * A photo the AI can't describe is marked failed, so it isn't tried again and again; running out
 * of today's allowance is not a failure, and stops the run (the error goes to the page).
 * @returns { photo: id | null, caption, status }
 */
export async function describeNext(wedding) {
  const photo = await Photo.findOne(await waiting(wedding._id)).sort({ uploadedAt: 1, _id: 1 });
  if (!photo) return { photo: null, ...(await searchStatus(wedding._id)) };

  let entry;
  try {
    const image = await imageForAi(photo.publicId, photo.version);
    const raw = await generateJson({ system: PHOTO_SYSTEM_PROMPT, prompt: 'Describe this wedding photo.', schema: PHOTO_SCHEMA, images: [image] });
    const reply = photoReply.safeParse(raw);
    if (!reply.success) throw new AppError(502, 'ai_bad_output', "The AI's description didn't make sense.");
    const d = reply.data;
    const text = searchText(d);
    const [embedding] = await embedTexts([text]);
    entry = { status: 'done', caption: d.caption, tags: d.tags, text, embedding };
  } catch (err) {
    // Out of allowance or briefly busy: stop here and leave the photo for later.
    if (['ai_daily_limit', 'ai_busy', 'ai_unavailable', 'ai_not_set_up'].includes(err.code)) throw err;
    console.error(`Photo ${photo._id} couldn't be described: ${err.message}`);
    entry = { status: 'failed' };
  }
  await PhotoDescription.updateOne(
    { photo: photo._id },
    { $set: { wedding: wedding._id, album: photo.album, ...entry } },
    { upsert: true },
  );
  return { photo: photo._id, caption: entry.caption ?? null, status: entry.status, ...(await searchStatus(wedding._id)) };
}

// Albums whose name (or another name for the same function) appears in the search.
async function albumsNamed(weddingId, query) {
  const albums = await Album.find({ wedding: weddingId }).select('name').lean();
  return albums.filter((a) => namesOf(a.name).some((n) => said(query, n)));
}

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

// Closest descriptions first, as [{ photo, score }].
async function rank(weddingId, vector, albumIds) {
  const filter = { wedding: new mongoose.Types.ObjectId(String(weddingId)), ...(albumIds && { album: { $in: albumIds } }) };
  if (!env.isTest) {
    try {
      const hits = await PhotoDescription.aggregate([
        { $vectorSearch: { index: PHOTO_INDEX, path: 'embedding', queryVector: vector, filter, numCandidates: 400, limit: 60 } },
        { $project: { photo: 1, score: { $meta: 'vectorSearchScore' } } },
      ]);
      // Atlas scores cosine as (1 + cosine) / 2; back to cosine so both paths cut the same way.
      if (hits.length > 0) return hits.map((h) => ({ photo: h.photo, score: h.score * 2 - 1 }));
    } catch (err) {
      console.warn(`Photo vector search unavailable, ranking in code: ${err.message}`);
    }
  }
  // No index yet (or tests): the same ranking done here. Fine for a few thousand photos.
  const all = await PhotoDescription.find({ ...filter, status: 'done' }).select('photo embedding').limit(5000).lean();
  return all.map((d) => ({ photo: d.photo, score: cosine(vector, d.embedding) })).sort((a, b) => b.score - a.score);
}

/**
 * @returns { photos: [{ photo, score, caption }], albums: [names matched], searchable }
 *   photos: closest first, only those close to the best match, at most MAX_RESULTS.
 */
export async function searchPhotos(weddingId, query) {
  const named = await albumsNamed(weddingId, query);
  // Once code has picked the album, its name is taken out, so the search is about what's in the photo.
  let about = query;
  for (const n of named.flatMap((a) => namesOf(a.name))) about = about.replace(new RegExp(`(^|[^\\p{L}])(?:at |in |from |during )?(?:the )?${n}(?=$|[^\\p{L}])`, 'giu'), '$1');
  about = about.replace(/\s+/g, ' ').trim() || query;
  const [vector] = await embedTexts([about], { task: 'query' });
  const ranked = await rank(weddingId, vector, named.length ? named.map((a) => a._id) : null);
  const best = ranked[0]?.score ?? 0;
  const close = ranked.filter((r) => r.score >= best - CLOSE_ENOUGH).slice(0, MAX_RESULTS);
  const captions = new Map(
    (await PhotoDescription.find({ photo: { $in: close.map((r) => r.photo) } }).select('photo caption').lean()).map((d) => [String(d.photo), d.caption]),
  );
  return {
    photos: close.map((r) => ({ ...r, caption: captions.get(String(r.photo)) ?? null })),
    albums: named.map((a) => a.name),
  };
}
