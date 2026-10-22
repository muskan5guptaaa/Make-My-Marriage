import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { sentEmails } = await import('../src/utils/email.js');
const { Wedding } = await import('../src/models/Wedding.js');
const { WeddingMember } = await import('../src/models/WeddingMember.js');

let mongo;
let app;
const aisha = { name: 'Aisha Sharma', email: 'Aisha@Email.com', password: 'mehendi2026' };
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await mongoose.connection.syncIndexes();
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
});

describe('POST /auth/register', () => {
  it('creates the user, lowercases the email and signs in', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(aisha).expect(201);
    assert.equal(res.body.user.email, 'aisha@email.com');
    assert.equal(res.body.user.globalRole, 'user');
    assert.equal(res.body.user.passwordHash, undefined);
    assert.match(cookieOf(res), /HttpOnly/);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/v1/auth/register').send(aisha).expect(201);
    const res = await request(app).post('/api/v1/auth/register').send({ ...aisha, email: 'aisha@email.com' }).expect(409);
    assert.equal(res.body.error.code, 'email_taken');
    assert.ok(res.body.error.fields.email);
  });

  it('returns field messages for bad input', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ name: '', email: 'nope', password: 'short' }).expect(400);
    assert.equal(res.body.error.code, 'invalid_input');
    assert.deepEqual(Object.keys(res.body.error.fields).sort(), ['email', 'name', 'password']);
  });
});

describe('POST /auth/login and /auth/logout', () => {
  beforeEach(() => request(app).post('/api/v1/auth/register').send(aisha));

  it('signs in with the right password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'AISHA@email.com', password: aisha.password }).expect(200);
    assert.equal(res.body.user.name, 'Aisha Sharma');
    assert.ok(cookieOf(res));
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const a = await request(app).post('/api/v1/auth/login').send({ email: aisha.email, password: 'wrong-pass' }).expect(401);
    const b = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@email.com', password: 'wrong-pass' }).expect(401);
    assert.equal(a.body.error.message, b.body.error.message);
  });

  it('logout clears the cookie', async () => {
    const res = await request(app).post('/api/v1/auth/logout').expect(204);
    assert.match(cookieOf(res), /Expires=Thu, 01 Jan 1970/);
  });
});

describe('GET /me', () => {
  it('needs a session', async () => {
    const res = await request(app).get('/api/v1/me').expect(401);
    assert.equal(res.body.error.code, 'unauthorized');
  });

  it('returns the user and their weddings with role', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send(aisha);
    const userId = reg.body.user._id;
    const wedding = await Wedding.create({ brideName: 'Aisha', groomName: 'Rohan', slug: 'aisha-rohan', createdBy: userId });
    await WeddingMember.create({ wedding: wedding._id, user: userId, role: 'owner', acceptedAt: new Date() });

    const res = await request(app).get('/api/v1/me').set('Cookie', cookieOf(reg)).expect(200);
    assert.equal(res.body.user._id, userId);
    assert.equal(res.body.weddings.length, 1);
    assert.equal(res.body.weddings[0].role, 'owner');
    assert.equal(res.body.weddings[0].brideName, 'Aisha');
  });
});

describe('password reset', () => {
  it('emails a link, resets once, and signs out old sessions', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send(aisha);
    const oldCookie = cookieOf(reg);
    await new Promise((r) => setTimeout(r, 1100)); // let the old token's iat fall a second behind

    await request(app).post('/api/v1/auth/forgot-password').send({ email: aisha.email }).expect(202);
    assert.equal(sentEmails.length, 1);
    const token = sentEmails[0].text.match(/token=([\w-]+)/)[1];

    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'sangeet2026' }).expect(200);
    assert.ok(cookieOf(reset));

    await request(app).get('/api/v1/me').set('Cookie', oldCookie).expect(401);
    await request(app).get('/api/v1/me').set('Cookie', cookieOf(reset)).expect(200);
    await request(app).post('/api/v1/auth/login').send({ email: aisha.email, password: 'sangeet2026' }).expect(200);

    const again = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'another2026' }).expect(400);
    assert.equal(again.body.error.code, 'reset_link_invalid');
  });

  it('answers 202 and sends nothing for an unknown email', async () => {
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@email.com' }).expect(202);
    assert.equal(sentEmails.length, 0);
  });
});
