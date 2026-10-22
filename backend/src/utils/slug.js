import crypto from 'node:crypto';

export function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "aisha-rohan-k3f9": readable, with a short random tail so two couples never clash.
export function weddingSlug(brideName, groomName) {
  const base = [slugify(brideName), slugify(groomName)].filter(Boolean).join('-').slice(0, 50) || 'wedding';
  const tail = crypto.randomBytes(3).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x');
  return `${base}-${tail}`;
}
