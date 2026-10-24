import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from './AppError.js';

// Photos live in Cloudinary. Browsers upload straight to Cloudinary with a short-lived
// signature from us, so files never pass through this server. In tests a fake stands in.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // Cloudinary's free-plan image limit
export const ALLOWED_FORMATS = ['jpg', 'png', 'webp', 'heic'];

const { cloudName, apiKey, apiSecret } = env.cloudinary;
const API = () => `https://api.cloudinary.com/v1_1/${cloudName || 'test'}`;
const basicAuth = () => `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;

export const photosReady = () => env.isTest || Boolean(cloudName && apiKey && apiSecret);
export function requirePhotos() {
  if (!photosReady()) throw new AppError(503, 'photos_not_set_up', 'Photo storage is not set up on the server yet.');
}

// Cloudinary's signature: SHA-1 of the sorted params joined as a=b&c=d, then the secret.
function sign(params) {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(base + apiSecret).digest('hex');
}

// Everything the browser needs to upload one file to Cloudinary as `publicId`.
export function uploadTicket(publicId) {
  const params = { allowed_formats: ALLOWED_FORMATS.join(','), public_id: publicId, timestamp: Math.floor(Date.now() / 1000) };
  return {
    url: `${API()}/image/upload`,
    fields: { ...params, api_key: apiKey, signature: env.isTest ? 'test-signature' : sign(params) },
  };
}

// Delivery URLs, built from the public id (nothing stored): small square thumbnails and a
// large view, both resized and compressed by Cloudinary.
export function photoUrls(publicId, version) {
  const base = `https://res.cloudinary.com/${cloudName || 'test'}/image/upload`;
  const v = version ? `/v${version}` : '';
  return {
    thumbUrl: `${base}/c_fill,w_480,h_480,g_auto,q_auto,f_auto${v}/${publicId}`,
    fullUrl: `${base}/c_limit,w_1800,h_1800,q_auto,f_auto${v}/${publicId}`,
    downloadUrl: `${base}/fl_attachment${v}/${publicId}`,
  };
}

// ---- server-side calls (Admin API) ----

// The uploaded file's details, or null if nothing was uploaded under that id.
export async function findUpload(publicId) {
  if (env.isTest) return fake.get(publicId) ?? null;
  const res = await fetch(`${API()}/resources/image/upload/${publicId}`, { headers: { Authorization: basicAuth() } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cloudinary lookup failed (${res.status})`);
  const r = await res.json();
  return { bytes: r.bytes, format: r.format, width: r.width, height: r.height, version: r.version };
}

export async function deleteUploads(publicIds) {
  if (publicIds.length === 0) return;
  if (env.isTest) {
    publicIds.forEach((id) => fake.delete(id));
    return;
  }
  for (let i = 0; i < publicIds.length; i += 100) {
    const qs = publicIds.slice(i, i + 100).map((id) => `public_ids[]=${encodeURIComponent(id)}`).join('&');
    const res = await fetch(`${API()}/resources/image/upload?${qs}`, { method: 'DELETE', headers: { Authorization: basicAuth() } });
    if (!res.ok) throw new Error(`Cloudinary delete failed (${res.status})`);
  }
}

// Everything under a prefix, e.g. a whole wedding's photos.
export async function deleteUploadsByPrefix(prefix) {
  if (env.isTest) {
    [...fake.keys()].filter((k) => k.startsWith(prefix)).forEach((k) => fake.delete(k));
    return;
  }
  const res = await fetch(`${API()}/resources/image/upload?prefix=${encodeURIComponent(prefix)}`, {
    method: 'DELETE',
    headers: { Authorization: basicAuth() },
  });
  if (!res.ok) throw new Error(`Cloudinary delete failed (${res.status})`);
}

// Test stand-in for Cloudinary: tests "upload" by putting { bytes, format, width, height }.
export const fake = new Map();
