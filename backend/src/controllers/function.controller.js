import mongoose from 'mongoose';
import { Expense } from '../models/Expense.js';
import { WeddingFunction } from '../models/Function.js';
import { Guest } from '../models/Guest.js';
import { Task } from '../models/Task.js';
import { invitedCounts } from './guest.controller.js';
import { notFoundError } from '../utils/AppError.js';
import { daysBetween, todayIn, youtubeVideoId, zonedToUtc } from '../utils/time.js';

const functionNotFound = () => notFoundError('function_not_found', 'This function is not part of this wedding.');

const EDITABLE = ['name', 'localDate', 'startTime', 'venue', 'address', 'dressCode', 'description', 'livestreamUrl', 'lat', 'lng', 'placeId'];

function toFunction(f) {
  return {
    _id: f._id,
    name: f.name,
    localDate: f.localDate,
    startTime: f.startTime ?? null,
    startsAt: f.startsAt,
    venue: f.venue ?? null,
    address: f.address ?? null,
    lat: f.lat ?? null,
    lng: f.lng ?? null,
    placeId: f.placeId ?? null,
    dressCode: f.dressCode ?? null,
    description: f.description ?? null,
    order: f.order,
    livestreamUrl: f.livestreamUrl ?? null,
    livestreamVideoId: f.livestreamVideoId ?? null,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

// Timeline order with status: a function is done once its day has passed in the wedding's
// timezone; the first one not done is "next"; the rest are "upcoming".
export async function functionsWithStatus(wedding) {
  const list = await WeddingFunction.find({ wedding: wedding._id }).sort({ startsAt: 1, order: 1, createdAt: 1 });
  const today = todayIn(wedding.timezone);
  const counts = await invitedCounts(wedding._id);
  let nextGiven = false;
  return list.map((f) => {
    const done = f.localDate < today;
    let status = 'done';
    if (!done) {
      status = nextGiven ? 'upcoming' : 'next';
      nextGiven = true;
    }
    return {
      ...toFunction(f),
      status,
      daysLeft: done ? null : daysBetween(today, f.localDate),
      invitedCount: counts.get(String(f._id)) ?? 0,
    };
  });
}

// First and last function date, shown as the wedding's dates.
export async function weddingDateRange(weddingId) {
  const [first] = await WeddingFunction.find({ wedding: weddingId }).sort({ localDate: 1 }).limit(1).select('localDate');
  const [last] = await WeddingFunction.find({ wedding: weddingId }).sort({ localDate: -1 }).limit(1).select('localDate');
  return first ? { start: first.localDate, end: last.localDate } : null;
}

// Copies validated body fields onto the document and re-derives startsAt and the video id.
function apply(fn, body, timezone) {
  for (const key of EDITABLE) {
    if (body[key] !== undefined) fn[key] = body[key] ?? undefined; // null clears the field
  }
  if (body.livestreamUrl !== undefined) fn.livestreamVideoId = fn.livestreamUrl ? youtubeVideoId(fn.livestreamUrl) : undefined;
  fn.startsAt = zonedToUtc(fn.localDate, fn.startTime, timezone);
}

async function loadFunction(req) {
  const { functionId } = req.params;
  if (!mongoose.isValidObjectId(functionId)) throw functionNotFound();
  const fn = await WeddingFunction.findOne({ _id: functionId, wedding: req.wedding._id });
  if (!fn) throw functionNotFound();
  return fn;
}

const withStatus = async (wedding, id) => (await functionsWithStatus(wedding)).find((f) => String(f._id) === String(id));

export async function listFunctions(req, res) {
  res.json({ data: await functionsWithStatus(req.wedding) });
}

export async function getFunction(req, res) {
  const fn = await loadFunction(req);
  res.json({ function: await withStatus(req.wedding, fn._id) });
}

export async function createFunction(req, res) {
  const fn = new WeddingFunction({ wedding: req.wedding._id, order: await WeddingFunction.countDocuments({ wedding: req.wedding._id }) });
  apply(fn, req.body, req.wedding.timezone);
  await fn.save();
  res.status(201).json({ function: await withStatus(req.wedding, fn._id) });
}

export async function updateFunction(req, res) {
  const fn = await loadFunction(req);
  apply(fn, req.body, req.wedding.timezone);
  await fn.save();
  res.json({ function: await withStatus(req.wedding, fn._id) });
}

// Tasks and expenses keep existing without a function, and guests lose the invitation and its
// answer. Albums (a later step) are cleared inside this same transaction too.
export async function deleteFunction(req, res) {
  const fn = await loadFunction(req);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Task.updateMany({ wedding: req.wedding._id, function: fn._id }, { $unset: { function: 1 } }, { session });
      await Expense.updateMany({ wedding: req.wedding._id, function: fn._id }, { $unset: { function: 1 } }, { session });
      await Guest.updateMany(
        { wedding: req.wedding._id, invitedFunctions: fn._id },
        { $pull: { invitedFunctions: fn._id, rsvps: { function: fn._id } } },
        { session },
      );
      await WeddingFunction.deleteOne({ _id: fn._id }, { session });
    });
  } finally {
    await session.endSession();
  }
  res.status(204).end();
}

// After a wedding's timezone changes, every startsAt moves with it.
export async function rederiveStartsAt(wedding, session) {
  const list = await WeddingFunction.find({ wedding: wedding._id }).session(session ?? null);
  if (list.length === 0) return;
  await WeddingFunction.bulkWrite(
    list.map((f) => ({
      updateOne: { filter: { _id: f._id }, update: { $set: { startsAt: zonedToUtc(f.localDate, f.startTime, wedding.timezone) } } },
    })),
    { session },
  );
}
