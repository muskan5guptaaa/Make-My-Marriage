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
const { AppError } = await import('../src/utils/AppError.js');
const { env } = await import('../src/config/env.js');
const { PhotoDescription } = await import('../src/models/PhotoDescription.js');

let mongo;
let app;
let cookie;
let W;
let sangeet;
let reception;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const get = (url, c = cookie) => request(app).get(`/api/v1${url}`).set('Cookie', c);
const post = (url, body, c = cookie) => request(app).post(`/api/v1${url}`).set('Cookie', c).send(body);
const del = (url) => request(app).delete(`/api/v1${url}`).set('Cookie', cookie);
const JPG = { bytes: 200_000, format: 'jpg', width: 1200, height: 800, version: 1 };

const albumOf = async (name) => (await get(`${W}/albums`).expect(200)).body.data.find((a) => a.name === name);
async function upload(albumName) {
  const album = await albumOf(albumName);
  const ticket = (await post(`${W}/albums/${album._id}/photos/sign`).expect(201)).body;
  cloud.set(ticket.upload.fields.public_id, JPG);
  return (await post(`${W}/photos/${ticket.photoId}/complete`).expect(200)).body.photo;
}
const said = (caption, people, setting, tags) => ({ caption, people, setting, tags });
const describeNext = (seen) => {
  ai.json = seen;
  return post(`${W}/photos/describe-next`);
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
  cloud.clear();
  Object.assign(ai, { json: null, embedError: null });
  env.ai.photoMinScore = 0; // the fake embeddings don't score on Gemini's scale
  ai.calls.length = 0;
  ai.embedCalls.length = 0;
  cookie = cookieOf(await request(app).post('/api/v1/auth/register').send({ name: 'Aisha Sharma', email: 'aisha@email.com', password: 'mehendi2026' }));
  const wedding = (await post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  W = `/weddings/${wedding._id}`;
  sangeet = (await post(`${W}/functions`, { name: 'Sangeet', localDate: '2026-10-24' })).body.function;
  reception = (await post(`${W}/functions`, { name: 'Reception', localDate: '2026-10-27' })).body.function;
});

// Three photos, described: a hug and a dance at the Sangeet, a very similar dance at the Reception.
async function seed() {
  const hug = await upload('Sangeet');
  const dance = await upload('Sangeet');
  const party = await upload('Reception');
  await describeNext(said('The bride in a red lehenga hugs an elderly woman in a white saree.', 'bride, grandmother', 'stage, evening', ['hug', 'emotional', 'grandmother'])).expect(200);
  await describeNext(said('Friends dancing to a dhol player under fairy lights.', 'group of friends, dhol player', 'dance floor, night', ['dancing', 'dhol', 'lights'])).expect(200);
  await describeNext(said('Friends dancing to a dhol player under bright lights.', 'group of friends, dhol player', 'dance floor, night', ['dancing', 'dhol', 'lights'])).expect(200);
  return { hug, dance, party };
}

describe('photo search: describing photos', () => {
  it('describes one photo per request, oldest first, until none are waiting', async () => {
    const first = await upload('Sangeet');
    await upload('Reception');
    let status = (await get(`${W}/photos/search-status`).expect(200)).body;
    assert.deepEqual(status, { total: 2, searchable: 0, failed: 0, waiting: 2 });

    const res = await describeNext(said('The bride hugs her grandmother.', 'bride, elderly woman', 'stage', ['hug'])).expect(200);
    assert.equal(res.body.photo, first._id);
    assert.equal(res.body.caption, 'The bride hugs her grandmother.');
    assert.deepEqual([res.body.searchable, res.body.waiting], [1, 1]);

    const { system, images } = ai.calls[0];
    assert.match(system, /Never name or guess who a person is/);
    assert.equal(images.length, 1, 'the photo itself is sent');
    assert.equal(images[0].mimeType, 'image/jpeg');
    const stored = await PhotoDescription.findOne({ photo: first._id }).lean();
    assert.equal(stored.text, 'The bride hugs her grandmother. bride, elderly woman. stage. hug.');
    assert.equal(stored.embedding.length, 768);

    await describeNext(said('A cake on a table.', 'no people', 'banquet', ['cake'])).expect(200);
    const done = (await describeNext(null).expect(200)).body;
    assert.equal(done.photo, null, 'nothing left to describe');
    assert.equal(ai.calls.length, 2, 'no AI request when nothing is waiting');
    status = (await get(`${W}/photos/search-status`).expect(200)).body;
    assert.deepEqual(status, { total: 2, searchable: 2, failed: 0, waiting: 0 });
  });

  it("marks a photo it can't describe, and stops without marking when the allowance runs out", async () => {
    const a = await upload('Sangeet');
    const b = await upload('Sangeet');
    let res = await describeNext({ caption: '' }).expect(200); // not a valid description
    assert.deepEqual([res.body.photo, res.body.status], [a._id, 'failed']);

    ai.embedError = new AppError(429, 'ai_daily_limit', "The assistant has used today's free allowance.");
    res = await describeNext(said('Lights.', 'no people', 'night', ['lights'])).expect(429);
    assert.equal(res.body.error.code, 'ai_daily_limit');
    assert.equal(await PhotoDescription.countDocuments({ photo: b._id }), 0, 'left for tomorrow');
    assert.deepEqual((await get(`${W}/photos/search-status`)).body, { total: 2, searchable: 0, failed: 1, waiting: 1 });
  });
});

