import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { Expense, ExpenseCategory } = await import('../src/models/Expense.js');

let mongo;
let app;
let cookie;
let wedding;
let W;
let sangeet;
let cats; // name → id
const cookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('mmm_session='));
const get = (url) => request(app).get(`/api/v1${url}`).set('Cookie', cookie);
const post = (url, body) => request(app).post(`/api/v1${url}`).set('Cookie', cookie).send(body);
const patch = (url, body) => request(app).patch(`/api/v1${url}`).set('Cookie', cookie).send(body);
const del = (url, body) => request(app).delete(`/api/v1${url}`).set('Cookie', cookie).send(body);
const lakh = (n) => Math.round(n * 100_000 * 100); // ₹n lakh in paise

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
  sangeet = (await post(`${W}/functions`, { name: 'Sangeet', localDate: '2026-10-24' })).body.function;
  const list = (await get(`${W}/expense-categories`).expect(200)).body.data;
  cats = Object.fromEntries(list.map((c) => [c.name, c._id]));
});

describe('categories', () => {
  it('starts with a standard set, once', async () => {
    assert.ok(cats.Catering && cats.Decor && cats.Venue && cats.Other);
    await get(`${W}/expense-categories`);
    assert.equal(await ExpenseCategory.countDocuments({ wedding: wedding._id }), Object.keys(cats).length);
  });

  it('adds and renames, refusing names that differ only by case', async () => {
    const res = await post(`${W}/expense-categories`, { name: 'Mehendi artist' }).expect(201);
    const dup = await post(`${W}/expense-categories`, { name: 'catering' }).expect(409);
    assert.equal(dup.body.error.code, 'category_exists');
    await patch(`${W}/expense-categories/${res.body.category._id}`, { name: 'Henna' }).expect(200);
    await patch(`${W}/expense-categories/${res.body.category._id}`, { name: 'DECOR' }).expect(409);
  });

  it('will not delete a category that has expenses', async () => {
    await post(`${W}/expenses`, { vendorName: 'Taj Caterers', category: cats.Catering, budgetedAmountPaise: lakh(1.8) });
    const res = await del(`${W}/expense-categories/${cats.Catering}`).expect(409);
    assert.equal(res.body.error.code, 'category_in_use');
    await del(`${W}/expense-categories/${cats.Music}`).expect(204);
  });
});

describe('expenses', () => {
  it('creates with defaults and names the category and function', async () => {
    const res = await post(`${W}/expenses`, {
      vendorName: 'Taj Caterers',
      category: cats.Catering,
      function: sangeet._id,
      budgetedAmountPaise: lakh(1.8),
    }).expect(201);
    const e = res.body.expense;
    assert.equal(e.category.name, 'Catering');
    assert.equal(e.function.name, 'Sangeet');
    assert.equal(e.actualAmountPaise, 0);
    assert.equal(e.paidBy, 'shared');
    assert.equal(e.paymentStatus, 'pending');
  });

  it('validates money, references and enums', async () => {
    const other = (await post('/weddings', { brideName: 'Neha', groomName: 'Karan' })).body.wedding;
    const otherCat = (await get(`/weddings/${other._id}/expense-categories`)).body.data[0]._id;
    const res = await post(`${W}/expenses`, { vendorName: 'X', category: otherCat, budgetedAmountPaise: 100 }).expect(400);
    assert.ok(res.body.error.fields.category);

    const bad = await post(`${W}/expenses`, { vendorName: '', category: cats.Decor, budgetedAmountPaise: -5, actualAmountPaise: 1.5, paidBy: 'uncle' }).expect(400);
    assert.deepEqual(Object.keys(bad.body.error.fields).sort(), ['actualAmountPaise', 'budgetedAmountPaise', 'paidBy', 'vendorName']);
  });

  it('edits, filters and deletes', async () => {
    const e = (await post(`${W}/expenses`, { vendorName: 'Royal Decorators', category: cats.Decor, budgetedAmountPaise: lakh(2) })).body.expense;
    await post(`${W}/expenses`, { vendorName: 'DJ Beats', category: cats.Music, function: sangeet._id, budgetedAmountPaise: lakh(0.6) });

    const res = await patch(`${W}/expenses/${e._id}`, { actualAmountPaise: lakh(1.2), paymentStatus: 'partial', paidBy: 'bride-side' }).expect(200);
    assert.equal(res.body.expense.paymentStatus, 'partial');

    const names = async (q) => (await get(`${W}/expenses${q}`).expect(200)).body.data.map((x) => x.vendorName);
    assert.deepEqual(await names(`?category=${cats.Decor}`), ['Royal Decorators']);
    assert.deepEqual(await names(`?function=${sangeet._id}`), ['DJ Beats']);
    assert.deepEqual(await names('?function=none'), ['Royal Decorators']);
    assert.deepEqual(await names('?paymentStatus=partial&paidBy=bride-side'), ['Royal Decorators']);
    await get(`${W}/expenses?paymentStatus=later`).expect(400);

    await del(`${W}/expenses/${e._id}`).expect(204);
    await get(`${W}/expenses/${e._id}`).expect(404);
  });

  it('blocks changes while archived', async () => {
    await post(`${W}/archive`).expect(200);
    const res = await post(`${W}/expenses`, { vendorName: 'X', category: cats.Decor, budgetedAmountPaise: 1 }).expect(409);
    assert.equal(res.body.error.code, 'wedding_archived');
  });
});

