import { WeddingFunction } from '../models/Function.js';
import { Task } from '../models/Task.js';
import { generateJson, requireAi } from '../utils/ai.js';
import { AppError, badRequest } from '../utils/AppError.js';
import { buildPlanPrompt, PLAN_SCHEMA, PLAN_SYSTEM_PROMPT, planReply, toDrafts } from '../utils/taskPlan.js';
import { todayIn } from '../utils/time.js';

// POST /weddings/:weddingId/tasks/plan { functions?, wholeWedding? }
// Drafts tasks for the chosen upcoming functions. Saves nothing: the page shows the drafts,
// the couple edits or drops them, then sends the ones they keep to /tasks/bulk.
export async function planTasks(req, res) {
  requireAi();
  const today = todayIn(req.wedding.timezone);
  const chosen = req.body.functions;
  const filter = { wedding: req.wedding._id, archivedAt: null, localDate: { $gte: today } };
  if (chosen) filter._id = { $in: chosen };
  const [functions, existingTasks] = await Promise.all([
    WeddingFunction.find(filter).sort({ startsAt: 1, order: 1 }).lean(),
    Task.find({ wedding: req.wedding._id }).select('title function').lean(),
  ]);
  if (functions.length === 0) {
    throw badRequest('Choose at least one upcoming function to plan for.', { functions: 'Choose an upcoming function.' });
  }

  const { wholeWedding } = req.body;
  const context = buildPlanPrompt({ wedding: req.wedding, functions, existingTasks, wholeWedding, today });
  const raw = await generateJson({ system: PLAN_SYSTEM_PROMPT, prompt: context.prompt, schema: PLAN_SCHEMA });
  const reply = planReply.safeParse(raw);
  if (!reply.success) {
    console.error('Task plan reply failed validation:', reply.error.issues.slice(0, 3));
    throw new AppError(502, 'ai_bad_output', "The assistant's plan didn't make sense. Try again.");
  }

  const data = toDrafts(reply.data, { ...context, existingTasks, wholeWedding, today });
  res.json({ data, meta: { functions: functions.map((f) => ({ _id: f._id, name: f.name, localDate: f.localDate })) } });
}

// POST /weddings/:weddingId/tasks/bulk { tasks: [{ title, description, function, dueDate }] }
export async function saveTasks(req, res) {
  const { tasks } = req.body;
  const ids = [...new Set(tasks.map((t) => t.function).filter(Boolean))];
  const found = await WeddingFunction.countDocuments({ _id: { $in: ids }, wedding: req.wedding._id });
  if (found !== ids.length) throw badRequest('Some fields need fixing.', { function: 'Choose a function from this wedding.' });

  const created = await Task.insertMany(
    tasks.map((t) => ({
      wedding: req.wedding._id,
      function: t.function || undefined,
      title: t.title,
      description: t.description || undefined,
      dueDate: t.dueDate || undefined,
      createdBy: req.user._id,
    })),
  );
  res.status(201).json({ created: created.length });
}
