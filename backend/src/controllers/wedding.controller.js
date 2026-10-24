import mongoose from 'mongoose';
import { Wedding } from '../models/Wedding.js';
import { Expense, ExpenseCategory } from '../models/Expense.js';
import { WeddingFunction } from '../models/Function.js';
import { Guest } from '../models/Guest.js';
import { GuestLink } from '../models/GuestLink.js';
import { Album, Photo } from '../models/Photo.js';
import { Task } from '../models/Task.js';
import { deleteWeddingPhotos } from './photo.controller.js';
import { WeddingMember } from '../models/WeddingMember.js';
import { AppError, badRequest } from '../utils/AppError.js';
import { weddingSlug } from '../utils/slug.js';
import { rederiveStartsAt, weddingDateRange } from './function.controller.js';

// Single-wedding responses also carry the first and last function date.
const sendWedding = async (res, wedding, role) =>
  res.json({ wedding: { ...toWedding(wedding, role), dateRange: await weddingDateRange(wedding._id) } });

export const toWedding = (wedding, role) => ({
  _id: wedding._id,
  brideName: wedding.brideName,
  groomName: wedding.groomName,
  slug: wedding.slug,
  timezone: wedding.timezone,
  currency: wedding.currency,
  status: wedding.status,
  createdAt: wedding.createdAt,
  updatedAt: wedding.updatedAt,
  role,
});

async function uniqueSlug(brideName, groomName) {
  for (let i = 0; i < 5; i++) {
    const slug = weddingSlug(brideName, groomName);
    if (!(await Wedding.exists({ slug }))) return slug;
  }
  throw new Error('Could not generate a unique wedding slug');
}

// The wedding and its owner row are written together, or not at all.
export async function createWedding(req, res) {
  const { brideName, groomName, timezone } = req.body;
  const slug = await uniqueSlug(brideName, groomName);

  let wedding;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      [wedding] = await Wedding.create([{ brideName, groomName, timezone, slug, createdBy: req.user._id }], { session });
      await WeddingMember.create(
        [{ wedding: wedding._id, user: req.user._id, role: 'owner', acceptedAt: new Date() }],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({ wedding: { ...toWedding(wedding, 'owner'), dateRange: null } });
}

// ?status=active (default), archived, or all.
export async function listWeddings(req, res) {
  const status = req.query.status ?? 'active';
  if (!['active', 'archived', 'all'].includes(status)) {
    throw badRequest('status must be active, archived or all.', { status: 'Use active, archived or all.' });
  }

  const memberships = await WeddingMember.find({ user: req.user._id, acceptedAt: { $ne: null } })
    .populate('wedding')
    .sort({ createdAt: -1 });

  const weddings = memberships
    .filter((m) => m.wedding && (status === 'all' || m.wedding.status === status))
    .map((m) => toWedding(m.wedding, m.role));

  res.json({ data: weddings });
}

export async function getWedding(req, res) {
  await sendWedding(res, req.wedding, req.membership.role);
}

export async function updateWedding(req, res) {
  const { wedding } = req;
  const timezoneChanged = req.body.timezone !== undefined && req.body.timezone !== wedding.timezone;
  for (const key of ['brideName', 'groomName', 'timezone']) {
    if (req.body[key] !== undefined) wedding[key] = req.body[key];
  }

  // A new timezone moves every function's startsAt; both writes land together.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await wedding.save({ session });
      if (timezoneChanged) await rederiveStartsAt(wedding, session);
    });
  } finally {
    await session.endSession();
  }
  await sendWedding(res, wedding, req.membership.role);
}

export async function archiveWedding(req, res) {
  const { wedding } = req;
  if (wedding.status !== 'archived') {
    wedding.status = 'archived';
    await wedding.save();
  }
  await sendWedding(res, wedding, req.membership.role);
}

export async function restoreWedding(req, res) {
  const { wedding } = req;
  if (wedding.status !== 'active') {
    wedding.status = 'active';
    await wedding.save();
  }
  await sendWedding(res, wedding, req.membership.role);
}

// Permanent. Each collection added in later steps must be cleared in this transaction too.
export async function deleteWedding(req, res) {
  const { wedding } = req;
  if (req.body.confirmSlug !== wedding.slug) {
    throw new AppError(400, 'confirm_mismatch', "The slug you typed doesn't match this wedding.", {
      confirmSlug: `Type ${wedding.slug} to confirm.`,
    });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Photo.deleteMany({ wedding: wedding._id }, { session });
      await Album.deleteMany({ wedding: wedding._id }, { session });
      await Expense.deleteMany({ wedding: wedding._id }, { session });
      await ExpenseCategory.deleteMany({ wedding: wedding._id }, { session });
      await GuestLink.deleteMany({ wedding: wedding._id }, { session });
      await Guest.deleteMany({ wedding: wedding._id }, { session });
      await Task.deleteMany({ wedding: wedding._id }, { session });
      await WeddingFunction.deleteMany({ wedding: wedding._id }, { session });
      await WeddingMember.deleteMany({ wedding: wedding._id }, { session });
      await Wedding.deleteOne({ _id: wedding._id }, { session });
    });
  } finally {
    await session.endSession();
  }
  // Files go after the rows. If this fails, the files are unreachable and can be removed later.
  await deleteWeddingPhotos(wedding._id).catch((err) => console.error(`Deleting photos of wedding ${wedding._id} failed: ${err.message}`));
  res.status(204).end();
}
