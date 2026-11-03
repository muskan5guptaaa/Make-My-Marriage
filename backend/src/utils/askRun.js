// Runs a plan from "Ask your wedding" once the person approves it, and undoes it later.
//
// Every change goes through the same checks and the same code as the matching page (the
// controllers' apply and checkReferences), inside one transaction: all of them are saved, or
// none. Each step keeps the values it replaced, so undo can put them back. Undo leaves a record
// alone if someone changed it after the plan ran, rather than overwrite their edit.
// Messages to guests go out last, after everything else is saved, and can't be undone.

import mongoose from 'mongoose';
import * as expenses from '../controllers/expense.controller.js';
import * as functions from '../controllers/function.controller.js';
import { applyRsvp, linkUrl } from '../controllers/guest.controller.js';
import * as tasks from '../controllers/task.controller.js';
import { AgentRun } from '../models/AgentRun.js';
import { Expense } from '../models/Expense.js';
import { WeddingFunction } from '../models/Function.js';
import { Guest } from '../models/Guest.js';
import { GuestLink } from '../models/GuestLink.js';
import { Task } from '../models/Task.js';
import { AppError, conflict, notFoundError } from './AppError.js';
import { messageRecipients } from './askActions.js';
import { sendEmail } from './email.js';

const TASK_FIELDS = ['title', 'description', 'function', 'assignee', 'dueDate', 'status'];
const RSVP_FIELDS = ['status', 'plusOnes', 'mealPreference', 'note', 'respondedAt'];

