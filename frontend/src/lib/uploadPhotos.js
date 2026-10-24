// Uploads photos straight to Cloudinary: ask our API for a signed ticket, send the file to
// Cloudinary with progress, then tell our API it's done. Used by planners and guests.

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const OK_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

// A reason the file can't be uploaded, or null.
export function checkFile(file) {
  if (!OK_TYPES.includes(file.type) && !OK_EXT.test(file.name)) return 'Only JPG, PNG, WebP or HEIC photos.';
  if (file.size > MAX_BYTES) return 'Larger than 10 MB.';
  return null;
}

function sendToCloudinary(ticket, file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(ticket.upload.fields).forEach(([k, v]) => form.append(k, String(v)));
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', ticket.upload.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let message = 'Upload failed.';
        try {
          message = JSON.parse(xhr.responseText).error?.message ?? message;
        } catch {
          // keep the default
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Network problem. Check your connection and try again.'));
    xhr.send(form);
  });
}

// files: File[]. sign() and complete(photoId) call our API. onUpdate(index, { progress, status, error })
// reports each file. Three upload at a time. Resolves with the number that succeeded.
export async function uploadPhotos(files, { sign, complete, onUpdate }) {
  let done = 0;
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const i = next++;
      const problem = checkFile(files[i]);
      if (problem) {
        onUpdate(i, { status: 'error', error: problem });
        continue;
      }
      try {
        onUpdate(i, { status: 'uploading', progress: 0 });
        const ticket = await sign();
        await sendToCloudinary(ticket, files[i], (progress) => onUpdate(i, { status: 'uploading', progress }));
        onUpdate(i, { status: 'finishing', progress: 100 });
        await complete(ticket.photoId);
        onUpdate(i, { status: 'done', progress: 100 });
        done++;
      } catch (err) {
        onUpdate(i, { status: 'error', error: err.message });
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return done;
}
