import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { fake } = await import('../src/utils/ai.js');
const { matchChecklist, buildPlanPrompt, toDrafts } = await import('../src/utils/taskPlan.js');
const { addDays, todayIn } = await import('../src/utils/time.js');
const { Task } = await import('../src/models/Task.js');

let mongo;
let app;
let cookie;
let wedding;
let W;
let sangeet;
let haldi;
let today;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const post = (url, body, c = cookie) => request(app).post(`/api/v1${url}`).set('Cookie', c).send(body);
const inDays = (n) => addDays(today, n);

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
  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Aisha Sharma', email: 'aisha@email.com', password: 'mehendi2026' });
  cookie = cookieOf(reg);
  wedding = (await post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  W = `/weddings/${wedding._id}`;
  today = todayIn(wedding.timezone);
  sangeet = (await post(`${W}/functions`, { name: 'Sangeet Night', localDate: inDays(60), startTime: '19:00', venue: 'The Grand Lawns' })).body.function;
  haldi = (await post(`${W}/functions`, { name: 'Haldi', localDate: inDays(61) })).body.function;
});

describe('task plan: matching checklists', () => {
  it('picks the checklist by the longest word in the name', () => {
    assert.equal(matchChecklist('Sangeet Night').id, 'sangeet');
    assert.equal(matchChecklist('Wedding Reception').id, 'reception');
    assert.equal(matchChecklist('Mehndi & Haldi').id, 'mehendi');
    assert.equal(matchChecklist('Pheras').id, 'wedding');
    assert.equal(matchChecklist('Pool brunch').id, 'event');
  });

  it('gives the model the functions, existing tasks and matching checklist items', () => {
    const { prompt, functionRefs, sourceRefs } = buildPlanPrompt({
      wedding: { brideName: 'Aisha', groomName: 'Rohan' },
      functions: [{ _id: 'f1', name: 'Sangeet', localDate: '2026-12-11', venue: 'The Grand Lawns' }],
      existingTasks: [{ title: 'Book the DJ', function: 'f1' }],
      wholeWedding: false,
      today: '2026-10-29',
    });
    assert.match(prompt, /\[F1\] Sangeet · 2026-12-11 · at The Grand Lawns · 43 days from today/);
    assert.match(prompt, /- Book the DJ \(Sangeet\)/);
    assert.match(prompt, /\[C1\] Book the DJ or band and the sound system · 45 days before/);
    assert.doesNotMatch(prompt, /Whole wedding/);
    assert.equal(functionRefs.get('F1')._id, 'f1');
    assert.equal(sourceRefs.get('C1'), 'Sangeet');
  });
});

describe('task plan: turning the reply into drafts', () => {
  const fn = { _id: 'f1', name: 'Sangeet', localDate: '2026-12-11' };
  const context = {
    functionRefs: new Map([['F1', fn]]),
    sourceRefs: new Map([['C1', 'Sangeet']]),
    firstDate: '2026-12-11',
    existingTasks: [{ title: 'Book the DJ!', function: 'f1' }],
    wholeWedding: true,
    today: '2026-10-29',
  };
  const task = (t) => ({ description: null, source: null, ...t });

  it('counts due dates back from the function and never before today', () => {
    const drafts = toDrafts(
      { tasks: [task({ title: 'Hold rehearsals', functionRef: 'F1', daysBefore: 10, source: 'C1' }), task({ title: 'Set the budget', functionRef: null, daysBefore: 120 })] },
      context,
    );
    assert.deepEqual(
      drafts.map((d) => [d.title, d.dueDate, d.late, d.source, d.function?.name ?? null]),
      [
        ['Set the budget', '2026-10-29', true, null, null],
        ['Hold rehearsals', '2026-12-01', false, 'Sangeet', 'Sangeet'],
      ],
    );
  });

  it('drops repeats, unknown functions and whole-wedding tasks when not asked for', () => {
    const reply = {
      tasks: [
        task({ title: 'book the dj', functionRef: 'F1', daysBefore: 40 }), // already on the list
        task({ title: 'Book DJ or band and sound system for the Sangeet', functionRef: 'F1', daysBefore: 45 }), // same, more words
        task({ title: 'Hire a choreographer', functionRef: 'F1', daysBefore: 40 }),
        task({ title: 'Hire a choreographer', functionRef: 'F1', daysBefore: 30 }),
        task({ title: 'Book the mandap', functionRef: 'F9', daysBefore: 30 }),
        task({ title: 'Print cards', functionRef: null, daysBefore: 30 }),
      ],
    };
    const drafts = toDrafts(reply, { ...context, wholeWedding: false });
    assert.deepEqual(drafts.map((d) => d.title), ['Hire a choreographer']);
  });
});

