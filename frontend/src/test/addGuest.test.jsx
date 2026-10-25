import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { WeddingContext } from '../layout/WeddingContext.js';
import GuestDialog from '../pages/guests/GuestDialog.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { createGuest: vi.fn(), getGuest: vi.fn() } };
});

const wedding = { _id: 'w1', brideName: 'Aisha', groomName: 'Rohan', status: 'active', role: 'owner' };
const functions = [
  { _id: 'f1', name: 'Sangeet', localDate: '2026-10-24' },
  { _id: 'f2', name: 'Reception', localDate: '2026-10-27' },
];

function renderAddGuest() {
  const props = { onClose: vi.fn(), onChanged: vi.fn(), onCreated: vi.fn() };
  render(
    <WeddingContext.Provider value={{ wedding }}>
      <GuestDialog guestId={null} functions={functions} canEdit {...props} />
    </WeddingContext.Provider>,
  );
  return props;
}

describe('Add a guest', () => {
  it('sends the details and the chosen functions, then opens the new guest', async () => {
    api.createGuest.mockResolvedValue({ guest: { _id: 'g1' } });
    const props = renderAddGuest();
    const u = userEvent.setup();

    await u.type(screen.getByLabelText('Name'), 'Priya Mehta');
    await u.type(screen.getByLabelText('Phone (optional)'), '87074 63461');
    await u.type(screen.getByLabelText('Email (optional)'), 'priya@email.com');
    await u.click(screen.getByRole('checkbox', { name: /Sangeet/ }));
    await u.clear(screen.getByLabelText('Plus-ones allowed'));
    await u.type(screen.getByLabelText('Plus-ones allowed'), '2');
    await u.click(screen.getByRole('button', { name: 'Add guest' }));

    expect(api.createGuest).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        name: 'Priya Mehta',
        phone: '87074 63461',
        email: 'priya@email.com',
        invitedFunctions: ['f1'],
        plusOnesAllowed: '2',
        photoAccess: 'none',
      }),
    );
    expect(props.onChanged).toHaveBeenCalled();
    expect(props.onCreated).toHaveBeenCalledWith('g1');
  });

  it('shows the server’s field messages and does not open a guest', async () => {
    api.createGuest.mockRejectedValue(
      new ApiError(400, {
        code: 'invalid_input',
        message: 'Some fields need fixing.',
        fields: { name: "Enter the guest's name.", phone: 'Enter a 10-digit Indian mobile number, or include the country code, like +44 7700 900123.' },
      }),
    );
    const props = renderAddGuest();
    const u = userEvent.setup();

    await u.type(screen.getByLabelText('Phone (optional)'), '12345');
    await u.click(screen.getByRole('button', { name: 'Add guest' }));

    expect(await screen.findByText("Enter the guest's name.")).toBeInTheDocument();
    expect(screen.getByText(/10-digit Indian mobile/)).toBeInTheDocument();
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it('explains that photos need an email when photo access is given', async () => {
    renderAddGuest();
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText('Wedding photos'), 'view');
    expect(screen.getByText(/Add their email above/)).toBeInTheDocument();
    await u.type(screen.getByLabelText('Email (optional)'), 'priya@email.com');
    expect(screen.getByText(/They sign in with priya@email.com to see photos/)).toBeInTheDocument();
  });
});
