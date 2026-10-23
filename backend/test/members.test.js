import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { sentEmails } = await import('../src/utils/email.js');
const { WeddingMember } = await import('../src/models/WeddingMember.js');

let mongo;
let app;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));

async function signUp(name, email) {
  const res = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'mehendi2026' }).expect(201);
  return { cookie: cookieOf(res), id: res.body.user._id };
}
const as = (who) => ({
  get: (url) => request(app).get(`/api/v1${url}`).set('Cookie', who.cookie),
  post: (url, body) => request(app).post(`/api/v1${url}`).set('Cookie', who.cookie).send(body),
  patch: (url, body) => request(app).patch(`/api/v1${url}`).set('Cookie', who.cookie).send(body),
  del: (url) => request(app).delete(`/api/v1${url}`).set('Cookie', who.cookie),
});

let aisha;
let wedding;
let base;

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
  aisha = await signUp('Aisha Sharma', 'aisha@email.com');
  wedding = (await as(aisha).post('/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  base = `/weddings/${wedding._id}/members`;
});

describe('inviting', () => {
  it('invites someone with no account; they sign up, see it, and accept', async () => {
    const res = await as(aisha).post(base, { email: 'Rekha@Email.com' }).expect(201);
    assert.equal(res.body.member.email, 'rekha@email.com');
    assert.equal(res.body.member.status, 'invited');
    assert.equal(res.body.member.user, null);
    assert.equal(res.body.emailSent, true);
    assert.equal(sentEmails[0].to, 'rekha@email.com');
    assert.match(sentEmails[0].text, /Create an account/);

    const rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
    const me = await as(rekha).get('/me').expect(200);
    assert.equal(me.body.weddings.length, 0);
    assert.equal(me.body.invites.length, 1);
    assert.equal(me.body.invites[0].invitedBy.name, 'Aisha Sharma');

    // Not a member until accepted.
    await as(rekha).get(`/weddings/${wedding._id}`).expect(404);

    const accepted = await as(rekha).post(`${base}/accept`).expect(200);
    assert.equal(accepted.body.wedding.role, 'co-admin');
    await as(rekha).get(`/weddings/${wedding._id}`).expect(200);

    const list = await as(aisha).get(base).expect(200);
    assert.deepEqual(list.body.data.map((m) => [m.email, m.role, m.status]), [
      ['aisha@email.com', 'owner', 'active'],
      ['rekha@email.com', 'co-admin', 'active'],
    ]);
  });

  it('invites an existing user and says "Sign in"', async () => {
    await signUp('Rohan Mehta', 'rohan@email.com');
    const res = await as(aisha).post(base, { email: 'rohan@email.com' }).expect(201);
    assert.equal(res.body.member.user.name, 'Rohan Mehta');
    assert.match(sentEmails[0].text, /Sign in/);
  });

  it('refuses duplicates and existing members', async () => {
    await as(aisha).post(base, { email: 'rekha@email.com' }).expect(201);
    const again = await as(aisha).post(base, { email: 'rekha@email.com' }).expect(409);
    assert.equal(again.body.error.code, 'already_invited');
    const self = await as(aisha).post(base, { email: 'aisha@email.com' }).expect(409);
    assert.equal(self.body.error.code, 'already_member');
  });

  it('only owners invite', async () => {
    await as(aisha).post(base, { email: 'rekha@email.com' });
    const rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
    await as(rekha).post(`${base}/accept`).expect(200);
    const res = await as(rekha).post(base, { email: 'karan@email.com' }).expect(403);
    assert.equal(res.body.error.code, 'owner_only');
  });

  it('lets the invited person decline', async () => {
    await as(aisha).post(base, { email: 'rekha@email.com' });
    const rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
    await as(rekha).post(`${base}/decline`).expect(204);
    assert.equal((await as(rekha).get('/me')).body.invites.length, 0);
    await as(rekha).post(`${base}/accept`).expect(404);
  });

  it('does not let a stranger accept someone else\'s invite', async () => {
    await as(aisha).post(base, { email: 'rekha@email.com' });
    const karan = await signUp('Karan Shah', 'karan@email.com');
    const res = await as(karan).post(`${base}/accept`).expect(404);
    assert.equal(res.body.error.code, 'invite_not_found');
  });
});

describe('roles and removal', () => {
  async function addCoAdmin(name, email) {
    await as(aisha).post(base, { email });
    const who = await signUp(name, email);
    await as(who).post(`${base}/accept`).expect(200);
    const list = await as(aisha).get(base);
    return { ...who, memberId: list.body.data.find((m) => m.email === email)._id };
  }
  const aishaMemberId = async () => (await as(aisha).get(base)).body.data.find((m) => m.email === 'aisha@email.com')._id;

  it('promotes a co-admin to owner and protects the last owner', async () => {
    const rohan = await addCoAdmin('Rohan Mehta', 'rohan@email.com');
    const mine = await aishaMemberId();

    const last = await as(aisha).patch(`${base}/${mine}`, { role: 'co-admin' }).expect(409);
    assert.equal(last.body.error.code, 'last_owner');

    await as(aisha).patch(`${base}/${rohan.memberId}`, { role: 'owner' }).expect(200);
    // Now two owners, so Aisha can step down.
    await as(aisha).patch(`${base}/${mine}`, { role: 'co-admin' }).expect(200);
    const me = await as(aisha).get(`/weddings/${wedding._id}`);
    assert.equal(me.body.wedding.role, 'co-admin');
  });

  it('owner removes a co-admin; co-admin can only remove themselves', async () => {
    const rekha = await addCoAdmin('Rekha Kapoor', 'rekha@email.com');
    const karan = await addCoAdmin('Karan Shah', 'karan@email.com');

    const res = await as(rekha).del(`${base}/${karan.memberId}`).expect(403);
    assert.equal(res.body.error.code, 'owner_only');

    await as(rekha).del(`${base}/${rekha.memberId}`).expect(204); // leave
    await as(rekha).get(`/weddings/${wedding._id}`).expect(404);

    await as(aisha).del(`${base}/${karan.memberId}`).expect(204);
    assert.equal((await as(aisha).get(base)).body.data.length, 1);
  });

  it('the last owner cannot leave', async () => {
    const res = await as(aisha).del(`${base}/${await aishaMemberId()}`).expect(409);
    assert.equal(res.body.error.code, 'last_owner');
  });

  it('owner cancels a pending invite', async () => {
    const invite = (await as(aisha).post(base, { email: 'rekha@email.com' })).body.member;
    await as(aisha).del(`${base}/${invite._id}`).expect(204);
    const rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
    assert.equal((await as(rekha).get('/me')).body.invites.length, 0);
  });

  it('cannot change the role of a pending invite', async () => {
    const invite = (await as(aisha).post(base, { email: 'rekha@email.com' })).body.member;
    const res = await as(aisha).patch(`${base}/${invite._id}`, { role: 'owner' }).expect(409);
    assert.equal(res.body.error.code, 'invite_pending');
  });
});

