import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { WeddingContext } from '../layout/WeddingContext.js';
import SmartImportDialog from '../pages/guests/SmartImportDialog.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return { ...actual, api: { extractGuests: vi.fn(), importGuests: vi.fn() } };
});

const wedding = { _id: 'w1', brideName: 'Aisha', groomName: 'Rohan', status: 'active' };
const row = (extra) => ({ phone: null, phoneOk: true, side: null, groupTag: null, functions: [], plusOnesAllowed: null, existing: false, ...extra });

function renderImport(onImported = vi.fn()) {
  render(
    <WeddingContext.Provider value={{ wedding }}>
      <SmartImportDialog onClose={vi.fn()} onImported={onImported} />
    </WeddingContext.Provider>,
  );
  return onImported;
}

describe('Import guests with AI', () => {
  it('reads a pasted list, lets the couple fix it, then imports the kept rows as CSV', async () => {
    api.extractGuests.mockResolvedValue({
      data: [
        row({ name: 'Priya Mehta', phone: '+919876543210', side: 'bride', functions: ['Sangeet'], plusOnesAllowed: 2 }),
        row({ name: 'Kabir "KS" Singh', phone: '12345', phoneOk: false }),
        row({ name: 'Ravi Uncle', existing: true }),
      ],
      meta: { functions: ['Sangeet', 'Haldi'] },
    });
    api.importGuests.mockResolvedValue({ created: 2, skipped: 0 });
    const onImported = renderImport();
    const u = userEvent.setup();

    await u.type(screen.getByLabelText('Guest list'), 'Priya 98765 43210');
    await u.click(screen.getByRole('button', { name: 'Read the list' }));
    expect(api.extractGuests).toHaveBeenCalledWith('w1', { text: 'Priya 98765 43210' });

    expect(await screen.findByText('Check this phone number, or clear it.')).toBeInTheDocument();
    expect(screen.getByText('Already on your guest list')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Add Ravi Uncle' })).not.toBeChecked();

    await u.clear(screen.getByLabelText('Phone for Kabir "KS" Singh'));
    await u.click(screen.getByRole('button', { name: 'Haldi for Priya Mehta' }));
    await u.selectOptions(screen.getByLabelText('Side for Kabir "KS" Singh'), 'groom');
    await u.click(screen.getByRole('button', { name: 'Add 2 guests' }));

    expect(api.importGuests).toHaveBeenCalledWith(
      'w1',
      'Name,Phone,Side,Group,Functions,Plus ones\n' +
        '"Priya Mehta","+919876543210","bride","","Sangeet; Haldi","2"\n' +
        '"Kabir ""KS"" Singh","","groom","","",""',
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Added 2 guests.');
    expect(onImported).toHaveBeenCalled();
  });

  it('shows each import problem on its own row', async () => {
    api.extractGuests.mockResolvedValue({
      data: [row({ name: 'Ravi Uncle', existing: true }), row({ name: 'Priya' }), row({ name: 'Meera', phone: '99' })],
      meta: { functions: [] },
    });
    api.importGuests.mockRejectedValue(
      new ApiError(400, { code: 'import_failed', message: 'Nothing was imported. Fix 1 row and try again.', fields: { rows: [{ row: 3, name: 'Meera', message: 'phone: Enter a 10-digit Indian mobile number' }] } }),
    );
    renderImport();
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Guest list'), 'list');
    await u.click(screen.getByRole('button', { name: 'Read the list' }));
    await u.click(await screen.findByRole('button', { name: 'Add 2 guests' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual(['phone: Enter a 10-digit Indian mobile number', 'Nothing was imported. Fix 1 row and try again.']);
  });
});
