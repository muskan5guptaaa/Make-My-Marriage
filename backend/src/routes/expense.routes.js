import { Router } from 'express';
import * as expenses from '../controllers/expense.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { loadWedding, requireActive } from '../middleware/membership.js';
import { validateBody } from '../middleware/validate.js';
import { categorySchema, createExpenseSchema, updateExpenseSchema } from '../validators/expense.schemas.js';

export const expenseRouter = Router();

// Owners and co-admins manage the budget; archived weddings are read-only.
const member = [requireAuth, loadWedding];
const write = [...member, requireActive];
const W = '/weddings/:weddingId';
const C = `${W}/expense-categories`;
const E = `${W}/expenses`;

expenseRouter.get(C, ...member, expenses.listCategories);
expenseRouter.post(C, ...write, validateBody(categorySchema), expenses.createCategory);
expenseRouter.patch(`${C}/:categoryId`, ...write, validateBody(categorySchema), expenses.renameCategory);
expenseRouter.delete(`${C}/:categoryId`, ...write, expenses.deleteCategory);

expenseRouter.get(E, ...member, expenses.listExpenses);
expenseRouter.get(`${E}/summary`, ...member, expenses.expenseSummary); // before /:expenseId
expenseRouter.post(E, ...write, validateBody(createExpenseSchema), expenses.createExpense);
expenseRouter.get(`${E}/:expenseId`, ...member, expenses.getExpense);
expenseRouter.patch(`${E}/:expenseId`, ...write, validateBody(updateExpenseSchema), expenses.updateExpense);
expenseRouter.delete(`${E}/:expenseId`, ...write, expenses.deleteExpense);
