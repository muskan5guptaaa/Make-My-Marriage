// The changes "Ask your wedding" may suggest, and the checks that turn what the model asked for
// into proposals the page shows for approval. Nothing here saves anything: once approved, the
// page sends each change to the normal API (tasks, expenses, RSVPs), which checks it again.
//
// The model names records by the references in the wedding data ([T3], [F1], …), never by id, so
// it can only point at records of this wedding that it was shown.

import { rupees } from './askContext.js';
import { isRealDate } from './time.js';
import { updateExpenseSchema } from '../validators/expense.schemas.js';
import { rsvpSchema } from '../validators/guest.schemas.js';
import { createTaskSchema, TASK_STATUSES, updateTaskSchema } from '../validators/task.schemas.js';

export const MAX_PROPOSALS = 20;

const S = (description, extra = {}) => ({ type: 'STRING', description, ...extra });
const DATE = 'A date as YYYY-MM-DD, or "none" to clear it.';

// Gemini function declarations (OpenAPI-style schemas).
export const ASK_TOOLS = [
  {
    name: 'create_task',
    description: 'Suggest a new task for the planning team. One call per task.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: S('What needs doing, under 120 characters.'),
        description: S('Optional details.'),
        functionRef: S('The function it is for, like "F2". Leave out for the whole wedding.'),
        assignee: S('Name of a planning team member to assign it to.'),
        dueDate: S('A date as YYYY-MM-DD.'),
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: 'Suggest changes to one existing task. Send only the fields that change.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskRef: S('The task, like "T3".'),
        title: S('New title.'),
        status: S('New status.', { enum: TASK_STATUSES }),
        dueDate: S(DATE),
        assignee: S('Name of a planning team member, or "nobody" to unassign.'),
        functionRef: S('The function it is for, like "F2", or "none" for the whole wedding.'),
      },
      required: ['taskRef'],
    },
  },
  {
    name: 'update_expense',
    description: 'Suggest changes to one existing expense, for example recording a payment. Send only the fields that change.',
    parameters: {
      type: 'OBJECT',
      properties: {
        expenseRef: S('The expense, like "E2".'),
        paymentStatus: S('New payment status.', { enum: ['pending', 'partial', 'paid'] }),
        actualAmountRupees: { type: 'NUMBER', description: 'Total spent so far, in rupees.' },
        budgetedAmountRupees: { type: 'NUMBER', description: 'New budget, in rupees.' },
        dueDate: S(DATE),
        notes: S('New notes, replacing the old ones.'),
      },
      required: ['expenseRef'],
    },
  },
  {
    name: 'set_rsvp',
    description: "Record a guest's answer for one function they are invited to.",
    parameters: {
      type: 'OBJECT',
      properties: {
        guestRef: S('The guest, like "G4".'),
        functionRef: S('The function, like "F1".'),
        status: S('Their answer.', { enum: ['yes', 'no', 'pending'] }),
        plusOnes: { type: 'INTEGER', description: 'Extra people they bring, if they said so.' },
        mealPreference: S('Their meal choice, if they said so.'),
      },
      required: ['guestRef', 'functionRef', 'status'],
    },
  },
];

const TASK_STATUS = { todo: 'To do', 'in-progress': 'In progress', done: 'Done' };
const PAYMENT = { pending: 'Pending', partial: 'Partly paid', paid: 'Paid' };
const RSVP = { yes: 'Coming', no: 'Not coming', pending: 'Not answered' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (ymd) => (ymd ? `${Number(ymd.slice(8))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}` : 'no date');
const CLEAR = /^(none|null|nobody|no one|clear|)$/i;

class Skip extends Error {}

/**
 * @param calls [{ name, args }] as the model sent them.
 * @param context { refs, members, guests } — refs from buildAskContext, members { userId, name },
 *   guests as stored (for who is invited where).
 * @returns { proposals, skipped } — proposals { kind, ids, body, title, changes }; skipped are
 *   short reasons for calls that could not become a change.
 */
export function toProposals(calls, context) {
  const proposals = [];
  const skipped = [];
  for (const call of calls) {
    if (proposals.length >= MAX_PROPOSALS) {
      skipped.push(`Only ${MAX_PROPOSALS} changes can be suggested at once.`);
      break;
    }
    try {
      const build = BUILDERS[call.name];
      if (!build) throw new Skip(`The assistant tried something it can't do (${call.name}).`);
      proposals.push(build(call.args ?? {}, context));
    } catch (err) {
      if (!(err instanceof Skip)) throw err;
      skipped.push(err.message);
    }
  }
  return { proposals, skipped };
}

// "[T3]", " t3 " → the record behind it, if it is of the expected kind.
function record(refs, ref, kind, what) {
  const key = String(ref ?? '').replace(/[[\]\s]/g, '').toUpperCase();
  const found = refs.get(key);
  if (!found || found.kind !== kind) throw new Skip(`Couldn't find the ${what} the assistant meant (${ref || 'none given'}).`);
  return found;
}

function member(members, name) {
  const wanted = String(name).trim().toLowerCase();
  const exact = members.filter((m) => m.name.toLowerCase() === wanted);
  const first = members.filter((m) => m.name.toLowerCase().split(/\s+/)[0] === wanted);
  const match = exact.length === 1 ? exact : first;
  if (match.length !== 1) throw new Skip(`"${name}" isn't one person on the planning team.`);
  return match[0];
}

function date(value) {
  if (CLEAR.test(String(value).trim())) return null;
  if (!isRealDate(String(value))) throw new Skip(`"${value}" isn't a date.`);
  return value;
}

function rupeesToPaise(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Skip(`"${value}" isn't an amount.`);
  return Math.round(n * 100);
}

// Runs the same check the API will, so a bad suggestion is dropped before anyone approves it.
function checked(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) throw new Skip(result.error.issues[0]?.message ?? 'The suggested change is not valid.');
  return body;
}

