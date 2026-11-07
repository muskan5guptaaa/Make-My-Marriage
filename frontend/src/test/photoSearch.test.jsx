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
      listAlbums: vi.fn(), listPhotos: vi.fn(), photoSearchStatus: vi.fn(), describeNextPhoto: vi.fn(), searchPhotos: vi.fn(),
      updatePhoto: vi.fn(), deletePhoto: vi.fn(), updateAlbum: vi.fn(), signPhoto: vi.fn(), completePhoto: vi.fn(),
    },
  };
});

const albums = [
  { _id: 'a1', name: 'Sangeet', function: 'f1', photoCount: 2, coverUrl: null, coverPhoto: null },
  { _id: 'a2', name: 'Reception', function: 'f2', photoCount: 1, coverUrl: null, coverPhoto: null },
];
const photo = (id, album, caption, albumName) => ({
  _id: id, album, thumbUrl: `https://img/${id}-thumb`, fullUrl: `https://img/${id}`, downloadUrl: `https://img/${id}-dl`,
  uploadedAt: '2026-10-24T10:00:00Z', uploaderName: 'Aisha', hidden: false, caption, albumName,
});

function renderGallery(status = 'active') {
  return render(
    <WeddingContext.Provider value={{ wedding: { _id: 'w1', status } }}>
      <Gallery />
    </WeddingContext.Provider>,
  );
}

describe('Photo search', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.listAlbums.mockResolvedValue({ data: albums });
  });

  it('finds photos by what is in them and shows what the AI saw', async () => {
    api.photoSearchStatus.mockResolvedValue({ total: 3, searchable: 3, failed: 0, waiting: 0 });
    api.searchPhotos.mockResolvedValue({
      data: [photo('p1', 'a1', 'The bride in a red lehenga hugs an elderly woman.', 'Sangeet')],
      meta: { albums: ['Sangeet'], total: 3, searchable: 3, failed: 0, waiting: 0 },
    });
    api.updatePhoto.mockResolvedValue({});
    renderGallery();
    const u = userEvent.setup();
    const box = await screen.findByRole('region', { name: 'Search photos' });
    expect(box).toHaveTextContent('3 of 3 photos are searchable');

    await u.type(within(box).getByRole('searchbox'), 'bride with grandmother at the sangeet');
    await u.click(within(box).getByRole('button', { name: 'Search' }));
    expect(api.searchPhotos).toHaveBeenCalledWith('w1', 'bride with grandmother at the sangeet');
    expect(await screen.findByText(/1 photo for “bride with grandmother at the sangeet” in Sangeet, closest match first/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /All albums/ })).not.toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Open photo 1: The bride in a red lehenga hugs an elderly woman.' }));
    const viewer = screen.getByRole('dialog');
    expect(viewer).toHaveTextContent('The bride in a red lehenga hugs an elderly woman.');
    await u.click(within(viewer).getByRole('button', { name: 'Hide from guests' }));
    expect(api.updatePhoto).toHaveBeenCalledWith('w1', 'p1', { hidden: true });
    expect(await within(viewer).findByRole('button', { name: 'Show to guests' })).toBeInTheDocument();
    await u.click(within(viewer).getByRole('button', { name: 'Close' }));

    await u.click(within(box).getByRole('button', { name: 'Clear' }));
    expect(await screen.findByRole('tab', { name: /All albums/ })).toBeInTheDocument();
  });

  it('makes photos searchable one at a time, and stops when the free allowance runs out', async () => {
    api.photoSearchStatus.mockResolvedValue({ total: 3, searchable: 1, failed: 0, waiting: 2 });
    api.describeNextPhoto.mockRejectedValueOnce(new ApiError(429, { code: 'ai_daily_limit', message: 'used up' }));
    renderGallery();
    const u = userEvent.setup();
    const box = await screen.findByRole('region', { name: 'Search photos' });
    expect(box).toHaveTextContent('1 of 3 photos are searchable');

    await u.click(within(box).getByRole('button', { name: 'Make 2 photos searchable' }));
    expect(await within(box).findByRole('alert')).toHaveTextContent('Today’s free AI allowance is used up');

    api.describeNextPhoto.mockResolvedValueOnce({ photo: 'p2', caption: 'Friends dancing to a dhol.', status: 'done', total: 3, searchable: 3, failed: 0, waiting: 0 });
    await u.click(within(box).getByRole('button', { name: 'Make 2 photos searchable' }));
    expect(await within(box).findByText(/3 of 3 photos are searchable/)).toBeInTheDocument();
    expect(box).toHaveTextContent('Just described: “Friends dancing to a dhol.”');
    expect(within(box).queryByRole('button', { name: /searchable$/ })).not.toBeInTheDocument();
  });

  it('cannot describe photos on an archived wedding, but can still search', async () => {
    api.photoSearchStatus.mockResolvedValue({ total: 3, searchable: 1, failed: 0, waiting: 2 });
    renderGallery('archived');
    const box = await screen.findByRole('region', { name: 'Search photos' });
    expect(within(box).queryByRole('button', { name: /searchable$/ })).not.toBeInTheDocument();
    expect(within(box).getByRole('searchbox')).toBeEnabled();
  });

  it('is not shown before any photo is uploaded', async () => {
    api.photoSearchStatus.mockResolvedValue({ total: 0, searchable: 0, failed: 0, waiting: 0 });
    renderGallery();
    await screen.findByRole('tab', { name: /All albums/ });
    expect(screen.queryByRole('region', { name: 'Search photos' })).not.toBeInTheDocument();
  });
});
