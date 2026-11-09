import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { fake: cloud } = await import('../src/utils/cloudinary.js');
const { fake: ai } = await import('../src/utils/ai.js');
const { distance, groupLookAlikes } = await import('../src/utils/photoMoments.js');
const { Album, Photo } = await import('../src/models/Photo.js');
const { PhotoMoment } = await import('../src/models/PhotoMoment.js');

let mongo;
let app;
let cookie;
let W;
let album;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const get = (url, c = cookie) => request(app).get(`/api/v1${url}`).set('Cookie', c);
const send = (method, url, body, c = cookie) => request(app)[method](`/api/v1${url}`).set('Cookie', c).send(body);

// Hashes: the three "A" shots are a burst (0–8 bits apart), the two "B" shots another, C stands alone.
const HASH = { a1: 'ffffffffffffffff', a2: 'fffffffffffffff0', a3: 'ffffffffffffff00', b1: '0000000000000000', b2: '000000000000000f', c: '0f0f0f0f0f0f0f0f' };
async function upload(phash, width = 1200) {
  const ticket = (await send('post', `${W}/albums/${album._id}/photos/sign`).expect(201)).body;
  cloud.set(ticket.upload.fields.public_id, { bytes: 200_000, format: 'jpg', width, height: 800, version: 1, phash });
  return (await send('post', `${W}/photos/${ticket.photoId}/complete`).expect(200)).body.photo;
}
const moments = async () => (await get(`${W}/albums/${album._id}/moments`).expect(200)).body;
const groupOf = (body, photo) => body.groups.find((g) => g.photos.some((p) => p._id === photo._id));

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
  cloud.clear();
  ai.json = null;
  ai.calls.length = 0;
  cookie = cookieOf(await request(app).post('/api/v1/auth/register').send({ name: 'Aisha Sharma', email: 'aisha@email.com', password: 'mehendi2026' }));
  const wedding = (await send('post', '/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  W = `/weddings/${wedding._id}`;
  await send('post', `${W}/functions`, { name: 'Sangeet', localDate: '2026-10-24' });
  album = (await get(`${W}/albums`)).body.data[0];
});

async function seed() {
  const a1 = await upload(HASH.a1, 1200);
  const a2 = await upload(HASH.a2, 4000); // the largest of the burst
  const a3 = await upload(HASH.a3, 2000);
  const b1 = await upload(HASH.b1);
  const b2 = await upload(HASH.b2);
  const c = await upload(HASH.c);
  return { a1, a2, a3, b1, b2, c };
}

describe('photo moments: grouping in code', () => {
  it('counts the bits two hashes differ in, and joins look-alikes through each other', () => {
    assert.equal(distance(HASH.a1, HASH.a1), 0);
    assert.equal(distance(HASH.a1, HASH.a3), 8);
    assert.equal(distance(HASH.a1, HASH.b1), 64);
    const p = (id, phash) => ({ _id: id, phash });
    // x and z are 12 bits apart, but both look like y, so all three are one moment.
    const groups = groupLookAlikes([p('x', 'ffffffffffffffff'), p('y', 'ffffffffffffffc0'), p('z', 'fffffffffffff000'), p('w', '0000000000000000'), p('v', null)], 10);
    assert.deepEqual(groups.map((g) => g.map((x) => x._id)), [['x', 'y', 'z']]);
  });
});

