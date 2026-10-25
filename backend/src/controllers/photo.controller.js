import mongoose from 'mongoose';
import { WeddingFunction } from '../models/Function.js';
import { Album, Photo } from '../models/Photo.js';
import { AppError, badRequest, notFoundError } from '../utils/AppError.js';
import {
  ALLOWED_FORMATS, MAX_PHOTO_BYTES, deleteUploads, deleteUploadsByPrefix, findUpload, photoUrls, requirePhotos, uploadTicket,
} from '../utils/cloudinary.js';

const albumNotFound = () => notFoundError('album_not_found', 'This album is not part of this wedding.');
const photoNotFound = () => notFoundError('photo_not_found', 'This photo is not part of this wedding.');
export const GUEST_UPLOAD_LIMIT = 200; // per guest, so one link can't fill the storage

const prefixFor = (weddingId) => `mmm/weddings/${weddingId}/`;

function toPhoto(p, { forPlanner }) {
  return {
    _id: p._id,
    album: p.album,
    ...photoUrls(p.publicId, p.version),
    width: p.width ?? null,
    height: p.height ?? null,
    uploadedAt: p.uploadedAt,
    uploaderName: p.uploaderName ?? null,
    ...(forPlanner && { uploaderType: p.uploaderType, hidden: p.hidden }),
  };
}

// Every function gets its album the first time albums are listed; renaming the function
// renames its album, and a deleted function leaves its album as a general one.
async function ensureFunctionAlbums(wedding) {
  const [fns, albums] = await Promise.all([
    WeddingFunction.find({ wedding: wedding._id }).sort({ startsAt: 1 }).select('name'),
    Album.find({ wedding: wedding._id, function: { $ne: null } }).select('function name'),
  ]);
  const byFn = new Map(albums.map((a) => [String(a.function), a]));
  const missing = fns.filter((f) => !byFn.has(String(f._id)));
  if (missing.length) await Album.insertMany(missing.map((f) => ({ wedding: wedding._id, function: f._id, name: f.name })));
  const renamed = fns.filter((f) => byFn.has(String(f._id)) && byFn.get(String(f._id)).name !== f.name);
  await Promise.all(renamed.map((f) => Album.updateOne({ _id: byFn.get(String(f._id))._id }, { $set: { name: f.name } })));
}

// Albums in timeline order (function albums by date, then general ones), with counts and cover.
async function albumList(wedding, { forPlanner, functionIds }) {
  await ensureFunctionAlbums(wedding);
  const fnOrder = new Map(
    (await WeddingFunction.find({ wedding: wedding._id }).sort({ startsAt: 1 }).select('_id')).map((f, i) => [String(f._id), i]),
  );
  let albums = await Album.find({ wedding: wedding._id }).sort({ createdAt: 1 });
  if (functionIds) albums = albums.filter((a) => !a.function || functionIds.has(String(a.function)));

  const visible = forPlanner ? { status: 'complete' } : { status: 'complete', hidden: false };
  const counts = await Photo.aggregate([
    { $match: { wedding: wedding._id, ...visible } },
    { $sort: { uploadedAt: -1 } },
    { $group: { _id: '$album', n: { $sum: 1 }, latest: { $first: '$_id' } } },
  ]);
  const byAlbum = new Map(counts.map((c) => [String(c._id), c]));
  const coverIds = albums.map((a) => a.coverPhoto ?? byAlbum.get(String(a._id))?.latest).filter(Boolean);
  const covers = new Map((await Photo.find({ _id: { $in: coverIds }, ...visible })).map((p) => [String(p._id), p]));

  const rank = (a) => (a.function ? fnOrder.get(String(a.function)) ?? 999 : 1000);
  return albums
    .sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt)
    .map((a) => {
      const cover = covers.get(String(a.coverPhoto ?? '')) ?? covers.get(String(byAlbum.get(String(a._id))?.latest ?? ''));
      return {
        _id: a._id,
        name: a.name,
        function: a.function ?? null,
        photoCount: byAlbum.get(String(a._id))?.n ?? 0,
        coverUrl: cover ? photoUrls(cover.publicId, cover.version).thumbUrl : null,
        coverPhoto: a.coverPhoto ?? null,
      };
    });
}

