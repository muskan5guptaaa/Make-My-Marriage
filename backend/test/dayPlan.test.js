import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { fake } = await import('../src/utils/ai.js');
const { dayChecks } = await import('../src/utils/dayPlan.js');
const { DayPlan } = await import('../src/models/DayPlan.js');

let mongo;
let app;
let cookie;
let wedding;
let W;
let haldi;
let shaadi;
let sangeet;
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const call = (method, url, body, c = cookie) => request(app)[method](`/api/v1${url}`).set('Cookie', c).send(body);
const DAY = '2026-12-12';

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
  wedding = (await call('post', '/weddings', { brideName: 'Aisha', groomName: 'Rohan' })).body.wedding;
  W = `/weddings/${wedding._id}`;
  // The Haldi usually runs 3 hours, so a Wedding at 11:00 overlaps it.
  haldi = (await call('post', `${W}/functions`, { name: 'Haldi', localDate: DAY, startTime: '09:00', venue: 'Home' })).body.function;
  shaadi = (await call('post', `${W}/functions`, { name: 'Wedding', localDate: DAY, startTime: '11:00', venue: 'Rambagh Palace' })).body.function;
  sangeet = (await call('post', `${W}/functions`, { name: 'Sangeet', localDate: '2026-12-11' })).body.function;
  await call('post', `${W}/tasks`, { title: 'Order haldi flowers', function: haldi._id });
  const done = (await call('post', `${W}/tasks`, { title: 'Book the pandit', function: shaadi._id })).body.task;
  await call('patch', `${W}/tasks/${done._id}`, { status: 'done' });
  const cat = (await call('post', `${W}/expense-categories`, { name: 'Flowers' })).body.category;
  await call('post', `${W}/expenses`, { vendorName: 'Phoolwala Decor', category: cat._id, function: shaadi._id, budgetedAmountPaise: 30_000_000, paymentStatus: 'partial' });
  const priya = (await call('post', `${W}/guests`, { name: 'Priya Mehta', phone: '9876543210', email: 'priya@email.com', plusOnesAllowed: 1, invitedFunctions: [haldi._id] })).body.guest;
  await call('patch', `${W}/guests/${priya._id}/rsvps/${haldi._id}`, { status: 'yes', plusOnes: 1 }).expect(200);
});

describe('day plan: checks worked out in code', () => {
  it('finds overlaps, tight moves between venues, missing times and double-booked people', () => {
    const f = (name, startTime, venue) => ({ _id: name, name, startTime, venue });
    assert.deepEqual(dayChecks({ functions: [f('Haldi', '09:00', 'Home'), f('Wedding', '12:30', 'Rambagh Palace')] }), [
      { level: 'warning', text: "Only 30 minutes from the end of the Haldi (around 12:00) to the Wedding at 12:30, and it's a different venue: Home → Rambagh Palace." },
    ]);
    assert.deepEqual(dayChecks({ functions: [f('Haldi', '09:00', 'Home'), f('Lunch', '12:30', 'Home')] }), [], 'same venue: no travel needed');
    assert.deepEqual(dayChecks({ functions: [f('Mehendi', '16:00'), f('Cocktails', '16:00'), f('Dinner')] }).map((c) => c.text), [
      'The Mehendi and the Cocktails both start at 16:00.',
      "The Dinner has no start time yet, so it isn't on the timeline. Add one on the Functions page.",
    ]);
    const items = [{ time: '08:00', who: 'Rohan', title: 'Meet decorators' }, { time: '08:00', who: 'rohan ', title: 'Pick up mithai' }];
    assert.deepEqual(dayChecks({ functions: [], items }), [{ level: 'clash', text: 'Rohan has 2 things at 08:00: Meet decorators; Pick up mithai.' }]);
  });
});

