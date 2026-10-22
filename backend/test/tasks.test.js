import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { Task } = await import('../src/models/Task.js');

let mongo;
let app;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const as = (cookie) => ({
  get: (url) => request(app).get(`/api/v1${url}`).set('Cookie', cookie),
  post: (url, body) => request(app).post(`/api/v1${url}`).set('Cookie', cookie).send(body),
  patch: (url, body) => request(app).patch(`/api/v1${url}`).set('Cookie', cookie).send(body),
  del: (url, body) => request(app).delete(`/api/v1${url}`).set('Cookie', cookie).send(body),
});

let aisha;
let rekha;
let wedding;
let base;
let sangeet;
let rekhaMemberId;

async function signUp(name, email) {
  const res = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'mehendi2026' });
  return { cookie: cookieOf(res), id: res.body.user._id };
}

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
  aisha = await signUp('Aisha Sharma', 'aisha@email.com');
  wedding = (await as(aisha.cookie).post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  const w = `/weddings/${wedding._id}`;
  base = `${w}/tasks`;
  sangeet = (await as(aisha.cookie).post(`${w}/functions`, { name: 'Sangeet', localDate: '2026-10-24' })).body.function;

  await as(aisha.cookie).post(`${w}/members`, { email: 'rekha@email.com' });
  rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
  await as(rekha.cookie).post(`${w}/members/accept`).expect(200);
  rekhaMemberId = (await as(aisha.cookie).get(`${w}/members`)).body.data.find((m) => m.email === 'rekha@email.com')._id;
});

describe('create and read', () => {
  it('creates a task with function and assignee, readable by co-admins', async () => {
    const res = await as(aisha.cookie)
      .post(base, { title: 'Book caterer for Sangeet', function: sangeet._id, assignee: rekha.id, dueDate: '2026-10-12' })
      .expect(201);
    const t = res.body.task;
    assert.equal(t.status, 'todo');
    assert.deepEqual(t.function, { _id: sangeet._id, name: 'Sangeet' });
    assert.deepEqual(t.assignee, { _id: rekha.id, name: 'Rekha Kapoor' });
    assert.equal(t.createdBy.name, 'Aisha Sharma');

    const list = await as(rekha.cookie).get(base).expect(200);
    assert.equal(list.body.data.length, 1);
  });

  it('rejects a function or assignee from outside the wedding', async () => {
    const karan = await signUp('Karan Shah', 'karan@email.com');
    const other = (await as(karan.cookie).post('/weddings', { brideName: 'Neha', groomName: 'Karan' })).body.wedding;
    const otherFn = (await as(karan.cookie).post(`/weddings/${other._id}/functions`, { name: 'Haldi', localDate: '2026-11-01' })).body.function;

    const res = await as(aisha.cookie).post(base, { title: 'X', function: otherFn._id, assignee: karan.id }).expect(400);
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['assignee', 'function']);
  });

  it('validates title, date and status', async () => {
    const res = await as(aisha.cookie).post(base, { title: ' ', dueDate: '2026-13-01', status: 'later' }).expect(400);
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['dueDate', 'status', 'title']);
  });
});