async function loadAlbum(weddingId, albumId) {
  if (!mongoose.isValidObjectId(albumId)) throw albumNotFound();
  const album = await Album.findOne({ _id: albumId, wedding: weddingId });
  if (!album) throw albumNotFound();
  return album;
}

async function loadPhoto(weddingId, photoId) {
  if (!mongoose.isValidObjectId(photoId)) throw photoNotFound();
  const photo = await Photo.findOne({ _id: photoId, wedding: weddingId });
  if (!photo) throw photoNotFound();
  return photo;
}

// ---- shared by planners and the guest portal ----

export async function listPhotosIn(album, { forPlanner, includeHidden }) {
  const filter = { album: album._id, status: 'complete' };
  if (!(forPlanner && includeHidden)) filter.hidden = false;
  const photos = await Photo.find(filter).sort({ uploadedAt: -1 }).limit(1000);
  return photos.map((p) => toPhoto(p, { forPlanner }));
}

// Step 1 of an upload: a pending Photo and a signed ticket to send the file to Cloudinary.
export async function startUpload(album, uploader) {
  requirePhotos();
  const _id = new mongoose.Types.ObjectId();
  const publicId = `${prefixFor(album.wedding)}albums/${album._id}/${_id}`;
  await Photo.create({ _id, wedding: album.wedding, album: album._id, ...uploader, publicId });
  return { photoId: _id, maxBytes: MAX_PHOTO_BYTES, formats: ALLOWED_FORMATS, upload: uploadTicket(publicId) };
}

// Step 2: confirm Cloudinary has the file, check it, and publish it.
export async function finishUpload(photo, { forPlanner }) {
  requirePhotos();
  if (photo.status === 'complete') return toPhoto(photo, { forPlanner });
  const file = await findUpload(photo.publicId);
  if (!file) throw new AppError(409, 'upload_missing', 'The photo did not finish uploading. Please try again.');
  if (!ALLOWED_FORMATS.includes(file.format) || file.bytes > MAX_PHOTO_BYTES) {
    await deleteUploads([photo.publicId]);
    await Photo.deleteOne({ _id: photo._id });
    throw badRequest(`Photos must be JPG, PNG, WebP or HEIC and at most ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`);
  }
  Object.assign(photo, { format: file.format, width: file.width, height: file.height, sizeBytes: file.bytes, version: file.version });
  photo.status = 'complete';
  photo.uploadedAt = new Date();
  await photo.save();
  return toPhoto(photo, { forPlanner });
}

// ---- planner routes (owners and co-admins) ----

export async function listAlbums(req, res) {
  res.json({ data: await albumList(req.wedding, { forPlanner: true }) });
}

export async function createAlbum(req, res) {
  const album = await Album.create({ wedding: req.wedding._id, name: req.body.name, createdBy: req.user._id });
  res.status(201).json({ album: { _id: album._id, name: album.name, function: null, photoCount: 0, coverUrl: null, coverPhoto: null } });
}

// Rename a general album (function albums follow the function's name) or choose its cover.
export async function updateAlbum(req, res) {
  const album = await loadAlbum(req.wedding._id, req.params.albumId);
  if (req.body.name !== undefined) {
    if (album.function) throw new AppError(409, 'function_album', 'This album is named after its function. Rename the function instead.');
    album.name = req.body.name;
  }
  if (req.body.coverPhoto !== undefined) {
    if (req.body.coverPhoto && !(await Photo.exists({ _id: req.body.coverPhoto, album: album._id, status: 'complete' }))) {
      throw badRequest('Choose a photo from this album.', { coverPhoto: 'Choose a photo from this album.' });
    }
    album.coverPhoto = req.body.coverPhoto ?? undefined;
  }
  await album.save();
  res.json({ album: (await albumList(req.wedding, { forPlanner: true })).find((a) => String(a._id) === String(album._id)) });
}

