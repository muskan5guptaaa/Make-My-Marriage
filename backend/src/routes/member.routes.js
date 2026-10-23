import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import * as members from '../controllers/member.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive, requireOwner } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { inviteSchema, roleSchema } from '../validators/member.schemas.js';

export const memberRouter = Router();

const member = [requireAuth, loadWedding];
const M = '/weddings/:weddingId/members';

// Link holders read invitations without signing in, so guessing tokens is rate-limited.
const linkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  skip: () => env.isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'rate_limited', message: 'Too many attempts. Wait 15 minutes and try again.' } }),
});

// The /join/<token> invitation page.
memberRouter.get('/member-invites/:token', linkLimiter, members.getInviteByToken);
memberRouter.post('/member-invites/:token/accept', linkLimiter, requireAuth, members.acceptInviteByToken);

// The invited person (not a member yet). Registered before /:memberId so they aren't read as ids.
memberRouter.post(`${M}/accept`, requireAuth, members.acceptInvite);
memberRouter.post(`${M}/decline`, requireAuth, members.declineInvite);

memberRouter.get(M, ...member, members.listMembers);
memberRouter.post(M, ...member, requireOwner, requireActive, validateBody(inviteSchema), members.inviteMember);
memberRouter.post(`${M}/:memberId/resend`, ...member, requireOwner, requireActive, members.resendInvite);
memberRouter.patch(`${M}/:memberId`, ...member, requireOwner, requireActive, validateBody(roleSchema), members.changeRole);
memberRouter.delete(`${M}/:memberId`, ...member, members.removeMember);
