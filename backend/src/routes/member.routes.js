import { Router } from 'express';
import * as members from '../controllers/member.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive, requireOwner } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { inviteSchema, roleSchema } from '../validators/member.schemas.js';

export const memberRouter = Router();

const member = [requireAuth, loadWedding];
const M = '/weddings/:weddingId/members';

// The invited person (not a member yet). Registered before /:memberId so they aren't read as ids.
memberRouter.post(`${M}/accept`, requireAuth, members.acceptInvite);
memberRouter.post(`${M}/decline`, requireAuth, members.declineInvite);

memberRouter.get(M, ...member, members.listMembers);
memberRouter.post(M, ...member, requireOwner, requireActive, validateBody(inviteSchema), members.inviteMember);
memberRouter.patch(`${M}/:memberId`, ...member, requireOwner, requireActive, validateBody(roleSchema), members.changeRole);
memberRouter.delete(`${M}/:memberId`, ...member, members.removeMember);
