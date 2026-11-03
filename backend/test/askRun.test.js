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
const { AgentRun } = await import('../src/models/AgentRun.js');
const { WeddingFunction } = await import('../src/models/Function.js');
const { Guest } = await import('../src/models/Guest.js');
const { Task } = await import('../src/models/Task.js');

let mongo;
let app;
let cookie;
let wedding;
let W;
let sangeet;
let haldi;
let priya;
let kabir;
let task;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const post = (url, body, c = cookie) => request(app).post(`/api/v1${url}`).set('Cookie', c).send(body);
const patch = (url, body) => request(app).patch(`/api/v1${url}`).set('Cookie', cookie).send(body);
const get = (url, c = cookie) => request(app).get(`/api/v1${url}`).set('Cookie', c);
const apply = (steps, c) => post(`${W}/ask/apply`, { question: 'Move the Haldi and tell everyone', steps }, c);
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
  Object.assign(fake, { reply: '', toolCalls: [] });
  fake.calls.length = 0;
  sentEmails.length = 0;
  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Aisha Sharma', email: 'aisha@email.com', password: 'mehendi2026' });
  cookie = cookieOf(reg);
  wedding = (await post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  W = `/weddings/${wedding._id}`;
  sangeet = (await post(`${W}/functions`, { name: 'Sangeet', localDate: '2026-12-11', startTime: '19:00' })).body.function;
  haldi = (await post(`${W}/functions`, { name: 'Haldi', localDate: '2026-12-12', startTime: '09:00', venue: 'Home' })).body.function;
  // Through the API, so each guest has an RSVP per function and a private link.
  priya = (await post(`${W}/guests`, { name: 'Priya Mehta', email: 'priya@email.com', plusOnesAllowed: 2, invitedFunctions: [sangeet._id, haldi._id] })).body.guest;
  kabir = (await post(`${W}/guests`, { name: 'Kabir Singh', phone: '9876543210', invitedFunctions: [haldi._id] })).body.guest;
  task = (await post(`${W}/tasks`, { title: 'Order haldi paste', function: haldi._id, dueDate: '2026-12-10' })).body.task;
});

const moveHaldi = { kind: 'updateFunction', title: 'Change Haldi', changes: ['Date 12 Dec 2026 → 13 Dec 2026'], ids: { function: '' }, body: { localDate: '2026-12-13', startTime: '10:00' } };
const steps = () => [
  { kind: 'messageGuests', title: 'Message guests: Haldi', ids: { function: haldi._id }, body: { audience: 'everyone', message: 'The Haldi is now on Sunday 13 December at 10 am.' } },
  { ...moveHaldi, ids: { function: haldi._id } },
  { kind: 'updateTask', title: 'Update task: Order haldi paste', ids: { task: task._id }, body: { dueDate: '2026-12-11', status: 'in-progress' } },
  { kind: 'createTask', title: 'New task: Tell the caterer', body: { title: 'Tell the caterer about the new Haldi date' } },
  { kind: 'setRsvp', title: 'RSVP: Priya Mehta', ids: { guest: priya._id, function: haldi._id }, body: { status: 'yes', plusOnes: 1 } },
];