describe('invitation link (/join/<token>)', () => {
  const tokenFrom = (email) => email.text.match(/\/join\/([A-Za-z0-9_-]+)/)[1];
  const view = (token) => request(app).get(`/api/v1/member-invites/${token}`);

  it('shows the couple, dates, functions, email, role and whether an account exists', async () => {
    await as(aisha).post(`/weddings/${wedding._id}/functions`, { name: 'Sangeet', localDate: '2026-10-24', startTime: '19:00', venue: 'The Grand Lawns' });
    const res = await as(aisha).post(base, { email: 'rekha@email.com' }).expect(201);
    assert.match(res.body.inviteUrl, /\/join\/[A-Za-z0-9_-]{43}$/);
    const token = tokenFrom(sentEmails[0]);
    assert.ok(res.body.inviteUrl.endsWith(token));

    const { body } = await view(token).expect(200); // no session needed
    assert.equal(body.invite.status, 'pending');
    assert.equal(body.invite.email, 'rekha@email.com');
    assert.equal(body.invite.role, 'co-admin');
    assert.equal(body.invite.invitedBy.name, 'Aisha Sharma');
    assert.equal(body.invite.hasAccount, false);
    assert.equal(body.invite.wedding.brideName, 'Aisha');
    assert.deepEqual(body.invite.wedding.dateRange, { start: '2026-10-24', end: '2026-10-24' });
    assert.deepEqual(body.invite.wedding.functions.map((f) => [f.name, f.startTime, f.venue]), [['Sangeet', '19:00', 'The Grand Lawns']]);

    await signUp('Rekha Kapoor', 'rekha@email.com');
    assert.equal((await view(token)).body.invite.hasAccount, true);
  });

  it('accepts only for the invited email, then shows accepted', async () => {
    await as(aisha).post(base, { email: 'rekha@email.com' });
    const token = tokenFrom(sentEmails[0]);
    const karan = await signUp('Karan Shah', 'karan@email.com');
    const wrong = await as(karan).post(`/member-invites/${token}/accept`).expect(403);
    assert.equal(wrong.body.error.code, 'wrong_account');
    await request(app).post(`/api/v1/member-invites/${token}/accept`).expect(401);

    const rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
    const ok = await as(rekha).post(`/member-invites/${token}/accept`).expect(200);
    assert.equal(ok.body.wedding.role, 'co-admin');
    await as(rekha).get(`/weddings/${wedding._id}`).expect(200);
    assert.equal((await view(token)).body.invite.status, 'accepted');
    await as(rekha).post(`/member-invites/${token}/accept`).expect(200); // opening it again is fine
  });

  it('re-sending issues a new link and the old one stops working', async () => {
    const invite = (await as(aisha).post(base, { email: 'rekha@email.com' })).body.member;
    const first = tokenFrom(sentEmails[0]);
    const res = await as(aisha).post(`${base}/${invite._id}/resend`).expect(200);
    const second = tokenFrom(sentEmails[1]);
    assert.notEqual(first, second);
    assert.ok(res.body.inviteUrl.endsWith(second));
    const old = await view(first).expect(404);
    assert.equal(old.body.error.code, 'invite_link_invalid');
    await view(second).expect(200);
  });

  it('expired links can be viewed but not accepted; cancelled and made-up links are invalid', async () => {
    const invite = (await as(aisha).post(base, { email: 'rekha@email.com' })).body.member;
    const token = tokenFrom(sentEmails[0]);
    await WeddingMember.updateOne({ _id: invite._id }, { $set: { inviteExpiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await view(token)).body.invite.status, 'expired');
    const rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
    const res = await as(rekha).post(`/member-invites/${token}/accept`).expect(410);
    assert.equal(res.body.error.code, 'invite_expired');

    await as(aisha).del(`${base}/${invite._id}`).expect(204);
    await view(token).expect(404);
    await view('not-a-real-token-at-all-xxxxxxxx').expect(404);
    await view('short').expect(404);
  });

  it('only owners can re-send', async () => {
    await as(aisha).post(base, { email: 'karan@email.com' });
    await as(aisha).post(base, { email: 'rekha@email.com' });
    const rekha = await signUp('Rekha Kapoor', 'rekha@email.com');
    await as(rekha).post(`${base}/accept`).expect(200);
    const karanInvite = (await as(aisha).get(base)).body.data.find((m) => m.email === 'karan@email.com');
    await as(rekha).post(`${base}/${karanInvite._id}/resend`).expect(403);
  });
});
