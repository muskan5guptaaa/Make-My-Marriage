import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api.js';
import { WeddingContext } from '../layout/WeddingContext.js';
import InvitationDialog from '../pages/guests/InvitationDialog.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { draftInvitation: vi.fn(), updateWedding: vi.fn() } };
});

const wedding = { _id: 'w1', brideName: 'Aisha', groomName: 'Rohan', status: 'active', invitation: { email: null, whatsapp: null } };

describe('Invitation words', () => {
  it('drafts in the chosen tone, lets the couple edit, then saves on the wedding', async () => {
    api.draftInvitation.mockResolvedValue({ draft: { email: 'We are getting married!', whatsapp: 'Join us! 💛' } });
    const saved = { ...wedding, invitation: { email: 'We are getting married! Please come.', whatsapp: 'Join us! 💛' } };
    api.updateWedding.mockResolvedValue({ wedding: saved });
    const setWedding = vi.fn();
    render(
      <WeddingContext.Provider value={{ wedding, setWedding }}>
        <InvitationDialog onClose={vi.fn()} />
      </WeddingContext.Provider>,
    );
    const u = userEvent.setup();

    await u.click(screen.getByRole('button', { name: 'Formal' }));
    await u.type(screen.getByLabelText('Anything to mention (optional)'), 'Small family wedding');
    await u.click(screen.getByRole('button', { name: 'Write with AI' }));
    expect(api.draftInvitation).toHaveBeenCalledWith('w1', { tone: 'formal', notes: 'Small family wedding' });

    const email = screen.getByLabelText('Email message');
    expect(email).toHaveValue('We are getting married!');
    expect(screen.getByLabelText('WhatsApp message')).toHaveValue('Join us! 💛');
    await u.type(email, ' Please come.');
    await u.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.updateWedding).toHaveBeenCalledWith('w1', { invitation: { email: 'We are getting married! Please come.', whatsapp: 'Join us! 💛' } });
    expect(setWedding).toHaveBeenCalledWith(saved);
    expect(await screen.findByRole('status')).toHaveTextContent('New invitations will use these words.');
  });
});
