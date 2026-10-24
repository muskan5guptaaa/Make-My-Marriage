import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { Guest } = await import('../src/models/Guest.js');
const { GuestLink } = await import('../src/models/GuestLink.js');
const { parseCsv } = await import('../src/utils/csv.js');

let mongo;
let app;
let cookie;
let wedding;
let W;
let G;
let sangeet;
let reception;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const get = (url) => request(app).get(`/api/v1${url}`).set('Cookie', cookie);
const post = (url, body) => request(app).post(`/api/v1${url}`).set('Cookie', cookie).send(body);
const patch = (url, body) => request(app).patch(`/api/v1${url}`).set('Cookie', cookie).send(body);
const del = (url, body) => request(app).delete(`/api/v1${url}`).set('Cookie', cookie).send(body);

const priya = () => ({ name: 'Priya Mehta', side: 'bride', groupTag: 'friends', email: 'priya@email.com', invitedFunctions: [sangeet._id, reception._id], plusOnesAllowed: 2 });

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
  W = `/weddings/${wedding._id}`;
  G = `${W}/guests`;
  sangeet = (await post(`${W}/functions`, { name: 'Sangeet', localDate: '2026-10-24' })).body.function;
  reception = (await post(`${W}/functions`, { name: 'Reception', localDate: '2026-10-27' })).body.function;
});

describe('csv parser', () => {
  it('handles quotes, commas inside quotes, CRLF and a BOM', () => {
    const rows = parseCsv('﻿Name,Functions\r\n"Shah, Karan","Sangeet; Wedding"\r\n"Say ""hi""",x\n\n');
    assert.deepEqual(rows, [['Name', 'Functions'], ['Shah, Karan', 'Sangeet; Wedding'], ['Say "hi"', 'x']]);
  });
});

describe('create and read', () => {
  it('creates a guest with a pending RSVP per function and a private link', async () => {
    const res = await post(G, priya()).expect(201);
    const g = res.body.guest;
    assert.deepEqual(g.invitedFunctions.map((f) => f.name), ['Sangeet', 'Reception']);
    assert.deepEqual(g.rsvps.map((r) => [r.function.name, r.status]), [['Sangeet', 'pending'], ['Reception', 'pending']]);
    assert.equal(g.rsvpStatus, 'pending');
    assert.match(g.link.url, /\/i\/[A-Za-z0-9_-]{43}$/);

    const fns = await get(`${W}/functions`);
    assert.deepEqual(fns.body.data.map((f) => f.invitedCount), [1, 1]);
  });

  it('rejects functions from another wedding and bad fields', async () => {
    const other = (await post('/weddings', { brideName: 'Neha', groomName: 'Karan' })).body.wedding;
    const haldi = (await post(`/weddings/${other._id}/functions`, { name: 'Haldi', localDate: '2026-11-01' })).body.function;
    const res = await post(G, { name: 'X', invitedFunctions: [haldi._id] }).expect(400);
    assert.ok(res.body.error.fields.invitedFunctions);

    const bad = await post(G, { name: '', email: 'nope', side: 'left', plusOnesAllowed: 11 }).expect(400);
    assert.deepEqual(Object.keys(bad.body.error.fields).sort(), ['email', 'name', 'plusOnesAllowed', 'side']);
  });
});

describe('list, filters and summary', () => {
  beforeEach(async () => {
    const p = (await post(G, priya())).body.guest;
    await patch(`${G}/${p._id}/rsvps/${sangeet._id}`, { status: 'yes', plusOnes: 1, mealPreference: 'Veg' });
    await patch(`${G}/${p._id}/rsvps/${reception._id}`, { status: 'no' });
    const k = (await post(G, { name: 'Karan Shah', side: 'groom', phone: '+91 98765 43210', invitedFunctions: [reception._id] })).body.guest;
    await patch(`${G}/${k._id}/rsvps/${reception._id}`, { status: 'no' });
    await post(G, { name: 'arjun Nair', side: 'both', invitedFunctions: [sangeet._id] });
    await post(G, { name: 'Divya Rao', side: 'groom' }); // not invited to anything yet
  });

  const names = async (q) => (await get(`${G}${q}`).expect(200)).body.data.map((g) => g.name);

  it('sorts by name ignoring case and summarizes the whole wedding', async () => {
    const { body } = await get(G).expect(200);
    assert.deepEqual(body.data.map((g) => [g.name, g.rsvpStatus]), [
      ['arjun Nair', 'pending'],
      ['Divya Rao', 'not-invited'],
      ['Karan Shah', 'no'],
      ['Priya Mehta', 'yes'],
    ]);
    assert.deepEqual(body.meta.summary, { total: 4, invited: 3, yes: 1, no: 1, pending: 1, heads: 2 });
  });

  it('filters by search, side, function and RSVP', async () => {
    assert.deepEqual(await names('?q=98765'), ['Karan Shah']);
    assert.deepEqual(await names('?q=PRIYA'), ['Priya Mehta']);
    assert.deepEqual(await names('?side=groom'), ['Divya Rao', 'Karan Shah']);
    assert.deepEqual(await names(`?function=${sangeet._id}`), ['arjun Nair', 'Priya Mehta']);
    assert.deepEqual(await names('?rsvp=yes'), ['Priya Mehta']);
    assert.deepEqual(await names(`?function=${reception._id}&rsvp=no`), ['Karan Shah', 'Priya Mehta']);
  });

  it('reports RSVP totals per function and recent answers', async () => {
    const { body } = await get(`${W}/rsvps/summary`).expect(200);
    assert.deepEqual(
      body.functions.map((f) => [f.function.name, f.invited, f.yes, f.no, f.pending, f.heads]),
      [['Sangeet', 2, 1, 0, 1, 2], ['Reception', 2, 0, 2, 0, 0]],
    );
    assert.deepEqual(body.recent.map((r) => r.name).sort(), ['Karan Shah', 'Priya Mehta']);
  });
});

