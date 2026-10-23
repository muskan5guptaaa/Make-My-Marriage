import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { WeddingFunction } from '../models/Function.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { Wedding } from '../models/Wedding.js';
import { WeddingMember } from '../models/WeddingMember.js';
import { AppError, conflict, forbidden, notFoundError } from '../utils/AppError.js';
import { sendEmail } from '../utils/email.js';
import { randomToken, sha256 } from '../utils/tokens.js';
import { weddingDateRange } from './function.controller.js';
import { toWedding } from './wedding.controller.js';

const memberNotFound = () => notFoundError('member_not_found', 'This member is not part of this wedding.');
const lastOwner = () => conflict('last_owner', 'A wedding needs at least one owner. Make someone else an owner first.');

// A pending invite for the signed-in user: matched by user id, or by email if it was
// sent before they had an account.
const pendingFor = (user) => ({
  acceptedAt: null,
  $or: [{ user: user._id }, { user: null, invitedEmail: user.email }],
});

export function toMember(m) {
  return {
    _id: m._id,
    user: m.user ? { _id: m.user._id, name: m.user.name, email: m.user.email } : null,
    email: m.user?.email ?? m.invitedEmail,
    role: m.role,
    status: m.acceptedAt ? 'active' : 'invited',
    invitedBy: m.invitedBy ? { _id: m.invitedBy._id, name: m.invitedBy.name } : null,
    acceptedAt: m.acceptedAt ?? null,
    createdAt: m.createdAt,
  };
}

const populated = (query) => query.populate('user', 'name email').populate('invitedBy', 'name');

async function loadMember(req) {
  const { memberId } = req.params;
  if (!mongoose.isValidObjectId(memberId)) throw memberNotFound();
  const member = await populated(WeddingMember.findOne({ _id: memberId, wedding: req.wedding._id }));
  if (!member) throw memberNotFound();
  return member;
}

const ownerCount = (weddingId, session) =>
  WeddingMember.countDocuments({ wedding: weddingId, role: 'owner', acceptedAt: { $ne: null } }).session(session ?? null);

// Owners first, then co-admins, then pending invites; oldest first within each.
export async function listMembers(req, res) {
  const members = await populated(WeddingMember.find({ wedding: req.wedding._id }).sort({ createdAt: 1 }));
  const rank = (m) => (!m.acceptedAt ? 2 : m.role === 'owner' ? 0 : 1);
  members.sort((a, b) => rank(a) - rank(b));
  res.json({ data: members.map(toMember) });
}

export async function inviteMember(req, res) {
  const { email } = req.body;
  const { wedding } = req;

  const existingUser = await User.findOne({ email });
  const clash = await WeddingMember.findOne({
    wedding: wedding._id,
    $or: [{ invitedEmail: email }, ...(existingUser ? [{ user: existingUser._id }] : [])],
  });
  if (clash) {
    throw clash.acceptedAt
      ? conflict('already_member', 'This person is already a member of this wedding.', { email: 'Already a member.' })
      : conflict('already_invited', 'This email has already been invited.', { email: 'Already invited.' });
  }

  let created;
  try {
    created = await WeddingMember.create({
      wedding: wedding._id,
      user: existingUser?._id,
      invitedEmail: email,
      role: 'co-admin',
      invitedBy: req.user._id,
    });
  } catch (err) {
    // Two invites for the same email at the same moment: the unique index stops the second.
    if (err?.code === 11000) throw conflict('already_invited', 'This email has already been invited.', { email: 'Already invited.' });
    throw err;
  }
  const member = await populated(WeddingMember.findById(created._id));
  const { inviteUrl, emailSent } = await issueInvite(member, wedding, req.user, Boolean(existingUser));
  res.status(201).json({ member: toMember(member), emailSent, inviteUrl });
}

const INVITE_DAYS = 14;
const joinUrl = (token) => `${env.webAppUrl}/join/${token}`;

