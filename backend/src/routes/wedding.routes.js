import { Router } from 'express';
import * as weddings from '../controllers/wedding.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive, requireOwner } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { createWeddingSchema, deleteWeddingSchema, updateWeddingSchema } from '../validators/wedding.schemas.js';

export const weddingRouter = Router();

// Every route below /weddings/:weddingId first checks the caller is a member.
const member = [requireAuth, loadWedding];
const W = '/weddings/:weddingId';

weddingRouter.post('/weddings', requireAuth, validateBody(createWeddingSchema), weddings.createWedding);
weddingRouter.get('/weddings', requireAuth, weddings.listWeddings);

weddingRouter.get(W, ...member, weddings.getWedding);
weddingRouter.patch(W, ...member, requireActive, validateBody(updateWeddingSchema), weddings.updateWedding);
weddingRouter.post(`${W}/archive`, ...member, requireOwner, weddings.archiveWedding);
weddingRouter.post(`${W}/restore`, ...member, requireOwner, weddings.restoreWedding);
weddingRouter.delete(W, ...member, requireOwner, validateBody(deleteWeddingSchema), weddings.deleteWedding);
