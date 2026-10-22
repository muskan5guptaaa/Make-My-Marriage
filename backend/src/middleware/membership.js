import mongoose from 'mongoose';
import { Wedding } from '../models/Wedding.js';
import { WeddingMember } from '../models/WeddingMember.js';
import { AppError, forbidden, notFoundError } from '../utils/AppError.js';

// Same answer for "doesn't exist" and "not yours", so ids of other weddings aren't confirmed.
const weddingNotFound = () => notFoundError('wedding_not_found', "This wedding doesn't exist or you don't have access to it.");

// Runs after requireAuth on every /weddings/:weddingId route. Sets req.wedding and req.membership.
export async function loadWedding(req, _res, next) {
  const { weddingId } = req.params;
  if (!mongoose.isValidObjectId(weddingId)) throw weddingNotFound();

  const membership = await WeddingMember.findOne({
    wedding: weddingId,
    user: req.user._id,
    acceptedAt: { $ne: null },
  });
  if (!membership) throw weddingNotFound();

  const wedding = await Wedding.findById(weddingId);
  if (!wedding) throw weddingNotFound();

  req.membership = membership;
  req.wedding = wedding;
  next();
}

export function requireOwner(req, _res, next) {
  if (req.membership.role !== 'owner') throw forbidden('owner_only', 'Only an owner of this wedding can do this.');
  next();
}

// Archived weddings are read-only until an owner restores them.
export function requireActive(req, _res, next) {
  if (req.wedding.status === 'archived') {
    throw new AppError(409, 'wedding_archived', 'This wedding is archived. An owner can restore it in Settings.');
  }
  next();
}
