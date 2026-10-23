import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { sentEmails } = await import('../src/utils/email.js');

let mongo;
let app;
let cookie;
let W;
let sangeet;
let reception;
let haldi;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const get = (url) => request(app).get(`/api/v1${url}`).set('Cookie', cookie);
const post = (url, body) => request(app).post(`/api/v1${url}`).set('Cookie', cookie).send(body);
const tokenOf = (guest) => guest.link.url.split('/i/')[1];
const portal = (token) => request(app).get(`/api/v1/portal/${token}`); // no cookie: guests have no account
const answer = (token, fnId, body) => request(app).put(`/api/v1/portal/${token}/rsvps/${fnId}`).send(body);

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
  sentEmails.length = 0;
  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Aisha Sharma', email: 'aisha@email.com', password: 'mehendi2026' });
  cookie = cookieOf(reg);
  const wedding = (await post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  W = `/weddings/${wedding._id}`;
  haldi = (await post(`${W}/functions`, { name: 'Haldi', localDate: '2026-10-18' })).body.function;
  sangeet = (await post(`${W}/functions`, { name: 'Sangeet', localDate: '2026-10-24', startTime: '19:00', venue: 'The Grand Lawns', dressCode: 'Gold' })).body.function;
  reception = (await post(`${W}/functions`, { name: 'Reception', localDate: '2026-10-27', livestreamUrl: 'https://youtu.be/dQw4w9WgXcQ' })).body.function;
});

const addPriya = async () =>
  (await post(`${W}/guests`, { name: 'Priya Mehta', email: 'priya@email.com', invitedFunctions: [sangeet._id, reception._id], plusOnesAllowed: 2 })).body.guest;

describe('guest portal', () => {
  it('shows only the functions the guest is invited to, without signing in', async () => {
    const g = await addPriya();
    const { body } = await portal(tokenOf(g)).expect(200);
    assert.equal(body.wedding.brideName, 'Aisha');
    assert.deepEqual(body.wedding.dateRange, { start: '2026-10-18', end: '2026-10-27' }); // the whole wedding
    assert.deepEqual(body.guest, { name: 'Priya Mehta', plusOnesAllowed: 2 });
    assert.deepEqual(body.functions.map((f) => f.name), ['Sangeet', 'Reception']); // no Haldi
    assert.equal(body.functions[0].dressCode, 'Gold');
    assert.equal(body.functions[1].livestreamUrl, 'https://youtu.be/dQw4w9WgXcQ');
    assert.equal(body.functions[0].rsvp.status, 'pending');
    assert.equal(body.email, undefined); // nothing private about the guest or wedding leaks

    const after = (await get(`${W}/guests/${g._id}`)).body.guest;
    assert.ok(after.link.lastUsedAt, 'opening the link is recorded');
  });

  it('lets the guest answer per function, and planners see it', async () => {
    const g = await addPriya();
    const t = tokenOf(g);
    const yes = await answer(t, sangeet._id, { status: 'yes', plusOnes: 1, mealPreference: 'Veg', note: 'Can’t wait!' }).expect(200);
    assert.deepEqual(yes.body.functions[0].rsvp.status, 'yes');
    await answer(t, reception._id, { status: 'no' }).expect(200);

    const planner = (await get(`${W}/guests/${g._id}`)).body.guest;
    assert.deepEqual(planner.rsvps.map((r) => [r.function.name, r.status, r.plusOnes]), [['Sangeet', 'yes', 1], ['Reception', 'no', 0]]);
    assert.equal(planner.rsvps[0].note, 'Can’t wait!');
    assert.equal(planner.rsvpStatus, 'yes');
  });

  it('refuses too many plus-ones, uninvited functions, and "pending"', async () => {
    const t = tokenOf(await addPriya());
    assert.equal((await answer(t, sangeet._id, { status: 'yes', plusOnes: 3 }).expect(422)).body.error.code, 'too_many_plus_ones');
    assert.equal((await answer(t, haldi._id, { status: 'yes' }).expect(404)).body.error.code, 'not_invited');
    await answer(t, sangeet._id, { status: 'pending' }).expect(400);
  });

  it('stops working when the link is turned off, replaced, or the wedding archived', async () => {
    const g = await addPriya();
    const old = tokenOf(g);
    const regen = (await post(`${W}/guests/${g._id}/link/regenerate`)).body.link.url.split('/i/')[1];
    assert.equal((await portal(old).expect(404)).body.error.code, 'link_not_working');
    await portal(regen).expect(200);

    await post(`${W}/archive`).expect(200);
    await portal(regen).expect(404);
    await answer(regen, sangeet._id, { status: 'yes' }).expect(404);
    await post(`${W}/restore`).expect(200);

    await post(`${W}/guests/${g._id}/link/revoke`).expect(200);
    await portal(regen).expect(404);
    await portal('made-up-token-that-is-long-enough').expect(404);
  });
});