describe('RSVPs and edits', () => {
  it('enforces plus-ones, zeroes them on no, and clears respondedAt on pending', async () => {
    const g = (await post(G, priya())).body.guest;
    const url = `${G}/${g._id}/rsvps/${sangeet._id}`;
    const tooMany = await patch(url, { status: 'yes', plusOnes: 3 }).expect(422);
    assert.equal(tooMany.body.error.code, 'too_many_plus_ones');

    const yes = await patch(url, { status: 'yes', plusOnes: 2 }).expect(200);
    assert.equal(yes.body.guest.heads, 3);
    assert.ok(yes.body.guest.rsvps[0].respondedAt);

    const no = await patch(url, { status: 'no', plusOnes: 2 }).expect(200);
    assert.equal(no.body.guest.rsvps[0].plusOnes, 0);

    const back = await patch(url, { status: 'pending' }).expect(200);
    assert.equal(back.body.guest.rsvps[0].respondedAt, null);
  });

  it('refuses an RSVP for a function the guest is not invited to', async () => {
    const g = (await post(G, { name: 'Karan', invitedFunctions: [reception._id] })).body.guest;
    const res = await patch(`${G}/${g._id}/rsvps/${sangeet._id}`, { status: 'yes' }).expect(404);
    assert.equal(res.body.error.code, 'not_invited');
  });

  it('keeps answers when functions change and trims plus-ones when the allowance drops', async () => {
    const g = (await post(G, priya())).body.guest;
    await patch(`${G}/${g._id}/rsvps/${sangeet._id}`, { status: 'yes', plusOnes: 2 });
    const res = await patch(`${G}/${g._id}`, { invitedFunctions: [sangeet._id], plusOnesAllowed: 1 }).expect(200);
    assert.deepEqual(res.body.guest.rsvps.map((r) => [r.function.name, r.status, r.plusOnes]), [['Sangeet', 'yes', 1]]);
  });

  it('deleting a function removes it from guests', async () => {
    const g = (await post(G, priya())).body.guest;
    await del(`${W}/functions/${sangeet._id}`).expect(204);
    const after = (await get(`${G}/${g._id}`).expect(200)).body.guest;
    assert.deepEqual(after.invitedFunctions.map((f) => f.name), ['Reception']);
    assert.equal(after.rsvps.length, 1);
  });
});

describe('private link', () => {
  it('regenerates (old token revoked) and revokes', async () => {
    const g = (await post(G, priya())).body.guest;
    const first = g.link.url;
    const regen = await post(`${G}/${g._id}/link/regenerate`).expect(200);
    assert.notEqual(regen.body.link.url, first);
    assert.equal(await GuestLink.countDocuments({ guest: g._id, revokedAt: null }), 1);

    await post(`${G}/${g._id}/link/revoke`).expect(200);
    const now = await get(`${G}/${g._id}/link`).expect(200);
    assert.equal(now.body.link, null);
  });

  it('deleting a guest deletes their links; deleting the wedding deletes guests', async () => {
    const g = (await post(G, priya())).body.guest;
    await del(`${G}/${g._id}`).expect(204);
    assert.equal(await GuestLink.countDocuments({ guest: g._id }), 0);

    await post(G, priya());
    await del(W, { confirmSlug: wedding.slug }).expect(204);
    assert.equal(await Guest.countDocuments({ wedding: wedding._id }), 0);
    assert.equal(await GuestLink.countDocuments({ wedding: wedding._id }), 0);
  });
});

