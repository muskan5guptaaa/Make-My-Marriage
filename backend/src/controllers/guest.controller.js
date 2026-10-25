import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { WeddingFunction } from '../models/Function.js';
import { Guest } from '../models/Guest.js';
import { GuestLink } from '../models/GuestLink.js';
import { AppError, badRequest, notFoundError } from '../utils/AppError.js';
import { parseCsv } from '../utils/csv.js';
import { sendEmail } from '../utils/email.js';
import { randomToken } from '../utils/tokens.js';
import { GROUPS, RSVP_STATUSES, SIDES, createGuestSchema } from '../validators/guest.schemas.js';

const guestNotFound = () => notFoundError('guest_not_found', 'This guest is not part of this wedding.');
const EDITABLE = ['name', 'phone', 'email', 'side', 'groupTag', 'plusOnesAllowed', 'accommodationNeeded', 'travelNotes', 'notes', 'photoAccess'];

export const linkUrl = (token) => `${env.webAppUrl}/i/${token}`;

// Answers for functions that aren't archived. Archived ones keep their answers for a restore,
// but don't count until then. `archived` is a Set of function ids.
const NONE = new Set();
const liveRsvps = (guest, archived = NONE) => guest.rsvps.filter((r) => !archived.has(String(r.function)));

// One status per guest, for the RSVP column and the dashboard totals:
// not-invited (no functions) · pending (any function unanswered) · yes (at least one yes) · no (said no to all).
export function overallStatus(guest, archived = NONE) {
  const rsvps = liveRsvps(guest, archived);
  if (rsvps.length === 0) return 'not-invited';
  if (rsvps.some((r) => r.status === 'pending')) return 'pending';
  return rsvps.some((r) => r.status === 'yes') ? 'yes' : 'no';
}

// People coming: each yes counts the guest plus the plus-ones they bring.
const headsOf = (guest, archived = NONE) =>
  liveRsvps(guest, archived).reduce((n, r) => (r.status === 'yes' ? n + 1 + r.plusOnes : n), 0);

const archivedIn = (fns) => new Set([...fns.values()].filter((f) => f.archivedAt).map((f) => String(f._id)));

async function functionNames(weddingId) {
  const list = await WeddingFunction.find({ wedding: weddingId }).sort({ startsAt: 1 }).select('name localDate startTime venue archivedAt');
  return new Map(list.map((f) => [String(f._id), f]));
}

const toLink = (link) => (link ? { url: linkUrl(link.token), lastUsedAt: link.lastUsedAt ?? null, createdAt: link.createdAt } : null);