// Gives the invite a fresh private link (any older link stops working) and emails it.
// The invite stands even if the email doesn't go out; the owner can share inviteUrl by hand.
async function issueInvite(member, wedding, inviter, hasAccount) {
  const token = randomToken();
  member.inviteTokenHash = sha256(token);
  member.inviteExpiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  await member.save();

  const inviteUrl = joinUrl(token);
  const couple = `${wedding.brideName} & ${wedding.groomName}`;
  const expires = member.inviteExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  let emailSent = false;
  try {
    const { delivered } = await sendEmail({
      to: member.invitedEmail,
      subject: `${inviter.name} invited you to help plan ${couple}`,
      text:
        `${inviter.name} invited you to help plan ${couple}'s wedding on Make My Marriage, as a co-admin.\n\n` +
        `Open your invitation to see the functions and accept:\n${inviteUrl}\n\n` +
        `${hasAccount ? 'Sign in' : 'Create an account'} with ${member.invitedEmail} to accept. ` +
        `This link works until ${expires}.\n\n` +
        `If you weren't expecting this, you can ignore this email.`,
    });
    emailSent = delivered;
  } catch (err) {
    console.error('Invite email failed:', err.message);
  }
  return { inviteUrl, emailSent };
}

// Owner sends a pending invite again, with a new link.
export async function resendInvite(req, res) {
  const member = await loadMember(req);
  if (member.acceptedAt) throw conflict('already_member', 'This person has already accepted.');
  const hasAccount = Boolean(member.user) || Boolean(await User.exists({ email: member.invitedEmail }));
  const { inviteUrl, emailSent } = await issueInvite(member, req.wedding, req.user, hasAccount);
  res.json({ member: toMember(member), emailSent, inviteUrl });
}

// ---- the /join/<token> page: readable by anyone holding the link ----

const inviteLinkNotFound = () =>
  notFoundError('invite_link_invalid', 'This invitation link is not valid. It may have been cancelled or replaced by a newer one.');

async function findByToken(token) {
  if (typeof token !== 'string' || token.length < 20) throw inviteLinkNotFound();
  const member = await WeddingMember.findOne({ inviteTokenHash: sha256(token) }).populate('invitedBy', 'name');
  if (!member) throw inviteLinkNotFound();
  const wedding = await Wedding.findById(member.wedding);
  if (!wedding) throw inviteLinkNotFound();
  return { member, wedding };
}

const inviteState = (member) =>
  member.acceptedAt ? 'accepted' : member.inviteExpiresAt && member.inviteExpiresAt < new Date() ? 'expired' : 'pending';

// What the invitation page shows: the couple, dates, functions, who is invited and as what,
// and whether that email already has an account (so the page offers Sign in or Create account).
export async function getInviteByToken(req, res) {
  const { member, wedding } = await findByToken(req.params.token);
  const functions = await WeddingFunction.find({ wedding: wedding._id }).sort({ startsAt: 1 }).select('name localDate startTime venue');
  res.json({
    invite: {
      status: inviteState(member),
      email: member.invitedEmail,
      role: member.role,
      invitedBy: member.invitedBy ? { name: member.invitedBy.name } : null,
      expiresAt: member.inviteExpiresAt ?? null,
      hasAccount: Boolean(member.user) || Boolean(await User.exists({ email: member.invitedEmail })),
      wedding: {
        _id: wedding._id,
        brideName: wedding.brideName,
        groomName: wedding.groomName,
        timezone: wedding.timezone,
        status: wedding.status,
        dateRange: await weddingDateRange(wedding._id),
        functions: functions.map((f) => ({
          _id: f._id,
          name: f.name,
          localDate: f.localDate,
          startTime: f.startTime ?? null,
          venue: f.venue ?? null,
        })),
      },
    },
  });
}

