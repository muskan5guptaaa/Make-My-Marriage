import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { AuthProvider } from '../auth/AuthContext.jsx';
import GuestPortal from '../pages/portal/GuestPortal.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { me: vi.fn(), getPortal: vi.fn(), answerPortalRsvp: vi.fn(), portalChat: vi.fn(), answerPortalRsvps: vi.fn() } };
});

// The browser's speech recogniser, faked: the test says what was "heard".
class FakeRecognition {
  static last = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  hear(words, isFinal) {
    this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: words }], { isFinal })] });
  }
}

const fn = { _id: 'f1', name: 'Sangeet', localDate: '2026-12-11', startTime: '19:00', venue: null, address: null, dressCode: null, description: null, livestreamUrl: null, rsvp: { status: 'pending', plusOnes: 0, mealPreference: null, note: null } };
const portal = () => ({
  wedding: { brideName: 'Aisha', groomName: 'Rohan', timezone: 'Asia/Kolkata', dateRange: null },
  guest: { name: 'Priya Mehta', plusOnesAllowed: 2 },
  chat: true,
  photos: { access: 'none', email: null, hasAccount: false, signedIn: false, signedInAs: null },
  functions: [fn],
});

function renderPortal() {
  api.me.mockRejectedValue(new ApiError(401, { code: 'unauthorized' }));
  api.getPortal.mockResolvedValue(portal());
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

describe('Speaking in the RSVP chat', () => {
  let synth;
  beforeEach(() => {
    vi.resetAllMocks();
    window.SpeechRecognition = FakeRecognition;
    synth = { getVoices: vi.fn(() => [{ lang: 'en-IN' }, { lang: 'hi-IN' }]), cancel: vi.fn(), speak: vi.fn() };
    window.speechSynthesis = synth;
    window.SpeechSynthesisUtterance = function Utterance(text) {
      this.text = text;
    };
  });
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
  });

  it('turns Hindi speech into text to check, sends it, reads the reply aloud, and thanks in Hindi', async () => {
    api.portalChat.mockResolvedValue({
      reply: 'बहुत बढ़िया! संगीत के लिए 3 लोग। कृपया जाँचकर Save दबाएँ।',
      answers: [{ function: { _id: 'f1', name: 'Sangeet' }, status: 'yes', plusOnes: 2, mealPreference: null, note: null }],
      notes: [],
      language: 'hi',
    });
    api.answerPortalRsvps.mockResolvedValue(portal());
    renderPortal();
    const u = userEvent.setup();
    const chat = await screen.findByRole('region', { name: 'Reply in your own words' });

    await u.selectOptions(within(chat).getByLabelText('Language you speak'), 'hi-IN');
    await u.click(within(chat).getByRole('button', { name: 'Speak your reply' }));
    const rec = FakeRecognition.last;
    expect(rec.lang).toBe('hi-IN');
    act(() => rec.hear('हम संगीत में', false));
    expect(within(chat).getByRole('status')).toHaveTextContent('Listening: “हम संगीत में”');
    act(() => rec.hear('हम संगीत में 3 लोग आएँगे', true));
    act(() => rec.onend());
    expect(within(chat).getByLabelText('Your reply')).toHaveValue('हम संगीत में 3 लोग आएँगे'); // to check before sending

    await u.click(within(chat).getByRole('button', { name: 'Send' }));
    expect(api.portalChat).toHaveBeenCalledWith('tok123', [{ role: 'guest', text: 'हम संगीत में 3 लोग आएँगे' }]);
    await u.click(await within(chat).findByRole('button', { name: 'Listen to this reply' }));
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.speak.mock.calls[0][0]).toMatchObject({ lang: 'hi-IN', voice: { lang: 'hi-IN' } });

    await u.click(within(chat).getByRole('button', { name: 'Save these answers' }));
    expect(await within(chat).findByText(/सहेज लिया गया। धन्यवाद!/)).toBeInTheDocument();
  });

  it('says how to allow the microphone, and never reads Tamil with an English voice', async () => {
    api.portalChat.mockResolvedValue({ reply: 'எத்தனை பேர் வருகிறீர்கள்?', answers: [], notes: [], language: 'ta' });
    renderPortal();
    const u = userEvent.setup();
    const chat = await screen.findByRole('region', { name: 'Reply in your own words' });

    await u.click(within(chat).getByRole('button', { name: 'Speak your reply' }));
    act(() => FakeRecognition.last.onerror({ error: 'not-allowed' }));
    act(() => FakeRecognition.last.onend());
    expect(within(chat).getByRole('alert')).toHaveTextContent('Allow the microphone for this page');

    await u.type(within(chat).getByLabelText('Your reply'), 'நாங்கள் வருவோம்');
    await u.click(within(chat).getByRole('button', { name: 'Send' }));
    await u.click(await within(chat).findByRole('button', { name: 'Listen to this reply' }));
    expect(synth.speak).not.toHaveBeenCalled(); // this device has no Tamil voice
    expect(within(chat).getByRole('alert')).toHaveTextContent('no voice for that language');
  });

  it('offers only typing where the browser cannot listen', async () => {
    delete window.SpeechRecognition;
    renderPortal();
    const chat = await screen.findByRole('region', { name: 'Reply in your own words' });
    expect(within(chat).queryByRole('button', { name: 'Speak your reply' })).not.toBeInTheDocument();
    expect(within(chat).getByLabelText('Your reply')).toBeInTheDocument();
  });
});