describe('planning agent: suggesting', () => {
  it('shows a function change as old → new, and puts messages last with who gets them', async () => {
    fake.reply = 'Here are 2 changes for you to approve.';
    fake.toolCalls = [
      { name: 'message_guests', args: { functionRef: 'F2', message: 'The Haldi moves to Sunday at 10 am.' } },
      { name: 'update_function', args: { functionRef: 'F2', date: '2026-12-13', startTime: '10:00', venue: 'Home' } },
    ];
    const res = await ask('Move the Haldi to Sunday 10 am and tell everyone');
    const { proposals } = res.body.trim().split('\n').map(JSON.parse).find((e) => e.type === 'proposals');

    assert.ok(fake.calls[0].tools.some((t) => t.name === 'update_function'));
    assert.match(fake.calls[0].system, /put messages to guests last/);
    assert.deepEqual(proposals, [
      {
        kind: 'updateFunction', ids: { function: haldi._id }, title: 'Change Haldi',
        body: { localDate: '2026-12-13', startTime: '10:00' }, // the venue didn't change
        changes: ['Date 12 Dec 2026 → 13 Dec 2026', 'Time 09:00 → 10:00'],
      },
      {
        kind: 'messageGuests', ids: { function: haldi._id }, title: 'Message guests: Haldi', cannotUndo: true,
        body: { audience: 'everyone', message: 'The Haldi moves to Sunday at 10 am.' },
        changes: ['2 guests invited to the Haldi', '1 by email, 1 on WhatsApp (you press send)'],
      },
    ]);
    assert.equal((await WeddingFunction.findById(haldi._id)).localDate, '2026-12-12', 'nothing changes until approved');
  });

  it('skips a message nobody would get', async () => {
    fake.toolCalls = [{ name: 'message_guests', args: { functionRef: 'F2', audience: 'coming', message: 'See you there!' } }];
    const res = await ask("Remind the people coming to the Haldi");
    const { proposals, skipped } = res.body.trim().split('\n').map(JSON.parse).find((e) => e.type === 'proposals');
    assert.deepEqual(proposals, []);
    assert.deepEqual(skipped, ['No guests coming to the Haldi, so there\'s nobody to message.']);
  });
});

describe('planning agent: applying', () => {
  it('saves every step in order, then messages the guests with the new details', async () => {
    const res = await apply(steps()).expect(201);

    const fn = await WeddingFunction.findById(haldi._id);
    assert.equal(fn.localDate, '2026-12-13');
    assert.equal(fn.startsAt.toISOString(), '2026-12-13T04:30:00.000Z', 'start time worked out again (IST)');
    const t = await Task.findById(task._id);
    assert.deepEqual([t.dueDate, t.status], ['2026-12-11', 'in-progress']);
    assert.equal(await Task.countDocuments({ title: /Tell the caterer/ }), 1);
    const g = await Guest.findById(priya._id);
    assert.deepEqual(g.rsvps.find((r) => String(r.function) === haldi._id).toObject().status, 'yes');

    // Priya has an email; Kabir only a phone, so he comes back as a WhatsApp link.
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'priya@email.com');
    assert.equal(sentEmails[0].subject, 'Haldi: an update from Aisha & Rohan');
    assert.match(sentEmails[0].text, /^Dear Priya Mehta,\n\nThe Haldi is now on Sunday 13 December at 10 am\.\n\nYour functions and RSVP: http\S+\/i\/\S+/);
    assert.equal(res.body.whatsapp.length, 1);
    assert.equal(res.body.whatsapp[0].name, 'Kabir Singh');
    assert.match(res.body.whatsapp[0].url, /^https:\/\/wa\.me\/919876543210\?text=Dear%20Kabir%20Singh/);

    const { run } = res.body;
    assert.deepEqual(run.steps.map((s) => s.kind), ['updateFunction', 'updateTask', 'createTask', 'setRsvp', 'messageGuests'], 'message sent last');
    assert.deepEqual(run.steps.at(-1).result, { emailed: 1, notEmailed: 1 });
    assert.equal(run.canUndo, true);

    const history = await get(`${W}/ask/runs`).expect(200);
    assert.equal(history.body.data.length, 1);
    assert.equal(history.body.data[0].createdBy.name, 'Aisha Sharma');
    assert.equal(history.body.data[0].question, 'Move the Haldi and tell everyone');
    const stored = await AgentRun.findOne().lean();
    assert.doesNotMatch(JSON.stringify(stored), /9876543210|priya@email/, 'no phones or emails kept in the history');
  });

  it('saves nothing and sends nothing when any step fails', async () => {
    const bad = [
      { ...moveHaldi, ids: { function: haldi._id } },
      { kind: 'setRsvp', title: 'RSVP: Kabir Singh', ids: { guest: kabir._id, function: sangeet._id }, body: { status: 'yes' } },
      steps()[0],
    ];
    const res = await apply(bad).expect(404);
    assert.equal(res.body.error.message, 'Step 2, “RSVP: Kabir Singh”: This guest is not invited to that function. Nothing was changed.');
    assert.equal((await WeddingFunction.findById(haldi._id)).localDate, '2026-12-12');
    assert.equal(await AgentRun.countDocuments(), 0);
    assert.equal(sentEmails.length, 0);
  });

  it('checks each step like its own page does', async () => {
    let res = await apply([{ ...moveHaldi, ids: { function: haldi._id }, body: { localDate: '2026-02-30' } }]).expect(400);
    assert.equal(res.body.error.fields['steps.0.body.localDate'], 'Enter a valid date.');
    res = await apply([{ kind: 'messageGuests', title: 'Message', ids: { function: haldi._id }, body: { audience: 'everyone', message: ' ' } }]).expect(400);
    assert.equal(res.body.error.fields['steps.0.body.message'], 'Write the message.');
    res = await apply([{ kind: 'deleteGuest', title: 'Delete', ids: { guest: priya._id }, body: {} }]).expect(400);
    res = await apply([{ kind: 'updateTask', title: 'Assign', ids: { task: task._id }, body: { assignee: new mongoose.Types.ObjectId().toString() } }]).expect(400);
    assert.equal(res.body.error.message, 'Step 1, “Assign”: Choose a member of this wedding. Nothing was changed.');
  });

  it("can't touch another wedding's records, or an archived wedding", async () => {
    const other = await request(app).post('/api/v1/auth/register').send({ name: 'Zoya', email: 'zoya@email.com', password: 'sangeet2026' });
    const zoya = cookieOf(other);
    const theirs = (await post('/weddings', { brideName: 'Zoya', groomName: 'Arjun' }, zoya)).body.wedding;
    const theirTask = (await post(`/weddings/${theirs._id}/tasks`, { title: 'Book the band' }, zoya)).body.task;

    const res = await apply([{ kind: 'updateTask', title: 'Update', ids: { task: theirTask._id }, body: { status: 'done' } }]).expect(404);
    assert.match(res.body.error.message, /no longer part of this wedding/);
    assert.equal((await Task.findById(theirTask._id)).status, 'todo');
    await apply(steps(), zoya).expect(404); // not her wedding

    await post(`${W}/archive`, {}).expect(200);
    await apply(steps()).expect(409);
  });
});