// Accept from the link. Only the account whose email was invited can accept it.
export async function acceptInviteByToken(req, res) {
  const { member, wedding } = await findByToken(req.params.token);
  if (member.invitedEmail !== req.user.email) {
    throw forbidden('wrong_account', `This invitation is for ${member.invitedEmail}. Sign in with that email to accept it.`);
  }
  if (member.acceptedAt) {
    if (String(member.user) !== String(req.user._id)) throw inviteLinkNotFound();
    return res.json({ wedding: toWedding(wedding, member.role) }); // already in: just open it
  }
  if (inviteState(member) === 'expired') {
    throw new AppError(410, 'invite_expired', 'This invitation has expired. Ask the couple to send it again.');
  }
  member.user = req.user._id;
  member.acceptedAt = new Date();
  await member.save();
  res.json({ wedding: toWedding(wedding, member.role) });
}

// Owners can change any role; at least one owner must remain.
export async function changeRole(req, res) {
  const member = await loadMember(req);
  const { role } = req.body;
  if (!member.acceptedAt) throw conflict('invite_pending', 'Wait until they accept the invite before changing their role.');

  if (member.role !== role) {
    if (member.role === 'owner' && (await ownerCount(req.wedding._id)) <= 1) throw lastOwner();
    member.role = role;
    await member.save();
  }
  res.json({ member: toMember(member) });
}

// Owners remove anyone or cancel an invite. Any member can remove themselves (leave).
export async function removeMember(req, res) {
  const member = await loadMember(req);
  const isSelf = member.user && String(member.user._id) === String(req.user._id);
  if (!isSelf && req.membership.role !== 'owner') {
    throw forbidden('owner_only', 'Only an owner can remove other members.');
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (member.acceptedAt && member.role === 'owner' && (await ownerCount(req.wedding._id, session)) <= 1) {
        throw lastOwner();
      }
      // Their tasks stay, unassigned.
      if (member.user) {
        await Task.updateMany({ wedding: req.wedding._id, assignee: member.user._id }, { $unset: { assignee: 1 } }, { session });
      }
      await WeddingMember.deleteOne({ _id: member._id }, { session });
    });
  } finally {
    await session.endSession();
  }
  res.status(204).end();
}

// --- the invited person's side: these run without loadWedding, since they aren't a member yet ---

async function findMyInvite(req) {
  const { weddingId } = req.params;
  const notFound = () => notFoundError('invite_not_found', 'There is no pending invite to this wedding for you.');
  if (!mongoose.isValidObjectId(weddingId)) throw notFound();
  const invite = await WeddingMember.findOne({ wedding: weddingId, ...pendingFor(req.user) });
  if (!invite) throw notFound();
  return invite;
}

export async function acceptInvite(req, res) {
  const invite = await findMyInvite(req);
  invite.user = req.user._id;
  invite.acceptedAt = new Date();
  await invite.save();
  const wedding = await Wedding.findById(invite.wedding);
  if (!wedding) throw new AppError(404, 'wedding_not_found', 'This wedding no longer exists.');
  res.json({ wedding: toWedding(wedding, invite.role) });
}

export async function declineInvite(req, res) {
  const invite = await findMyInvite(req);
  await WeddingMember.deleteOne({ _id: invite._id });
  res.status(204).end();
}

// Pending invites for the signed-in user, for /me.
export async function myPendingInvites(user) {
  const invites = await WeddingMember.find(pendingFor(user))
    .populate('wedding', 'brideName groomName status')
    .populate('invitedBy', 'name')
    .sort({ createdAt: -1 })
    .lean();
  return invites
    .filter((i) => i.wedding)
    .map((i) => ({
      wedding: { _id: i.wedding._id, brideName: i.wedding.brideName, groomName: i.wedding.groomName, status: i.wedding.status },
      role: i.role,
      invitedBy: i.invitedBy ? { name: i.invitedBy.name } : null,
      createdAt: i.createdAt,
    }));
}