describe('task plan: drafting', () => {
  it('drafts tasks for upcoming functions without saving any', async () => {
    await post(`${W}/functions`, { name: 'Roka', localDate: addDays(today, -30) }); // already happened
    await post(`${W}/tasks`, { title: 'Book the DJ or band', function: sangeet._id });
    fake.json = {
      tasks: [
        { title: 'Book a choreographer for the Sangeet Night', description: 'Ask about group rates', functionRef: 'F1', daysBefore: 40, source: 'C2' },
        { title: 'Buy haldi paste ingredients', description: null, functionRef: 'F2', daysBefore: 3, source: 'C8' },
        { title: 'Set the total budget', description: null, functionRef: null, daysBefore: 120, source: null },
      ],
    };

    const res = await post(`${W}/tasks/plan`, {}).expect(200);

    assert.deepEqual(res.body.meta.functions.map((f) => f.name), ['Sangeet Night', 'Haldi']);
    assert.deepEqual(
      res.body.data.map((d) => [d.title, d.function?.name ?? null, d.dueDate, d.late]),
      [
        ['Set the total budget', null, today, true],
        ['Book a choreographer for the Sangeet Night', 'Sangeet Night', inDays(20), false],
        ['Buy haldi paste ingredients', 'Haldi', inDays(58), false],
      ],
    );
    assert.equal(await Task.countDocuments(), 1); // only the one added by hand

    const [call] = fake.calls;
    assert.equal(call.schema.properties.tasks.type, 'ARRAY');
    assert.match(call.prompt, /- Book the DJ or band \(Sangeet Night\)/);
    assert.doesNotMatch(call.prompt, /Roka/);
    assert.match(call.prompt, /Haldi checklist/);
  });

  it('plans only the chosen functions', async () => {
    fake.json = { tasks: [] };
    await post(`${W}/tasks/plan`, { functions: [haldi._id], wholeWedding: false }).expect(200);
    assert.doesNotMatch(fake.calls[0].prompt, /Sangeet/);
    assert.doesNotMatch(fake.calls[0].prompt, /Whole wedding/);
  });

  it('needs an upcoming function', async () => {
    const res = await post(`${W}/tasks/plan`, { functions: [new mongoose.Types.ObjectId().toString()] }).expect(400);
    assert.match(res.body.error.message, /upcoming function/);
    assert.equal(fake.calls.length, 0);
  });

  it('says so when the model returns the wrong shape', async () => {
    fake.json = { tasks: [{ title: 'Book DJ', functionRef: 'F1', daysBefore: -5 }] };
    const res = await post(`${W}/tasks/plan`, {}).expect(502);
    assert.equal(res.body.error.code, 'ai_bad_output');
  });

  it('is only for members', async () => {
    const other = cookieOf(await request(app).post('/api/v1/auth/register').send({ name: 'Kabir', email: 'kabir@email.com', password: 'mehendi2026' }));
    await post(`${W}/tasks/plan`, {}, other).expect(404);
  });
});

describe('task plan: saving', () => {
  it('saves the drafts the couple kept', async () => {
    const res = await post(`${W}/tasks/bulk`, {
      tasks: [
        { title: 'Book a choreographer', function: sangeet._id, dueDate: inDays(20), description: 'Ask about group rates' },
        { title: 'Set the total budget', function: null, dueDate: today },
      ],
    }).expect(201);
    assert.equal(res.body.created, 2);
    const list = (await request(app).get(`/api/v1${W}/tasks`).set('Cookie', cookie)).body.data;
    assert.deepEqual(list.map((t) => [t.title, t.function?.name ?? null, t.status]), [
      ['Set the total budget', null, 'todo'],
      ['Book a choreographer', 'Sangeet Night', 'todo'],
    ]);
  });

  it('refuses a function from another wedding', async () => {
    const other = (await post('/weddings', { brideName: 'Meera', groomName: 'Arjun' })).body.wedding;
    const theirs = (await post(`/weddings/${other._id}/functions`, { name: 'Mehendi', localDate: inDays(30) })).body.function;
    await post(`${W}/tasks/bulk`, { tasks: [{ title: 'Book artists', function: theirs._id }] }).expect(400);
    assert.equal(await Task.countDocuments(), 0);
  });

  it('needs at least one task', async () => {
    await post(`${W}/tasks/bulk`, { tasks: [] }).expect(400);
  });
});
