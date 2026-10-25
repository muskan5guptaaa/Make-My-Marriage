import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { fake } = await import('../src/utils/cloudinary.js');
const { Album, Photo } = await import('../src/models/Photo.js');
const { cleanupAbandonedUploads } = await import('../src/controllers/photo.controller.js');

let mongo;
let app;
let cookie;
let wedding;
let W;
let sangeet;
let reception;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const get = (url) => request(app).get(`/api/v1${url}`).set('Cookie', cookie);
const post = (url, body) => request(app).post(`/api/v1${url}`).set('Cookie', cookie).send(body);
const patch = (url, body) => request(app).patch(`/api/v1${url}`).set('Cookie', cookie).send(body);
const del = (url, body) => request(app).delete(`/api/v1${url}`).set('Cookie', cookie).send(body);
const JPG = { bytes: 200_000, format: 'jpg', width: 1200, height: 800, version: 1 };

// Sign, "upload" to the fake Cloudinary, complete: what the browser does. Returns the response.
async function upload(albumId, file = JPG, status = 200) {
  const ticket = (await post(`${W}/albums/${albumId}/photos/sign`).expect(201)).body;
  fake.set(ticket.upload.fields.public_id, file);
  return post(`${W}/photos/${ticket.photoId}/complete`).expect(status);
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
  fake.clear();
  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Aisha Sharma', email: 'aisha@email.com', password: 'mehendi2026' });
  cookie = cookieOf(reg);
  wedding = (await post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  W = `/weddings/${wedding._id}`;
  reception = (await post(`${W}/functions`, { name: 'Reception', localDate: '2026-10-27' })).body.function;
  sangeet = (await post(`${W}/functions`, { name: 'Sangeet', localDate: '2026-10-24' })).body.function;
});

const albums = async () => (await get(`${W}/albums`).expect(200)).body.data;

describe('albums', () => {
  it('makes one album per function, in date order, then general albums', async () => {
    await post(`${W}/albums`, { name: 'Pre-wedding shoot' }).expect(201);
    assert.deepEqual((await albums()).map((a) => a.name), ['Sangeet', 'Reception', 'Pre-wedding shoot']);
    await albums();
    assert.equal(await Album.countDocuments({ wedding: wedding._id }), 3); // not duplicated
  });

  it('follows function renames; function albums cannot be renamed or deleted', async () => {
    const s = (await albums())[0];
    await patch(`${W}/functions/${sangeet._id}`, { name: 'Sangeet Night' });
    assert.equal((await albums())[0].name, 'Sangeet Night');
    assert.equal((await patch(`${W}/albums/${s._id}`, { name: 'X' }).expect(409)).body.error.code, 'function_album');
    await del(`${W}/albums/${s._id}`).expect(409);
  });

  it('deleting a function keeps its album and photos as a general album', async () => {
    const s = (await albums())[0];
    await upload(s._id);
    await post(`${W}/functions/${sangeet._id}/archive`).expect(200);
    await del(`${W}/functions/${sangeet._id}`).expect(204);
    const after = (await albums()).find((a) => String(a._id) === String(s._id));
    assert.equal(after.function, null);
    assert.equal(after.photoCount, 1);
  });
});

