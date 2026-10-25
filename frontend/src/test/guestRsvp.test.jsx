import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { AuthProvider } from '../auth/AuthContext.jsx';
import GuestPortal from '../pages/portal/GuestPortal.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { me: vi.fn(), getPortal: vi.fn(), answerPortalRsvp: vi.fn() } };
});

const portal = (rsvp = { status: 'pending', plusOnes: 0, mealPreference: null, note: null }) => ({
  wedding: { brideName: 'Aisha', groomName: 'Rohan', timezone: 'Asia/Kolkata', dateRange: { start: '2026-10-24', end: '2026-10-27' } },
  guest: { name: 'Priya Mehta', plusOnesAllowed: 2 },
  photos: { access: 'none', email: null, hasAccount: false, signedIn: false, signedInAs: null },
  functions: [
    {
      _id: 'f1',
      name: 'Sangeet',
      localDate: '2026-10-24',
      startTime: '19:00',
      venue: 'The Grand Lawns',
      address: 'Jaipur',
      dressCode: 'Gold & emerald',
      description: null,
      livestreamUrl: null,
      rsvp,
    },
  ],
});

function renderPortal() {
  api.me.mockRejectedValue(new ApiError(401, { code: 'unauthorized' })); // guests have no account
  return render(
    <MemoryRouter initialEntries={['/i/tok123']}>
      <AuthProvider>
        <Routes>
          <Route path="/i/:token" element={<GuestPortal />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Guest RSVP', () => {
  it('shows the invitation without signing in', async () => {
    api.getPortal.mockResolvedValue(portal());
    renderPortal();

    expect(await screen.findByRole('heading', { name: 'Aisha & Rohan' })).toBeInTheDocument();
    expect(screen.getByText(/Dear Priya/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sangeet' })).toBeInTheDocument();
    expect(screen.getByText(/The Grand Lawns, Jaipur/)).toBeInTheDocument();
    expect(screen.getByText(/Gold & emerald/)).toBeInTheDocument();
    expect(api.getPortal).toHaveBeenCalledWith('tok123');
    // No photo access was given, so there is no photos section at all.
    expect(screen.queryByText(/Wedding photos/)).not.toBeInTheDocument();
  });

  it('answers yes with how many are coming and a meal, then shows the answer', async () => {
    api.getPortal.mockResolvedValue(portal());
    api.answerPortalRsvp.mockResolvedValue(portal({ status: 'yes', plusOnes: 1, mealPreference: 'Veg', note: null }));
    renderPortal();
    const u = userEvent.setup();

    await u.click(await screen.findByRole('button', { name: /Yes, I.ll be there/ }));
    const people = screen.getByRole('group', { name: 'How many of you are coming?' });
    await u.click(within(people).getByRole('button', { name: '2' }));
    await u.click(screen.getByRole('button', { name: 'Veg' }));
    await u.click(screen.getByRole('button', { name: 'Send my RSVP' }));

    expect(api.answerPortalRsvp).toHaveBeenCalledWith('tok123', 'f1', { status: 'yes', plusOnes: 1, mealPreference: 'Veg', note: '' });
    expect(await screen.findByText(/going · 2 guests · veg/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change answer' })).toBeInTheDocument();
  });

  it('only offers as many people as the guest is allowed', async () => {
    api.getPortal.mockResolvedValue(portal());
    renderPortal();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /Yes, I.ll be there/ }));
    const people = screen.getByRole('group', { name: 'How many of you are coming?' });
    expect(within(people).getAllByRole('button').map((b) => b.textContent)).toEqual(['1', '2', '3']);
  });

  it('answers no in one tap', async () => {
    api.getPortal.mockResolvedValue(portal());
    api.answerPortalRsvp.mockResolvedValue(portal({ status: 'no', plusOnes: 0, mealPreference: null, note: null }));
    renderPortal();
    const u = userEvent.setup();

    await u.click(await screen.findByRole('button', { name: /Can.t make it/ }));

    expect(api.answerPortalRsvp).toHaveBeenCalledWith('tok123', 'f1', { status: 'no', note: '' });
    expect(await screen.findByText(/You can.t make it/)).toBeInTheDocument();
  });

  it('shows a clear message when the link no longer works', async () => {
    api.getPortal.mockRejectedValue(
      new ApiError(404, { code: 'link_not_working', message: 'This invitation link is not working. Ask the couple for a new one.' }),
    );
    renderPortal();
    expect(await screen.findByRole('heading', { name: /This link isn.t working/ })).toBeInTheDocument();
    expect(screen.getByText(/Ask the couple for a new one/)).toBeInTheDocument();
  });
});