const BUILDERS = {
  create_task(args, { refs, members }) {
    const body = { title: String(args.title ?? '').trim() };
    const changes = [];
    if (args.description) body.description = String(args.description);
    if (args.functionRef) {
      const fn = record(refs, args.functionRef, 'function', 'function');
      body.function = fn.id;
      changes.push(`For ${fn.label.split(' · ')[0]}`);
    } else {
      changes.push('For the whole wedding');
    }
    if (args.assignee) {
      const m = member(members, args.assignee);
      body.assignee = String(m.userId);
      changes.push(`Assigned to ${m.name}`);
    }
    if (args.dueDate) {
      body.dueDate = date(args.dueDate);
      if (body.dueDate) changes.push(`Due ${day(body.dueDate)}`);
    }
    checked(createTaskSchema, body);
    return { kind: 'createTask', ids: {}, body, title: `New task: ${body.title}`, changes };
  },

  update_task(args, { refs, members }) {
    const task = record(refs, args.taskRef, 'task', 'task');
    const body = {};
    const changes = [];
    if (args.title) {
      body.title = String(args.title).trim();
      changes.push(`Title → ${body.title}`);
    }
    if (args.status) {
      body.status = args.status;
      changes.push(`Status → ${TASK_STATUS[args.status] ?? args.status}`);
    }
    if (args.dueDate !== undefined) {
      body.dueDate = date(args.dueDate);
      changes.push(`Due → ${day(body.dueDate)}`);
    }
    if (args.assignee !== undefined) {
      if (CLEAR.test(String(args.assignee).trim())) {
        body.assignee = null;
        changes.push('Assigned → nobody');
      } else {
        const m = member(members, args.assignee);
        body.assignee = String(m.userId);
        changes.push(`Assigned → ${m.name}`);
      }
    }
    if (args.functionRef !== undefined) {
      if (CLEAR.test(String(args.functionRef).trim())) {
        body.function = null;
        changes.push('For → the whole wedding');
      } else {
        const fn = record(refs, args.functionRef, 'function', 'function');
        body.function = fn.id;
        changes.push(`For → ${fn.label.split(' · ')[0]}`);
      }
    }
    if (changes.length === 0) throw new Skip(`The assistant didn't say what to change on "${task.label}".`);
    checked(updateTaskSchema, body);
    return { kind: 'updateTask', ids: { task: task.id }, body, title: `Update task: ${task.label}`, changes };
  },

  update_expense(args, { refs }) {
    const expense = record(refs, args.expenseRef, 'expense', 'expense');
    const body = {};
    const changes = [];
    if (args.paymentStatus) {
      body.paymentStatus = args.paymentStatus;
      changes.push(`Payment → ${PAYMENT[args.paymentStatus] ?? args.paymentStatus}`);
    }
    if (args.actualAmountRupees !== undefined) {
      body.actualAmountPaise = rupeesToPaise(args.actualAmountRupees);
      changes.push(`Spent → ${rupees(body.actualAmountPaise)}`);
    }
    if (args.budgetedAmountRupees !== undefined) {
      body.budgetedAmountPaise = rupeesToPaise(args.budgetedAmountRupees);
      changes.push(`Budget → ${rupees(body.budgetedAmountPaise)}`);
    }
    if (args.dueDate !== undefined) {
      body.dueDate = date(args.dueDate);
      changes.push(`Due → ${day(body.dueDate)}`);
    }
    if (args.notes !== undefined) {
      body.notes = String(args.notes);
      changes.push(`Notes → ${body.notes || 'none'}`);
    }
    if (changes.length === 0) throw new Skip(`The assistant didn't say what to change on "${expense.label}".`);
    checked(updateExpenseSchema, body);
    return { kind: 'updateExpense', ids: { expense: expense.id }, body, title: `Update expense: ${expense.label}`, changes };
  },

  set_rsvp(args, { refs, guests }) {
    const guest = record(refs, args.guestRef, 'guest', 'guest');
    const fn = record(refs, args.functionRef, 'function', 'function');
    const fnName = fn.label.split(' · ')[0];
    const stored = guests.find((g) => String(g._id) === guest.id);
    if (!stored?.invitedFunctions?.some((f) => String(f) === fn.id)) {
      throw new Skip(`${guest.label} isn't invited to the ${fnName}.`);
    }
    const body = { status: args.status };
    const changes = [`${fnName} → ${RSVP[args.status] ?? args.status}`];
    if (args.plusOnes !== undefined && args.status === 'yes') {
      body.plusOnes = Number(args.plusOnes);
      if (body.plusOnes > 0) changes.push(`Bringing ${body.plusOnes} more`);
    }
    if (args.mealPreference) {
      body.mealPreference = String(args.mealPreference);
      changes.push(`Meal → ${body.mealPreference}`);
    }
    checked(rsvpSchema, body);
    return { kind: 'setRsvp', ids: { guest: guest.id, function: fn.id }, body, title: `RSVP: ${guest.label}`, changes };
  },
};
