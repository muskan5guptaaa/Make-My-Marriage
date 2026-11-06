import mongoose from 'mongoose';
import { WeddingFunction } from '../models/Function.js';
import { Guest } from '../models/Guest.js';
import { GuestLink } from '../models/GuestLink.js';
import { User } from '../models/User.js';
import { Wedding } from '../models/Wedding.js';
import { aiReady, generateJson, requireAi } from '../utils/ai.js';
import { AppError, forbidden, notFoundError } from '../utils/AppError.js';
import { buildChatPrompt, CHAT_SCHEMA, CHAT_SYSTEM_PROMPT, chatReply, toAnswers } from '../utils/rsvpChat.js';
import { weddingDateRange } from './function.controller.js';
import { applyRsvp } from './guest.controller.js';
import * as photos from './photo.controller.js';

// What a guest sees through their private link (/i/<token>): the couple, and only the
// functions they're invited to, each with their own answer. Nothing else from the wedding.

const linkNotWorking = () =>
  notFoundError('link_not_working', 'This invitation link is not working. It may have been turned off or replaced. Ask the couple for a new one.');

// A link resolves only while it's active and its wedding isn't archived.
async function resolve(token) {
  if (typeof token !== 'string' || token.length < 20) throw linkNotWorking();
  const link = await GuestLink.findOne({ token, revokedAt: null });
  if (!link) throw linkNotWorking();
  const [guest, wedding] = await Promise.all([Guest.findById(link.guest), Wedding.findById(link.wedding)]);
  if (!guest || !wedding || wedding.status !== 'active') throw linkNotWorking();
  return { link, guest, wedding };
}

async function view(guest, wedding, user) {
  const invited = await WeddingFunction.find({ _id: { $in: guest.invitedFunctions }, wedding: wedding._id, archivedAt: null }).sort({ startsAt: 1 });
  const answers = new Map(guest.rsvps.map((r) => [String(r.function), r]));
  return {
    wedding: {
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      timezone: wedding.timezone,
      dateRange: await weddingDateRange(wedding._id),
    },
    guest: { name: guest.name, plusOnesAllowed: guest.plusOnesAllowed },
    chat: aiReady(), // RSVP chat is offered only when the AI is set up
    photos: await photoStatus(guest, user),
    functions: invited.map((f) => {
      const r = answers.get(String(f._id));
      return {
        _id: f._id,
        name: f.name,
        localDate: f.localDate,
        startTime: f.startTime ?? null,
        venue: f.venue ?? null,
        address: f.address ?? null,
        dressCode: f.dressCode ?? null,
        description: f.description ?? null,
        livestreamUrl: f.livestreamUrl ?? null,
        rsvp: {
          status: r?.status ?? 'pending',
          plusOnes: r?.plusOnes ?? 0,
          mealPreference: r?.mealPreference ?? null,
          note: r?.note ?? null,
          respondedAt: r?.respondedAt ?? null,
        },
      };
    }),
  };
}

export async function getPortal(req, res) {
  const { link, guest, wedding } = await resolve(req.params.token);
  link.lastUsedAt = new Date(); // shown to planners as "last opened"
  await link.save();
  res.json(await view(guest, wedding, req.user));
}

// The guest answers yes or no for one function (with how many and meal choice for a yes).
export async function answerRsvp(req, res) {
  const { guest, wedding } = await resolve(req.params.token);
  if (!mongoose.isValidObjectId(req.params.functionId)) throw notFoundError('not_invited', 'You are not invited to that function.');
  applyRsvp(guest, req.params.functionId, req.body);
  await guest.save();
  res.json(await view(guest, wedding, req.user));
}

// Several answers at once (from the RSVP chat). One guest record, so all are saved or none.
export async function answerRsvps(req, res) {
  const { guest, wedding } = await resolve(req.params.token);
  for (const { function: functionId, ...body } of req.body.answers) applyRsvp(guest, functionId, body);
  await guest.save();
  res.json(await view(guest, wedding, req.user));
}

