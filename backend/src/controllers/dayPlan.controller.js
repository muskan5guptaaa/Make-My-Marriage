import { DayPlan } from '../models/DayPlan.js';
import { Expense } from '../models/Expense.js';
import { WeddingFunction } from '../models/Function.js';
import { Guest } from '../models/Guest.js';
import { Task } from '../models/Task.js';
import { WeddingMember } from '../models/WeddingMember.js';
import { generateJson, requireAi } from '../utils/ai.js';
import { AppError, badRequest, notFoundError } from '../utils/AppError.js';
import { buildDayPrompt, byTime, DAY_SCHEMA, DAY_SYSTEM_PROMPT, dayChecks, dayReply, fixedRows, toRunSheet } from '../utils/dayPlan.js';
import { isRealDate, todayIn } from '../utils/time.js';

// Everything one day's run sheet is built from: its functions, and the tasks and vendors
// linked to them. 404 when no function falls on that day.
async function loadDay(req) {
  const { date } = req.params;
  if (!isRealDate(date)) throw badRequest('Enter a valid date.', { date: 'Use YYYY-MM-DD.' });
  const functions = await WeddingFunction.find({ wedding: req.wedding._id, localDate: date, archivedAt: null }).sort({ startsAt: 1, order: 1 }).lean();
  if (functions.length === 0) throw notFoundError('no_functions_that_day', 'No function is planned on this day.');
  const ids = functions.map((f) => f._id);
  const [tasks, expenses, plan, memberships] = await Promise.all([
    Task.find({ wedding: req.wedding._id, function: { $in: ids } }).populate('assignee', 'name').lean(),
    Expense.find({ wedding: req.wedding._id, function: { $in: ids } }).populate('category', 'name').lean(),
    DayPlan.findOne({ wedding: req.wedding._id, date }).lean(),
    WeddingMember.find({ wedding: req.wedding._id, acceptedAt: { $ne: null } }).populate('user', 'name').lean(),
  ]);
  const members = memberships.filter((m) => m.user).map((m) => ({ name: m.user.name }));
  return { date, functions, tasks, expenses, plan, members };
}

const toItem = (it, functions) => {
  const fn = it.function && functions.find((f) => String(f._id) === String(it.function));
  return { time: it.time, title: it.title, function: fn ? { _id: fn._id, name: fn.name } : null, who: it.who ?? null, notes: it.notes ?? null, fixed: false };
};

function dayResponse({ date, functions, tasks, expenses, plan, members }, items) {
  return {
    date,
    functions: functions.map((f) => ({ _id: f._id, name: f.name, startTime: f.startTime ?? null, venue: f.venue ?? null })),
    items,
    saved: Boolean(plan),
    updatedAt: plan?.updatedAt ?? null,
    checks: dayChecks({ functions, tasks, expenses, items }),
    people: [...new Set([...members.map((m) => m.name), ...expenses.map((e) => e.vendorName)])], // for "who"
  };
}

// GET /weddings/:weddingId/day-plans — every day with a function, and whether it has a plan.
export async function listDays(req, res) {
  const [functions, plans] = await Promise.all([
    WeddingFunction.find({ wedding: req.wedding._id, archivedAt: null }).sort({ startsAt: 1, order: 1 }).select('name localDate').lean(),
    DayPlan.find({ wedding: req.wedding._id }).select('date').lean(),
  ]);
  const saved = new Set(plans.map((p) => p.date));
  const days = new Map();
  for (const f of functions) days.set(f.localDate, [...(days.get(f.localDate) ?? []), f.name]);
  const data = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, names]) => ({ date, functions: names, saved: saved.has(date) }));
  res.json({ data, meta: { today: todayIn(req.wedding.timezone) } });
}

// GET /weddings/:weddingId/day-plans/:date — the saved run sheet (or just the function starts)
// with the day's checks. No AI.
export async function getDay(req, res) {
  const day = await loadDay(req);
  const items = [...(day.plan?.items ?? []).map((it) => toItem(it, day.functions)), ...fixedRows(day.functions)].sort(byTime);
  res.json(dayResponse(day, items));
}

// POST /weddings/:weddingId/day-plans/:date/draft — the AI's run sheet. Saves nothing: the
// page shows it for editing, then PUT saves what the couple keeps.
export async function draftDay(req, res) {
  requireAi();
  const day = await loadDay(req);
  const guests = await Guest.find({ wedding: req.wedding._id, 'rsvps.function': { $in: day.functions.map((f) => f._id) } }).select('rsvps').lean();
  const heads = new Map();
  for (const g of guests) {
    for (const r of g.rsvps) if (r.status === 'yes') heads.set(String(r.function), (heads.get(String(r.function)) ?? 0) + 1 + (r.plusOnes ?? 0));
  }
  const context = buildDayPrompt({
    wedding: req.wedding,
    date: day.date,
    functions: day.functions,
    tasks: day.tasks.map((t) => ({ ...t, assigneeName: t.assignee?.name })),
    expenses: day.expenses.map((e) => ({ ...e, categoryName: e.category?.name })),
    members: day.members,
    heads,
  });
  const raw = await generateJson({ system: DAY_SYSTEM_PROMPT, prompt: context.prompt, schema: DAY_SCHEMA });
  const reply = dayReply.safeParse(raw);
  if (!reply.success) {
    console.error('Day plan reply failed validation:', reply.error.issues.slice(0, 3));
    throw new AppError(502, 'ai_bad_output', "The assistant's run sheet didn't make sense. Try again.");
  }
  res.json(dayResponse(day, toRunSheet(reply.data, { ...context, functions: day.functions })));
}

// PUT /weddings/:weddingId/day-plans/:date { items } — saves the run sheet for that day.
export async function saveDay(req, res) {
  const day = await loadDay(req);
  const dayIds = new Set(day.functions.map((f) => String(f._id)));
  const items = req.body.items;
  if (items.some((it) => it.function && !dayIds.has(it.function))) {
    throw badRequest('Some fields need fixing.', { function: 'Choose a function from this day.' });
  }
  const plan = await DayPlan.findOneAndUpdate(
    { wedding: req.wedding._id, date: day.date },
    { $set: { items: items.map((it) => ({ ...it, function: it.function || undefined, who: it.who || undefined, notes: it.notes || undefined })), updatedBy: req.user._id } },
    { upsert: true, new: true, lean: true },
  );
  const rows = [...plan.items.map((it) => toItem(it, day.functions)), ...fixedRows(day.functions)].sort(byTime);
  res.json(dayResponse({ ...day, plan }, rows));
}
