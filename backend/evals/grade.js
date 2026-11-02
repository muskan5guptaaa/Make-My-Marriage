import { CITATION } from '../src/utils/askContext.js';

// Scores one answer against its question in questions.json. Plain checks, no AI judge, so a
// score means the same thing every run.

const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'");

// A bare number must stand alone: "12" passes in "12 people", not in "2026-12-11" or "1,200".
function contains(answer, item) {
  if (/^\d+$/.test(item)) return new RegExp(`(?<![\\d,.\\-])${item}(?![\\d,\\-])`).test(answer);
  return norm(answer).includes(norm(item));
}

export function grade(answer, q, refs) {
  const problems = [];
  for (const item of q.includes ?? []) {
    const options = Array.isArray(item) ? item : [item];
    if (!options.some((o) => contains(answer, o))) problems.push(`missing ${options.map((o) => `"${o}"`).join(' or ')}`);
  }
  for (const item of q.excludes ?? []) {
    if (contains(answer, item)) problems.push(`should not mention "${item}"`);
  }

  const cited = new Set();
  for (const [, group] of answer.matchAll(CITATION)) {
    for (const ref of group.split(/\s*,\s*/)) {
      if (!refs.has(ref)) problems.push(`cites [${ref}], which doesn't exist`);
      cited.add(ref);
    }
  }
  for (const want of q.cites ?? []) {
    const [kind, label] = [want.slice(0, want.indexOf(':')), want.slice(want.indexOf(':') + 1)];
    const ref = [...refs].find(([, r]) => r.kind === kind && r.label === label)?.[0];
    if (!ref) problems.push(`test data has no ${want}`);
    else if (!cited.has(ref)) problems.push(`doesn't cite ${label} [${ref}]`);
  }

  if (q.notFound && !/couldn['’]t find|could not find/i.test(answer)) problems.push('should say it couldn\'t find the answer');
  if (!q.notFound && cited.size === 0) problems.push('cites no records');

  return { pass: problems.length === 0, problems, cited: cited.size };
}

// Scores the plan suggested for one request in agentQuestions.json: every expected step must be
// there, on the right record with the right fields, and nothing else may be suggested.
export function gradePlan(proposals, q, wedding) {
  const problems = [];
  const names = {
    function: new Map(wedding.functions.map((f) => [String(f._id), f.name])),
    task: new Map(wedding.tasks.map((t) => [String(t._id), t.title])),
    expense: new Map(wedding.expenses.map((e) => [String(e._id), e.vendorName])),
  };
  const recordOf = (p) => Object.entries(p.ids ?? {}).map(([kind, id]) => names[kind]?.get(String(id)));
  const left = [...proposals];
  for (const want of q.steps) {
    const label = `${want.kind} ${want.function ?? want.task ?? want.expense ?? ''}`.trim();
    const record = want.function ?? want.task ?? want.expense;
    const i = left.findIndex((p) => p.kind === want.kind && (!record || recordOf(p).includes(record)));
    if (i < 0) {
      problems.push(`missing step: ${label}`);
      continue;
    }
    const [p] = left.splice(i, 1);
    for (const [key, value] of Object.entries(want.body ?? {})) {
      if (p.body[key] !== value) problems.push(`${label}: ${key} is ${JSON.stringify(p.body[key])}, expected ${JSON.stringify(value)}`);
    }
    for (const [key, words] of Object.entries(want.contains ?? {})) {
      for (const w of words) if (!contains(String(p.body[key] ?? ''), w)) problems.push(`${label}: ${key} doesn't mention "${w}"`);
    }
  }
  for (const p of left) problems.push(`unexpected step: ${p.title}`);
  return { pass: problems.length === 0, problems, cited: 0 };
}