describe('CSV import', () => {
  it('imports rows, matching function names and skipping duplicates', async () => {
    await post(G, { name: 'Priya Mehta', email: 'priya@email.com' });
    const csv = [
      'Name,Phone,Email,Side,Group,Functions,Plus ones',
      'Priya Mehta,,priya@email.com,Bride,Friends,Sangeet,2',
      'Karan Shah,+91 98765 43210,,Groom,Family,"sangeet; Reception",1',
      'Neha Kapoor,,,,,,',
    ].join('\n');
    const res = await post(`${G}/import`, { csv }).expect(201);
    assert.deepEqual(res.body, { created: 2, skipped: 1 });

    const karan = (await get(`${G}?q=karan`)).body.data[0];
    assert.deepEqual(karan.invitedFunctions.map((f) => f.name), ['Sangeet', 'Reception']);
    assert.equal(karan.side, 'groom');
    assert.equal(karan.plusOnesAllowed, 1);
    assert.equal(await GuestLink.countDocuments({ wedding: wedding._id }), 3);
  });

  it('imports nothing when any row is wrong, and lists every problem', async () => {
    const csv = ['Name,Side,Functions,Email', 'Good Guest,bride,Sangeet,', ',groom,,', 'Bad Side,left,Haldi,not-an-email'].join('\n');
    const res = await post(`${G}/import`, { csv }).expect(400);
    assert.equal(res.body.error.code, 'import_failed');
    assert.deepEqual(res.body.error.fields.rows.map((r) => r.row), [3, 4]);
    assert.match(res.body.error.fields.rows[1].message, /unknown function "Haldi"/);
    assert.equal(await Guest.countDocuments({ wedding: wedding._id }), 0);
  });

  it('needs a Name column', async () => {
    const res = await post(`${G}/import`, { csv: 'Phone\n123' }).expect(400);
    assert.match(res.body.error.message, /Name/);
  });
});

describe('bulk delete', () => {
  it('deletes the chosen guests and their links, and ignores other weddings', async () => {
    const a = (await post(G, { name: 'Muskan Gupta' })).body.guest;
    const b = (await post(G, { name: 'Muskan Gupta' })).body.guest;
    const keep = (await post(G, { name: 'Ayush' })).body.guest;
    const other = (await post('/weddings', { brideName: 'Neha', groomName: 'Karan' })).body.wedding;
    const theirs = (await post(`/weddings/${other._id}/guests`, { name: 'Not yours' })).body.guest;

    const res = await post(`${G}/delete`, { ids: [a._id, b._id, theirs._id] }).expect(200);
    assert.equal(res.body.deleted, 2);
    assert.deepEqual((await get(G)).body.data.map((g) => g._id), [keep._id]);
    assert.equal(await GuestLink.countDocuments({ guest: { $in: [a._id, b._id] } }), 0);
    assert.equal(await Guest.countDocuments({ _id: theirs._id }), 1);

    await post(`${G}/delete`, { ids: [] }).expect(400);
    await post(`${G}/delete`, { ids: ['nope'] }).expect(400);
  });
});

describe('phone format', () => {
  it('turns every way of typing an Indian mobile into +91XXXXXXXXXX', async () => {
    const { normalizePhone } = await import('../src/utils/phone.js');
    for (const typed of ['8707463461', '87074 63461', '08707463461', '918707463461', '+91 87074-63461', '+91 (870) 746 3461', '00918707463461']) {
      assert.equal(normalizePhone(typed), '+918707463461', typed);
    }
    assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
    for (const bad of ['12345', '5707463461', '+91 12345', 'call me', '+1234']) assert.equal(normalizePhone(bad), null, bad);
  });

  it('stores one format, so the same number matches across guests and searches', async () => {
    const a = (await post(G, { name: 'Muskan Gupta', phone: '8707463461' }).expect(201)).body.guest;
    const b = (await post(G, { name: 'Muskan G', phone: '+91 87074 63461' }).expect(201)).body.guest;
    assert.equal(a.phone, '+918707463461');
    assert.equal(b.phone, a.phone);
    assert.deepEqual((await get(`${G}?q=87074 63461`)).body.data.map((g) => g.name), ['Muskan G', 'Muskan Gupta']);
    const bad = await post(G, { name: 'X', phone: '12345' }).expect(400);
    assert.match(bad.body.error.fields.phone, /10-digit Indian mobile/);
  });

  it('CSV import skips a guest already on the list under another spelling of the number', async () => {
    await post(G, { name: 'Muskan Gupta', phone: '+918707463461' });
    const res = await post(`${G}/import`, { csv: 'Name,Phone\nMuskan Gupta,08707463461\nAyush,9876543210' }).expect(201);
    assert.deepEqual(res.body, { created: 1, skipped: 1 });
  });
});
