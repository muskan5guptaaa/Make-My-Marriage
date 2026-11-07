import { Album, Photo } from '../models/Photo.js';
import { requireAi } from '../utils/ai.js';
import { badRequest } from '../utils/AppError.js';
import { describeNext, searchPhotos, searchStatus } from '../utils/photoSearch.js';
import { toPhoto } from './photo.controller.js';

// GET /weddings/:weddingId/photos/search-status — how many photos can be found by searching.
export async function status(req, res) {
  res.json(await searchStatus(req.wedding._id));
}

// POST /weddings/:weddingId/photos/describe-next — the AI describes one more photo. The page
// calls it again and again until nothing is waiting, so each request stays short.
export async function describe(req, res) {
  requireAi();
  res.json(await describeNext(req.wedding));
}

// GET /weddings/:weddingId/photos/search?q=… — photos closest in meaning, best first.
export async function search(req, res) {
  requireAi();
  const q = String(req.query.q ?? '').trim();
  if (!q) throw badRequest('Type what you are looking for.', { q: 'Type what you are looking for.' });
  if (q.length > 200) throw badRequest('Keep the search under 200 characters.', { q: 'Keep the search under 200 characters.' });

  const found = await searchPhotos(req.wedding._id, q);
  const photos = await Photo.find({ _id: { $in: found.photos.map((f) => f.photo) }, wedding: req.wedding._id, status: 'complete' });
  const albums = new Map((await Album.find({ wedding: req.wedding._id }).select('name').lean()).map((a) => [String(a._id), a.name]));
  const byId = new Map(photos.map((p) => [String(p._id), p]));
  const data = found.photos
    .filter((f) => byId.has(String(f.photo)))
    .map((f) => {
      const p = byId.get(String(f.photo));
      return { ...toPhoto(p, { forPlanner: true }), caption: f.caption, albumName: albums.get(String(p.album)) ?? null };
    });
  res.json({ data, meta: { albums: found.albums, ...(await searchStatus(req.wedding._id)) } });
}
