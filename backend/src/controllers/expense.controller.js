import mongoose from 'mongoose';
import { WeddingFunction } from '../models/Function.js';
import { Expense, ExpenseCategory } from '../models/Expense.js';
import { badRequest, conflict, notFoundError } from '../utils/AppError.js';
import { PAID_BY, PAYMENT_STATUSES } from '../validators/expense.schemas.js';

const DEFAULT_CATEGORIES = ['Catering', 'Decor', 'Photography', 'Venue', 'Attire', 'Jewellery', 'Music', 'Gifts', 'Travel', 'Other'];
const EDITABLE = ['vendorName', 'category', 'function', 'budgetedAmountPaise', 'actualAmountPaise', 'paidBy', 'paymentStatus', 'dueDate', 'notes'];

const categoryNotFound = () => notFoundError('category_not_found', 'This category is not part of this wedding.');
const expenseNotFound = () => notFoundError('expense_not_found', 'This expense is not part of this wedding.');
const nameTaken = () => conflict('category_exists', 'A category with this name already exists.', { name: 'Already a category.' });
const caseless = { locale: 'en', strength: 2 };

// ---- categories ----

// A wedding starts with a standard set of categories the first time they're asked for.
async function categoriesFor(weddingId) {
  let list = await ExpenseCategory.find({ wedding: weddingId }).collation(caseless).sort({ name: 1 });
  if (list.length === 0) {
    try {
      await ExpenseCategory.insertMany(DEFAULT_CATEGORIES.map((name) => ({ wedding: weddingId, name })), { ordered: false });
    } catch (err) {
      if (err?.code !== 11000 && !err?.writeErrors) throw err; // another request seeded them first
    }
    list = await ExpenseCategory.find({ wedding: weddingId }).collation(caseless).sort({ name: 1 });
  }
  return list;
}