describe('photo moments: the API', () => {
  it('groups look-alike shots, with the largest as the best until a pick is made', async () => {
    const { a1, a2, a3, b1, b2 } = await seed();
    const body = await moments();
    assert.deepEqual([body.total, body.grouped, body.waitingForHash], [6, 5, 0]);
    assert.equal(body.groups.length, 2, 'the lone photo is no group');
    const a = groupOf(body, a1);
    assert.deepEqual(new Set(a.photos.map((p) => p._id)), new Set([a1._id, a2._id, a3._id]));
    assert.deepEqual([a.best, a.by, a.reason], [a2._id, 'size', null]);
    assert.deepEqual(new Set(groupOf(body, b1).photos.map((p) => p._id)), new Set([b1._id, b2._id]));
    assert.equal(ai.calls.length, 0, 'grouping uses no AI');
  });

  it('asks Cloudinary for the hash of photos uploaded before moments existed', async () => {
    const { a1, a2 } = await seed();
    await Photo.updateMany({ _id: { $in: [a1._id, a2._id] } }, { $unset: { phash: 1 } });
    const body = await moments();
    assert.equal(body.waitingForHash, 0);
    assert.equal(groupOf(body, a1).photos.length, 3);
    assert.equal((await Photo.findById(a1._id)).phash, HASH.a1);
  });

  it('lets the AI pick the best shot once, and remembers it', async () => {
    const { a1, a2, a3 } = await seed();
    const { key } = groupOf(await moments(), a1);
    ai.json = { best: 3, reason: 'Sharpest shot, and everyone is smiling.' };
    const res = await send('post', `${W}/albums/${album._id}/moments/pick`, { key }).expect(200);
    // The AI sees the shots largest first: a2 (4000), a3 (2000), a1 (1200), so 3 is a1.
    assert.deepEqual([res.body.moment.best, res.body.moment.by, res.body.moment.reason], [a1._id, 'ai', 'Sharpest shot, and everyone is smiling.']);
    const { system, images, prompt } = ai.calls[0];
    assert.equal(images.length, 3);
    assert.match(prompt, /numbered 1 to 3/);
    assert.match(system, /Never name or guess who anyone is/);

    const again = groupOf(await moments(), a3);
    assert.deepEqual([again.best, again.by], [a1._id, 'ai']);
    assert.equal(ai.calls.length, 1, 'no new AI request');
  });

  it("keeps nothing when the AI's pick makes no sense", async () => {
    const { a1 } = await seed();
    const { key } = groupOf(await moments(), a1);
    ai.json = { best: 9, reason: 'The ninth one.' };
    await send('post', `${W}/albums/${album._id}/moments/pick`, { key }).expect(502);
    assert.equal(await PhotoMoment.countDocuments(), 0);
  });

  it('lets the couple choose the best themselves, and hide the rest from guests', async () => {
    const { a1, a2, a3, b1 } = await seed();
    const { key } = groupOf(await moments(), a1);
    await send('put', `${W}/albums/${album._id}/moments/best`, { key, best: b1._id }).expect(400); // not in this group
    let res = await send('put', `${W}/albums/${album._id}/moments/best`, { key, best: a3._id }).expect(200);
    assert.deepEqual([res.body.moment.best, res.body.moment.by], [a3._id, 'you']);

    await Album.updateOne({ _id: album._id }, { $set: { coverPhoto: a2._id } });
    res = await send('post', `${W}/albums/${album._id}/moments/hide-rest`, { key }).expect(200);
    assert.equal(res.body.hidden, 2);
    const hidden = Object.fromEntries((await Photo.find({ _id: { $in: [a1._id, a2._id, a3._id] } })).map((p) => [String(p._id), p.hidden]));
    assert.deepEqual(hidden, { [a1._id]: true, [a2._id]: true, [a3._id]: false });
    assert.equal((await Album.findById(album._id)).coverPhoto, undefined, 'a hidden photo is no cover');
  });

  it('starts a group again when its photos change', async () => {
    const { a1, a2 } = await seed();
    const { key } = groupOf(await moments(), a1);
    await send('put', `${W}/albums/${album._id}/moments/best`, { key, best: a1._id }).expect(200);
    await send('delete', `${W}/photos/${a2._id}`).expect(204);
    assert.equal(await PhotoMoment.countDocuments(), 0);
    const group = groupOf(await moments(), a1);
    assert.equal(group.by, 'size');
    const res = await send('put', `${W}/albums/${album._id}/moments/best`, { key, best: a1._id }).expect(409);
    assert.equal(res.body.error.code, 'moment_changed');
  });

  it("is only for the wedding's own team; picking stops once archived", async () => {
    const { a1 } = await seed();
    const { key } = groupOf(await moments(), a1);
    const zoya = cookieOf(await request(app).post('/api/v1/auth/register').send({ name: 'Zoya', email: 'zoya@email.com', password: 'sangeet2026' }));
    await get(`${W}/albums/${album._id}/moments`, zoya).expect(404);
    await send('post', `${W}/archive`, {}).expect(200);
    await moments();
    await send('post', `${W}/albums/${album._id}/moments/pick`, { key }).expect(409);
    await send('post', `${W}/albums/${album._id}/moments/hide-rest`, { key }).expect(409);
  });
});
