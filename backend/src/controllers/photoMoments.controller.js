import { Album, Photo } from '../models/Photo.js';
import { requireAi } from '../utils/ai.js';
import { AppError, badRequest } from '../utils/AppError.js';
import { addMissingHashes, albumMoments, pickBest, savePick } from '../utils/photoMoments.js';
import { loadAlbum, toPhoto } from './photo.controller.js';

const momentChanged = () =>
  new AppError(409, 'moment_changed', 'These photos have changed since you opened them. Showing the latest groups.');

function toMoment(group, captions) {
  return {
    key: group.key,
    photos: group.photos.map((p) => ({ ...toPhoto(p, { forPlanner: true }), caption: captions.get(String(p._id)) ?? null })),
    best: group.best._id,
    by: group.by, // 'ai', 'you', or 'size' (the largest photo, until a pick is made)
    reason: group.reason,
  };
}

async function momentsResponse(album) {
  const waitingForHash = await addMissingHashes(album);
  const m = await albumMoments(album);
  return { groups: m.groups.map((g) => toMoment(g, m.captions)), total: m.total, grouped: m.grouped, waitingForHash };
}

async function findGroup(album, key) {
  const m = await albumMoments(album);
  const group = m.groups.find((g) => g.key === key);
  if (!group) throw momentChanged();
  return { group, captions: m.captions };
}

// GET /weddings/:weddingId/albums/:albumId/moments — look-alike shots grouped, best shot first.
export async function list(req, res) {
  const album = await loadAlbum(req.wedding._id, req.params.albumId);
  res.json(await momentsResponse(album));
}

// POST …/moments/pick { key } — the AI picks the best shot of one group (one request).
export async function pick(req, res) {
  requireAi();
  const album = await loadAlbum(req.wedding._id, req.params.albumId);
  const { group } = await findGroup(album, req.body.key);
  await pickBest(album, group);
  const { group: picked, captions } = await findGroup(album, req.body.key);
  res.json({ moment: toMoment(picked, captions) });
}

// PUT …/moments/best { key, best } — the couple chooses the best shot themselves.
export async function choose(req, res) {
  const album = await loadAlbum(req.wedding._id, req.params.albumId);
  const { group } = await findGroup(album, req.body.key);
  if (!group.photos.some((p) => String(p._id) === req.body.best)) throw badRequest('Choose a photo from this group.', { best: 'Choose a photo from this group.' });
  await savePick(album, group, req.body.best, 'you');
  const { group: picked, captions } = await findGroup(album, req.body.key);
  res.json({ moment: toMoment(picked, captions) });
}

// POST …/moments/hide-rest { key } — hides every photo of the group but the best from guests.
export async function hideRest(req, res) {
  const album = await loadAlbum(req.wedding._id, req.params.albumId);
  const { group } = await findGroup(album, req.body.key);
  const rest = group.photos.filter((p) => String(p._id) !== String(group.best._id)).map((p) => p._id);
  await Photo.updateMany({ _id: { $in: rest } }, { $set: { hidden: true } });
  await Album.updateOne({ _id: album._id, coverPhoto: { $in: rest } }, { $unset: { coverPhoto: 1 } });
  const { group: updated, captions } = await findGroup(album, req.body.key);
  res.json({ moment: toMoment(updated, captions), hidden: rest.length });
}
