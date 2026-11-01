import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { fake } = await import('../src/utils/ai.js');
const { sentEmails } = await import('../src/utils/email.js');

let mongo;
let app;
let cookie;
let W;
let sangeet;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const post = (url, body, c = cookie) => request(app).post(`/api/v1${url}`).set('Cookie', c).send(body);
const patch = (url, body) => request(app).patch(`/api/v1${url}`).set('Cookie', cookie).send(body);

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
  fake.json = null;
  fake.calls.length = 0;
  sentEmails.length = 0;
  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Aisha Sharma', email: 'aisha@email.com', password: 'mehendi2026' });
  cookie = cookieOf(reg);
  const wedding = (await post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  W = `/weddings/${wedding._id}`;
  sangeet = (await post(`${W}/functions`, { name: 'Sangeet', localDate: '2026-12-11', dressCode: 'Indo-western', venue: 'The Grand Lawns' })).body.function;
  await post(`${W}/functions`, { name: 'Haldi', localDate: '2026-12-12' });
});

const DRAFT = {
  email: 'We are so happy to share that we are getting married, and our celebrations would not be complete without you.',
  whatsapp: 'We are getting married and would love you there! 💛',
};

describe('invitation writer: drafting', () => {
  it('drafts both messages in the chosen tone from the functions, and saves nothing', async () => {
    fake.json = DRAFT;
    const res = await post(`${W}/invitation/draft`, { tone: 'fun', notes: 'Mention the dhol at the Sangeet' }).expect(200);

    assert.deepEqual(res.body.draft, DRAFT);
    const { system, prompt } = fake.calls[0];
    assert.match(system, /the app adds each guest's own functions and private RSVP link/);
    assert.match(prompt, /Couple: Aisha & Rohan/);
    assert.match(prompt, /- Sangeet \(dress code: Indo-western\)\n- Haldi/);
    assert.match(prompt, /light and playful/);
    assert.match(prompt, /Notes from the couple: "Mention the dhol at the Sangeet"/);
    assert.doesNotMatch(prompt, /Grand Lawns|2026-12-11/, 'dates and venues are added by the app, not written by the model');

    const wedding = (await request(app).get(`/api/v1${W}`).set('Cookie', cookie)).body.wedding;
    assert.deepEqual(wedding.invitation, { email: null, whatsapp: null });
  });

  it('needs a known tone', async () => {
    const res = await post(`${W}/invitation/draft`, { tone: 'sad' }).expect(400);
    assert.equal(res.body.error.fields.tone, 'Choose warm, formal or fun.');
    assert.equal(fake.calls.length, 0);
  });

  it('says so when the model returns the wrong shape', async () => {
    fake.json = { email: 'Hi', whatsapp: '' };
    const res = await post(`${W}/invitation/draft`, { tone: 'warm' }).expect(502);
    assert.equal(res.body.error.code, 'ai_bad_output');
  });

  it('is only for members', async () => {
    const other = await request(app).post('/api/v1/auth/register').send({ name: 'Ravi', email: 'ravi@email.com', password: 'mehendi2026' });
    await post(`${W}/invitation/draft`, { tone: 'warm' }, cookieOf(other)).expect(404);
    assert.equal(fake.calls.length, 0);
  });
});

describe('invitation writer: using the saved words', () => {
  it('saves the words on the wedding, uses them in the email, and clears them with blanks', async () => {
    let res = await patch(W, { invitation: DRAFT }).expect(200);
    assert.deepEqual(res.body.wedding.invitation, DRAFT);

    const guest = (await post(`${W}/guests`, { name: 'Priya Mehta', email: 'priya@email.com', invitedFunctions: [sangeet._id] })).body.guest;
    await post(`${W}/guests/${guest._id}/send-invitation`, {}).expect(200);
    const { text } = sentEmails.at(-1);
    assert.match(text, new RegExp(`^Dear Priya Mehta,\\n\\n${DRAFT.email}\\n\\nYou're invited to:\\n  • Sangeet: 11 December, The Grand Lawns`));
    assert.match(text, /\/i\/[A-Za-z0-9_-]+/, 'the private link is still added');

    res = await patch(W, { invitation: { email: '', whatsapp: '  ' } }).expect(200);
    assert.deepEqual(res.body.wedding.invitation, { email: null, whatsapp: null });
    await post(`${W}/guests/${guest._id}/send-invitation`, {}).expect(200);
    assert.match(sentEmails.at(-1).text, /Aisha & Rohan would love you to join them for:/);
  });

  it('keeps each message within its length', async () => {
    const res = await patch(W, { invitation: { whatsapp: 'x'.repeat(501) } }).expect(400);
    assert.match(JSON.stringify(res.body.error), /Use at most 500 characters/);
  });
});
