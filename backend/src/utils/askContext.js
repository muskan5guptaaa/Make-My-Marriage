// Turns one wedding's records into the text the assistant reads, with a short reference per
// record ([F1] function, [G1] guest, [T1] task, [E1] expense, [B1] budget summary, [A1] album) so answers
// can cite their source.
// Phone numbers and emails are never included: the model is told only whether one exists.
// Counts and money totals are worked out here, so the model never has to do the arithmetic.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SIDE = { bride: 'bride side', groom: 'groom side', both: 'both sides' };
const PAID_BY = { 'bride-side': 'bride side', 'groom-side': 'groom side', shared: 'shared' };
const TASK_STATUS = { todo: 'to do', 'in-progress': 'in progress', done: 'done' };

export const rupees = (paise) =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const weekday = (ymd) => WEEKDAYS[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
const dated = (ymd) => `${ymd} (${weekday(ymd)})`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quote = (s) => `"${String(s).replace(/\s+/g, ' ').trim()}"`;

/**
 * @param data { wedding, functions, guests, tasks, expenses, categories, members, today, albums }
 *   Plain records as stored. `functions` should already exclude archived ones; `members` are
 *   { userId, name, role }, `today` is YYYY-MM-DD in the wedding's timezone; `albums` are
 *   { _id, name, function, photos, byGuests, hidden, uploaders: [{ name, count }], lastUploadedAt }.
 * @returns { text, refs } where refs maps "G3" to { kind, id, label }.
 */
export function buildAskContext({ wedding, functions, guests, tasks, expenses, categories, members, today, albums = [] }) {
  const refs = new Map();
  const add = (prefix, list, kind, label) =>
    new Map(
      list.map((item, i) => {
        const ref = `${prefix}${i + 1}`;
        refs.set(ref, { kind, id: String(item._id), label: label(item) });
        return [String(item._id), ref];
      }),
    );

  const fnRef = add('F', functions, 'function', (f) => `${f.name} · ${f.localDate}`);
  const guestRef = add('G', guests, 'guest', (g) => g.name);
  const taskRef = add('T', tasks, 'task', (t) => t.title);
  const catName = new Map(categories.map((c) => [String(c._id), c.name]));
  const expenseRef = add('E', expenses, 'expense', (e) => `${catName.get(String(e.category)) ?? 'Other'} · ${e.vendorName}`);
  const fnName = (id) => (id && fnRef.has(String(id)) ? `${functions.find((f) => String(f._id) === String(id)).name} [${fnRef.get(String(id))}]` : null);
  const memberName = new Map(members.map((m) => [String(m.userId), m.name]));

  const lines = [];
  const out = (s = '') => lines.push(s);

  out(`Wedding of ${wedding.brideName} & ${wedding.groomName}. Today is ${dated(today)}.`);
  if (members.length) out(`Planning team: ${members.map((m) => `${m.name} (${m.role})`).join(', ')}.`);

  // ---- functions, with RSVP totals per function ----
  const answers = (g, fnId) => g.rsvps?.find((r) => String(r.function) === fnId) ?? { status: 'pending', plusOnes: 0 };
  out();
  out(`## Functions (${functions.length})`);
  for (const f of functions) {
    const id = String(f._id);
    const invited = guests.filter((g) => g.invitedFunctions?.some((x) => String(x) === id));
    const yes = invited.filter((g) => answers(g, id).status === 'yes');
    const no = invited.filter((g) => answers(g, id).status === 'no').length;
    const people = yes.reduce((n, g) => n + 1 + (answers(g, id).plusOnes ?? 0), 0);
    const meals = {}; // meal → { count, names }
    for (const g of yes) {
      const { mealPreference: meal, plusOnes = 0 } = answers(g, id);
      if (!meal) continue;
      meals[meal] ??= { count: 0, names: [] };
      meals[meal].count += 1 + plusOnes;
      meals[meal].names.push(`${g.name} [${guestRef.get(String(g._id))}]${plusOnes ? ` +${plusOnes}` : ''}`);
    }
    const parts = [`[${fnRef.get(id)}] ${f.name}`, `${dated(f.localDate)}${f.startTime ? ` at ${f.startTime}` : ''}`];
    if (f.localDate < today) parts.push('already happened');
    if (f.venue || f.address) parts.push([f.venue, f.address].filter(Boolean).join(', '));
    if (f.dressCode) parts.push(`dress code: ${f.dressCode}`);
    if (f.livestreamUrl) parts.push('has a livestream');
    parts.push(
      `RSVPs: ${plural(invited.length, 'guest')} invited, ${yes.length} yes (${plural(people, 'person', 'people')} coming), ${no} no, ${invited.length - yes.length - no} not answered`,
    );
    if (Object.keys(meals).length) {
      parts.push(`meals of people coming: ${Object.entries(meals).map(([m, { count: n, names }]) => `${m} ${n} (${names.join(', ')})`).join('; ')}`);
    }
    out(parts.join(' · '));
    if (f.description) out(`  About: ${quote(f.description)}`);
  }

  // ---- guests ----
  out();
  out(`## Guests (${guests.length})`);
  const bySide = count(guests, (g) => SIDE[g.side] ?? 'both sides');
  const byGroup = count(guests, (g) => g.groupTag ?? 'other');
  out(`Totals: ${Object.entries(bySide).map(([k, n]) => `${n} ${k}`).join(', ')}; groups: ${Object.entries(byGroup).map(([k, n]) => `${k} ${n}`).join(', ')}; ${guests.filter((g) => g.accommodationNeeded).length} need accommodation; ${guests.filter((g) => !g.phone).length} have no phone number; ${guests.filter((g) => !g.email).length} have no email.`);
  for (const g of guests) {
    const parts = [`[${guestRef.get(String(g._id))}] ${g.name}`, SIDE[g.side] ?? 'both sides', g.groupTag ?? 'other'];
    if (g.plusOnesAllowed) parts.push(`may bring ${plural(g.plusOnesAllowed, 'extra person', 'extra people')}`);
    const invitedTo = (g.invitedFunctions ?? []).map(String).filter((id) => fnRef.has(id));
    if (invitedTo.length === 0) parts.push('not invited to any function yet');
    for (const id of invitedTo) {
      const a = answers(g, id);
      const name = functions.find((f) => String(f._id) === id).name;
      if (a.status === 'yes') {
        parts.push(`${name}: yes, ${plural(1 + (a.plusOnes ?? 0), 'person', 'people')}${a.mealPreference ? `, ${a.mealPreference}` : ''}`);
      } else {
        parts.push(`${name}: ${a.status === 'no' ? 'no' : 'not answered'}`);
      }
      if (a.note) parts.push(`${name} note: ${quote(a.note)}`);
    }
    if (g.accommodationNeeded) parts.push('needs accommodation');
    if (g.travelNotes) parts.push(`travel: ${quote(g.travelNotes)}`);
    if (g.notes) parts.push(`notes: ${quote(g.notes)}`);
    if (!g.phone) parts.push('no phone number');
    if (!g.email) parts.push('no email');
    if (g.invitationSentAt) parts.push('invitation emailed');
    if (g.photoAccess === 'view') parts.push('can view photos');
    if (g.photoAccess === 'upload') parts.push('can view and upload photos');
    out(parts.join(' · '));
  }

  // ---- tasks ----
  const overdue = (t) => t.status !== 'done' && t.dueDate && t.dueDate < today;
  out();
  out(`## Tasks (${tasks.length})`);
  const byStatus = count(tasks, (t) => TASK_STATUS[t.status]);
  out(`Totals: ${Object.entries(byStatus).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}; ${tasks.filter(overdue).length} overdue.`);
  for (const t of tasks) {
    const parts = [`[${taskRef.get(String(t._id))}] ${t.title}`, TASK_STATUS[t.status]];
    parts.push(fnName(t.function) ?? 'whole wedding');
    if (t.dueDate) parts.push(`due ${dated(t.dueDate)}${overdue(t) ? ', overdue' : ''}`);
    parts.push(t.assignee && memberName.has(String(t.assignee)) ? `assigned to ${memberName.get(String(t.assignee))}` : 'not assigned');
    if (t.description) parts.push(`details: ${quote(t.description)}`);
    out(parts.join(' · '));
  }

  // ---- budget ----
  const sum = (list, key) => list.reduce((n, e) => n + (e[key] ?? 0), 0);
  const budget = sum(expenses, 'budgetedAmountPaise');
  const spent = sum(expenses, 'actualAmountPaise');
  out();
  out(`## Budget (${plural(expenses.length, 'expense')}; amounts in Indian rupees)`);
  // Budget summary lines get their own references ([B1]…) so totals can be cited too.
  let summaries = 0;
  const summary = (label, id, line) => {
    const ref = `B${++summaries}`;
    refs.set(ref, { kind: 'budget', id, label });
    out(`[${ref}] ${line}`);
  };
  const over = (e) => (e.actualAmountPaise ?? 0) - e.budgetedAmountPaise;
  summary('Budget totals', 'totals', `Totals: budget ${rupees(budget)}, spent ${rupees(spent)}, ${budget >= spent ? `${rupees(budget - spent)} left` : `${rupees(spent - budget)} over budget`}.`);
  for (const c of categories) {
    const list = expenses.filter((e) => String(e.category) === String(c._id));
    if (list.length === 0) continue;
    const b = sum(list, 'budgetedAmountPaise');
    const s = sum(list, 'actualAmountPaise');
    summary(`${c.name} budget`, String(c._id), `Category ${c.name}: budget ${rupees(b)}, spent ${rupees(s)}${s > b ? `, over by ${rupees(s - b)}` : ''}.`);
  }
  const overspent = expenses.filter((e) => over(e) > 0);
  out(`Expenses that cost more than budgeted: ${overspent.map((e) => `${e.vendorName} [${expenseRef.get(String(e._id))}] by ${rupees(over(e))}`).join('; ') || 'none'}.`);
  for (const e of expenses) {
    const parts = [`[${expenseRef.get(String(e._id))}] ${catName.get(String(e.category)) ?? 'Other'}`, e.vendorName];
    parts.push(fnName(e.function) ?? 'whole wedding');
    parts.push(`budget ${rupees(e.budgetedAmountPaise)}`, `spent ${rupees(e.actualAmountPaise ?? 0)}`);
    if (over(e) > 0) parts.push(`over budget by ${rupees(over(e))}`);
    parts.push(`payment ${e.paymentStatus ?? 'pending'}`, `paid by ${PAID_BY[e.paidBy] ?? 'shared'}`);
    if (e.dueDate) parts.push(`due ${dated(e.dueDate)}`);
    if (e.notes) parts.push(`notes: ${quote(e.notes)}`);
    out(parts.join(' · '));
  }

  // ---- gallery ----
  const albumRef = add('A', albums, 'album', (a) => a.name);
  const totalPhotos = albums.reduce((n, a) => n + a.photos, 0);
  out();
  out(`## Gallery (${plural(albums.length, 'album')})`);
  out(`Totals: ${plural(totalPhotos, 'photo')}, ${albums.reduce((n, a) => n + a.byGuests, 0)} uploaded by guests, ${albums.reduce((n, a) => n + a.hidden, 0)} hidden from guests; guests with photo access: ${guests.filter((g) => g.photoAccess === 'view').length} can view, ${guests.filter((g) => g.photoAccess === 'upload').length} can view and upload.`);
  for (const a of albums) {
    const parts = [`[${albumRef.get(String(a._id))}] ${a.name}`, fnName(a.function) ? `album of ${fnName(a.function)}` : 'general album', plural(a.photos, 'photo')];
    if (a.byGuests) parts.push(`${a.byGuests} from guests`);
    if (a.hidden) parts.push(`${a.hidden} hidden from guests`);
    if (a.uploaders.length) parts.push(`uploaded by ${a.uploaders.map((u) => `${u.name} (${u.count})`).join(', ')}`);
    if (a.lastUploadedAt) parts.push(`last upload ${a.lastUploadedAt}`);
    out(parts.join(' · '));
  }

  return { text: lines.join('\n'), refs };
}

function count(list, keyOf) {
  const counts = {};
  for (const item of list) counts[keyOf(item)] = (counts[keyOf(item)] ?? 0) + 1;
  return counts;
}

// "[G1]" or "[G1, F2]" in an answer.
export const CITATION = /\[([FGTEBA]\d+(?:\s*,\s*[FGTEBA]\d+)*)\]/g;

// The references an answer cited, in order of first use, keeping only real ones.
export function citedRefs(answer, refs) {
  const seen = [];
  for (const [, group] of answer.matchAll(CITATION)) {
    for (const ref of group.split(/\s*,\s*/)) {
      if (refs.has(ref) && !seen.includes(ref)) seen.push(ref);
    }
  }
  return seen.map((ref) => ({ ref, ...refs.get(ref) }));
}