describe('day plan: the API', () => {
  it('lists the days that have functions', async () => {
    const res = await call('get', `${W}/day-plans`).expect(200);
    assert.deepEqual(res.body.data, [
      { date: '2026-12-11', functions: ['Sangeet'], saved: false },
      { date: DAY, functions: ['Haldi', 'Wedding'], saved: false },
    ]);
  });

  it("shows a day's function starts and its checks, without the AI", async () => {
    const res = await call('get', `${W}/day-plans/${DAY}`).expect(200);
    assert.deepEqual(res.body.items.map((i) => [i.time, i.title, i.fixed]), [['09:00', 'Haldi starts', true], ['11:00', 'Wedding starts', true]]);
    assert.deepEqual(res.body.checks.map((c) => c.level), ['clash', 'warning', 'warning']);
    assert.match(res.body.checks[0].text, /The Wedding starts at 11:00, but the Haldi \(from 09:00\) usually runs about 3 hours, until around 12:00\./);
    assert.equal(res.body.checks[1].text, '1 task for the Haldi still open: Order haldi flowers.');
    assert.equal(res.body.checks[2].text, 'Not fully paid yet: Phoolwala Decor (Wedding).');
    assert.deepEqual(res.body.people, ['Aisha Sharma', 'Phoolwala Decor']);
    assert.equal(fake.calls.length, 0);

    const sangeetDay = await call('get', `${W}/day-plans/2026-12-11`).expect(200);
    assert.deepEqual(sangeetDay.body.items, []);
    assert.match(sangeetDay.body.checks[0].text, /The Sangeet has no start time yet/);
    await call('get', `${W}/day-plans/2026-12-25`).expect(404);
    await call('get', `${W}/day-plans/2026-02-30`).expect(400);
  });

  it('drafts a run sheet, keeping only sound steps, and saves nothing', async () => {
    fake.json = {
      items: [
        { time: '07:00', title: 'Decorators arrive', functionRef: 'F2', who: 'Phoolwala Decor', notes: 'Mandap first' },
        { time: '7:30', title: 'Haldi setup', functionRef: 'F1', who: 'aisha sharma', notes: null },
        { time: '09:00', title: 'Haldi starts', functionRef: 'F1', who: null, notes: null }, // already a fixed row
        { time: '25:00', title: 'Midnight snack', functionRef: null, who: null, notes: null },
        { time: '10:00', title: 'Photos with family', functionRef: 'F9', who: null, notes: null }, // no such function
        { time: '10:30', title: 'Leave for the palace', functionRef: null, who: 'Ravi', notes: null }, // Ravi isn't in the data
        { time: '10:30', title: 'Leave for the palace', functionRef: null, who: null, notes: null }, // duplicate
      ],
    };
    const res = await call('post', `${W}/day-plans/${DAY}/draft`).expect(200);

    const { system, prompt } = fake.calls[0];
    assert.match(system, /never include a step for a function starting/);
    assert.match(prompt, /\[F1\] Haldi · starts 09:00 · at Home · 2 people coming · usually about 3 hours/);
    assert.match(prompt, /- Phoolwala Decor \(Flowers\) for \[F2\]/);
    assert.match(prompt, /- Order haldi flowers \(\[F1\]\)/);
    assert.doesNotMatch(prompt, /Book the pandit/, 'done tasks are left out');
    assert.doesNotMatch(prompt, /98765|priya@email/, 'no phones or emails');

    assert.deepEqual(res.body.items.map((i) => [i.time, i.title, i.who, i.function?.name ?? null, i.fixed]), [
      ['07:00', 'Decorators arrive', 'Phoolwala Decor', 'Wedding', false],
      ['07:30', 'Haldi setup', 'Aisha Sharma', 'Haldi', false],
      ['09:00', 'Haldi starts', null, 'Haldi', true],
      ['10:30', 'Leave for the palace', null, null, false],
      ['11:00', 'Wedding starts', null, 'Wedding', true],
    ]);
    assert.equal(res.body.saved, false);
    assert.equal(await DayPlan.countDocuments(), 0);
  });

  it('saves the kept steps; function starts always follow the Functions page', async () => {
    const items = [
      { time: '07:00', title: 'Decorators arrive', function: shaadi._id, who: 'Phoolwala Decor', notes: '' },
      { time: '08:00', title: 'Meet the mehendi artist', who: 'Aisha Sharma' },
      { time: '08:00', title: 'Collect the jaimala', who: 'Aisha Sharma' },
    ];
    let res = await call('put', `${W}/day-plans/${DAY}`, { items }).expect(200);
    assert.equal(res.body.saved, true);
    assert.ok(res.body.checks.some((c) => c.level === 'clash' && c.text === 'Aisha Sharma has 2 things at 08:00: Meet the mehendi artist; Collect the jaimala.'));

    await call('patch', `${W}/functions/${shaadi._id}`, { startTime: '19:00' }).expect(200);
    res = await call('get', `${W}/day-plans/${DAY}`).expect(200);
    assert.deepEqual(res.body.items.map((i) => [i.time, i.title]), [
      ['07:00', 'Decorators arrive'], ['08:00', 'Meet the mehendi artist'], ['08:00', 'Collect the jaimala'], ['09:00', 'Haldi starts'], ['19:00', 'Wedding starts'],
    ]);
    assert.equal(res.body.items[0].notes, null);
    assert.equal(res.body.checks.some((c) => /usually runs/.test(c.text)), false, 'no overlap any more');
    assert.equal((await call('get', `${W}/day-plans`)).body.data[1].saved, true);

    res = await call('put', `${W}/day-plans/${DAY}`, { items: [{ time: '08:00', title: 'Sangeet rehearsal', function: sangeet._id }] }).expect(400);
    assert.equal(res.body.error.fields.function, 'Choose a function from this day.');
    res = await call('put', `${W}/day-plans/${DAY}`, { items: [{ time: '8am', title: 'Breakfast' }] }).expect(400);
    assert.equal(res.body.error.fields['items.0.time'], 'Enter a time like 07:30.');
  });

  it("keeps day plans to the wedding's own team, and read-only once archived", async () => {
    const other = cookieOf(await request(app).post('/api/v1/auth/register').send({ name: 'Zoya', email: 'zoya@email.com', password: 'sangeet2026' }));
    await call('get', `${W}/day-plans/${DAY}`, undefined, other).expect(404);
    await call('put', `${W}/day-plans/${DAY}`, { items: [] }, other).expect(404);

    await call('post', `${W}/archive`, {}).expect(200);
    await call('get', `${W}/day-plans/${DAY}`).expect(200);
    await call('post', `${W}/day-plans/${DAY}/draft`).expect(409);
    await call('put', `${W}/day-plans/${DAY}`, { items: [] }).expect(409);
  });
});
