import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { WeddingMember } from '../models/WeddingMember.js';
import { clearSessionCookie, setSessionCookie } from '../middleware/auth.js';
import { myPendingInvites } from './member.controller.js';
import { AppError, conflict, unauthorized } from '../utils/AppError.js';
import { sendEmail } from '../utils/email.js';
import { randomToken, sha256 } from '../utils/tokens.js';

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 30 * 60 * 1000;

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export async function register(req, res) {
  const { name, email, phone, password } = req.body;

  if (await User.exists({ email })) {
    throw conflict('email_taken', 'An account with this email already exists. Sign in instead.', {
      email: 'This email is already registered.',
    });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let user;
  try {
    user = await User.create({ name, email, phone, passwordHash });
  } catch (err) {
    if (err?.code === 11000) {
      throw conflict('email_taken', 'An account with this email already exists. Sign in instead.', {
        email: 'This email is already registered.',
      });
    }
    throw err;
  }

  setSessionCookie(res, user);
  res.status(201).json({ user: user.toPublic() });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Email or password is incorrect.');

  setSessionCookie(res, user);
  res.json({ user: user.toPublic() });
}

export function logout(_req, res) {
  clearSessionCookie(res);
  res.status(204).end();
}

// Always 202, whether or not the email exists, so the form cannot be used to find accounts.
export async function forgotPassword(req, res) {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (user) {
    const token = randomToken();
    user.passwordResetTokenHash = sha256(token);
    user.passwordResetExpiresAt = new Date(Date.now() + RESET_TTL_MS);
    await user.save();

    const link = `${env.webAppUrl}/reset-password?token=${token}`;
    // A failed send is logged, not shown: the answer must look the same whether or not the
    // account exists, and the person can simply ask again.
    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Make My Marriage password',
        text:
          `Hi ${user.name},\n\n` +
          `Open this link to choose a new password. It works for 30 minutes.\n\n${link}\n\n` +
          `If you didn't ask for this, ignore this email. Your password stays the same.`,
      });
    } catch (err) {
      console.error(`Password reset email to ${user.email} failed: ${err.message}`);
    }
  }

  res.status(202).json({ message: 'If that email has an account, a reset link is on its way.' });
}

export async function resetPassword(req, res) {
  const { token, password } = req.body;
  const user = await User.findOne({
    passwordResetTokenHash: sha256(token),
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!user) {
    throw new AppError(400, 'reset_link_invalid', 'This reset link has expired or was already used. Ask for a new one.');
  }

  user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.passwordChangedAt = new Date();
  await user.save();

  // Sign in on this device with a fresh session; older sessions are now rejected.
  setSessionCookie(res, user);
  res.json({ user: user.toPublic() });
}

export async function me(req, res) {
  const memberships = await WeddingMember.find({ user: req.user._id, acceptedAt: { $ne: null } })
    .populate('wedding', 'brideName groomName slug status timezone')
    .sort({ createdAt: -1 })
    .lean();

  const weddings = memberships
    .filter((m) => m.wedding)
    .map((m) => ({
      _id: m.wedding._id,
      brideName: m.wedding.brideName,
      groomName: m.wedding.groomName,
      slug: m.wedding.slug,
      status: m.wedding.status,
      timezone: m.wedding.timezone,
      role: m.role,
      acceptedAt: m.acceptedAt ?? null,
    }));

  res.json({ user: req.user.toPublic(), weddings, invites: await myPendingInvites(req.user) });
}
