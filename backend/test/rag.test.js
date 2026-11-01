import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { fake } = await import('../src/utils/ai.js');
const { AppError } = await import('../src/utils/AppError.js');
const { buildAskContext } = await import('../src/utils/askContext.js');
const { chunkText } = await import('../src/utils/aiIndex.js');
const { AiChunk } = await import('../src/models/AiChunk.js');
const { Guest } = await import('../src/models/Guest.js');
const { Task } = await import('../src/models/Task.js');

let mongo;
let app;
let cookie;
let user;
let wedding;
let W;
let sangeet;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const post = (url, body, c = cookie) => request(app).post(`/api/v1${url}`).set('Cookie', c).send(body);
const ask = (question) =>
  post(`${W}/ask`, { question })
    .buffer(true)
    .parse((res, done) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => done(null, text));
    })
    .expect(200);

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  app = createApp();
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.connection.syncIndexes();
  Object.assign(fake, { reply: 'ok', toolCalls: [], embedError: null });
  fake.calls.length = 0;
  fake.embedCalls.length = 0;
  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Aisha Sharma', email: 'aisha@email.com', password: 'mehendi2026' });
  cookie = cookieOf(reg);
  user = reg.body.user;
  wedding = (await post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  W = `/weddings/${wedding._id}`;
  sangeet = (await post(`${W}/functions`, { name: 'Sangeet', localDate: '2026-12-11' })).body.function;
});
afterEach(() => {
  env.ai.rag = 'auto';
});

// 30 guests; only Lakshmi needs a Jain meal and an airport pickup.
async function seedGuests() {
  const guests = Array.from({ length: 29 }, (_, i) => ({
    wedding: wedding._id, name: `Guest ${String(i + 1).padStart(2, '0')}`, side: 'groom', email: `g${i}@email.com`, phone: '+919876500000',
    invitedFunctions: [sangeet._id], rsvps: [{ function: sangeet._id, status: 'yes', mealPreference: 'Veg' }],
  }));
  guests.push({
    wedding: wedding._id, name: 'Lakshmi Iyer', side: 'bride', phone: '+919876511111', email: 'lakshmi@email.com', travelNotes: 'Flying in from Chennai, needs airport pickup',
    invitedFunctions: [sangeet._id], rsvps: [{ function: sangeet._id, status: 'yes', mealPreference: 'Jain' }],
  });
  return Guest.create(guests);
}

describe('search by meaning: the context', () => {
  it('writes only the kept lines, while totals and references still cover everyone', async () => {
    const guests = await seedGuests();
    const lakshmi = guests.at(-1);
    const data = { wedding, functions: [{ ...sangeet, _id: sangeet._id }], guests, tasks: [], expenses: [], categories: [], members: [], today: '2026-11-20' };
    const whole = buildAskContext(data);
    const some = buildAskContext(data, { keep: new Set([String(lakshmi._id)]) });

    assert.equal(whole.recordLines.size, 30);
    assert.match(whole.text, /Guest 07/);
    assert.doesNotMatch(some.text, /Guest 07 ·/);
    assert.match(some.text, /\(Showing the 1 guests that best match the question, out of 30\. The Totals line counts all of them\.\)/);
    assert.match(some.text, /Lakshmi Iyer · bride side/);
    assert.match(some.text, /RSVPs: 30 guests invited, 30 yes/, 'function totals still count everyone');
    assert.deepEqual([...some.refs.keys()], [...whole.refs.keys()]);
    assert.equal(chunkText('[G30] Lakshmi Iyer · Sangeet [F1]: yes'), 'Lakshmi Iyer · Sangeet: yes');
  });
});

describe('search by meaning: asking', () => {
  it('sends a small wedding whole and never builds an index (auto)', async () => {
    await seedGuests();
    await ask('Who needs a Jain meal?');
    assert.equal(fake.embedCalls.length, 0);
    assert.equal(await AiChunk.countDocuments(), 0);
    assert.match(fake.calls[0].prompt, /Guest 07 ·/);
  });

  it('indexes every record, finds the closest ones, and re-embeds only what changed', async () => {
    env.ai.rag = 'always';
    const guests = await seedGuests();
    await Task.create({ wedding: wedding._id, title: 'Arrange airport pickups', createdBy: user._id });

    await ask('Who needs an airport pickup from Chennai?');
    assert.equal(await AiChunk.countDocuments({ wedding: wedding._id, needsEmbedding: false }), 31);
    const [docs, query] = fake.embedCalls;
    assert.equal(docs.texts.length, 31);
    assert.equal(query.task, 'query');
    assert.ok(docs.texts.every((t) => !/98765|@email\.com/.test(t)), 'phones and emails are never embedded');

    // 31 records, top 40 kept: everything fits, so nothing is left out yet.
    let { prompt } = fake.calls.at(-1);
    assert.match(prompt, /Lakshmi Iyer/);

    // Edit one guest, delete another: one new embedding, one chunk gone.
    await Guest.updateOne({ _id: guests[0]._id }, { $set: { notes: 'Brings the dhol' } });
    await Guest.deleteOne({ _id: guests[1]._id });
    fake.embedCalls.length = 0;
    await ask('Who brings the dhol?');
    assert.equal(fake.embedCalls[0].texts.length, 1);
    assert.match(fake.embedCalls[0].texts[0], /Brings the dhol/);
    assert.equal(await AiChunk.countDocuments(), 30);
    ({ prompt } = fake.calls.at(-1));
    assert.match(prompt, /Guest 01 .*Brings the dhol/);
  });

  it('keeps only the closest lines once there are more records than it sends', async () => {
    env.ai.rag = 'always';
    await seedGuests();
    await Guest.create(Array.from({ length: 20 }, (_, i) => ({ wedding: wedding._id, name: `Extra ${i}`, side: 'groom' })));
    await ask('Who is flying in from Chennai and needs an airport pickup?');
    const { prompt } = fake.calls.at(-1);
    assert.match(prompt, /Showing the 40 guests that best match the question, out of 50/);
    assert.match(prompt, /Lakshmi Iyer/);
  });

  it('sends the whole wedding when embeddings fail, and still answers', async () => {
    env.ai.rag = 'always';
    await seedGuests();
    fake.embedError = new AppError(503, 'ai_unavailable', 'down');
    fake.reply = 'Lakshmi Iyer [G30].';
    const res = await ask('Who needs a Jain meal?');
    assert.match(res.body, /Lakshmi Iyer/);
    assert.match(fake.calls[0].prompt, /Guest 07 ·/);
    assert.doesNotMatch(fake.calls[0].prompt, /Showing the/);
  });

  it('is never used when switched off', async () => {
    env.ai.rag = 'off';
    await seedGuests();
    await ask('Who needs a Jain meal?');
    assert.equal(fake.embedCalls.length, 0);
  });
});
