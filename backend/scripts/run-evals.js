// Scores the "Ask your wedding" assistant: asks every question in evals/questions.json about
// the sample wedding, using the real model from .env, and checks each answer.
//
//   npm run eval                          all questions, whole wedding sent (today's approach)
//   npm run eval -- --rag                 search by meaning: only the closest records are sent
//   npm run eval -- --rag --k 15          ...keeping 15 records per question (default 10)
//   npm run eval -- --only budget-left    just these ids (comma-separated)
//   npm run eval -- --model gemini-3.5-flash-lite   score one model (no switching to the next)
//   npm run eval -- --resume evals/results/<file>.json   carry on a run that stopped
//
// Each question uses one of the models' free requests (about 20 a day per model), so run it
// after changing the prompt or the context, not on every edit. If today's allowance runs out,
// the run stops, saves what it has, and prints the --resume command for tomorrow.
// The free Gemini plan allows only a few requests a minute, so questions are spaced out.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { env } from '../src/config/env.js';
import { SYSTEM_PROMPT, askPrompt } from '../src/controllers/ask.controller.js';
import { embedTexts, streamAnswer } from '../src/utils/ai.js';
import { buildAskContext } from '../src/utils/askContext.js';
import { chunkText } from '../src/utils/aiIndex.js';
import { grade } from '../evals/grade.js';
import { sampleWedding } from '../evals/sampleWedding.js';

const GAP_MS = 12_000;
const has = (name) => process.argv.includes(`--${name}`);
const arg = (name) => process.argv[process.argv.indexOf(`--${name}`) + 1];
const only = has('only') ? arg('only').split(',') : null;
const rag = has('rag');
const k = has('k') ? Number(arg('k')) : 10;
if (has('model')) env.gemini.models = [arg('model')];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!env.gemini.apiKey) {
  console.error('Set GEMINI_API_KEY in backend/.env first.');
  process.exit(1);
}

const { questions } = JSON.parse(await readFile(new URL('../evals/questions.json', import.meta.url), 'utf8'));
const previous = has('resume') ? JSON.parse(await readFile(arg('resume'), 'utf8')) : null;
// Resuming keeps every answer that got through; questions that never got an answer run again.
const kept = (previous?.results ?? []).filter((r) => !r.problems.some((p) => p.startsWith('request failed')));
const done = new Set(kept.map((r) => r.id));
const chosen = (only ? questions.filter((q) => only.includes(q.id)) : questions).filter((q) => !done.has(q.id));
const whole = buildAskContext(sampleWedding);
const { refs } = whole;

// Search by meaning, done in code over the sample wedding: embed each record once, then keep
// the k closest to each question. Embeddings have their own free allowance.
let records = null;
if (rag) {
  const ids = [...whole.recordLines.keys()];
  const vectors = await embedTexts(ids.map((id) => chunkText(whole.recordLines.get(id).line)));
  records = ids.map((id, i) => ({ id, vector: vectors.at(i) }));
}
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
};
async function contextFor(question) {
  if (!rag) return whole.text;
  const [q] = await embedTexts([question], { task: 'query' });
  const keep = new Set(records.map((r) => ({ id: r.id, score: cosine(q, r.vector) })).sort((a, b) => b.score - a.score).slice(0, k).map((r) => r.id));
  return buildAskContext(sampleWedding, { keep }).text;
}

const mode = rag ? `search by meaning, ${k} records per question` : 'whole wedding';
console.log(`Models ${env.gemini.models.join(' → ')} · ${mode} · ${chosen.length} questions${done.size ? ` (${done.size} already answered)` : ''}\n`);
const results = [...kept];
let stoppedEarly = false;
for (const [i, q] of chosen.entries()) {
  if (i > 0) await sleep(GAP_MS);
  const started = Date.now();
  let firstMs = null;
  let answer = '';
  let error = null;
  try {
    const text = await contextFor(q.question);
    for await (const piece of await streamAnswer({ system: SYSTEM_PROMPT, prompt: askPrompt(text, q.question) })) {
      firstMs ??= Date.now() - started;
      answer += piece;
    }
  } catch (err) {
    error = err;
  }
  const totalMs = Date.now() - started;
  const result = error ? { pass: false, problems: [`request failed: ${error.message}`], cited: 0 } : grade(answer, q, refs);
  results.push({ id: q.id, question: q.question, answer, ...result, firstMs, totalMs });

  console.log(`${result.pass ? '✔' : '✖'} ${q.id}  (${(totalMs / 1000).toFixed(1)}s)`);
  if (!result.pass) {
    console.log(`    ${result.problems.join('; ')}`);
    if (answer) console.log(`    answer: ${answer.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
  if (error?.code === 'ai_daily_limit') {
    stoppedEarly = true;
    break;
  }
}

const answeredOk = results.filter((r) => !r.problems.some((p) => p.startsWith('request failed')));
const passed = answeredOk.filter((r) => r.pass).length;
// A valid source: cites at least one record and none that don't exist ("couldn't find" answers need none).
const notFound = new Set(questions.filter((q) => q.notFound).map((q) => q.id));
const withSource = answeredOk.filter(
  (r) => !r.problems.some((p) => p.includes("which doesn't exist")) && (r.cited > 0 || notFound.has(r.id)),
).length;
const answered = results.filter((r) => r.firstMs !== null);
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const summary = {
  models: env.gemini.models,
  mode,
  questions: only ?? 'all',
  ranAt: new Date().toISOString(),
  passed,
  answered: answeredOk.length,
  total: only ? only.length : questions.length,
  accuracy: `${Math.round((passed / Math.max(answeredOk.length, 1)) * 100)}%`,
  withValidSource: `${Math.round((withSource / Math.max(answeredOk.length, 1)) * 100)}%`,
  medianFirstTextSeconds: +(median(answered.map((r) => r.firstMs)) / 1000).toFixed(1),
  medianTotalSeconds: +(median(answered.map((r) => r.totalMs)) / 1000).toFixed(1),
};
console.log(`\n${passed}/${answeredOk.length} answered questions passed (${summary.accuracy}) · first text after ${summary.medianFirstTextSeconds}s · full answer ${summary.medianTotalSeconds}s (medians)`);
console.log(`V2 gate: 90% correct${answeredOk.length < summary.total ? ` once all ${summary.total} are answered` : ''}, and no answer citing a record that doesn't exist.`);

const dir = new URL('../evals/results/', import.meta.url);
await mkdir(dir, { recursive: true });
const file = new URL(`${summary.ranAt.replace(/[:.]/g, '-')}.json`, dir);
await writeFile(file, JSON.stringify({ summary, results }, null, 2));
const saved = `evals/results/${file.pathname.split('/').pop()}`;
console.log(`Saved to ${saved}`);
if (stoppedEarly) {
  console.log(`\nToday's free allowance ran out after ${answeredOk.length} answers. Tomorrow, carry on with:\n  npm run eval -- ${rag ? `--rag --k ${k} ` : ''}--resume ${saved}`);
}
