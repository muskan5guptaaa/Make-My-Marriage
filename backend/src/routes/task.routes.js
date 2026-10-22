import { Router } from 'express';
import * as tasks from '../controllers/task.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { createTaskSchema, updateTaskSchema } from '../validators/task.schemas.js';

export const taskRouter = Router();

// Owners and co-admins manage tasks; archived weddings are read-only.
const member = [requireAuth, loadWedding];
const T = '/weddings/:weddingId/tasks';

taskRouter.get(T, ...member, tasks.listTasks);
taskRouter.post(T, ...member, requireActive, validateBody(createTaskSchema), tasks.createTask);
taskRouter.get(`${T}/:taskId`, ...member, tasks.getTask);
taskRouter.patch(`${T}/:taskId`, ...member, requireActive, validateBody(updateTaskSchema), tasks.updateTask);
taskRouter.delete(`${T}/:taskId`, ...member, requireActive, tasks.deleteTask);
