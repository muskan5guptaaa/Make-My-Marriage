import mongoose from 'mongoose';
import { WeddingFunction } from '../models/Function.js';
import { Task } from '../models/Task.js';
import { WeddingMember } from '../models/WeddingMember.js';
import { badRequest, notFoundError } from '../utils/AppError.js';
import { todayIn } from '../utils/time.js';
import { TASK_STATUSES } from '../validators/task.schemas.js';

const taskNotFound = () => notFoundError('task_not_found', 'This task is not part of this wedding.');
const EDITABLE = ['title', 'description', 'function', 'assignee', 'dueDate', 'status'];

function toTask(t, today) {
  return {
    _id: t._id,
    title: t.title,
    description: t.description ?? null,
    function: t.function ? { _id: t.function._id, name: t.function.name } : null,
    assignee: t.assignee ? { _id: t.assignee._id, name: t.assignee.name } : null,
    dueDate: t.dueDate ?? null,
    status: t.status,
    overdue: Boolean(t.dueDate && t.status !== 'done' && t.dueDate < today),
    completedAt: t.completedAt ?? null,
    createdBy: t.createdBy ? { _id: t.createdBy._id, name: t.createdBy.name } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

const populated = (query) =>
  query.populate('function', 'name').populate('assignee', 'name').populate('createdBy', 'name');

// Earliest due date first; tasks with no date go last; then oldest first.
const byDue = (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.createdAt - b.createdAt;

// The function and assignee must belong to this wedding (MongoDB has no foreign keys).
async function checkReferences(wedding, body) {
  const fields = {};
  if (body.function) {
    if (!(await WeddingFunction.exists({ _id: body.function, wedding: wedding._id }))) {
      fields.function = 'Choose a function from this wedding.';
    }
  }
  if (body.assignee) {
    const member = await WeddingMember.exists({ wedding: wedding._id, user: body.assignee, acceptedAt: { $ne: null } });
    if (!member) fields.assignee = 'Choose a member of this wedding.';
  }
  if (Object.keys(fields).length > 0) throw badRequest('Some fields need fixing.', fields);
}

function apply(task, body) {
  for (const key of EDITABLE) {
    if (body[key] !== undefined) task[key] = body[key] ?? undefined; // null clears the field
  }
  if (task.isModified('status')) task.completedAt = task.status === 'done' ? new Date() : undefined;
}

async function loadTask(req) {
  const { taskId } = req.params;
  if (!mongoose.isValidObjectId(taskId)) throw taskNotFound();
  const task = await Task.findOne({ _id: taskId, wedding: req.wedding._id });
  if (!task) throw taskNotFound();
  return task;
}

const sendTask = async (res, req, id, status = 200) => {
  const task = await populated(Task.findById(id));
  res.status(status).json({ task: toTask(task, todayIn(req.wedding.timezone)) });
};

// Filters: ?status=todo|in-progress|done, ?function=<id>|none, ?assignee=<userId>|none, ?mine=true.
// meta.counts always covers every status, so the filter chips can show totals.
export async function listTasks(req, res) {
  const { status, function: fn, assignee, mine } = req.query;
  const filter = { wedding: req.wedding._id };

  if (status !== undefined) {
    if (!TASK_STATUSES.includes(status)) throw badRequest('Unknown status filter.', { status: 'Use todo, in-progress or done.' });
    filter.status = status;
  }
  for (const [key, value] of [['function', fn], ['assignee', mine === 'true' ? String(req.user._id) : assignee]]) {
    if (value === undefined) continue;
    if (value === 'none') filter[key] = null;
    else if (mongoose.isValidObjectId(value)) filter[key] = new mongoose.Types.ObjectId(value); // aggregate doesn't cast
    else throw badRequest(`Unknown ${key} filter.`, { [key]: 'Use an id or none.' });
  }

  const today = todayIn(req.wedding.timezone);
  const tasks = (await populated(Task.find(filter))).sort(byDue).map((t) => toTask(t, today));

  const { status: _ignored, ...withoutStatus } = filter;
  const grouped = await Task.aggregate([{ $match: withoutStatus }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const counts = { all: 0, todo: 0, 'in-progress': 0, done: 0 };
  for (const g of grouped) {
    counts[g._id] = g.n;
    counts.all += g.n;
  }

  res.json({ data: tasks, meta: { counts } });
}

export async function getTask(req, res) {
  const task = await loadTask(req);
  await sendTask(res, req, task._id);
}

export async function createTask(req, res) {
  await checkReferences(req.wedding, req.body);
  const task = new Task({ wedding: req.wedding._id, createdBy: req.user._id });
  apply(task, req.body);
  await task.save();
  await sendTask(res, req, task._id, 201);
}

export async function updateTask(req, res) {
  const task = await loadTask(req);
  await checkReferences(req.wedding, req.body);
  apply(task, req.body);
  await task.save();
  await sendTask(res, req, task._id);
}

export async function deleteTask(req, res) {
  const task = await loadTask(req);
  await Task.deleteOne({ _id: task._id });
  res.status(204).end();
}
