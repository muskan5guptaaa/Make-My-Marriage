import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api.js';
import { WeddingContext } from '../layout/WeddingContext.js';
import DayPlan from '../pages/DayPlan.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { listDayPlans: vi.fn(), getDayPlan: vi.fn(), draftDayPlan: vi.fn(), saveDayPlan: vi.fn() } };
});

const haldi = { _id: 'f1', name: 'Haldi', startTime: '09:00', venue: 'Home' };
const shaadi = { _id: 'f2', name: 'Wedding', startTime: '19:00', venue: 'Rambagh Palace' };
const fixed = (f) => ({ time: f.startTime, title: `${f.name} starts`, function: { _id: f._id, name: f.name }, who: null, notes: f.venue, fixed: true });
const day = (items, extra = {}) => ({
  date: '2026-12-12', functions: [haldi, shaadi], items, saved: false, updatedAt: null, people: ['Aisha Sharma', 'Phoolwala Decor'],
  checks: [{ level: 'clash', text: 'Aisha Sharma has 2 things at 08:00.' }, { level: 'warning', text: '1 task for the Haldi still open: Order haldi flowers.' }],
  ...extra,
});

function renderPage(status = 'active') {
  return render(
    <MemoryRouter>
      <WeddingContext.Provider value={{ wedding: { _id: 'w1', status } }}>
        <DayPlan />
      </WeddingContext.Provider>
    </MemoryRouter>,
  );
}

describe('Day plan', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.listDayPlans.mockResolvedValue({
      data: [
        { date: '2026-11-01', functions: ['Roka'], saved: false },
        { date: '2026-12-12', functions: ['Haldi', 'Wedding'], saved: false },
      ],
      meta: { today: '2026-11-03' },
    });
  });

  it('opens the next day with functions, with its checks and run sheet', async () => {
    api.getDayPlan.mockResolvedValue(day([fixed(haldi), fixed(shaadi)]));
    renderPage();

    expect(await screen.findByRole('region', { name: 'Run sheet' })).toHaveTextContent('09:00Haldi starts');
    expect(api.getDayPlan).toHaveBeenCalledWith('w1', '2026-12-12');
    expect(screen.getByRole('button', { name: 'Sat 12 Dec · Haldi, Wedding' })).toHaveAttribute('aria-pressed', 'true');
    const checks = screen.getByRole('region', { name: 'Checks' });
    expect(checks).toHaveTextContent('Clash Aisha Sharma has 2 things at 08:00.');
    expect(checks).toHaveTextContent('Check 1 task for the Haldi still open');
  });

  it('drafts with the AI, lets the couple edit, and saves only their steps', async () => {
    api.getDayPlan.mockResolvedValue(day([fixed(haldi), fixed(shaadi)]));
    api.draftDayPlan.mockResolvedValue(day([
      { time: '07:00', title: 'Decorators arrive', function: { _id: 'f2', name: 'Wedding' }, who: 'Phoolwala Decor', notes: null, fixed: false },
      { time: '08:00', title: 'Haldi setup', function: { _id: 'f1', name: 'Haldi' }, who: 'Aisha Sharma', notes: null, fixed: false },
      fixed(haldi),
      fixed(shaadi),
    ]));
    api.saveDayPlan.mockImplementation(async (_w, _d, items) => day([...items.map((it) => ({ ...it, fixed: false })), fixed(haldi), fixed(shaadi)], { saved: true, updatedAt: '2026-11-03T10:00:00Z' }));
    renderPage();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Draft with AI' }));

    const form = await screen.findByRole('form', { name: 'Edit run sheet' });
    expect(form).toHaveTextContent('Haldi starts · Home (change it on Functions)');
    await u.click(within(form).getByRole('button', { name: 'Remove Haldi setup' }));
    const who = within(form).getByLabelText('Who for Decorators arrive');
    await u.clear(who);
    await u.type(who, 'Aisha Sharma');
    await u.click(within(form).getByRole('button', { name: '+ Add a step' }));
    const times = within(form).getAllByLabelText('Time for new step');
    await u.type(times[0], '18:00');
    await u.type(within(form).getAllByLabelText('What happens').at(-1), 'Baraat leaves');
    await u.click(within(form).getByRole('button', { name: 'Save run sheet' }));

    expect(api.saveDayPlan).toHaveBeenCalledWith('w1', '2026-12-12', [
      { time: '07:00', title: 'Decorators arrive', function: 'f2', who: 'Aisha Sharma', notes: null },
      { time: '18:00', title: 'Baraat leaves', function: null, who: '', notes: '' },
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('Run sheet saved.');
    expect(screen.getByRole('region', { name: 'Run sheet' })).toHaveTextContent('Baraat leaves');
  });

  it('is read-only on an archived wedding', async () => {
    api.getDayPlan.mockResolvedValue(day([fixed(haldi)]));
    renderPage('archived');
    await screen.findByRole('region', { name: 'Run sheet' });
    expect(screen.queryByRole('button', { name: 'Draft with AI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
  });

  it('asks for a function first when there are none', async () => {
    api.listDayPlans.mockResolvedValue({ data: [], meta: { today: '2026-11-03' } });
    renderPage();
    expect(await screen.findByRole('link', { name: 'Go to Functions' })).toHaveAttribute('href', '/w/w1/functions');
  });
});
