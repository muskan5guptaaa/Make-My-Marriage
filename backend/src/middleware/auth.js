import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { unauthorized } from '../utils/AppError.js';

export const SESSION_COOKIE = 'mmm_session';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax',
  path: '/',
});

export function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: String(user._id) }, env.jwtSecret(), {
    expiresIn: `${env.sessionDays}d`,
  });
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: env.sessionDays * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

// Loads req.user from the session cookie, or answers 401.
export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret());
  } catch {
    throw unauthorized('Your session has ended. Sign in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized('Your session has ended. Sign in again.');

  // A password reset after this token was issued signs the session out.
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
    throw unauthorized('Your password was changed. Sign in again.');
  }

  req.user = user;
  next();
}

// For pages anyone can open (the guest portal): sets req.user when a valid session is
// present, and simply carries on without one.
export async function optionalAuth(req, res, next) {
  if (!req.cookies?.[SESSION_COOKIE]) return next();
  try {
    await requireAuth(req, res, () => {});
  } catch {
    req.user = undefined; // an expired session counts as signed out here
  }
  next();
}
