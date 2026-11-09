import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api.js';
import { WeddingContext } from '../layout/WeddingContext.js';
import Gallery from '../pages/gallery/Gallery.jsx';

vi.mock('../api.js', async () => {
  const actual = await vi.importActual('../api.js');
  return {
    ...actual,
    api: {
      listAlbums: vi.fn(), listPhotos: vi.fn(), photoSearchStatus: vi.fn(),
      listMoments: vi.fn(), pickMoment: vi.fn(), chooseMoment: vi.fn(), hideMomentRest: vi.fn(),
    },
  };
});

const photo = (id, extra = {}) => ({ _id: id, album: 'a1', thumbUrl: `https://img/${id}`, fullUrl: `https://img/${id}-full`, hidden: false, caption: null, ...extra });
const moment = (extra = {}) => ({
  key: 'p1,p2,p3',
  photos: [photo('p1'), photo('p2', { caption: 'The couple laughing on the stage.' }), photo('p3')],
  best: 'p2', by: 'size', reason: null, ...extra,
});

function renderGallery(status = 'active') {
  return render(
    <WeddingContext.Provider value={{ wedding: { _id: 'w1', status } }}>
      <Gallery />
    </WeddingContext.Provider>,
  );
}

async function openMoments(u) {
  await u.click(await screen.findByRole('tab', { name: /Sangeet/ }));
  await u.click(await screen.findByRole('button', { name: 'Group similar shots' }));
  return screen.findByRole('region', { name: 'Moments' });
}

describe('Photo moments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.listAlbums.mockResolvedValue({ data: [{ _id: 'a1', name: 'Sangeet', function: 'f1', photoCount: 4, coverUrl: null, coverPhoto: null }] });
    api.listPhotos.mockResolvedValue({ data: [photo('p1'), photo('p2'), photo('p3'), photo('p4')] });
    api.photoSearchStatus.mockResolvedValue({ total: 0, searchable: 0, failed: 0, waiting: 0 });
  });

  it('groups look-alike shots, lets the AI pick the best, and hides the rest', async () => {
    api.listMoments.mockResolvedValue({ groups: [moment()], total: 4, grouped: 3, waitingForHash: 0 });
    api.pickMoment.mockResolvedValue({ moment: moment({ best: 'p3', by: 'ai', reason: 'Sharpest shot, eyes open.' }) });
    api.hideMomentRest.mockResolvedValue({ moment: moment({ best: 'p3', by: 'ai', reason: 'Sharpest shot, eyes open.', photos: [photo('p1', { hidden: true }), photo('p2', { hidden: true }), photo('p3')] }), hidden: 2 });
    const u = userEvent.setup();
    renderGallery();
    const view = await openMoments(u);

    expect(api.listMoments).toHaveBeenCalledWith('w1', 'a1');
    expect(view).toHaveTextContent('3 of 4 photos are look-alike shots of 1 moment');
    const m = within(view).getByRole('listitem', { name: 'Moment 1' });
    expect(m).toHaveTextContent('The largest shot, for now');
    expect(within(m).getByRole('img', { name: 'The couple laughing on the stage.' })).toBeInTheDocument();

    await u.click(within(m).getByRole('button', { name: 'Ask AI to pick the best' }));
    expect(api.pickMoment).toHaveBeenCalledWith('w1', 'a1', 'p1,p2,p3');
    expect(await within(m).findByText('Picked by AI: Sharpest shot, eyes open.')).toBeInTheDocument();
    expect(within(m).queryByRole('button', { name: 'Ask AI to pick the best' })).not.toBeInTheDocument();

    await u.click(within(m).getByRole('button', { name: 'Hide the other 2 from guests' }));
    expect(api.hideMomentRest).toHaveBeenCalledWith('w1', 'a1', 'p1,p2,p3');
    expect(await within(m).findAllByText('Hidden')).toHaveLength(2);
    expect(within(m).queryByRole('button', { name: /Hide the other/ })).not.toBeInTheDocument();
    expect(api.listPhotos).toHaveBeenCalledTimes(2); // the album count of hidden photos is refreshed
  });

  it('lets the couple choose, and says when the free AI is used up', async () => {
    api.listMoments.mockResolvedValue({ groups: [moment()], total: 4, grouped: 3, waitingForHash: 0 });
    api.pickMoment.mockRejectedValue(new ApiError(429, { code: 'ai_daily_limit', message: 'used up' }));
    api.chooseMoment.mockResolvedValue({ moment: moment({ best: 'p1', by: 'you' }) });
    const u = userEvent.setup();
    renderGallery();
    const m = within(await openMoments(u)).getByRole('listitem', { name: 'Moment 1' });

    await u.click(within(m).getByRole('button', { name: 'Ask AI to pick the best' }));
    expect(await within(m).findByRole('alert')).toHaveTextContent('Choose the best yourself');
    await u.click(within(m).getAllByRole('button', { name: 'Use this one' })[0]);
    expect(api.chooseMoment).toHaveBeenCalledWith('w1', 'a1', 'p1,p2,p3', 'p1');
    expect(await within(m).findByText('Picked by you')).toBeInTheDocument();
  });

  it('says so when every photo is a different moment, and is read-only when archived', async () => {
    api.listMoments.mockResolvedValue({ groups: [], total: 4, grouped: 0, waitingForHash: 0 });
    const u = userEvent.setup();
    renderGallery();
    await u.click(await screen.findByRole('tab', { name: /Sangeet/ }));
    await u.click(await screen.findByRole('button', { name: 'Group similar shots' }));
    expect(await screen.findByText('No look-alike shots in Sangeet: each of the 4 photos is a different moment.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Show all photos' }));
    expect(screen.getAllByRole('button', { name: /Open photo/ })).toHaveLength(4);
  });

  it('shows no buttons on an archived wedding', async () => {
    api.listMoments.mockResolvedValue({ groups: [moment()], total: 4, grouped: 3, waitingForHash: 0 });
    const u = userEvent.setup();
    renderGallery('archived');
    const m = within(await openMoments(u)).getByRole('listitem', { name: 'Moment 1' });
    expect(within(m).queryByRole('button')).not.toBeInTheDocument();
  });
});