// Deletes a general album and its photos. Function albums go when their function is deleted.
export async function deleteAlbum(req, res) {
  const album = await loadAlbum(req.wedding._id, req.params.albumId);
  if (album.function) throw new AppError(409, 'function_album', 'Albums for functions can’t be deleted. Delete the photos instead.');
  const photos = await Photo.find({ album: album._id }).select('publicId');
  await deleteUploads(photos.map((p) => p.publicId));
  await Photo.deleteMany({ album: album._id });
  await Album.deleteOne({ _id: album._id });
  res.status(204).end();
}

export async function listPhotos(req, res) {
  const album = await loadAlbum(req.wedding._id, req.params.albumId);
  res.json({ data: await listPhotosIn(album, { forPlanner: true, includeHidden: req.query.includeHidden !== 'false' }) });
}

export async function signUpload(req, res) {
  const album = await loadAlbum(req.wedding._id, req.params.albumId);
  res.status(201).json(await startUpload(album, { uploaderType: 'member', uploaderId: req.user._id, uploaderName: req.user.name }));
}

export async function completeUpload(req, res) {
  const photo = await loadPhoto(req.wedding._id, req.params.photoId);
  res.json({ photo: await finishUpload(photo, { forPlanner: true }) });
}

export async function updatePhoto(req, res) {
  const photo = await loadPhoto(req.wedding._id, req.params.photoId);
  photo.hidden = req.body.hidden;
  await photo.save();
  if (photo.hidden) await Album.updateOne({ _id: photo.album, coverPhoto: photo._id }, { $unset: { coverPhoto: 1 } });
  res.json({ photo: toPhoto(photo, { forPlanner: true }) });
}

export async function deletePhoto(req, res) {
  const photo = await loadPhoto(req.wedding._id, req.params.photoId);
  await deleteUploads([photo.publicId]);
  await Photo.deleteOne({ _id: photo._id });
  await Album.updateOne({ _id: photo.album, coverPhoto: photo._id }, { $unset: { coverPhoto: 1 } });
  res.status(204).end();
}

// ---- guest portal ----

// Albums of archived functions are hidden from guests until the function is restored.
async function guestFunctionIds(wedding, guest) {
  const active = await WeddingFunction.find({ _id: { $in: guest.invitedFunctions }, wedding: wedding._id, archivedAt: null }).select('_id');
  return new Set(active.map((f) => String(f._id)));
}

export const guestAlbums = async (wedding, guest) =>
  albumList(wedding, { forPlanner: false, functionIds: await guestFunctionIds(wedding, guest) });

// A guest may see an album for a function they're invited to, or a general album.
export async function guestAlbum(wedding, guest, albumId) {
  const album = await loadAlbum(wedding._id, albumId);
  if (album.function && !(await guestFunctionIds(wedding, guest)).has(String(album.function))) throw albumNotFound();
  return album;
}

export async function guestStartUpload(wedding, guest, albumId) {
  const album = await guestAlbum(wedding, guest, albumId);
  const used = await Photo.countDocuments({ uploaderType: 'guest', uploaderId: guest._id });
  if (used >= GUEST_UPLOAD_LIMIT) {
    throw new AppError(429, 'upload_limit', `You can share up to ${GUEST_UPLOAD_LIMIT} photos. Thank you for so many!`);
  }
  return startUpload(album, { uploaderType: 'guest', uploaderId: guest._id, uploaderName: guest.name });
}

export async function guestFinishUpload(wedding, guest, photoId) {
  const photo = await loadPhoto(wedding._id, photoId);
  if (photo.uploaderType !== 'guest' || String(photo.uploaderId) !== String(guest._id)) throw photoNotFound();
  return finishUpload(photo, { forPlanner: false });
}

// ---- cleanup ----

// Pending uploads older than a day were abandoned: remove them and any file that arrived.
export async function cleanupAbandonedUploads() {
  const stale = await Photo.find({ status: 'pending', createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).select('publicId');
  if (stale.length === 0) return 0;
  await deleteUploads(stale.map((p) => p.publicId));
  await Photo.deleteMany({ _id: { $in: stale.map((p) => p._id) } });
  return stale.length;
}

// After a wedding is deleted: its files in Cloudinary. Database rows go in the wedding's transaction.
export const deleteWeddingPhotos = (weddingId) => deleteUploadsByPrefix(prefixFor(weddingId));