describe('planning agent: undo', () => {
  it('puts everything back in one tap, but never unsends a message', async () => {
    const { run } = (await apply(steps()).expect(201)).body;
    const res = await post(`${W}/ask/runs/${run._id}/undo`, {}).expect(200);

    assert.deepEqual(res.body.notes, ['Undid 4 changes.', 'Messages that were sent can’t be taken back.']);
    const fn = await WeddingFunction.findById(haldi._id);
    assert.deepEqual([fn.localDate, fn.startTime, fn.startsAt.toISOString()], ['2026-12-12', '09:00', '2026-12-12T03:30:00.000Z']);
    const t = await Task.findById(task._id);
    assert.deepEqual([t.dueDate, t.status], ['2026-12-10', 'todo']);
    assert.equal(await Task.countDocuments({ title: /Tell the caterer/ }), 0, 'the new task is removed');
    const r = (await Guest.findById(priya._id)).rsvps.find((x) => String(x.function) === haldi._id);
    assert.deepEqual([r.status, r.plusOnes, r.respondedAt], ['pending', 0, undefined]);
    assert.equal(res.body.run.canUndo, false);

    await post(`${W}/ask/runs/${run._id}/undo`, {}).expect(409);
  });

  it("leaves a record alone if someone changed it afterwards", async () => {
    const { run } = (await apply(steps().slice(1, 3)).expect(201)).body;
    await patch(`${W}/tasks/${task._id}`, { status: 'done' }).expect(200);

    const res = await post(`${W}/ask/runs/${run._id}/undo`, {}).expect(200);
    assert.deepEqual(res.body.notes, ['Undid 1 change.', 'Left as they are, because someone changed them afterwards: Update task: Order haldi paste.']);
    assert.equal((await Task.findById(task._id)).status, 'done', 'their edit is kept');
    assert.equal((await WeddingFunction.findById(haldi._id)).localDate, '2026-12-12');
  });

  it("only undoes this wedding's plans", async () => {
    await post(`${W}/ask/runs/${new mongoose.Types.ObjectId()}/undo`, {}).expect(404);
    await post(`${W}/ask/runs/nope/undo`, {}).expect(404);
  });
});
