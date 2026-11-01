// Search by meaning (RAG) for "Ask your wedding".
//
// Most weddings are small enough to send whole, which is also the most accurate for counting.
// For bigger ones (or always, with AI_RAG=always) the question finds the closest guests, tasks
// and expenses by meaning and only those lines are sent; Totals lines still count everyone.
//
// The index keeps itself in step: each question first compares every record's line with its
// stored chunk and re-embeds only what changed. So no save route has to remember to update it.
// If anything isn't ready (no vector index in Atlas, embeddings failing, still indexing), the
// whole wedding is sent instead, exactly as before.

import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AiChunk } from '../models/AiChunk.js';
import { embedTexts } from './ai.js';
import { buildAskContext } from './askContext.js';

export const VECTOR_INDEX = 'aichunks_vector';
export const TOP_K = 40; // lines sent per question
const EMBED_PER_QUESTION = 300; // new or changed records embedded before one answer

// The text a record is searched by: its line without references, which shift as records are added.
export const chunkText = (line) => line.replace(/\s?\[[A-Z]\d+\]/g, '').replace(/\s+/g, ' ').trim();

// Makes the stored chunks match the wedding's records: new ones added, changed ones marked for
// a new embedding, deleted ones removed.
export async function syncChunks(weddingId, recordLines) {
  const existing = await AiChunk.find({ wedding: weddingId }).select('record text').lean();
  const stored = new Map(existing.map((c) => [String(c.record), c]));
  const ops = [];
  for (const [id, { kind, line }] of recordLines) {
    const text = chunkText(line);
    const old = stored.get(id);
    if (!old) ops.push({ insertOne: { document: { wedding: weddingId, kind, record: id, text, needsEmbedding: true } } });
    else if (old.text !== text) {
      ops.push({ updateOne: { filter: { _id: old._id }, update: { $set: { text, needsEmbedding: true }, $unset: { embedding: 1 } } } });
    }
  }
  const gone = existing.filter((c) => !recordLines.has(String(c.record))).map((c) => c._id);
  if (gone.length) ops.push({ deleteMany: { filter: { _id: { $in: gone } } } });
  if (ops.length) await AiChunk.bulkWrite(ops, { ordered: false });
}

// Embeds chunks waiting for it, up to `max`. Returns how many are still waiting.
export async function embedPending(weddingId, max = EMBED_PER_QUESTION) {
  const pending = await AiChunk.find({ wedding: weddingId, needsEmbedding: true }).limit(max).select('text').lean();
  if (pending.length) {
    const vectors = await embedTexts(pending.map((c) => c.text));
    await AiChunk.bulkWrite(
      pending.map((c, i) => ({ updateOne: { filter: { _id: c._id }, update: { $set: { embedding: vectors.at(i), needsEmbedding: false } } } })),
      { ordered: false },
    );
  }
  return AiChunk.countDocuments({ wedding: weddingId, needsEmbedding: true });
}

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

// The ids of the k records closest in meaning to the question, within this wedding only.
// Atlas Vector Search in real use; in tests (no Atlas) the same ranking done in code.
export async function searchRecords(weddingId, question, k = TOP_K) {
  const [queryVector] = await embedTexts([question], { task: 'query' });
  let hits;
  if (env.isTest) {
    const all = await AiChunk.find({ wedding: weddingId, needsEmbedding: false }).select('record embedding').lean();
    hits = all
      .map((c) => ({ record: c.record, score: cosine(queryVector, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  } else {
    hits = await AiChunk.aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: 'embedding',
          queryVector,
          filter: { wedding: new mongoose.Types.ObjectId(String(weddingId)) },
          numCandidates: Math.max(k * 10, 100),
          limit: k,
        },
      },
      { $project: { record: 1 } },
    ]);
  }
  return new Set(hits.map((h) => String(h.record)));
}

/**
 * The context for one question: search by meaning when it's on and ready, else the whole wedding.
 * @returns { context: { text, refs, recordLines }, search: 'used' | 'whole' | 'indexing' | 'unavailable' }
 */
export async function contextForQuestion({ wedding, question, data }) {
  const whole = buildAskContext(data);
  const { rag, ragMinChars } = env.ai;
  if (rag === 'off' || (rag === 'auto' && whole.text.length < ragMinChars)) return { context: whole, search: 'whole' };

  try {
    await syncChunks(wedding._id, whole.recordLines);
    if ((await embedPending(wedding._id)) > 0) return { context: whole, search: 'indexing' };
    const keep = await searchRecords(wedding._id, question);
    if (keep.size === 0) return { context: whole, search: 'unavailable' };
    return { context: buildAskContext(data, { keep }), search: 'used' };
  } catch (err) {
    console.warn(`Search by meaning unavailable, sending the whole wedding: ${err.message}`);
    return { context: whole, search: 'unavailable' };
  }
}