describe('emailing invitations', () => {
  it('emails one guest their own link and records when', async () => {
    const g = await addPriya();
    const res = await post(`${W}/guests/${g._id}/send-invitation`).expect(200);
    assert.ok(res.body.guest.invitationSentAt);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'priya@email.com');
    assert.match(sentEmails[0].subject, /Aisha & Rohan/);
    assert.ok(sentEmails[0].text.includes(g.link.url));
    assert.match(sentEmails[0].text, /Sangeet: 24 October, 19:00, The Grand Lawns/);
    assert.doesNotMatch(sentEmails[0].text, /Haldi/);
  });

  it('explains why an invitation cannot be sent', async () => {
    const noEmail = (await post(`${W}/guests`, { name: 'Karan', invitedFunctions: [sangeet._id] })).body.guest;
    assert.equal((await post(`${W}/guests/${noEmail._id}/send-invitation`).expect(409)).body.error.code, 'no_email');
    const noFns = (await post(`${W}/guests`, { name: 'Neha', email: 'neha@email.com' })).body.guest;
    assert.equal((await post(`${W}/guests/${noFns._id}/send-invitation`).expect(409)).body.error.code, 'no_functions');
    const off = await addPriya();
    await post(`${W}/guests/${off._id}/link/revoke`);
    assert.equal((await post(`${W}/guests/${off._id}/send-invitation`).expect(409)).body.error.code, 'no_link');
    assert.equal(sentEmails.length, 0);
  });

  it('bulk: counts first, then sends only to guests not yet emailed', async () => {
    const priya = await addPriya();
    await post(`${W}/guests`, { name: 'Karan', email: 'karan@email.com', invitedFunctions: [sangeet._id] });
    await post(`${W}/guests`, { name: 'Neha', invitedFunctions: [sangeet._id] }); // no email
    await post(`${W}/guests`, { name: 'Divya', email: 'divya@email.com' }); // not invited to anything
    await post(`${W}/guests/${priya._id}/send-invitation`);
    sentEmails.length = 0;

    const preview = await post(`${W}/guests/send-invitations`, { audience: 'not-sent', dryRun: true }).expect(200);
    assert.deepEqual(preview.body, { eligible: 1, withoutEmail: 1, sent: 0, failed: [] });
    assert.equal(sentEmails.length, 0);

    const sent = await post(`${W}/guests/send-invitations`, { audience: 'not-sent' }).expect(200);
    assert.equal(sent.body.sent, 1);
    assert.deepEqual(sentEmails.map((e) => e.to), ['karan@email.com']);

    // Reminders: everyone with an unanswered function and an email, emailed or not.
    const pending = await post(`${W}/guests/send-invitations`, { audience: 'pending', dryRun: true }).expect(200);
    assert.equal(pending.body.eligible, 2);
    await post(`${W}/guests/send-invitations`, { audience: 'everyone' }).expect(400);
  });
});
