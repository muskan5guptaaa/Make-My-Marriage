import { Expense, ExpenseCategory } from '../models/Expense.js';
import { WeddingFunction } from '../models/Function.js';
import { generateJson, requireAi } from '../utils/ai.js';
import { AppError } from '../utils/AppError.js';
import { buildInsightsPrompt, computeInsights, INSIGHTS_SCHEMA, INSIGHTS_SYSTEM_PROMPT, insightsReply } from '../utils/budgetInsights.js';
import { todayIn } from '../utils/time.js';

async function loadBudget(wedding) {
  const [expenses, categories, functions] = await Promise.all([
    Expense.find({ wedding: wedding._id }).sort({ createdAt: 1, _id: 1 }).lean(),
    ExpenseCategory.find({ wedding: wedding._id }).sort({ name: 1 }).lean(),
    WeddingFunction.find({ wedding: wedding._id }).select('name').lean(),
  ]);
  const facts = computeInsights({ expenses, categories, functions, today: todayIn(wedding.timezone) });
  return { expenses, categories, functions, facts };
}

const publicFacts = ({ refs: _refs, refsByExpense: _byExpense, ...facts }) => facts;

// GET /weddings/:weddingId/expenses/insights
// Over-budget categories and lines, likely duplicate payments, payments due soon. No AI: free and exact.
export async function budgetInsights(req, res) {
  const { facts } = await loadBudget(req.wedding);
  res.json(publicFacts(facts));
}

// POST /weddings/:weddingId/expenses/insights/suggest
// Up to 3 AI suggestions about those facts, each linked to the expenses it names. Changes nothing.
export async function suggestSavings(req, res) {
  requireAi();
  const { expenses, categories, functions, facts } = await loadBudget(req.wedding);
  if (expenses.length === 0) return res.json({ suggestions: [] });

  const raw = await generateJson({
    system: INSIGHTS_SYSTEM_PROMPT,
    prompt: buildInsightsPrompt({ facts, expenses, categories, functions }),
    schema: INSIGHTS_SCHEMA,
  });
  const reply = insightsReply.safeParse(raw);
  if (!reply.success) {
    console.error('Budget insights reply failed validation:', reply.error.issues.slice(0, 3));
    throw new AppError(502, 'ai_bad_output', "The assistant's suggestions didn't make sense. Try again.");
  }

  // Keep only references to real expenses, and suggestions that still point at one.
  const byId = new Map(expenses.map((e) => [String(e._id), e]));
  const suggestions = reply.data.suggestions
    .slice(0, 3)
    .map((s) => ({
      text: s.text,
      expenses: [...new Set(s.refs.map((r) => r.replace(/[[\]\s]/g, '').toUpperCase()))]
        .filter((r) => facts.refs.has(r))
        .map((r) => ({ ref: r, _id: facts.refs.get(r), vendorName: byId.get(facts.refs.get(r)).vendorName })),
    }))
    .filter((s) => s.expenses.length > 0);
  res.json({ suggestions });
}