describe('list filters and counts', () => {
  beforeEach(async () => {
    const c = as(aisha.cookie);
    await c.post(base, { title: 'Confirm DJ', function: sangeet._id, assignee: rekha.id, dueDate: '2026-10-22' });
    await c.post(base, { title: 'Send reminders', assignee: aisha.id, dueDate: '2026-10-20', status: 'in-progress' });
    await c.post(base, { title: 'Pack return gifts' });
    await c.post(base, { title: 'Book caterer', function: sangeet._id, dueDate: '2000-01-01', status: 'done' });
  });

  it('sorts by due date, no date last, and flags overdue', async () => {
    await as(aisha.cookie).post(base, { title: 'Old and open', dueDate: '2000-01-02' });
    const { body } = await as(aisha.cookie).get(base).expect(200);
    assert.deepEqual(body.data.map((t) => t.title), ['Book caterer', 'Old and open', 'Send reminders', 'Confirm DJ', 'Pack return gifts']);
    assert.equal(body.data.find((t) => t.title === 'Old and open').overdue, true);
    assert.equal(body.data.find((t) => t.title === 'Book caterer').overdue, false); // done is never overdue
  });

  it('filters by status but counts every status', async () => {
    const { body } = await as(aisha.cookie).get(`${base}?status=todo`).expect(200);
    assert.deepEqual(body.data.map((t) => t.title), ['Confirm DJ', 'Pack return gifts']);
    assert.deepEqual(body.meta.counts, { all: 4, todo: 2, 'in-progress': 1, done: 1 });
  });

  it('filters by function, no function, assignee and mine', async () => {
    const titles = async (q, who = aisha) => (await as(who.cookie).get(`${base}?${q}`).expect(200)).body.data.map((t) => t.title);
    assert.deepEqual(await titles(`function=${sangeet._id}`), ['Book caterer', 'Confirm DJ']);
    assert.deepEqual(await titles('function=none'), ['Send reminders', 'Pack return gifts']);
    assert.deepEqual(await titles(`assignee=${rekha.id}`), ['Confirm DJ']);
    assert.deepEqual(await titles('assignee=none'), ['Book caterer', 'Pack return gifts']);
    assert.deepEqual(await titles('mine=true', rekha), ['Confirm DJ']);

    const counts = (await as(aisha.cookie).get(`${base}?function=${sangeet._id}`)).body.meta.counts;
    assert.deepEqual(counts, { all: 2, todo: 1, 'in-progress': 0, done: 1 });
  });

  it('rejects unknown filters', async () => {
    await as(aisha.cookie).get(`${base}?status=later`).expect(400);
    await as(aisha.cookie).get(`${base}?function=abc`).expect(400);
  });
});

describe('update and delete', () => {
  it('sets completedAt when done and clears it when reopened', async () => {
    const t = (await as(aisha.cookie).post(base, { title: 'Book caterer' })).body.task;
    const done = await as(aisha.cookie).patch(`${base}/${t._id}`, { status: 'done' }).expect(200);
    assert.ok(done.body.task.completedAt);
    const reopened = await as(aisha.cookie).patch(`${base}/${t._id}`, { status: 'in-progress' }).expect(200);
    assert.equal(reopened.body.task.completedAt, null);
  });

  it('clears fields with null and deletes', async () => {
    const t = (await as(aisha.cookie).post(base, { title: 'Confirm DJ', assignee: rekha.id, dueDate: '2026-10-22' })).body.task;
    const res = await as(aisha.cookie).patch(`${base}/${t._id}`, { assignee: null, dueDate: '' }).expect(200);
    assert.equal(res.body.task.assignee, null);
    assert.equal(res.body.task.dueDate, null);
    await as(aisha.cookie).del(`${base}/${t._id}`).expect(204);
    await as(aisha.cookie).get(`${base}/${t._id}`).expect(404);
  });

  it('blocks changes while archived', async () => {
    await as(aisha.cookie).post(`/weddings/${wedding._id}/archive`).expect(200);
    const res = await as(aisha.cookie).post(base, { title: 'X' }).expect(409);
    assert.equal(res.body.error.code, 'wedding_archived');
  });
});

describe('integrity', () => {
  it('deleting a function keeps its tasks, without the function', async () => {
    const t = (await as(aisha.cookie).post(base, { title: 'Confirm DJ', function: sangeet._id })).body.task;
    await as(aisha.cookie).del(`/weddings/${wedding._id}/functions/${sangeet._id}`).expect(204);
    const after = await as(aisha.cookie).get(`${base}/${t._id}`).expect(200);
    assert.equal(after.body.task.function, null);
  });

  it('removing a member unassigns their tasks', async () => {
    const t = (await as(aisha.cookie).post(base, { title: 'Confirm DJ', assignee: rekha.id })).body.task;
    await as(aisha.cookie).del(`/weddings/${wedding._id}/members/${rekhaMemberId}`).expect(204);
    const after = await as(aisha.cookie).get(`${base}/${t._id}`).expect(200);
    assert.equal(after.body.task.assignee, null);
  });

  it('deleting the wedding deletes its tasks', async () => {
    await as(aisha.cookie).post(base, { title: 'Confirm DJ' });
    await as(aisha.cookie).del(`/weddings/${wedding._id}`, { confirmSlug: wedding.slug }).expect(204);
    assert.equal(await Task.countDocuments({ wedding: wedding._id }), 0);
  });
});
