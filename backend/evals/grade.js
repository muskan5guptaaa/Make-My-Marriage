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
