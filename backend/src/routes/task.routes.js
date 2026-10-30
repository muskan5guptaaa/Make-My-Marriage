import { Router } from 'express';
import * as tasks from '../controllers/task.controller.js';
import * as plan from '../controllers/taskPlan.controller.js';
import { aiLimit } from '../middleware/aiLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { createTaskSchema, updateTaskSchema } from '../validators/task.schemas.js';
import { planTasksSchema, saveTasksSchema } from '../validators/taskPlan.schemas.js';

export const taskRouter = Router();

// Owners and co-admins manage tasks; archived weddings are read-only.
const member = [requireAuth, loadWedding];
const T = '/weddings/:weddingId/tasks';

taskRouter.get(T, ...member, tasks.listTasks);
taskRouter.post(T, ...member, requireActive, validateBody(createTaskSchema), tasks.createTask);
// The AI task plan: draft first (saves nothing), then save the drafts the couple kept.
taskRouter.post(`${T}/plan`, ...member, requireActive, aiLimit, validateBody(planTasksSchema), plan.planTasks);
taskRouter.post(`${T}/bulk`, ...member, requireActive, validateBody(saveTasksSchema), plan.saveTasks);
taskRouter.get(`${T}/:taskId`, ...member, tasks.getTask);
taskRouter.patch(`${T}/:taskId`, ...member, requireActive, validateBody(updateTaskSchema), tasks.updateTask);
taskRouter.delete(`${T}/:taskId`, ...member, requireActive, tasks.deleteTask);
