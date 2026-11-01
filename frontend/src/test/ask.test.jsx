import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { WeddingContext } from '../layout/WeddingContext.js';
import Ask from '../pages/ask/Ask.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { askWedding: vi.fn(), updateTask: vi.fn(), createTask: vi.fn(), updateExpense: vi.fn(), setRsvp: vi.fn() } };
});

const wedding = { _id: 'w1', brideName: 'Aisha', groomName: 'Rohan', status: 'active' };

function renderAsk() {
  return render(
    <MemoryRouter>
      <WeddingContext.Provider value={{ wedding }}>
        <Ask />
      </WeddingContext.Provider>
    </MemoryRouter>,
  );
}

describe('Ask your wedding', () => {
  it('streams the answer and links each source', async () => {
    api.askWedding.mockImplementation(async (_id, _q, { onText }) => {
      onText('Kabir Singh hasn’t replied [G1]');
      onText(' for the **Sangeet** [F1, G1].');
      return {
        sources: [
          { ref: 'G1', kind: 'guest', id: 'g1', label: 'Kabir Singh' },
          { ref: 'F1', kind: 'function', id: 'f1', label: 'Sangeet · 2026-12-11' },
        ],
        proposals: [],
        skipped: [],
      };
    });
    renderAsk();
    const u = userEvent.setup();

    await u.type(screen.getByLabelText('Your question'), 'Who hasn’t replied?');
    await u.click(screen.getByRole('button', { name: 'Ask' }));

    expect(api.askWedding).toHaveBeenCalledWith('w1', 'Who hasn’t replied?', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByText('Who hasn’t replied?')).toBeInTheDocument();
    const answer = await screen.findByText(/Kabir Singh hasn’t replied/);
    // Citations become numbers that match the Sources list; refs never show as raw text.
    expect(answer).toHaveTextContent('Kabir Singh hasn’t replied 1 for the Sangeet 2, 1.');
    expect(within(answer).getByText('Sangeet').tagName).toBe('STRONG');
    const sources = screen.getByRole('heading', { name: 'Sources' }).nextElementSibling;
    expect(within(sources).getByRole('link', { name: 'Kabir Singh' })).toHaveAttribute('href', '/w/w1/guests');
    expect(within(sources).getByRole('link', { name: 'Sangeet · 2026-12-11' })).toHaveAttribute('href', '/w/w1/functions');
    expect(screen.getByLabelText('Your question')).toHaveValue('');
  });

  it('asks a starter question in one tap', async () => {
    api.askWedding.mockResolvedValue({ sources: [], proposals: [], skipped: [] });
    renderAsk();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Which tasks are overdue?' }));
    expect(api.askWedding).toHaveBeenCalledWith('w1', 'Which tasks are overdue?', expect.anything());
    expect(screen.queryByRole('group', { name: 'Example questions' })).not.toBeInTheDocument();
  });

  it('applies only the suggested changes the person keeps, and shows any that fail', async () => {
    api.askWedding.mockImplementation(async (_id, _q, { onText }) => {
      onText('Here are 3 changes for you to approve.');
      return {
        sources: [],
        proposals: [
          { kind: 'updateTask', ids: { task: 't1' }, body: { status: 'done' }, title: 'Update task: Book mehendi artist', changes: ['Status → Done'] },
          { kind: 'createTask', ids: {}, body: { title: 'Order haldi paste' }, title: 'New task: Order haldi paste', changes: ['For the whole wedding'] },
          { kind: 'setRsvp', ids: { guest: 'g1', function: 'f1' }, body: { status: 'yes' }, title: 'RSVP: Kabir Singh', changes: ['Sangeet → Coming'] },
        ],
        skipped: ['"Ravi" isn\'t one person on the planning team.'],
      };
    });
    api.updateTask.mockResolvedValue({});
    api.setRsvp.mockRejectedValue(new ApiError(404, { code: 'not_invited', message: 'This guest is not invited to that function.' }));
    renderAsk();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Your question'), 'Tidy up{Enter}');

    const changes = await screen.findByRole('region', { name: 'Suggested changes' });
    expect(changes).toHaveTextContent('Left out:"Ravi" isn\'t one person on the planning team.');
    await u.click(within(changes).getByRole('checkbox', { name: 'Apply New task: Order haldi paste' }));
    await u.click(within(changes).getByRole('button', { name: 'Apply 2 changes' }));

    expect(api.updateTask).toHaveBeenCalledWith('w1', 't1', { status: 'done' });
    expect(api.createTask).not.toHaveBeenCalled();
    expect(api.setRsvp).toHaveBeenCalledWith('w1', 'g1', 'f1', { status: 'yes' });
    expect(await within(changes).findByRole('alert')).toHaveTextContent('not invited');
    expect(within(changes).getByRole('link', { name: 'View' })).toHaveAttribute('href', '/w/w1/tasks');
    // The failed one can be tried again; the saved one isn't sent twice.
    expect(within(changes).getByRole('button', { name: 'Apply 1 change' })).toBeEnabled();
  });

  it('shows why an answer failed', async () => {
    api.askWedding.mockRejectedValue(
      new ApiError(429, { code: 'ai_busy', message: 'The assistant has used its free allowance for now. Try again in a minute.' }),
    );
    renderAsk();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Your question'), 'Budget?{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('free allowance');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled(); // empty box again
  });
});
