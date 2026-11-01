import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api.js';
import BudgetInsights from '../pages/expenses/BudgetInsights.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { expenseInsights: vi.fn(), suggestSavings: vi.fn() } };
});

const line = (ref, expenseId, vendorName) => ({ ref, expenseId, vendorName, category: 'Catering', function: null });

describe('Budget insights', () => {
  it('shows the exact facts, then AI suggestions that open the expenses they name', async () => {
    api.expenseInsights.mockResolvedValue({
      totals: { budgetPaise: 3_00_000_00, spentPaise: 3_10_000_00, leftPaise: -10_000_00, count: 4 },
      overCategories: [{ categoryId: 'c1', name: 'Catering', budgetPaise: 2_00_000_00, spentPaise: 2_50_000_00, overPaise: 50_000_00 }],
      overExpenses: [{ ...line('E1', 'x1', 'Taj Caterers'), budgetPaise: 2_00_000_00, spentPaise: 2_50_000_00, overPaise: 50_000_00 }],
      duplicates: [{ vendorName: 'Chai Stall', amountPaise: 15_000_00, lines: [line('E2', 'x2', 'Chai Stall'), line('E3', 'x3', 'Chai Stall')] }],
      duePayments: [{ ...line('E4', 'x4', 'Dhol team'), dueDate: '2026-11-03', overdue: true, owedPaise: 10_000_00, paymentStatus: 'pending' }],
    });
    api.suggestSavings.mockResolvedValue({
      suggestions: [{ text: 'Check the Chai Stall payment entered twice.', expenses: [{ ref: 'E2', _id: 'x2', vendorName: 'Chai Stall' }] }],
    });
    const onOpen = vi.fn();
    render(<BudgetInsights weddingId="w1" refreshKey={1} onOpen={onOpen} />);
    const u = userEvent.setup();

    const card = await screen.findByRole('region', { name: 'Needs attention' });
    expect(card).toHaveTextContent('Catering is ₹50,000 over budget (₹2,50,000 spent of ₹2,00,000).');
    expect(card).toHaveTextContent('Taj Caterers cost ₹50,000 more than budgeted.');
    expect(card).toHaveTextContent('Possible duplicate: Chai Stall, ₹15,000, entered 2 times (Chai Stall, Chai Stall).');
    expect(card).toHaveTextContent('Dhol team was due 3 Nov, ₹10,000 still to pay.');
    expect(api.suggestSavings).not.toHaveBeenCalled();

    await u.click(within(card).getByRole('button', { name: 'Taj Caterers' }));
    expect(onOpen).toHaveBeenLastCalledWith('x1');

    await u.click(within(card).getByRole('button', { name: 'Suggest where to save' }));
    const tips = await within(card).findByLabelText('Suggestions');
    expect(tips).toHaveTextContent('Check the Chai Stall payment entered twice.');
    await u.click(within(tips).getByRole('button', { name: 'Chai Stall' }));
    expect(onOpen).toHaveBeenLastCalledWith('x2');
  });

  it('shows nothing when there are no expenses', async () => {
    api.expenseInsights.mockResolvedValue({ totals: { budgetPaise: 0, spentPaise: 0, leftPaise: 0, count: 0 }, overCategories: [], overExpenses: [], duplicates: [], duePayments: [] });
    const { container } = render(<BudgetInsights weddingId="w1" refreshKey={1} onOpen={vi.fn()} />);
    await vi.waitFor(() => expect(api.expenseInsights).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
