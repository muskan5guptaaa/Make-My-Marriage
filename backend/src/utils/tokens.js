import crypto from 'node:crypto';

// 32 random bytes, base64url: used for password reset links (and later guest links).
export const randomToken = () => crypto.randomBytes(32).toString('base64url');

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