export async function listCategories(req, res) {
  const [list, usage] = await Promise.all([
    categoriesFor(req.wedding._id),
    Expense.aggregate([{ $match: { wedding: req.wedding._id } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
  ]);
  const used = new Map(usage.map((u) => [String(u._id), u.n]));
  res.json({ data: list.map((c) => ({ _id: c._id, name: c.name, expenseCount: used.get(String(c._id)) ?? 0 })) });
}

async function loadCategory(req) {
  const { categoryId } = req.params;
  if (!mongoose.isValidObjectId(categoryId)) throw categoryNotFound();
  const category = await ExpenseCategory.findOne({ _id: categoryId, wedding: req.wedding._id });
  if (!category) throw categoryNotFound();
  return category;
}

async function saveCategory(category) {
  try {
    await category.save();
  } catch (err) {
    if (err?.code === 11000) throw nameTaken();
    throw err;
  }
}

export async function createCategory(req, res) {
  await categoriesFor(req.wedding._id); // seed first, so a custom name can't clash with a default later
  const category = new ExpenseCategory({ wedding: req.wedding._id, name: req.body.name });
  await saveCategory(category);
  res.status(201).json({ category: { _id: category._id, name: category.name, expenseCount: 0 } });
}

export async function renameCategory(req, res) {
  const category = await loadCategory(req);
  category.name = req.body.name;
  await saveCategory(category);
  res.json({ category: { _id: category._id, name: category.name, expenseCount: await Expense.countDocuments({ category: category._id }) } });
}

// A category that still has expenses can't be deleted; move them first.
export async function deleteCategory(req, res) {
  const category = await loadCategory(req);
  const inUse = await Expense.countDocuments({ wedding: req.wedding._id, category: category._id });
  if (inUse > 0) {
    throw conflict('category_in_use', `${inUse} expense${inUse === 1 ? ' uses' : 's use'} this category. Move ${inUse === 1 ? 'it' : 'them'} to another category first.`);
  }
  await ExpenseCategory.deleteOne({ _id: category._id });
  res.status(204).end();
}

// ---- expenses ----

function toExpense(e) {
  return {
    _id: e._id,
    vendorName: e.vendorName,
    category: e.category ? { _id: e.category._id, name: e.category.name } : null,
    function: e.function ? { _id: e.function._id, name: e.function.name } : null,
    budgetedAmountPaise: e.budgetedAmountPaise,
    actualAmountPaise: e.actualAmountPaise,
    paidBy: e.paidBy,
    paymentStatus: e.paymentStatus,
    dueDate: e.dueDate ?? null,
    notes: e.notes ?? null,
    createdBy: e.createdBy ? { _id: e.createdBy._id, name: e.createdBy.name } : null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

const populated = (query) => query.populate('category', 'name').populate('function', 'name').populate('createdBy', 'name');

// Category and function must belong to this wedding (MongoDB has no foreign keys).
async function checkReferences(weddingId, body) {
  const fields = {};
  if (body.category && !(await ExpenseCategory.exists({ _id: body.category, wedding: weddingId }))) {
    fields.category = 'Choose a category from this wedding.';
  }
  if (body.function && !(await WeddingFunction.exists({ _id: body.function, wedding: weddingId }))) {
    fields.function = 'Choose a function from this wedding.';
  }
  if (Object.keys(fields).length > 0) throw badRequest('Some fields need fixing.', fields);
}

function apply(expense, body) {
  for (const key of EDITABLE) {
    if (body[key] !== undefined) expense[key] = body[key] ?? undefined; // null clears the field
  }
}

async function loadExpense(req) {
  const { expenseId } = req.params;
  if (!mongoose.isValidObjectId(expenseId)) throw expenseNotFound();
  const expense = await Expense.findOne({ _id: expenseId, wedding: req.wedding._id });
  if (!expense) throw expenseNotFound();
  return expense;
}

const sendExpense = async (res, id, status = 200) =>
  res.status(status).json({ expense: toExpense(await populated(Expense.findById(id))) });

// Filters: ?category, ?function=<id>|none, ?paymentStatus, ?paidBy. Newest first.
export async function listExpenses(req, res) {
  const { category, function: fn, paymentStatus, paidBy } = req.query;
  const filter = { wedding: req.wedding._id };
  if (category) {
    if (!mongoose.isValidObjectId(category)) throw badRequest('Unknown category filter.', { category: 'Use a category id.' });
    filter.category = category;
  }
  if (fn) {
    if (fn !== 'none' && !mongoose.isValidObjectId(fn)) throw badRequest('Unknown function filter.', { function: 'Use an id or none.' });
    filter.function = fn === 'none' ? null : fn;
  }
  if (paymentStatus) {
    if (!PAYMENT_STATUSES.includes(paymentStatus)) throw badRequest('Unknown status filter.', { paymentStatus: 'Use pending, partial or paid.' });
    filter.paymentStatus = paymentStatus;
  }
  if (paidBy) {
    if (!PAID_BY.includes(paidBy)) throw badRequest('Unknown payer filter.', { paidBy: 'Use bride-side, groom-side or shared.' });
    filter.paidBy = paidBy;
  }
  const list = await populated(Expense.find(filter).sort({ createdAt: -1 }));
  res.json({ data: list.map(toExpense) });
}

export async function getExpense(req, res) {
  const expense = await loadExpense(req);
  await sendExpense(res, expense._id);
}

export async function createExpense(req, res) {
  await checkReferences(req.wedding._id, req.body);
  const expense = new Expense({ wedding: req.wedding._id, createdBy: req.user._id });
  apply(expense, req.body);
  await expense.save();
  await sendExpense(res, expense._id, 201);
}

export async function updateExpense(req, res) {
  const expense = await loadExpense(req);
  await checkReferences(req.wedding._id, req.body);
  apply(expense, req.body);
  await expense.save();
  await sendExpense(res, expense._id);
}

export async function deleteExpense(req, res) {
  const expense = await loadExpense(req);
  await Expense.deleteOne({ _id: expense._id });
  res.status(204).end();
}

// Budget against actual spend: in total, by who pays, by category, by function and by status.
// "Split by who's paying" uses actual spend, falling back to the budget for lines not yet spent.
export async function expenseSummary(req, res) {
  const [expenses, categories, functions] = await Promise.all([
    Expense.find({ wedding: req.wedding._id }),
    categoriesFor(req.wedding._id),
    WeddingFunction.find({ wedding: req.wedding._id }).sort({ startsAt: 1 }).select('name'),
  ]);

  const zero = () => ({ budgetedPaise: 0, actualPaise: 0, count: 0 });
  const add = (bucket, e) => {
    bucket.budgetedPaise += e.budgetedAmountPaise;
    bucket.actualPaise += e.actualAmountPaise;
    bucket.count++;
  };

  const total = zero();
  const byPaidBy = Object.fromEntries(PAID_BY.map((p) => [p, 0]));
  const byStatus = Object.fromEntries(PAYMENT_STATUSES.map((s) => [s, zero()]));
  const byCat = new Map(categories.map((c) => [String(c._id), { category: { _id: c._id, name: c.name }, ...zero() }]));
  const byFn = new Map(functions.map((f) => [String(f._id), { function: { _id: f._id, name: f.name }, ...zero() }]));
  const noFunction = { function: null, ...zero() };

  for (const e of expenses) {
    add(total, e);
    add(byStatus[e.paymentStatus], e);
    byPaidBy[e.paidBy] += e.actualAmountPaise || e.budgetedAmountPaise;
    const cat = byCat.get(String(e.category));
    if (cat) add(cat, e);
    add(e.function ? byFn.get(String(e.function)) ?? noFunction : noFunction, e);
  }

  res.json({
    total,
    byPaidBy,
    byStatus,
    byCategory: [...byCat.values()].filter((c) => c.count > 0).sort((a, b) => b.budgetedPaise - a.budgetedPaise),
    byFunction: [...byFn.values(), noFunction].filter((f) => f.count > 0),
  });
}
