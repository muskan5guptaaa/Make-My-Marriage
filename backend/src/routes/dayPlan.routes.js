import { Router } from 'express';
import * as days from '../controllers/dayPlan.controller.js';
import { aiLimit } from '../middleware/aiLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { saveDayPlanSchema } from '../validators/dayPlan.schemas.js';

export const dayPlanRouter = Router();

// Any member can read run sheets; drafting and saving need an active wedding.
const member = [requireAuth, loadWedding];
const D = '/weddings/:weddingId/day-plans';

dayPlanRouter.get(D, ...member, days.listDays);
dayPlanRouter.get(`${D}/:date`, ...member, days.getDay);
dayPlanRouter.post(`${D}/:date/draft`, ...member, requireActive, aiLimit, days.draftDay);
dayPlanRouter.put(`${D}/:date`, ...member, requireActive, validateBody(saveDayPlanSchema), days.saveDay);