function toGuest(g, fns, link) {
  const archived = archivedIn(fns);
  const fn = (id) => ({ _id: id, name: fns.get(String(id))?.name ?? 'Deleted function', archived: archived.has(String(id)) });
  const out = {
    _id: g._id,
    name: g.name,
    phone: g.phone ?? null,
    email: g.email ?? null,
    side: g.side,
    groupTag: g.groupTag,
    plusOnesAllowed: g.plusOnesAllowed,
    accommodationNeeded: g.accommodationNeeded,
    travelNotes: g.travelNotes ?? null,
    notes: g.notes ?? null,
    invitedFunctions: g.invitedFunctions.map(fn),
    rsvps: g.rsvps.map((r) => ({
      function: fn(r.function),
      status: r.status,
      plusOnes: r.plusOnes,
      mealPreference: r.mealPreference ?? null,
      note: r.note ?? null,
      respondedAt: r.respondedAt ?? null,
    })),
    rsvpStatus: overallStatus(g, archived),
    heads: headsOf(g, archived),
    invitationSentAt: g.invitationSentAt ?? null,
    photoAccess: g.photoAccess,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
  if (link !== undefined) out.link = toLink(link); // only on single-guest responses
  return out;
}

// Invited functions must belong to this wedding.
async function checkFunctions(weddingId, ids) {
  if (!ids?.length) return;
  const unique = [...new Set(ids)];
  const found = await WeddingFunction.countDocuments({ _id: { $in: unique }, wedding: weddingId });
  if (found !== unique.length) throw badRequest('Some fields need fixing.', { invitedFunctions: 'Choose functions from this wedding.' });
}

// Keeps one RSVP per invited function, in the same order: new functions start pending,
// dropped ones lose their answer, and plus-ones never exceed what the guest is allowed.
function syncRsvps(guest) {
  const ids = [...new Set(guest.invitedFunctions.map(String))];
  const existing = new Map(guest.rsvps.map((r) => [String(r.function), typeof r.toObject === 'function' ? r.toObject() : r]));
  guest.invitedFunctions = ids;
  guest.rsvps = ids.map((id) => {
    const r = existing.get(id) ?? { function: id, status: 'pending', plusOnes: 0 };
    return { ...r, plusOnes: Math.min(r.plusOnes ?? 0, guest.plusOnesAllowed ?? 0) };
  });
}

function apply(guest, body) {
  for (const key of EDITABLE) {
    if (body[key] !== undefined) guest[key] = body[key] ?? undefined; // null clears the field
  }
  if (body.invitedFunctions !== undefined) guest.invitedFunctions = body.invitedFunctions;
  syncRsvps(guest);
}

async function loadGuest(req) {
  const { guestId } = req.params;
  if (!mongoose.isValidObjectId(guestId)) throw guestNotFound();
  const guest = await Guest.findOne({ _id: guestId, wedding: req.wedding._id });
  if (!guest) throw guestNotFound();
  return guest;
}

const activeLink = (guestId) => GuestLink.findOne({ guest: guestId, revokedAt: null });
const newLink = (guest) => ({ guest: guest._id, wedding: guest.wedding, token: randomToken() });

async function sendGuest(res, req, guestId, status = 200) {
  const [guest, fns, link] = await Promise.all([Guest.findById(guestId), functionNames(req.wedding._id), activeLink(guestId)]);
  res.status(status).json({ guest: toGuest(guest, fns, link) });
}

async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

// ---- list and summary ----

function summarize(guests, archived = NONE) {
  const s = { total: guests.length, invited: 0, yes: 0, no: 0, pending: 0, heads: 0 };
  for (const g of guests) {
    const status = overallStatus(g, archived);
    if (status === 'not-invited') continue;
    s.invited++;
    s[status]++;
    s.heads += headsOf(g, archived);
  }
  return s;
}

// Filters: ?q (name, email or phone), ?side, ?groupTag, ?function, ?rsvp=pending|yes|no
// (for that function when ?function is given, else the guest's overall status).
// A wedding has hundreds of guests at most, so filtering happens here after one query.
export async function listGuests(req, res) {
  const { q, side, groupTag, function: fnId, rsvp } = req.query;
  if (side && !SIDES.includes(side)) throw badRequest('Unknown side filter.', { side: 'Use bride, groom or both.' });
  if (groupTag && !GROUPS.includes(groupTag)) throw badRequest('Unknown group filter.', { groupTag: `Use ${GROUPS.join(', ')}.` });
  if (rsvp && !RSVP_STATUSES.includes(rsvp)) throw badRequest('Unknown RSVP filter.', { rsvp: 'Use pending, yes or no.' });
  if (fnId && !mongoose.isValidObjectId(fnId)) throw badRequest('Unknown function filter.', { function: 'Use a function id.' });

  const [all, fns] = await Promise.all([
    Guest.find({ wedding: req.wedding._id }).collation({ locale: 'en', strength: 2 }).sort({ name: 1 }),
    functionNames(req.wedding._id),
  ]);

  const archived = archivedIn(fns);
  const needle = q?.trim().toLowerCase();
  // "87074 63461" or "08707463461" still finds +918707463461.
  const needleDigits = needle && /^[+\d\s()-]+$/.test(needle) ? needle.replace(/\D/g, '').replace(/^0+/, '') : '';
  const filtered = all.filter((g) => {
    if (side && g.side !== side) return false;
    if (groupTag && g.groupTag !== groupTag) return false;
    if (fnId && !g.invitedFunctions.some((id) => String(id) === fnId)) return false;
    if (rsvp) {
      const status = fnId ? g.rsvps.find((r) => String(r.function) === fnId)?.status : overallStatus(g, archived);
      if (status !== rsvp) return false;
    }
    const textMatch = [g.name, g.email, g.phone].some((v) => v?.toLowerCase().includes(needle));
    if (needle && !textMatch && !(needleDigits && g.phone?.includes(needleDigits))) return false;
    return true;
  });

  res.json({ data: filtered.map((g) => toGuest(g, fns)), meta: { matching: filtered.length, summary: summarize(all, archived) } });
}

// Per function: how many guests are invited to each. Used for Functions' invitedCount.
export async function invitedCounts(weddingId) {
  const rows = await Guest.aggregate([
    { $match: { wedding: new mongoose.Types.ObjectId(String(weddingId)) } },
    { $unwind: '$invitedFunctions' },
    { $group: { _id: '$invitedFunctions', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

// Overall and per-function totals, plus the latest answers, for the dashboard.
export async function rsvpSummary(req, res) {
  const [guests, fnList] = await Promise.all([
    Guest.find({ wedding: req.wedding._id }),
    WeddingFunction.find({ wedding: req.wedding._id }).sort({ startsAt: 1 }).select('name localDate archivedAt'),
  ]);
  const archived = new Set(fnList.filter((f) => f.archivedAt).map((f) => String(f._id)));

  const functions = fnList.filter((f) => !f.archivedAt).map((f) => {
    const row = { function: { _id: f._id, name: f.name, localDate: f.localDate }, invited: 0, yes: 0, no: 0, pending: 0, heads: 0 };
    for (const g of guests) {
      const r = g.rsvps.find((x) => String(x.function) === String(f._id));
      if (!r) continue;
      row.invited++;
      row[r.status]++;
      if (r.status === 'yes') row.heads += 1 + r.plusOnes;
    }
    return row;
  });

  const fns = new Map(fnList.map((f) => [String(f._id), f]));
  const lastAnswer = (g) => Math.max(0, ...g.rsvps.map((r) => r.respondedAt?.getTime() ?? 0));
  const recent = guests
    .filter((g) => lastAnswer(g) > 0)
    .sort((a, b) => lastAnswer(b) - lastAnswer(a))
    .slice(0, 5)
    .map((g) => ({
      _id: g._id,
      name: g.name,
      rsvpStatus: overallStatus(g, archived),
      functions: g.invitedFunctions.map((id) => fns.get(String(id))).filter((f) => f && !f.archivedAt).map((f) => f.name),
      respondedAt: new Date(lastAnswer(g)),
    }));

  res.json({ overall: summarize(guests, archived), functions, recent });
}

// ---- one guest ----

export async function getGuest(req, res) {
  const guest = await loadGuest(req);
  await sendGuest(res, req, guest._id);
}

// The guest and their private link are created together.
export async function createGuest(req, res) {
  await checkFunctions(req.wedding._id, req.body.invitedFunctions);
  const guest = new Guest({ wedding: req.wedding._id });
  apply(guest, req.body);
  await inTransaction(async (session) => {
    await guest.save({ session });
    await GuestLink.create([newLink(guest)], { session });
  });
  await sendGuest(res, req, guest._id, 201);
}

export async function updateGuest(req, res) {
  const guest = await loadGuest(req);
  await checkFunctions(req.wedding._id, req.body.invitedFunctions);
  apply(guest, req.body);
  await guest.save();
  await sendGuest(res, req, guest._id);
}

export async function deleteGuest(req, res) {
  const guest = await loadGuest(req);
  await inTransaction(async (session) => {
    await GuestLink.deleteMany({ guest: guest._id }, { session });
    await Guest.deleteOne({ _id: guest._id }, { session });
  });
  res.status(204).end();
}

// Records one function's answer. Shared with the guest portal (step 7).
export function applyRsvp(guest, functionId, body) {
  const r = guest.rsvps.find((x) => String(x.function) === String(functionId));
  if (!r) throw notFoundError('not_invited', 'This guest is not invited to that function.');
  const plusOnes = body.status === 'no' ? 0 : (body.plusOnes ?? r.plusOnes ?? 0);
  if (plusOnes > guest.plusOnesAllowed) {
    throw new AppError(422, 'too_many_plus_ones', `This guest can bring at most ${guest.plusOnesAllowed}.`, {
      plusOnes: guest.plusOnesAllowed === 0 ? 'This guest has no plus-ones.' : `At most ${guest.plusOnesAllowed}.`,
    });
  }
  r.status = body.status;
  r.plusOnes = plusOnes;
  if (body.mealPreference !== undefined) r.mealPreference = body.mealPreference ?? undefined;
  if (body.note !== undefined) r.note = body.note ?? undefined;
  r.respondedAt = body.status === 'pending' ? undefined : new Date();
}

export async function setRsvp(req, res) {
  const guest = await loadGuest(req);
  if (!mongoose.isValidObjectId(req.params.functionId)) throw notFoundError('not_invited', 'This guest is not invited to that function.');
  applyRsvp(guest, req.params.functionId, req.body);
  await guest.save();
  await sendGuest(res, req, guest._id);
}

// ---- private link ----

export async function getLink(req, res) {
  const guest = await loadGuest(req);
  res.json({ link: toLink(await activeLink(guest._id)) });
}

// The old link stops working and a new one replaces it.
export async function regenerateLink(req, res) {
  const guest = await loadGuest(req);
  let created;
  await inTransaction(async (session) => {
    await GuestLink.updateMany({ guest: guest._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
    [created] = await GuestLink.create([newLink(guest)], { session });
  });
  res.json({ link: toLink(created) });
}

export async function revokeLink(req, res) {
  const guest = await loadGuest(req);
  await GuestLink.updateMany({ guest: guest._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  res.json({ link: null });
}

// ---- CSV import ----

const HEADERS = {
  name: ['name', 'guest', 'guest name', 'full name'],
  phone: ['phone', 'mobile', 'phone number', 'whatsapp'],
  email: ['email', 'e-mail', 'email address'],
  side: ['side'],
  groupTag: ['group', 'grouptag', 'relation'],
  functions: ['functions', 'function', 'invited to', 'events'],
  plusOnesAllowed: ['plus ones', 'plusones', 'plus-ones', 'plus_ones', '+1', 'plus one'],
};
const MAX_ROWS = 2000;

// All or nothing: if any row has a problem, nothing is imported and every problem is listed
// by row number. Rows matching an existing guest (same name and phone, or name and email) are skipped.
export async function importGuests(req, res) {
  const rows = parseCsv(req.body.csv);
  if (rows.length < 2) throw badRequest('The file has no guest rows under the header row.', { csv: 'Add a header row and at least one guest.' });
  if (rows.length - 1 > MAX_ROWS) throw badRequest(`Import at most ${MAX_ROWS} guests at a time.`, { csv: 'Split the file.' });

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(Object.entries(HEADERS).map(([k, names]) => [k, header.findIndex((h) => names.includes(h))]));
  if (col.name === -1) throw badRequest('The file needs a "Name" column.', { csv: 'Add a header row with a Name column.' });

  const fnList = await WeddingFunction.find({ wedding: req.wedding._id }).select('name');
  const fnByName = new Map(fnList.map((f) => [f.name.trim().toLowerCase(), String(f._id)]));
  const existing = await Guest.find({ wedding: req.wedding._id }).select('name phone email');
  const key = (name, contact) => (contact ? `${name.trim().toLowerCase()}|${contact.trim().toLowerCase()}` : null);
  const seen = new Set(existing.flatMap((g) => [key(g.name, g.phone), key(g.name, g.email)]).filter(Boolean));

  const errors = [];
  const toCreate = [];
  let skipped = 0;

  rows.slice(1).forEach((cells, i) => {
    const rowNumber = i + 2; // the header is row 1
    const cell = (k) => (col[k] === -1 ? '' : (cells[col[k]] ?? '').trim());
    const problems = [];

    const fnNames = cell('functions').split(/[;|,]/).map((s) => s.trim()).filter(Boolean);
    const unknown = fnNames.filter((n) => !fnByName.has(n.toLowerCase()));
    if (unknown.length) problems.push(`unknown function ${unknown.map((n) => `"${n}"`).join(', ')}`);

    const plusText = cell('plusOnesAllowed');
    const parsed = createGuestSchema.safeParse({
      name: cell('name'),
      phone: cell('phone'),
      email: cell('email'),
      side: cell('side').toLowerCase() || undefined,
      groupTag: cell('groupTag').toLowerCase() || undefined,
      plusOnesAllowed: plusText === '' ? undefined : plusText,
      invitedFunctions: fnNames.filter((n) => fnByName.has(n.toLowerCase())).map((n) => fnByName.get(n.toLowerCase())),
    });
    if (!parsed.success) problems.push(...parsed.error.issues.map((iss) => `${iss.path[0] ?? 'row'}: ${iss.message}`));

    if (problems.length) {
      errors.push({ row: rowNumber, name: cell('name') || null, message: problems.join('; ') });
      return;
    }
    const data = parsed.data;
    const keys = [key(data.name, data.phone), key(data.name, data.email)].filter(Boolean);
    if (keys.some((k) => seen.has(k))) {
      skipped++;
      return;
    }
    keys.forEach((k) => seen.add(k));
    toCreate.push(data);
  });

  if (errors.length) {
    throw new AppError(400, 'import_failed', `Nothing was imported. Fix ${errors.length} row${errors.length === 1 ? '' : 's'} and try again.`, {
      rows: errors,
    });
  }

  if (toCreate.length) {
    await inTransaction(async (session) => {
      const guests = toCreate.map((data) => {
        const g = new Guest({ wedding: req.wedding._id });
        apply(g, data);
        return g;
      });
      await Guest.insertMany(guests, { session });
      await GuestLink.insertMany(guests.map(newLink), { session });
    });
  }

  res.status(201).json({ created: toCreate.length, skipped });
}


// ---- emailing invitations ----

// The invitation email: who, which functions, and the guest's own link.
function invitationEmail(guest, wedding, fns, token) {
  const couple = `${wedding.brideName} & ${wedding.groomName}`;
  const lines = guest.invitedFunctions
    .map((id) => fns.get(String(id)))
    .filter((f) => f && !f.archivedAt)
    .map((f) => {
      const day = new Date(`${f.localDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
      return `  • ${f.name}: ${day}${f.startTime ? `, ${f.startTime}` : ''}${f.venue ? `, ${f.venue}` : ''}`;
    });
  return {
    to: guest.email,
    subject: `You're invited: ${couple}`,
    text:
      `Dear ${guest.name},\n\n` +
      `${couple} would love you to join them for:\n${lines.join('\n')}\n\n` +
      `See the details and RSVP for each function here (no login needed):\n${linkUrl(token)}\n\n` +
      `This link is just for you, so please don't forward it.\n\nWith love,\n${couple}`,
  };
}

// Sends one guest their link and records when. Returns { delivered, reason? }.
async function emailGuest(guest, wedding, fns) {
  if (!guest.email) return { delivered: false, reason: 'no_email' };
  const active = guest.invitedFunctions.filter((id) => fns.get(String(id)) && !fns.get(String(id)).archivedAt);
  if (active.length === 0) return { delivered: false, reason: 'no_functions' };
  const link = await activeLink(guest._id);
  if (!link) return { delivered: false, reason: 'no_link' };
  try {
    const { delivered } = await sendEmail(invitationEmail(guest, wedding, fns, link.token));
    if (!delivered) return { delivered: false, reason: 'email_not_set_up' };
  } catch (err) {
    console.error(`Invitation email to ${guest.email} failed: ${err.message}`);
    return { delivered: false, reason: 'send_failed' };
  }
  guest.invitationSentAt = new Date();
  await guest.save();
  return { delivered: true };
}

const WHY_NOT_SENT = {
  no_email: 'This guest has no email address. Add one, or share the link on WhatsApp.',
  no_functions: 'Choose at least one function for this guest first.',
  no_link: 'This guest’s link is turned off. Make a new link first.',
  email_not_set_up: 'Email isn’t set up on the server, so nothing was sent. Copy the link and send it yourself.',
  send_failed: 'The email could not be sent. Try again, or copy the link and send it yourself.',
};

export async function sendInvitation(req, res) {
  const guest = await loadGuest(req);
  const result = await emailGuest(guest, req.wedding, await functionNames(req.wedding._id));
  if (!result.delivered) {
    const status = result.reason === 'send_failed' || result.reason === 'email_not_set_up' ? 502 : 409;
    throw new AppError(status, result.reason, WHY_NOT_SENT[result.reason]);
  }
  await sendGuest(res, req, guest._id);
}

// Bulk send. audience: "not-sent" (never emailed) or "pending" (still has unanswered functions).
// dryRun: true only counts, so the page can ask "Send to 42 guests?" first.
// Sends one after another: Gmail allows about 500 a day, Resend's free plan 100.
export async function sendInvitations(req, res) {
  const { audience, dryRun } = req.body;
  const guests = await Guest.find({ wedding: req.wedding._id }).collation({ locale: 'en', strength: 2 }).sort({ name: 1 });
  const links = new Set((await GuestLink.find({ wedding: req.wedding._id, revokedAt: null }).select('guest')).map((l) => String(l.guest)));

  const fns = await functionNames(req.wedding._id);
  const archived = archivedIn(fns);
  const inAudience = guests.filter((g) =>
    audience === 'pending'
      ? overallStatus(g, archived) === 'pending'
      : overallStatus(g, archived) !== 'not-invited' && !g.invitationSentAt,
  );
  const ready = inAudience.filter((g) => g.email && links.has(String(g._id)));
  const counts = { eligible: ready.length, withoutEmail: inAudience.filter((g) => !g.email).length };
  if (dryRun) return res.json({ ...counts, sent: 0, failed: [] });

  let sent = 0;
  const failed = [];
  for (const g of ready) {
    const result = await emailGuest(g, req.wedding, fns);
    if (result.delivered) sent++;
    else failed.push({ _id: g._id, name: g.name, email: g.email, reason: WHY_NOT_SENT[result.reason] });
    if (result.reason === 'email_not_set_up') break; // nothing else will work either
  }
  res.json({ ...counts, sent, failed });
}

// Delete several guests at once (and their links). Ids from another wedding are ignored.
export async function deleteGuests(req, res) {
  const ids = [...new Set(req.body.ids)];
  let deleted = 0;
  await inTransaction(async (session) => {
    const found = await Guest.find({ _id: { $in: ids }, wedding: req.wedding._id }).select('_id').session(session);
    const own = found.map((g) => g._id);
    await GuestLink.deleteMany({ guest: { $in: own } }, { session });
    deleted = (await Guest.deleteMany({ _id: { $in: own } }, { session })).deletedCount;
  });
  res.json({ deleted });
}

// Set photo access for several guests at once. Ids from another wedding are ignored.
export async function setPhotoAccess(req, res) {
  const result = await Guest.updateMany(
    { _id: { $in: req.body.ids }, wedding: req.wedding._id },
    { $set: { photoAccess: req.body.photoAccess } },
  );
  res.json({ updated: result.modifiedCount });
}

// Weddings where this account's email is on the guest list (with a working link), so a
// guest who signs in can get back to their invitation. Only the couple's names and the link.
export async function guestInvitationsFor(user) {
  const guests = await Guest.find({ email: user.email }).select('wedding');
  if (guests.length === 0) return [];
  const links = await GuestLink.find({ guest: { $in: guests.map((g) => g._id) }, revokedAt: null }).populate('wedding', 'brideName groomName status');
  return links
    .filter((l) => l.wedding?.status === 'active')
    .map((l) => ({ wedding: { brideName: l.wedding.brideName, groomName: l.wedding.groomName }, path: `/i/${l.token}` }));
}
