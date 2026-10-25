// Scores the "Ask your wedding" assistant: asks every question in evals/questions.json about
// the sample wedding, using the real model from .env, and checks each answer.
//
//   npm run eval                          all questions
//   npm run eval -- --only budget-left    just these ids (comma-separated)
//   npm run eval -- --model gemini-3.5-flash-lite   score one model (no switching to the next)
//
// Each question uses one of the model's ~20 free requests a day, so run it after changing
// the prompt or the context, not on every edit.
// The free Gemini plan allows only a few requests a minute, so questions are spaced out.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { env } from '../src/config/env.js';
import { SYSTEM_PROMPT, askPrompt } from '../src/controllers/ask.controller.js';
import { streamAnswer } from '../src/utils/ai.js';
import { buildAskContext } from '../src/utils/askContext.js';
import { grade } from '../evals/grade.js';
import { sampleWedding } from '../evals/sampleWedding.js';

const GAP_MS = 12_000;
const arg = (name) => process.argv[process.argv.indexOf(`--${name}`) + 1];
const only = process.argv.includes('--only') ? arg('only').split(',') : null;
if (process.argv.includes('--model')) env.gemini.models = [arg('model')];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!env.gemini.apiKey) {
  console.error('Set GEMINI_API_KEY in backend/.env first.');
  process.exit(1);
}

const { questions } = JSON.parse(await readFile(new URL('../evals/questions.json', import.meta.url), 'utf8'));
const chosen = only ? questions.filter((q) => only.includes(q.id)) : questions;
const { text, refs } = buildAskContext(sampleWedding);

console.log(`Models ${env.gemini.models.join(' → ')} · ${chosen.length} questions · context ${text.length} characters\n`);
const results = [];
for (const [i, q] of chosen.entries()) {
  if (i > 0) await sleep(GAP_MS);
  const started = Date.now();
  let firstMs = null;
  let answer = '';
  let error = null;
  try {
    for await (const piece of await streamAnswer({ system: SYSTEM_PROMPT, prompt: askPrompt(text, q.question) })) {
      firstMs ??= Date.now() - started;
      answer += piece;
    }
  } catch (err) {
    error = err.message;
  }
  const totalMs = Date.now() - started;
  const result = error ? { pass: false, problems: [`request failed: ${error}`], cited: 0 } : grade(answer, q, refs);
  results.push({ id: q.id, question: q.question, answer, ...result, firstMs, totalMs });

  console.log(`${result.pass ? '✔' : '✖'} ${q.id}  (${(totalMs / 1000).toFixed(1)}s)`);
  if (!result.pass) {
    console.log(`    ${result.problems.join('; ')}`);
    console.log(`    answer: ${answer.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
}

const passed = results.filter((r) => r.pass).length;
const answered = results.filter((r) => r.firstMs !== null);
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const summary = {
  models: env.gemini.models,
  questions: only ?? 'all',
  ranAt: new Date().toISOString(),
  passed,
  total: results.length,
  accuracy: `${Math.round((passed / results.length) * 100)}%`,
  medianFirstTextSeconds: +(median(answered.map((r) => r.firstMs)) / 1000).toFixed(1),
  medianTotalSeconds: +(median(answered.map((r) => r.totalMs)) / 1000).toFixed(1),
};
console.log(`\n${passed}/${results.length} passed (${summary.accuracy}) · first text after ${summary.medianFirstTextSeconds}s · full answer ${summary.medianTotalSeconds}s (medians)`);

const dir = new URL('../evals/results/', import.meta.url);
await mkdir(dir, { recursive: true });
const file = new URL(`${summary.ranAt.replace(/[:.]/g, '-')}.json`, dir);
await writeFile(file, JSON.stringify({ summary, results }, null, 2));
console.log(`Saved to evals/results/${file.pathname.split('/').pop()}`);