describe('summary', () => {
  it('totals budget and actual by payer, category, function and status', async () => {
    await post(`${W}/expenses`, { vendorName: 'Taj Caterers', category: cats.Catering, function: sangeet._id, budgetedAmountPaise: lakh(3.5), actualAmountPaise: lakh(3.5), paidBy: 'bride-side', paymentStatus: 'paid' });
    await post(`${W}/expenses`, { vendorName: 'Royal Decorators', category: cats.Decor, budgetedAmountPaise: lakh(2), actualAmountPaise: lakh(1.8), paidBy: 'groom-side', paymentStatus: 'partial' });
    await post(`${W}/expenses`, { vendorName: 'DJ Beats', category: cats.Music, budgetedAmountPaise: lakh(0.6), paidBy: 'shared' });

    const { body } = await get(`${W}/expenses/summary`).expect(200);
    assert.deepEqual(body.total, { budgetedPaise: lakh(6.1), actualPaise: lakh(5.3), count: 3 });
    // Lines not yet spent count their budget towards who is paying.
    assert.deepEqual(body.byPaidBy, { 'bride-side': lakh(3.5), 'groom-side': lakh(1.8), shared: lakh(0.6) });
    assert.deepEqual(body.byCategory.map((c) => [c.category.name, c.budgetedPaise, c.actualPaise]), [
      ['Catering', lakh(3.5), lakh(3.5)],
      ['Decor', lakh(2), lakh(1.8)],
      ['Music', lakh(0.6), 0],
    ]);
    assert.deepEqual(body.byFunction.map((f) => [f.function?.name ?? null, f.count]), [['Sangeet', 1], [null, 2]]);
    assert.equal(body.byStatus.paid.count, 1);
    assert.equal(body.byStatus.pending.budgetedPaise, lakh(0.6));
  });
});

describe('integrity', () => {
  it('deleting a function keeps its expenses; deleting the wedding removes everything', async () => {
    const e = (await post(`${W}/expenses`, { vendorName: 'DJ Beats', category: cats.Music, function: sangeet._id, budgetedAmountPaise: 100 })).body.expense;
    await del(`${W}/functions/${sangeet._id}`).expect(204);
    assert.equal((await get(`${W}/expenses/${e._id}`)).body.expense.function, null);

    await del(W, { confirmSlug: wedding.slug }).expect(204);
    assert.equal(await Expense.countDocuments({ wedding: wedding._id }), 0);
    assert.equal(await ExpenseCategory.countDocuments({ wedding: wedding._id }), 0);
  });
});