// POST /portal/:token/chat { messages } — the guest's reply in their own words, read by the AI.
// Saves nothing: returns the AI's reply and the answers it understood, for the guest to save.
export async function chat(req, res) {
  requireAi();
  const { guest, wedding } = await resolve(req.params.token);
  const { functions } = await view(guest, wedding, null);
  if (functions.length === 0) throw new AppError(409, 'no_functions', 'There are no functions on your invitation yet.');
  const context = buildChatPrompt({ wedding, guest, functions, messages: req.body.messages });
  const raw = await generateJson({ system: CHAT_SYSTEM_PROMPT, prompt: context.prompt, schema: CHAT_SCHEMA });
  const reply = chatReply.safeParse(raw);
  if (!reply.success) {
    console.error('RSVP chat reply failed validation:', reply.error.issues.slice(0, 3));
    throw new AppError(502, 'ai_bad_output', "Sorry, I didn't quite get that. Try again, or answer below.");
  }
  const others = await WeddingFunction.find({ wedding: wedding._id, archivedAt: null, _id: { $nin: functions.map((f) => f._id) } }).select('name').lean();
  res.json(toAnswers(reply.data, { ...context, guest, messages: req.body.messages, otherFunctions: others.map((f) => f.name) }));
}

// ---- photos, through the guest's link ----
// The invitation and RSVP are open to anyone with the link. Photos also need the guest to be
// signed in with the email on their guest record, and the couple to have given them access.

const signedInAsGuest = (guest, user) => Boolean(user && guest.email && user.email === guest.email);

async function photoStatus(guest, user) {
  return {
    access: guest.photoAccess, // none | view | upload
    email: guest.email ?? null, // the email to sign in with
    hasAccount: guest.email ? Boolean(guest.user) || Boolean(await User.exists({ email: guest.email })) : false,
    signedIn: signedInAsGuest(guest, user),
    signedInAs: user?.email ?? null,
  };
}

async function photoGate(guest, user, need) {
  if (guest.photoAccess === 'none') throw forbidden('no_photo_access', 'The couple hasn’t shared photos with you yet.');
  if (need === 'upload' && guest.photoAccess !== 'upload') throw forbidden('view_only', 'You can view photos but not add them.');
  if (!guest.email) throw new AppError(409, 'no_email', 'Ask the couple to add your email to your invitation, then sign in to see photos.');
  if (!user) throw new AppError(401, 'sign_in_required', `Sign in with ${guest.email} to see photos.`);
  if (!signedInAsGuest(guest, user)) {
    throw forbidden('wrong_account', `You're signed in as ${user.email}. Photos on this invitation are for ${guest.email}.`);
  }
  if (!guest.user) {
    guest.user = user._id; // remember who this guest is
    await guest.save();
  }
}

export async function getAlbums(req, res) {
  const { guest, wedding } = await resolve(req.params.token);
  await photoGate(guest, req.user, 'view');
  res.json({ data: await photos.guestAlbums(wedding, guest) });
}

export async function getAlbumPhotos(req, res) {
  const { guest, wedding } = await resolve(req.params.token);
  await photoGate(guest, req.user, 'view');
  const album = await photos.guestAlbum(wedding, guest, req.params.albumId);
  res.json({ data: await photos.listPhotosIn(album, { forPlanner: false }) });
}

export async function signPhoto(req, res) {
  const { guest, wedding } = await resolve(req.params.token);
  await photoGate(guest, req.user, 'upload');
  res.status(201).json(await photos.guestStartUpload(wedding, guest, req.params.albumId));
}

export async function completePhoto(req, res) {
  const { guest, wedding } = await resolve(req.params.token);
  await photoGate(guest, req.user, 'upload');
  res.json({ photo: await photos.guestFinishUpload(wedding, guest, req.params.photoId) });
}