describe('photo search: searching', () => {
  it('finds photos by meaning, best first, leaving out ones that are not close', async () => {
    const { hug } = await seed();
    const res = await get(`${W}/photos/search?q=${encodeURIComponent('bride hugging her grandmother')}`).expect(200);
    assert.deepEqual(res.body.data.map((p) => p._id), [hug._id]);
    assert.equal(res.body.data[0].caption, 'The bride in a red lehenga hugs an elderly woman in a white saree.');
    assert.equal(res.body.data[0].albumName, 'Sangeet');
    assert.ok(res.body.data[0].thumbUrl);
    assert.deepEqual(ai.embedCalls.at(-1), { texts: ['bride hugging her grandmother'], task: 'query' });
  });

  it('finds nothing when no photo is close enough', async () => {
    await seed();
    env.ai.photoMinScore = 0.99;
    const res = await get(`${W}/photos/search?q=${encodeURIComponent('bride hugging her grandmother')}`).expect(200);
    assert.deepEqual(res.body.data, []);
  });

  it('keeps to the album of a function named in the search', async () => {
    const { dance, party } = await seed();
    let res = await get(`${W}/photos/search?q=${encodeURIComponent('people dancing')}`).expect(200);
    assert.deepEqual(new Set(res.body.data.map((p) => p._id)), new Set([dance._id, party._id]));

    res = await get(`${W}/photos/search?q=${encodeURIComponent('people dancing at the sangeet')}`).expect(200);
    assert.deepEqual(res.body.data.map((p) => p._id), [dance._id]);
    assert.deepEqual(res.body.meta.albums, ['Sangeet']);
    assert.deepEqual(ai.embedCalls.at(-1).texts, ['people dancing'], 'the function name picks the album, not the meaning');
  });

  it('forgets a photo when it or its album is deleted', async () => {
    const { hug } = await seed();
    await del(`${W}/photos/${hug._id}`).expect(204);
    assert.equal(await PhotoDescription.countDocuments({ photo: hug._id }), 0);
    const res = await get(`${W}/photos/search?q=${encodeURIComponent('bride hugging her grandmother')}`).expect(200);
    assert.equal(res.body.data.some((p) => p._id === hug._id), false);

    const mine = (await post(`${W}/albums`, { name: 'Pre-wedding shoot' }).expect(201)).body.album;
    await upload('Pre-wedding shoot');
    await describeNext(said('The couple at a fort.', 'bride, groom', 'outdoors', ['fort'])).expect(200);
    await del(`${W}/albums/${mine._id}`).expect(204);
    assert.equal(await PhotoDescription.countDocuments({ album: mine._id }), 0);
  });

  it("is only for the wedding's own team; describing stops once archived", async () => {
    await seed();
    const zoya = cookieOf(await request(app).post('/api/v1/auth/register').send({ name: 'Zoya', email: 'zoya@email.com', password: 'sangeet2026' }));
    await get(`${W}/photos/search?q=dancing`, zoya).expect(404);
    await post(`${W}/photos/describe-next`, {}, zoya).expect(404);
    await get(`${W}/photos/search?q=`).expect(400);

    await upload('Reception');
    await post(`${W}/archive`, {}).expect(200);
    await post(`${W}/photos/describe-next`).expect(409);
    await get(`${W}/photos/search?q=dancing`).expect(200); // searching changes nothing
  });
});
