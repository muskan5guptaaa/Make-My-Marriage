import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { WeddingMember } = await import('../src/models/WeddingMember.js');

let mongo;
let app;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));

async function signUp(name, email) {
  const res = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'mehendi2026' }).expect(201);
  return { cookie: cookieOf(res), id: res.body.user._id };
}
const createWedding = (cookie, body = { brideName: 'Aisha', groomName: 'Rohan' }) =>
  request(app).post('/api/v1/weddings').set('Cookie', cookie).send(body);

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
});

describe('POST /weddings', () => {
  it('creates the wedding with defaults and makes the caller owner', async () => {
    const aisha = await signUp('Aisha Sharma', 'aisha@email.com');
    const res = await createWedding(aisha.cookie).expect(201);
    const w = res.body.wedding;
    assert.equal(w.brideName, 'Aisha');
    assert.equal(w.timezone, 'Asia/Kolkata');
    assert.equal(w.currency, 'INR');
    assert.equal(w.status, 'active');
    assert.equal(w.role, 'owner');
    assert.match(w.slug, /^aisha-rohan-[a-z0-9]+$/);

    const member = await WeddingMember.findOne({ wedding: w._id, user: aisha.id });
    assert.equal(member.role, 'owner');
    assert.ok(member.acceptedAt);

    const me = await request(app).get('/api/v1/me').set('Cookie', aisha.cookie).expect(200);
    assert.equal(me.body.weddings.length, 1);
  });

  it('needs a session', async () => {
    await request(app).post('/api/v1/weddings').send({ brideName: 'A', groomName: 'B' }).expect(401);
  });

  it('rejects missing names and a bad timezone', async () => {
    const aisha = await signUp('Aisha Sharma', 'aisha@email.com');
    const res = await createWedding(aisha.cookie, { brideName: ' ', timezone: 'Mars/Base' }).expect(400);
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['brideName', 'groomName', 'timezone']);
  });

  it('ignores fields the client may not set', async () => {
    const aisha = await signUp('Aisha Sharma', 'aisha@email.com');
    const res = await createWedding(aisha.cookie, { brideName: 'A', groomName: 'B', status: 'archived', slug: 'x' }).expect(201);
    assert.equal(res.body.wedding.status, 'active');
    assert.notEqual(res.body.wedding.slug, 'x');
  });
});

describe('GET /weddings and /weddings/:id', () => {
  it('lists only my weddings, and hides other weddings behind 404', async () => {
    const aisha = await signUp('Aisha Sharma', 'aisha@email.com');
    const karan = await signUp('Karan Shah', 'karan@email.com');
    const mine = (await createWedding(aisha.cookie)).body.wedding;
    const theirs = (await createWedding(karan.cookie, { brideName: 'Neha', groomName: 'Karan' })).body.wedding;

    const list = await request(app).get('/api/v1/weddings').set('Cookie', aisha.cookie).expect(200);
    assert.deepEqual(list.body.data.map((w) => w._id), [mine._id]);

    await request(app).get(`/api/v1/weddings/${mine._id}`).set('Cookie', aisha.cookie).expect(200);
    const res = await request(app).get(`/api/v1/weddings/${theirs._id}`).set('Cookie', aisha.cookie).expect(404);
    assert.equal(res.body.error.code, 'wedding_not_found');
    await request(app).get('/api/v1/weddings/not-an-id').set('Cookie', aisha.cookie).expect(404);
  });
});

describe('PATCH /weddings/:id', () => {
  it('updates names and timezone', async () => {
    const aisha = await signUp('Aisha Sharma', 'aisha@email.com');
    const w = (await createWedding(aisha.cookie)).body.wedding;
    const res = await request(app)
      .patch(`/api/v1/weddings/${w._id}`)
      .set('Cookie', aisha.cookie)
      .send({ groomName: 'Rohan Mehta', timezone: 'Europe/London' })
      .expect(200);
    assert.equal(res.body.wedding.groomName, 'Rohan Mehta');
    assert.equal(res.body.wedding.timezone, 'Europe/London');
    assert.equal(res.body.wedding.slug, w.slug);
  });

  it('lets a co-admin edit but not archive', async () => {
    const aisha = await signUp('Aisha Sharma', 'aisha@email.com');
    const rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
    const w = (await createWedding(aisha.cookie)).body.wedding;
    await WeddingMember.create({ wedding: w._id, user: rekha.id, role: 'co-admin', acceptedAt: new Date() });

    await request(app).patch(`/api/v1/weddings/${w._id}`).set('Cookie', rekha.cookie).send({ brideName: 'Aisha S' }).expect(200);
    const res = await request(app).post(`/api/v1/weddings/${w._id}/archive`).set('Cookie', rekha.cookie).expect(403);
    assert.equal(res.body.error.code, 'owner_only');
  });

  it('does not let an invite that is not yet accepted in', async () => {
    const aisha = await signUp('Aisha Sharma', 'aisha@email.com');
    const rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
    const w = (await createWedding(aisha.cookie)).body.wedding;
    await WeddingMember.create({ wedding: w._id, user: rekha.id, role: 'co-admin' });
    await request(app).get(`/api/v1/weddings/${w._id}`).set('Cookie', rekha.cookie).expect(404);
  });
});

describe('archive, restore and delete', () => {
  it('archives, blocks edits, restores, and moves between list filters', async () => {
    const aisha = await signUp('Aisha Sharma', 'aisha@email.com');
    const w = (await createWedding(aisha.cookie)).body.wedding;
    const url = `/api/v1/weddings/${w._id}`;

    const archived = await request(app).post(`${url}/archive`).set('Cookie', aisha.cookie).expect(200);
    assert.equal(archived.body.wedding.status, 'archived');

    const blocked = await request(app).patch(url).set('Cookie', aisha.cookie).send({ brideName: 'X' }).expect(409);
    assert.equal(blocked.body.error.code, 'wedding_archived');

    const active = await request(app).get('/api/v1/weddings').set('Cookie', aisha.cookie);
    assert.equal(active.body.data.length, 0);
    const old = await request(app).get('/api/v1/weddings?status=archived').set('Cookie', aisha.cookie);
    assert.equal(old.body.data.length, 1);

    const restored = await request(app).post(`${url}/restore`).set('Cookie', aisha.cookie).expect(200);
    assert.equal(restored.body.wedding.status, 'active');
  });

  it('deletes permanently only with the right slug', async () => {
    const aisha = await signUp('Aisha Sharma', 'aisha@email.com');
    const w = (await createWedding(aisha.cookie)).body.wedding;
    const url = `/api/v1/weddings/${w._id}`;

    const wrong = await request(app).delete(url).set('Cookie', aisha.cookie).send({ confirmSlug: 'nope' }).expect(400);
    assert.equal(wrong.body.error.code, 'confirm_mismatch');

    await request(app).delete(url).set('Cookie', aisha.cookie).send({ confirmSlug: w.slug }).expect(204);
    await request(app).get(url).set('Cookie', aisha.cookie).expect(404);
    assert.equal(await WeddingMember.countDocuments({ wedding: w._id }), 0);
  });
});
