import { Router } from 'express';
import * as functions from '../controllers/function.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { createFunctionSchema, updateFunctionSchema } from '../validators/function.schemas.js';

export const functionRouter = Router();

// Owners and co-admins manage functions; archived weddings are read-only.
const member = [requireAuth, loadWedding];
const F = '/weddings/:weddingId/functions';

functionRouter.get(F, ...member, functions.listFunctions);
functionRouter.post(F, ...member, requireActive, validateBody(createFunctionSchema), functions.createFunction);
functionRouter.get(`${F}/:functionId`, ...member, functions.getFunction);
functionRouter.patch(`${F}/:functionId`, ...member, requireActive, validateBody(updateFunctionSchema), functions.updateFunction);
functionRouter.post(`${F}/:functionId/archive`, ...member, requireActive, functions.archiveFunction);
functionRouter.post(`${F}/:functionId/restore`, ...member, requireActive, functions.restoreFunction);
functionRouter.delete(`${F}/:functionId`, ...member, requireActive, functions.deleteFunction);