describe('uploading', () => {
  it('signs, completes, counts, and builds Cloudinary URLs', async () => {
    const s = (await albums())[0];
    const ticket = (await post(`${W}/albums/${s._id}/photos/sign`).expect(201)).body;
    assert.match(ticket.upload.url, /api\.cloudinary\.com\/v1_1\/.+\/image\/upload$/);
    assert.equal(ticket.upload.fields.public_id, `mmm/weddings/${wedding._id}/albums/${s._id}/${ticket.photoId}`);
    assert.equal(ticket.upload.fields.allowed_formats, 'jpg,png,webp,heic');

    // Not uploaded yet: completing fails and nothing is published.
    assert.equal((await post(`${W}/photos/${ticket.photoId}/complete`).expect(409)).body.error.code, 'upload_missing');

    fake.set(ticket.upload.fields.public_id, JPG);
    const done = (await post(`${W}/photos/${ticket.photoId}/complete`).expect(200)).body.photo;
    assert.match(done.thumbUrl, /c_fill,w_480,h_480/);
    assert.equal(done.uploaderName, 'Aisha Sharma');
    assert.equal((await albums())[0].photoCount, 1);
    assert.ok((await albums())[0].coverUrl);
  });

  it('removes files that are too big or the wrong type', async () => {
    const s = (await albums())[0];
    await upload(s._id, { ...JPG, bytes: 11 * 1024 * 1024 }, 400);
    await upload(s._id, { ...JPG, format: 'gif' }, 400);
    assert.equal(await Photo.countDocuments({}), 0);
    assert.equal(fake.size, 0);
  });

  it('cleans up uploads that were never finished', async () => {
    const s = (await albums())[0];
    await post(`${W}/albums/${s._id}/photos/sign`).expect(201);
    // Straight to the collection: Mongoose keeps createdAt from being changed.
    await Photo.collection.updateMany({}, { $set: { createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
    assert.equal(await cleanupAbandonedUploads(), 1);
    assert.equal(await Photo.countDocuments({}), 0);
  });
});

describe('managing photos', () => {
  it('hides, sets the cover, and deletes', async () => {
    const s = (await albums())[0];
    const a = (await upload(s._id)).body.photo;
    const b = (await upload(s._id)).body.photo;

    await patch(`${W}/albums/${s._id}`, { coverPhoto: a._id }).expect(200);
    assert.equal(String((await albums())[0].coverPhoto), String(a._id));

    await patch(`${W}/photos/${a._id}`, { hidden: true }).expect(200);
    assert.equal((await albums())[0].coverPhoto, null, 'a hidden photo stops being the cover');
    const listed = (await get(`${W}/albums/${s._id}/photos`)).body.data;
    assert.equal(listed.length, 2, 'planners still see hidden photos');
    assert.equal(listed.find((p) => p._id === a._id).hidden, true);

    await del(`${W}/photos/${b._id}`).expect(204);
    assert.equal(fake.has(`mmm/weddings/${wedding._id}/albums/${s._id}/${b._id}`), false, 'file removed from Cloudinary');
  });

  it('deleting a general album or the wedding removes photos and files', async () => {
    const general = (await post(`${W}/albums`, { name: 'Shoot' })).body.album;
    await upload(general._id);
    await del(`${W}/albums/${general._id}`).expect(204);
    assert.equal(await Photo.countDocuments({ album: general._id }), 0);

    await upload((await albums())[0]._id);
    await del(W, { confirmSlug: wedding.slug }).expect(204);
    assert.equal(await Photo.countDocuments({ wedding: wedding._id }), 0);
    assert.equal(await Album.countDocuments({ wedding: wedding._id }), 0);
    assert.equal(fake.size, 0);
  });
});

describe('guest photos through their link', () => {
  // A guest with an email and photo access, plus a signed-in session for that email.
  async function guest({ access = 'view', invitedFunctions = [sangeet._id], email = 'priya@email.com', account = true } = {}) {
    const g = (await post(`${W}/guests`, { name: 'Priya Mehta', email, invitedFunctions, photoAccess: access })).body.guest;
    const token = g.link.url.split('/i/')[1];
    let guestCookie = '';
    if (account && email) {
      const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Priya Mehta', email, password: 'mehendi2026' });
      guestCookie = cookieOf(reg);
    }
    const as = (c) => ({
      get: (path) => request(app).get(`/api/v1/portal/${token}${path}`).set('Cookie', c),
      post: (path) => request(app).post(`/api/v1/portal/${token}${path}`).set('Cookie', c),
    });
    return { g, token, signedIn: as(guestCookie), anon: as(''), owner: as(cookie) };
  }

  it('new guests have no photo access; the invitation itself stays open', async () => {
    const g = (await post(`${W}/guests`, { name: 'Neha', email: 'neha@email.com', invitedFunctions: [sangeet._id] })).body.guest;
    assert.equal(g.photoAccess, 'none');
    const token = g.link.url.split('/i/')[1];
    const page = (await request(app).get(`/api/v1/portal/${token}`).expect(200)).body;
    assert.equal(page.functions.length, 1);
    assert.deepEqual(page.photos, { access: 'none', email: 'neha@email.com', hasAccount: false, signedIn: false, signedInAs: null });
    assert.equal((await request(app).get(`/api/v1/portal/${token}/albums`).expect(403)).body.error.code, 'no_photo_access');
  });

  it('photos need the guest to sign in with the invited email', async () => {
    const { anon, owner, signedIn } = await guest();
    assert.equal((await anon.get('/albums').expect(401)).body.error.code, 'sign_in_required');
    assert.equal((await owner.get('/albums').expect(403)).body.error.code, 'wrong_account'); // signed in, but as someone else
    await signedIn.get('/albums').expect(200);
    const page = (await signedIn.get('').expect(200)).body;
    assert.equal(page.photos.signedIn, true);
  });

  it('a guest without an email is told to ask the couple', async () => {
    const { anon } = await guest({ email: null, account: false });
    assert.equal((await anon.get('/albums').expect(409)).body.error.code, 'no_email');
  });

  it('sees only albums of invited functions and general albums, and no hidden photos', async () => {
    await post(`${W}/albums`, { name: 'Shoot' });
    const [s, r] = await albums();
    const shown = (await upload(s._id)).body.photo;
    const hidden = (await upload(s._id)).body.photo;
    await patch(`${W}/photos/${hidden._id}`, { hidden: true });

    const { signedIn } = await guest();
    const list = (await signedIn.get('/albums').expect(200)).body.data;
    assert.deepEqual(list.map((a) => [a.name, a.photoCount]), [['Sangeet', 1], ['Shoot', 0]]);
    const photos = (await signedIn.get(`/albums/${s._id}/photos`).expect(200)).body.data;
    assert.deepEqual(photos.map((p) => p._id), [shown._id]);
    assert.equal(photos[0].hidden, undefined, 'moderation details stay with planners');
    await signedIn.get(`/albums/${r._id}/photos`).expect(404);
  });

  it('view-only guests cannot upload; upload guests can, only to albums they see', async () => {
    const [s, r] = await albums();
    const viewer = await guest({ access: 'view' });
    assert.equal((await viewer.signedIn.post(`/albums/${s._id}/photos/sign`).expect(403)).body.error.code, 'view_only');

    await post(`${W}/guests/photo-access`, { ids: [viewer.g._id], photoAccess: 'upload' }).expect(200);
    const ticket = (await viewer.signedIn.post(`/albums/${s._id}/photos/sign`).expect(201)).body;
    fake.set(ticket.upload.fields.public_id, JPG);
    const photo = (await viewer.signedIn.post(`/photos/${ticket.photoId}/complete`).expect(200)).body.photo;
    assert.equal(photo.uploaderName, 'Priya Mehta');
    assert.equal((await get(`${W}/albums/${s._id}/photos`)).body.data[0].uploaderType, 'guest');
    await viewer.signedIn.post(`/albums/${r._id}/photos/sign`).expect(404);
  });

  it('a guest cannot complete someone else’s upload', async () => {
    const [s] = await albums();
    const ticket = (await post(`${W}/albums/${s._id}/photos/sign`)).body; // the planner's upload
    fake.set(ticket.upload.fields.public_id, JPG);
    const { signedIn } = await guest({ access: 'upload' });
    await signedIn.post(`/photos/${ticket.photoId}/complete`).expect(404);
  });

  it('a signed-in guest finds their invitation from /me, without any planning access', async () => {
    const { token } = await guest();
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'priya@email.com', password: 'mehendi2026' });
    const me = (await request(app).get('/api/v1/me').set('Cookie', cookieOf(login)).expect(200)).body;
    assert.deepEqual(me.weddings, []);
    assert.deepEqual(me.guestOf, [{ wedding: { brideName: 'Aisha', groomName: 'Rohan' }, path: `/i/${token}` }]);
    await request(app).get(`/api/v1${W}`).set('Cookie', cookieOf(login)).expect(404);
  });
});
