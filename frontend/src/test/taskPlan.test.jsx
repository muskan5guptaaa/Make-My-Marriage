import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { WeddingContext } from '../layout/WeddingContext.js';
import { addDays, todayIn } from '../lib/format.js';
import PlanDialog from '../pages/tasks/PlanDialog.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { planTasks: vi.fn(), saveTasks: vi.fn() } };
});

const wedding = { _id: 'w1', brideName: 'Aisha', groomName: 'Rohan', status: 'active', timezone: 'Asia/Kolkata' };
const today = todayIn(wedding.timezone);
const functions = [
  { _id: 'f0', name: 'Roka', localDate: addDays(today, -20) },
  { _id: 'f1', name: 'Sangeet', localDate: addDays(today, 40) },
  { _id: 'f2', name: 'Haldi', localDate: addDays(today, 41) },
];

function renderPlan(onSaved = vi.fn()) {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal ??= function showModal() { this.open = true; };
  render(
    <WeddingContext.Provider value={{ wedding }}>
      <PlanDialog functions={functions} onClose={vi.fn()} onSaved={onSaved} />
    </WeddingContext.Provider>,
  );
  return onSaved;
}

describe('Plan tasks with AI', () => {
  it('drafts for the chosen upcoming functions, then saves only the kept, edited tasks', async () => {
    api.planTasks.mockResolvedValue({
      data: [
        { title: 'Book a choreographer', description: 'Ask about group rates', function: { _id: 'f1', name: 'Sangeet' }, dueDate: addDays(today, 0), late: false, source: 'Sangeet' },
        { title: 'Buy haldi paste', description: null, function: { _id: 'f2', name: 'Haldi' }, dueDate: addDays(today, 38), late: false, source: 'Haldi' },
      ],
    });
    api.saveTasks.mockResolvedValue({ created: 1 });
    const onSaved = renderPlan();
    const u = userEvent.setup();

    expect(screen.queryByRole('checkbox', { name: /^Roka/ })).not.toBeInTheDocument(); // already happened
    await u.click(screen.getByRole('checkbox', { name: /^Haldi/ }));
    await u.click(screen.getByRole('button', { name: 'Draft tasks' }));
    expect(api.planTasks).toHaveBeenCalledWith('w1', { functions: ['f1'], wholeWedding: true });

    expect(await screen.findByText('2 suggested tasks', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Sangeet · from the Sangeet checklist')).toBeInTheDocument();
    await u.click(screen.getByLabelText('Keep Buy haldi paste'));
    const title = screen.getByDisplayValue('Book a choreographer');
    await u.clear(title);
    await u.type(title, 'Book a Bollywood choreographer');
    await u.click(screen.getByRole('button', { name: 'Save 1 task' }));

    expect(api.saveTasks).toHaveBeenCalledWith('w1', [
      { title: 'Book a Bollywood choreographer', description: 'Ask about group rates', function: 'f1', dueDate: today },
    ]);
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows why drafting failed', async () => {
    api.planTasks.mockRejectedValue(new ApiError(429, { code: 'ai_daily_limit', message: "The assistant has used today's free allowance." }));
    renderPlan();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Draft tasks' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('free allowance');
    expect(api.saveTasks).not.toHaveBeenCalled();
  });
});
