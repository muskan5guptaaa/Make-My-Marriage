import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { WeddingFunction } = await import('../src/models/Function.js');
const { zonedToUtc, todayIn, youtubeVideoId } = await import('../src/utils/time.js');

let mongo;
let app;
let cookie;
let wedding;
let base;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const post = (url, body) => request(app).post(`/api/v1${url}`).set('Cookie', cookie).send(body);
const patch = (url, body) => request(app).patch(`/api/v1${url}`).set('Cookie', cookie).send(body);
const get = (url) => request(app).get(`/api/v1${url}`).set('Cookie', cookie);
const del = (url) => request(app).delete(`/api/v1${url}`).set('Cookie', cookie);

// A date `n` days from today in India, as YYYY-MM-DD.
const dayFromToday = (n) => {
  const [y, m, d] = todayIn('Asia/Kolkata').split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

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
  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Aisha Sharma', email: 'aisha@email.com', password: 'mehendi2026' });
  cookie = cookieOf(reg);
  wedding = (await post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  base = `/weddings/${wedding._id}/functions`;
});

describe('time helpers', () => {
  it('converts India wall-clock time to UTC', () => {
    assert.equal(zonedToUtc('2026-10-24', '19:00', 'Asia/Kolkata').toISOString(), '2026-10-24T13:30:00.000Z');
    assert.equal(zonedToUtc('2026-10-24', null, 'Asia/Kolkata').toISOString(), '2026-10-23T18:30:00.000Z');
  });
  it('handles daylight saving in London', () => {
    assert.equal(zonedToUtc('2026-07-01', '12:00', 'Europe/London').toISOString(), '2026-07-01T11:00:00.000Z');
    assert.equal(zonedToUtc('2026-12-01', '12:00', 'Europe/London').toISOString(), '2026-12-01T12:00:00.000Z');
  });
  it('reads YouTube links', () => {
    for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/live/dQw4w9WgXcQ?si=x']) {
      assert.equal(youtubeVideoId(url), 'dQw4w9WgXcQ');
    }
    assert.equal(youtubeVideoId('https://vimeo.com/123'), null);
  });
});

describe('create and list', () => {
  it('creates a function with derived startsAt and video id', async () => {
    const res = await post(base, {
      name: 'Sangeet',
      localDate: '2026-10-24',
      startTime: '19:00',
      venue: 'The Grand Lawns',
      address: 'Jaipur',
      dressCode: 'Indo-western, gold & emerald',
      livestreamUrl: 'https://youtu.be/dQw4w9WgXcQ',
    }).expect(201);
    const f = res.body.function;
    assert.equal(f.startsAt, '2026-10-24T13:30:00.000Z');
    assert.equal(f.livestreamVideoId, 'dQw4w9WgXcQ');
    assert.equal(f.invitedCount, 0);
  });

  it('orders by date and marks done, next and upcoming', async () => {
    await post(base, { name: 'Reception', localDate: dayFromToday(9) });
    await post(base, { name: 'Haldi', localDate: dayFromToday(-2), startTime: '09:00' });
    await post(base, { name: 'Sangeet', localDate: dayFromToday(5), startTime: '19:00' });
    await post(base, { name: 'Mehendi', localDate: dayFromToday(0), startTime: '16:00' });

    const { body } = await get(base).expect(200);
    assert.deepEqual(
      body.data.map((f) => [f.name, f.status, f.daysLeft]),
      [
        ['Haldi', 'done', null],
        ['Mehendi', 'next', 0], // today is still "next" until the day ends
        ['Sangeet', 'upcoming', 5],
        ['Reception', 'upcoming', 9],
      ],
    );

    const w = await get(`/weddings/${wedding._id}`);
    assert.deepEqual(w.body.wedding.dateRange, { start: dayFromToday(-2), end: dayFromToday(9) });
  });

  it('validates input', async () => {
    const res = await post(base, { name: '', localDate: '2026-02-30', startTime: '25:00', livestreamUrl: 'https://vimeo.com/1' }).expect(400);
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['livestreamUrl', 'localDate', 'name', 'startTime']);
  });

  it('treats blank optional fields as empty', async () => {
    const res = await post(base, { name: 'Haldi', localDate: '2026-10-18', startTime: '', venue: '  ', livestreamUrl: '' }).expect(201);
    assert.equal(res.body.function.startTime, null);
    assert.equal(res.body.function.venue, null);
  });
});

describe('update and delete', () => {
  it('edits, clears fields, and re-derives startsAt', async () => {
    const f = (await post(base, { name: 'Sangeet', localDate: '2026-10-24', startTime: '19:00', venue: 'Lawns', livestreamUrl: 'https://youtu.be/dQw4w9WgXcQ' })).body.function;
    const res = await patch(`${base}/${f._id}`, { startTime: '20:30', venue: null, livestreamUrl: '' }).expect(200);
    assert.equal(res.body.function.startsAt, '2026-10-24T15:00:00.000Z');
    assert.equal(res.body.function.venue, null);
    assert.equal(res.body.function.livestreamVideoId, null);
  });

  it('moves startsAt when the wedding timezone changes', async () => {
    const f = (await post(base, { name: 'Sangeet', localDate: '2026-12-01', startTime: '12:00' })).body.function;
    await patch(`/weddings/${wedding._id}`, { timezone: 'Europe/London' }).expect(200);
    const after = await get(`${base}/${f._id}`).expect(200);
    assert.equal(after.body.function.startsAt, '2026-12-01T12:00:00.000Z');
  });

  it('deletes, and hides other weddings\' functions', async () => {
    const f = (await post(base, { name: 'Haldi', localDate: '2026-10-18' })).body.function;
    const other = (await post('/weddings', { brideName: 'Neha', groomName: 'Karan' })).body.wedding;
    await get(`/weddings/${other._id}/functions/${f._id}`).expect(404);

    await del(`${base}/${f._id}`).expect(204);
    await get(`${base}/${f._id}`).expect(404);
  });

  it('blocks changes while archived', async () => {
    await post(`/weddings/${wedding._id}/archive`).expect(200);
    const res = await post(base, { name: 'Haldi', localDate: '2026-10-18' }).expect(409);
    assert.equal(res.body.error.code, 'wedding_archived');
    await get(base).expect(200);
  });

  it('deleting the wedding deletes its functions', async () => {
    await post(base, { name: 'Haldi', localDate: '2026-10-18' });
    await request(app).delete(`/api/v1/weddings/${wedding._id}`).set('Cookie', cookie).send({ confirmSlug: wedding.slug }).expect(204);
    assert.equal(await WeddingFunction.countDocuments({ wedding: wedding._id }), 0);
  });
});
