import { Router } from 'express';
import * as guests from '../controllers/guest.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { createGuestSchema, importSchema, rsvpSchema, updateGuestSchema } from '../validators/guest.schemas.js';

export const guestRouter = Router();

// Owners and co-admins manage guests; archived weddings are read-only.
const member = [requireAuth, loadWedding];
const write = [...member, requireActive];
const W = '/weddings/:weddingId';
const G = `${W}/guests`;
const ONE = `${G}/:guestId`;

guestRouter.get(G, ...member, guests.listGuests);
guestRouter.post(G, ...write, validateBody(createGuestSchema), guests.createGuest);
guestRouter.post(`${G}/import`, ...write, validateBody(importSchema), guests.importGuests);
guestRouter.get(`${W}/rsvps/summary`, ...member, guests.rsvpSummary);

guestRouter.get(ONE, ...member, guests.getGuest);
guestRouter.patch(ONE, ...write, validateBody(updateGuestSchema), guests.updateGuest);
guestRouter.delete(ONE, ...write, guests.deleteGuest);
guestRouter.patch(`${ONE}/rsvps/:functionId`, ...write, validateBody(rsvpSchema), guests.setRsvp);

guestRouter.get(`${ONE}/link`, ...member, guests.getLink);
guestRouter.post(`${ONE}/link/regenerate`, ...write, guests.regenerateLink);
guestRouter.post(`${ONE}/link/revoke`, ...write, guests.revokeLink);
