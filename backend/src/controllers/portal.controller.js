import mongoose from 'mongoose';
import { WeddingFunction } from '../models/Function.js';
import { Guest } from '../models/Guest.js';
import { GuestLink } from '../models/GuestLink.js';
import { Wedding } from '../models/Wedding.js';
import { notFoundError } from '../utils/AppError.js';
import { weddingDateRange } from './function.controller.js';
import { applyRsvp } from './guest.controller.js';

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

async function view(guest, wedding) {
  const invited = await WeddingFunction.find({ _id: { $in: guest.invitedFunctions }, wedding: wedding._id }).sort({ startsAt: 1 });
  const answers = new Map(guest.rsvps.map((r) => [String(r.function), r]));
  return {
    wedding: {
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      timezone: wedding.timezone,
      dateRange: await weddingDateRange(wedding._id),
    },
    guest: { name: guest.name, plusOnesAllowed: guest.plusOnesAllowed },
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
  res.json(await view(guest, wedding));
}

// The guest answers yes or no for one function (with how many and meal choice for a yes).
export async function answerRsvp(req, res) {
  const { guest, wedding } = await resolve(req.params.token);
  if (!mongoose.isValidObjectId(req.params.functionId)) throw notFoundError('not_invited', 'You are not invited to that function.');
  applyRsvp(guest, req.params.functionId, req.body);
  await guest.save();
  res.json(await view(guest, wedding));
}
