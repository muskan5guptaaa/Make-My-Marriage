import { Router } from 'express';
import * as askController from '../controllers/ask.controller.js';
import { aiLimit } from '../middleware/aiLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { askSchema } from '../validators/ask.schemas.js';

export const askRouter = Router();

// Any member can ask, including on archived weddings: answering changes nothing.
askRouter.post('/weddings/:weddingId/ask', requireAuth, loadWedding, aiLimit, validateBody(askSchema), askController.ask);
