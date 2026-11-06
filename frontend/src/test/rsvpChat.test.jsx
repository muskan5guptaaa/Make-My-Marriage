import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { AuthProvider } from '../auth/AuthContext.jsx';
import GuestPortal from '../pages/portal/GuestPortal.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { me: vi.fn(), getPortal: vi.fn(), answerPortalRsvp: vi.fn(), portalChat: vi.fn(), answerPortalRsvps: vi.fn() } };
});

const fn = (id, name, rsvp = { status: 'pending', plusOnes: 0, mealPreference: null, note: null }) => ({
  _id: id, name, localDate: '2026-12-11', startTime: '19:00', venue: null, address: null, dressCode: null, description: null, livestreamUrl: null, rsvp,
});
const portal = (chat = true, functions = [fn('f1', 'Sangeet'), fn('f2', 'Haldi')]) => ({
  wedding: { brideName: 'Aisha', groomName: 'Rohan', timezone: 'Asia/Kolkata', dateRange: null },
  guest: { name: 'Priya Mehta', plusOnesAllowed: 2 },
  chat,
  photos: { access: 'none', email: null, hasAccount: false, signedIn: false, signedInAs: null },
  functions,
});

function renderPortal() {
  api.me.mockRejectedValue(new ApiError(401, { code: 'unauthorized' }));
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

describe('RSVP chat', () => {
  beforeEach(() => vi.resetAllMocks());

  it('asks back, remembers the conversation, then saves the answers the guest confirms', async () => {
    api.getPortal.mockResolvedValue(portal());
    api.portalChat
      .mockResolvedValueOnce({ reply: 'Wonderful! How many of you for the Sangeet?', answers: [], notes: [] })
      .mockResolvedValueOnce({
        reply: "3 for the Sangeet with a Jain meal, and you can't make the Haldi. Press Save if that's right.",
        answers: [
          { function: { _id: 'f1', name: 'Sangeet' }, status: 'yes', plusOnes: 2, mealPreference: 'Jain', note: null },
          { function: { _id: 'f2', name: 'Haldi' }, status: 'no', plusOnes: 0, mealPreference: null, note: 'Flight lands late' },
        ],
        notes: [],
      });
    api.answerPortalRsvps.mockResolvedValue(portal(true, [
      fn('f1', 'Sangeet', { status: 'yes', plusOnes: 2, mealPreference: 'Jain', note: null }),
      fn('f2', 'Haldi', { status: 'no', plusOnes: 0, mealPreference: null, note: 'Flight lands late' }),
    ]));
    renderPortal();
    const u = userEvent.setup();
    const chat = await screen.findByRole('region', { name: 'Reply in your own words' });

    await u.type(within(chat).getByLabelText('Your reply'), 'Yes for the sangeet');
    await u.click(within(chat).getByRole('button', { name: 'Send' }));
    expect(await within(chat).findByText('Wonderful! How many of you for the Sangeet?')).toBeInTheDocument();
    expect(within(chat).queryByRole('button', { name: 'Save these answers' })).not.toBeInTheDocument();

    await u.type(within(chat).getByLabelText('Your reply'), "3 of us, one Jain. Can't make the haldi");
    await u.click(within(chat).getByRole('button', { name: 'Send' }));
    expect(api.portalChat).toHaveBeenLastCalledWith('tok123', [
      { role: 'guest', text: 'Yes for the sangeet' },
      { role: 'assistant', text: 'Wonderful! How many of you for the Sangeet?' },
      { role: 'guest', text: "3 of us, one Jain. Can't make the haldi" },
    ]);
    const understood = await within(chat).findByLabelText('Your answers');
    expect(understood).toHaveTextContent('Sangeet: Coming · 3 people · Jain');
    expect(understood).toHaveTextContent('Haldi: Can’t come · “Flight lands late”');

    await u.click(within(chat).getByRole('button', { name: 'Save these answers' }));
    expect(api.answerPortalRsvps).toHaveBeenCalledWith('tok123', [
      { function: 'f1', status: 'yes', plusOnes: 2, mealPreference: 'Jain', note: null },
      { function: 'f2', status: 'no', plusOnes: 0, mealPreference: null, note: 'Flight lands late' },
    ]);
    expect(await within(chat).findByText(/Saved\. Thank you!/)).toBeInTheDocument();
    expect(screen.getByText(/You’re going · 3 guests · jain/)).toBeInTheDocument(); // the cards below update
  });

  it('keeps the message when the chat fails, so the guest can try again', async () => {
    api.getPortal.mockResolvedValue(portal());
    api.portalChat.mockRejectedValue(new ApiError(429, { code: 'rate_limited', message: "That's a lot of messages. Wait a few minutes, or answer each function below." }));
    renderPortal();
    const u = userEvent.setup();
    const chat = await screen.findByRole('region', { name: 'Reply in your own words' });
    await u.type(within(chat).getByLabelText('Your reply'), 'We are coming');
    await u.click(within(chat).getByRole('button', { name: 'Send' }));
    expect(await within(chat).findByRole('alert')).toHaveTextContent('answer each function below');
    expect(within(chat).getByLabelText('Your reply')).toHaveValue('We are coming');
  });

  it('is hidden when the AI is not set up', async () => {
    api.getPortal.mockResolvedValue(portal(false));
    renderPortal();
    await screen.findByRole('heading', { name: 'Sangeet' });
    expect(screen.queryByRole('region', { name: 'Reply in your own words' })).not.toBeInTheDocument();
  });
});
