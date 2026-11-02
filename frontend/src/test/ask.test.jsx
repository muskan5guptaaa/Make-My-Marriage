import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { WeddingContext } from '../layout/WeddingContext.js';
import Ask from '../pages/ask/Ask.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { askWedding: vi.fn(), applyPlan: vi.fn(), listAgentRuns: vi.fn(), undoAgentRun: vi.fn() } };
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
  beforeEach(() => {
    vi.resetAllMocks();
    api.listAgentRuns.mockResolvedValue({ data: [] });
  });

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

  it('applies the kept steps as one plan, sends the edited message, and can undo', async () => {
    api.askWedding.mockImplementation(async (_id, _q, { onText }) => {
      onText('Here are 3 changes for you to approve.');
      return {
        sources: [],
        proposals: [
          { kind: 'updateFunction', ids: { function: 'f2' }, body: { localDate: '2026-12-13' }, title: 'Change Haldi', changes: ['Date 12 Dec 2026 → 13 Dec 2026'] },
          { kind: 'createTask', ids: {}, body: { title: 'Order haldi paste' }, title: 'New task: Order haldi paste', changes: ['For the whole wedding'] },
          {
            kind: 'messageGuests', ids: { function: 'f2' }, body: { audience: 'everyone', message: 'The Haldi moves to Sunday.' },
            title: 'Message guests: Haldi', changes: ['2 guests invited to the Haldi'], cannotUndo: true,
          },
        ],
        skipped: ['"Ravi" isn\'t one person on the planning team.'],
      };
    });
    api.applyPlan.mockResolvedValue({
      run: {
        _id: 'r1', canUndo: true,
        steps: [
          { kind: 'updateFunction', title: 'Change Haldi', changes: ['Date 12 Dec 2026 → 13 Dec 2026'], result: null, undo: null },
          { kind: 'messageGuests', title: 'Message guests: Haldi', changes: [], result: { emailed: 1, notEmailed: 1 }, undo: null },
        ],
      },
      whatsapp: [{ name: 'Kabir Singh', url: 'https://wa.me/919876543210?text=Hi' }],
    });
    api.undoAgentRun.mockResolvedValue({
      run: {
        _id: 'r1', canUndo: false,
        steps: [
          { kind: 'updateFunction', title: 'Change Haldi', changes: [], undo: 'undone' },
          { kind: 'messageGuests', title: 'Message guests: Haldi', changes: [], result: { emailed: 1, notEmailed: 1 }, undo: 'not-possible' },
        ],
      },
      notes: ['Undid 1 change.', 'Messages that were sent can’t be taken back.'],
    });
    renderAsk();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Your question'), 'Move the Haldi and tell everyone{Enter}');

    const plan = await screen.findByRole('region', { name: 'Suggested changes' });
    expect(plan).toHaveTextContent('Left out:"Ravi" isn\'t one person on the planning team.');
    expect(plan).toHaveTextContent('1. Change Haldi');
    await u.click(within(plan).getByRole('checkbox', { name: 'Apply New task: Order haldi paste' }));
    const message = within(plan).getByLabelText('Message for Message guests: Haldi');
    await u.clear(message);
    expect(within(plan).getByRole('button', { name: 'Apply 2 changes' })).toBeDisabled(); // no empty messages
    await u.type(message, 'The Haldi is now on Sunday at 10.');
    await u.click(within(plan).getByRole('button', { name: 'Apply 2 changes' }));

    expect(api.applyPlan).toHaveBeenCalledWith('w1', {
      question: 'Move the Haldi and tell everyone',
      steps: [
        { kind: 'updateFunction', ids: { function: 'f2' }, body: { localDate: '2026-12-13' }, title: 'Change Haldi', changes: ['Date 12 Dec 2026 → 13 Dec 2026'] },
        {
          kind: 'messageGuests', ids: { function: 'f2' }, body: { audience: 'everyone', message: 'The Haldi is now on Sunday at 10.' },
          title: 'Message guests: Haldi', changes: ['2 guests invited to the Haldi'],
        },
      ],
    });
    expect(await within(plan).findByText('Changes made')).toBeInTheDocument();
    expect(plan).toHaveTextContent('Emailed 1 · 1 to send on WhatsApp');
    expect(within(plan).getByRole('link', { name: 'Kabir Singh' })).toHaveAttribute('href', 'https://wa.me/919876543210?text=Hi');

    await u.click(within(plan).getByRole('button', { name: 'Undo' }));
    expect(api.undoAgentRun).toHaveBeenCalledWith('w1', 'r1');
    expect(await within(plan).findByText(/Undid 1 change\./)).toBeInTheDocument();
    expect(plan).toHaveTextContent('Sent: can’t be taken back');
    expect(within(plan).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('shows why a plan failed, and saves nothing', async () => {
    api.askWedding.mockResolvedValue({
      sources: [],
      proposals: [{ kind: 'setRsvp', ids: { guest: 'g1', function: 'f1' }, body: { status: 'yes' }, title: 'RSVP: Kabir Singh', changes: ['Sangeet → Coming'] }],
      skipped: [],
    });
    api.applyPlan.mockRejectedValue(
      new ApiError(404, { code: 'not_invited', message: 'Step 1, “RSVP: Kabir Singh”: This guest is not invited to that function. Nothing was changed.' }),
    );
    renderAsk();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Your question'), 'Kabir is coming{Enter}');
    await u.click(await screen.findByRole('button', { name: 'Apply 1 change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was changed');
    expect(screen.getByRole('button', { name: 'Apply 1 change' })).toBeEnabled(); // can try again
  });

  it('lists recent changes by the assistant, with undo', async () => {
    const run = { _id: 'r1', question: 'Move the Haldi', createdAt: '2026-11-02T10:00:00Z', createdBy: { name: 'Aisha' }, undoneAt: null };
    api.listAgentRuns.mockResolvedValue({ data: [{ ...run, canUndo: true, steps: [{ kind: 'updateFunction', title: 'Change Haldi', changes: [], undo: null }] }] });
    api.undoAgentRun.mockResolvedValue({
      run: { ...run, canUndo: false, undoneAt: '2026-11-02T10:05:00Z', steps: [{ kind: 'updateFunction', title: 'Change Haldi', changes: [], undo: 'undone' }] },
      notes: ['Undid 1 change.'],
    });
    renderAsk();
    const recent = await screen.findByRole('region', { name: 'Recent changes by the assistant' });
    expect(recent).toHaveTextContent('Move the Haldi');
    await userEvent.setup().click(within(recent).getByRole('button', { name: 'Undo' }));
    expect(await within(recent).findByRole('status')).toHaveTextContent('Undid 1 change.');
    expect(recent).toHaveTextContent('Change Haldi (undone)');
    expect(within(recent).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
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