// Stored values in a form that compares and saves the same way: ids and dates as strings.
const plain = (v) => {
  if (v == null) return null;
  if (v instanceof mongoose.Types.ObjectId) return String(v);
  if (v instanceof Date) return v.toISOString();
  return v;
};
const pick = (doc, keys) => Object.fromEntries(keys.map((k) => [k, plain(doc[k])]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changedKeys = (body) => Object.keys(body).filter((k) => body[k] !== undefined);

async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

// Edits to one existing record, done exactly as its own page does them.
const EDITS = {
  updateTask: { model: Task, id: 'task', what: 'task', check: (w, body) => tasks.checkReferences(w, body), apply: (doc, body) => tasks.apply(doc, body) },
  updateExpense: { model: Expense, id: 'expense', what: 'expense', check: (w, body) => expenses.checkReferences(w._id, body), apply: (doc, body) => expenses.apply(doc, body) },
  updateFunction: { model: WeddingFunction, id: 'function', what: 'function', apply: (doc, body, w) => functions.apply(doc, body, w.timezone) },
};

async function runEdit(edit, step, { wedding, session }) {
  const doc = await edit.model.findOne({ _id: step.ids[edit.id], wedding: wedding._id }).session(session);
  if (!doc) throw notFoundError(`${edit.what}_not_found`, `This ${edit.what} is no longer part of this wedding.`);
  const keys = changedKeys(step.body);
  const before = pick(doc, keys);
  await edit.check?.(wedding, step.body);
  edit.apply(doc, step.body, wedding);
  await doc.save({ session });
  return { record: doc._id, before, after: pick(doc, keys) };
}

async function undoEdit(edit, step, { wedding, session }) {
  const doc = await edit.model.findOne({ _id: step.record, wedding: wedding._id }).session(session);
  if (!doc) return 'gone';
  if (!same(pick(doc, Object.keys(step.after)), step.after)) return 'changed';
  edit.apply(doc, step.before, wedding);
  await doc.save({ session });
  return 'undone';
}

const rsvpOf = (guest, functionId) => guest.rsvps.find((r) => String(r.function) === String(functionId));

// Each returns { record, before, after }.
const RUN = {
  ...Object.fromEntries(Object.entries(EDITS).map(([kind, edit]) => [kind, (step, ctx) => runEdit(edit, step, ctx)])),

  async createTask(step, { wedding, user, session }) {
    await tasks.checkReferences(wedding, step.body);
    const task = new Task({ wedding: wedding._id, createdBy: user._id });
    tasks.apply(task, step.body);
    await task.save({ session });
    return { record: task._id, before: null, after: pick(task, TASK_FIELDS) };
  },

  async setRsvp(step, { wedding, session }) {
    const guest = await Guest.findOne({ _id: step.ids.guest, wedding: wedding._id }).session(session);
    if (!guest) throw notFoundError('guest_not_found', 'This guest is no longer part of this wedding.');
    const before = rsvpOf(guest, step.ids.function);
    const old = before ? pick(before, RSVP_FIELDS) : null;
    applyRsvp(guest, step.ids.function, step.body); // fails if they aren't invited
    await guest.save({ session });
    return { record: guest._id, before: old, after: pick(rsvpOf(guest, step.ids.function), RSVP_FIELDS) };
  },
};

// Each returns 'undone', 'changed' (edited since, so left alone) or 'gone' (deleted since).
const UNDO = {
  ...Object.fromEntries(Object.entries(EDITS).map(([kind, edit]) => [kind, (step, ctx) => undoEdit(edit, step, ctx)])),

  async createTask(step, { wedding, session }) {
    const task = await Task.findOne({ _id: step.record, wedding: wedding._id }).session(session);
    if (!task) return 'gone';
    if (!same(pick(task, TASK_FIELDS), step.after)) return 'changed';
    await Task.deleteOne({ _id: task._id }, { session });
    return 'undone';
  },

  async setRsvp(step, { wedding, session }) {
    const guest = await Guest.findOne({ _id: step.record, wedding: wedding._id }).session(session);
    const r = guest && rsvpOf(guest, step.ids.function);
    if (!r) return 'gone';
    if (!same(pick(r, RSVP_FIELDS), step.after)) return 'changed';
    for (const key of RSVP_FIELDS) r[key] = step.before?.[key] ?? undefined;
    await guest.save({ session });
    return 'undone';
  },
};

// "Step 2, “Change Haldi”: Choose a function from this wedding. Nothing was changed."
async function asStep(i, step, work) {
  try {
    return await work();
  } catch (err) {
    if (!(err instanceof AppError) && !(err instanceof mongoose.Error.ValidationError)) throw err;
    const detail = Object.values(err.fields ?? err.errors ?? {})[0];
    const why = typeof detail === 'string' ? detail : (detail?.message ?? err.message);
    throw new AppError(err.status ?? 400, err.code ?? 'invalid_input', `Step ${i + 1}, “${step.title}”: ${why} Nothing was changed.`, { step: String(i) });
  }
}

// ---- messages ----

async function messageFunction(step, wedding) {
  const fn = await WeddingFunction.findOne({ _id: step.ids.function, wedding: wedding._id, archivedAt: null });
  if (!fn) throw notFoundError('function_not_found', 'This function is no longer part of this wedding.');
  const guests = await Guest.find({ wedding: wedding._id, invitedFunctions: fn._id }).sort({ name: 1 });
  const to = messageRecipients(guests, fn._id, step.body.audience);
  if (to.length === 0) throw conflict('no_recipients', 'No guests match this message any more.');
  return { fn, to };
}

// WhatsApp with the message already typed; 10-digit numbers are taken as Indian (+91).
function whatsappUrl(phone, text) {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits.length >= 11 ? digits : ''}?text=${encodeURIComponent(text)}`;
}

// Emails everyone it can, one after another; the rest come back as WhatsApp links for the
// couple to send. Each guest is greeted by name and gets their own RSVP link.
async function sendMessages(step, wedding) {
  const { fn, to } = await messageFunction(step, wedding);
  const links = await GuestLink.find({ guest: { $in: to.map((g) => g._id) }, revokedAt: null }).select('guest token');
  const tokens = new Map(links.map((l) => [String(l.guest), l.token]));
  const couple = `${wedding.brideName} & ${wedding.groomName}`;
  let emailed = 0;
  let emailWorks = true;
  const whatsapp = [];
  for (const g of to) {
    const token = tokens.get(String(g._id));
    const text = `Dear ${g.name},\n\n${step.body.message}${token ? `\n\nYour functions and RSVP: ${linkUrl(token)}` : ''}\n\nWith love,\n${couple}`;
    let delivered = false;
    if (g.email && emailWorks) {
      try {
        ({ delivered } = await sendEmail({ to: g.email, subject: `${fn.name}: an update from ${couple}`, text }));
        if (!delivered) emailWorks = false; // no email provider set up: the rest won't go either
      } catch (err) {
        console.error(`Message to ${g.email} failed: ${err.message}`);
      }
    }
    if (delivered) emailed++;
    else whatsapp.push({ name: g.name, url: whatsappUrl(g.phone, text) });
  }
  return { emailed, whatsapp };
}

// ---- the plan ----

export function toRun(run) {
  return {
    _id: run._id,
    question: run.question ?? null,
    createdAt: run.createdAt,
    createdBy: run.createdBy?.name ? { _id: run.createdBy._id, name: run.createdBy.name } : null,
    undoneAt: run.undoneAt ?? null,
    steps: run.steps.map((s) => ({ kind: s.kind, title: s.title, changes: s.changes, result: s.result ?? null, undo: s.undo ?? null })),
    canUndo: !run.undoneAt && run.steps.some((s) => s.kind !== 'messageGuests'),
  };
}

/**
 * Saves every change in the plan, or none, then sends its messages.
 * @returns { run, whatsapp: [{ name, url }] } — guests a message couldn't be emailed to.
 */
export async function applyPlan({ wedding, user, question, steps }) {
  const ordered = [...steps.filter((s) => s.kind !== 'messageGuests'), ...steps.filter((s) => s.kind === 'messageGuests')];
  // Messages are checked first too, so a plan never saves changes and then can't announce them.
  for (const [i, step] of ordered.entries()) {
    if (step.kind === 'messageGuests') await asStep(i, step, () => messageFunction(step, wedding));
  }

  let run;
  await inTransaction(async (session) => {
    const done = [];
    for (const [i, step] of ordered.entries()) {
      const saved = step.kind === 'messageGuests' ? {} : await asStep(i, step, () => RUN[step.kind](step, { wedding, user, session }));
      done.push({ kind: step.kind, title: step.title, changes: step.changes, ids: step.ids ?? {}, ...saved });
    }
    [run] = await AgentRun.create([{ wedding: wedding._id, createdBy: user._id, question, steps: done }], { session });
  });

  const whatsapp = [];
  for (const [i, step] of ordered.entries()) {
    if (step.kind !== 'messageGuests') continue;
    const sent = await sendMessages(step, wedding);
    run.steps[i].result = { emailed: sent.emailed, notEmailed: sent.whatsapp.length };
    whatsapp.push(...sent.whatsapp);
  }
  if (run.steps.some((s) => s.kind === 'messageGuests')) await run.save();
  return { run: toRun(run), whatsapp };
}

/**
 * Puts back what the plan replaced, newest step first, in one transaction.
 * @returns { run, notes } — notes say what was left as it was, and why.
 */
export async function undoPlan({ run, wedding, user }) {
  if (run.undoneAt) throw conflict('already_undone', 'These changes were already undone.');
  if (!run.steps.some((s) => s.kind !== 'messageGuests')) throw conflict('cannot_undo', 'Messages that were sent can’t be taken back.');
  await inTransaction(async (session) => {
    for (const step of [...run.steps].reverse()) {
      step.undo = step.kind === 'messageGuests' ? 'not-possible' : await UNDO[step.kind](step, { wedding, session });
    }
    run.undoneAt = new Date();
    run.undoneBy = user._id;
    await run.save({ session });
  });

  const notes = [];
  const titles = (outcome) => run.steps.filter((s) => s.undo === outcome).map((s) => s.title);
  const undone = titles('undone').length;
  notes.push(undone ? `Undid ${undone} change${undone === 1 ? '' : 's'}.` : 'Nothing was undone.');
  if (titles('changed').length) notes.push(`Left as they are, because someone changed them afterwards: ${titles('changed').join('; ')}.`);
  if (titles('gone').length) notes.push(`Already deleted: ${titles('gone').join('; ')}.`);
  if (titles('not-possible').length) notes.push('Messages that were sent can’t be taken back.');
  return { run: toRun(run), notes };
}
