import { Router } from 'express';
import * as askController from '../controllers/ask.controller.js';
import * as runs from '../controllers/askRun.controller.js';
import { aiLimit } from '../middleware/aiLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { askSchema } from '../validators/ask.schemas.js';
import { applyPlanSchema } from '../validators/askRun.schemas.js';

export const askRouter = Router();
const A = '/weddings/:weddingId/ask';

// Any member can ask, including on archived weddings: answering changes nothing.
askRouter.post(A, requireAuth, loadWedding, aiLimit, validateBody(askSchema), askController.ask);
// Approved changes, their history, and undo. No AI is called; archived weddings are read-only.
askRouter.post(`${A}/apply`, requireAuth, loadWedding, requireActive, validateBody(applyPlanSchema), runs.apply);
askRouter.get(`${A}/runs`, requireAuth, loadWedding, runs.listRuns);
askRouter.post(`${A}/runs/:runId/undo`, requireAuth, loadWedding, requireActive, runs.undo);
