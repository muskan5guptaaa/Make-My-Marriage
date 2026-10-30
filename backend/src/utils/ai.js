import { env } from '../config/env.js';
import { AppError } from './AppError.js';

// The one place that talks to an AI model. Today that is Google's Gemini API on its free plan;
// moving to another provider means changing only this file. In tests a fake stands in.

const TIMEOUT_MS = 60_000;
const MAX_RETRY_WAIT_MS = 15_000;

// Google's 429 body says how long to wait, e.g. { "@type": "...RetryInfo", "retryDelay": "7s" }.
function retryDelayMs(body) {
  const info = body?.error?.details?.find((d) => d.retryDelay);
  const seconds = parseFloat(info?.retryDelay);
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 250 : null;
}

export const aiReady = () => env.isTest || Boolean(env.gemini.apiKey);
export function requireAi() {
  if (!aiReady()) throw new AppError(503, 'ai_not_set_up', 'The assistant is not set up on the server yet.');
}

// Models whose daily allowance ran out, with the day it happened, so they're skipped until tomorrow.
const usedUp = new Map();
const today = () => new Date().toISOString().slice(0, 10);

// Starts an answer and returns an async iterable of pieces as the model writes them: text as
// strings and, when `tools` (Gemini function declarations) are given, each tool the model
// calls as { name, args }. Nothing here runs a tool; the caller decides what a call means.
// Problems before the first piece (no allowance left, bad key) throw here, while a normal
// JSON error can still be sent. `signal` stops the request when the person closes the page.
export async function streamAnswer({ system, prompt, tools, signal }) {
  if (env.isTest) return fakeStream({ system, prompt, tools });
  return withModels(signal, async (model) => {
    const res = await post(model, 'streamGenerateContent?alt=sse', requestBody({ system, prompt, tools }), signal);
    return readSse(res.body);
  });
}

// Asks for one JSON object shaped like `schema` (Gemini's OpenAPI-style schema) and returns it
// parsed. The caller still validates it: valid JSON can still hold wrong values.
export async function generateJson({ system, prompt, schema, signal }) {
  if (env.isTest) return fakeJson({ system, prompt, schema });
  return withModels(signal, async (model) => {
    const res = await post(model, 'generateContent', requestBody({ system, prompt, schema }), signal);
    const text = textOfEvent(await res.json());
    try {
      return JSON.parse(text);
    } catch {
      console.error(`Gemini returned text that isn't JSON for ${model}: ${text.slice(0, 300)}`);
      throw new AppError(502, 'ai_bad_output', "The assistant's reply didn't make sense. Try again.");
    }
  });
}

const requestBody = ({ system, prompt, schema, tools }) => ({
  systemInstruction: { parts: [{ text: system }] },
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
  generationConfig: schema
    ? { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema }
    : { temperature: 0.2 },
});

// Tries each model in env.gemini.models until one accepts.
async function withModels(signal, run) {
  let lastError = null;
  for (const model of env.gemini.models) {
    if (usedUp.get(model) === today()) continue;
    try {
      return await run(model);
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err.code === 'ai_daily_limit') usedUp.set(model, today());
      // Out of allowance or overloaded: the next model may still answer.
      if (!['ai_daily_limit', 'ai_busy', 'ai_unavailable'].includes(err.code)) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new AppError(429, 'ai_daily_limit', "The assistant has used today's free allowance. It will work again tomorrow.");
}

// One request to one model; the free plan's limits come back as clear errors.
async function post(model, method, payload, signal) {
  const { apiKey } = env.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`;
  const send = async () => {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)].filter(Boolean)),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new AppError(503, 'ai_unavailable', "The assistant didn't respond. Try again in a moment.");
    }
  };

  let res = await send();
  // The free plan's per-minute limit: when Google says to retry within a few seconds, wait once.
  if (res.status === 429) {
    let body = await res.json().catch(() => null);
    const wait = retryDelayMs(body);
    if (wait !== null && wait <= MAX_RETRY_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      res = await send();
      body = res.status === 429 ? await res.json().catch(() => null) : null;
    }
    if (res.status === 429) {
      const daily = JSON.stringify(body?.error?.details ?? []).includes('PerDay');
      console.error(`Gemini quota reached (${daily ? 'daily' : 'per minute'}) for ${model}`);
      throw daily
        ? new AppError(429, 'ai_daily_limit', "The assistant has used today's free allowance. It will work again tomorrow.")
        : new AppError(429, 'ai_busy', 'The assistant is busy right now. Try again in a minute.');
    }
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`Gemini request failed for ${model} (${res.status}): ${detail.slice(0, 300)}`);
    throw new AppError(503, 'ai_unavailable', "The assistant isn't available right now. Try again later.");
  }
  return res;
}

// Gemini streams server-sent events: "data: {json}" blocks separated by blank lines.
async function* readSse(body) {
  let buffer = '';
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    buffer += chunk.replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      yield* piecesOf(block);
    }
  }
  yield* piecesOf(buffer);
}

// One streamed event's text (as one string) and tool calls (each as { name, args }).
function piecesOf(block) {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');
  if (!data) return [];
  const parts = partsOfEvent(JSON.parse(data));
  const text = parts.map((p) => p.text ?? '').join('');
  const calls = parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args ?? {} }));
  return [...(text ? [text] : []), ...calls];
}

// The parts of one reply (or one streamed piece of it), leaving out the model's thinking.
function partsOfEvent(event) {
  if (event.promptFeedback?.blockReason) {
    throw new AppError(422, 'ai_blocked', "The assistant can't answer that question.");
  }
  return (event.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought);
}

const textOfEvent = (event) => partsOfEvent(event).map((p) => p.text ?? '').join('');

// Test stand-in: set `fake.reply` (text), `fake.toolCalls` ([{ name, args }], sent after the
// text) or `fake.json` (an object) before a request; each request is recorded in `fake.calls`.
export const fake = { reply: '', toolCalls: [], json: null, calls: [] };

async function fakeJson(request) {
  fake.calls.push(request);
  return structuredClone(fake.json);
}

async function* fakeStream(request) {
  fake.calls.push(request);
  const mid = Math.ceil(fake.reply.length / 2);
  yield fake.reply.slice(0, mid);
  yield fake.reply.slice(mid);
  for (const call of fake.toolCalls) yield structuredClone(call);
}
