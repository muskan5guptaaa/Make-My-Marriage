import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Lightbox, PhotoGrid, UploadButton } from '../../components/photos/PhotoParts.jsx';
import { useWedding } from '../../layout/WeddingContext.js';

// The Gallery screen from the design: album chips, then the photos of the chosen album.
export default function Gallery() {
  const { wedding } = useWedding();
  const canEdit = wedding.status !== 'archived';
  const [albums, setAlbums] = useState(null);
  const [current, setCurrent] = useState('all'); // 'all' or an album id
  const [photos, setPhotos] = useState(null);
  const [open, setOpen] = useState(null); // index in photos
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const loadAlbums = useCallback(async () => {
    try {
      setAlbums((await api.listAlbums(wedding._id)).data);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [wedding._id]);

  const loadPhotos = useCallback(async () => {
    if (current === 'all') return setPhotos(null);
    try {
      setPhotos((await api.listPhotos(wedding._id, current)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [wedding._id, current]);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);
  useEffect(() => {
    setPhotos(null);
    loadPhotos();
  }, [loadPhotos]);

  const album = albums?.find((a) => a._id === current);
  const refresh = () => Promise.all([loadAlbums(), loadPhotos()]);

  async function act(work) {
    setError('');
    try {
      await work();
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Gallery</h1>
        {canEdit && (
          <div className="head-actions">
            <button type="button" className="btn btn-outline inline" onClick={() => setCreating(true)}>+ New album</button>
            {album && (
              <UploadButton
                sign={() => api.signPhoto(wedding._id, album._id)}
                complete={(photoId) => api.completePhoto(wedding._id, photoId)}
                onDone={refresh}
              />
            )}
          </div>
        )}
      </div>

      {creating && <NewAlbum onClose={() => setCreating(false)} onCreated={(a) => { setCreating(false); loadAlbums(); setCurrent(a._id); }} />}
      {error && <div className="alert" role="alert">{error}</div>}

      {albums === null ? (
        <p className="muted" role="status">Loading albums…</p>
      ) : (
        <>
          <div className="chips static" role="tablist" aria-label="Albums">
            <button type="button" role="tab" className="chip big" aria-pressed={current === 'all'} aria-selected={current === 'all'} onClick={() => setCurrent('all')}>
              All albums
            </button>
            {albums.map((a) => (
              <button key={a._id} type="button" role="tab" className="chip big" aria-pressed={current === a._id} aria-selected={current === a._id} onClick={() => setCurrent(a._id)}>
                {a.name}
                <span className="chip-count">{a.photoCount}</span>
              </button>
            ))}
          </div>

          {current === 'all' ? (
            albums.length === 0 ? (
              <section className="card hero-card">
                <div className="empty">
                  <h2>No albums yet</h2>
                  <p>Add functions and each one gets its own album automatically. You can also make albums of your own, like a pre-wedding shoot.</p>
                </div>
              </section>
            ) : (
              <ul className="album-grid">
                {albums.map((a) => (
                  <li key={a._id}>
                    <button type="button" className="album-card" onClick={() => setCurrent(a._id)}>
                      <span className="album-cover">
                        {a.coverUrl ? <img src={a.coverUrl} alt="" loading="lazy" /> : <span className="album-empty mono">No photos yet</span>}
                      </span>
                      <span className="album-name">{a.name}</span>
                      <span className="muted small">{a.photoCount} photo{a.photoCount === 1 ? '' : 's'}{!a.function && ' · your album'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              {album && !album.function && canEdit && <AlbumTools album={album} onChanged={refresh} onDeleted={() => { setCurrent('all'); loadAlbums(); }} />}
              {photos === null ? (
                <p className="muted" role="status">Loading photos…</p>
              ) : photos.length === 0 ? (
                <section className="card hero-card">
                  <div className="empty">
                    <h2>No photos in {album?.name} yet</h2>
                    <p>Upload photos here, or share a guest&rsquo;s invitation link: guests invited to this function can add theirs too.</p>
                    {canEdit && album && (
                      <UploadButton
                        label="Upload the first photos"
                        className="btn btn-outline inline"
                        sign={() => api.signPhoto(wedding._id, album._id)}
                        complete={(photoId) => api.completePhoto(wedding._id, photoId)}
                        onDone={refresh}
                      />
                    )}
                  </div>
                </section>
              ) : (
                <>
                  <p className="muted small">
                    {photos.length} photo{photos.length === 1 ? '' : 's'}
                    {photos.some((p) => p.hidden) && ` · ${photos.filter((p) => p.hidden).length} hidden from guests`}
                    {' · '}Click a photo to view, download, hide or delete it.
                  </p>
                  <PhotoGrid photos={photos} onOpen={setOpen} />
                </>
              )}
            </>
          )}
        </>
      )}

      {open !== null && photos && (
        <Lightbox
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          actions={(p) => canEdit && <PhotoActions photo={p} album={album} onAct={act} onDeleted={() => setOpen(null)} />}
        />
      )}
    </>
  );
}

function PhotoActions({ photo, album, onAct, onDeleted }) {
  const { wedding } = useWedding();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [photo._id]);
  const isCover = album?.coverPhoto === photo._id;

  return confirm ? (
    <span className="confirm lb-confirm">
      <span>Delete this photo for everyone?</span>
      <button type="button" className="btn btn-danger inline sm" onClick={() => onAct(async () => { await api.deletePhoto(wedding._id, photo._id); onDeleted(); })}>
        Yes, delete
      </button>
      <button type="button" className="btn btn-outline inline sm lb-btn" onClick={() => setConfirm(false)}>Keep</button>
    </span>
  ) : (
    <>
      <button type="button" className="btn btn-outline inline sm lb-btn" onClick={() => onAct(() => api.updatePhoto(wedding._id, photo._id, { hidden: !photo.hidden }))}>
        {photo.hidden ? 'Show to guests' : 'Hide from guests'}
      </button>
      {!photo.hidden && (
        <button type="button" className="btn btn-outline inline sm lb-btn" disabled={isCover} onClick={() => onAct(() => api.updateAlbum(wedding._id, album._id, { coverPhoto: photo._id }))}>
          {isCover ? 'Album cover' : 'Make album cover'}
        </button>
      )}
      <button type="button" className="btn btn-danger-outline inline sm" onClick={() => setConfirm(true)}>Delete</button>
    </>
  );
}

function NewAlbum({ onClose, onCreated }) {
  const { wedding } = useWedding();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onCreated((await api.createAlbum(wedding._id, name)).album);
    } catch (err) {
      setError(err.fields?.name ?? err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-panel" onSubmit={onSubmit}>
      <label htmlFor="album-name">New album name</label>
      <div className="copy-link">
        <input id="album-name" autoFocus placeholder="Pre-wedding shoot" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-primary inline sm" disabled={busy || !name.trim()}>Create</button>
        <button type="button" className="btn btn-outline inline sm" onClick={onClose}>Cancel</button>
      </div>
      {error && <p className="field-error">{error}</p>}
      <p className="field-hint">Each function already has its own album. Use this for anything else.</p>
    </form>
  );
}

// Rename or delete an album you made (function albums follow their function).
function AlbumTools({ album, onChanged, onDeleted }) {
  const { wedding } = useWedding();
  const [mode, setMode] = useState(null); // 'rename' | 'delete'
  const [name, setName] = useState(album.name);
  const [error, setError] = useState('');

  async function run(work) {
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err.fields?.name ?? err.message);
    }
  }

  if (mode === 'rename') {
    return (
      <form className="inline-panel" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.updateAlbum(wedding._id, album._id, { name }); setMode(null); onChanged(); }); }}>
        <label htmlFor="rename-album">Album name</label>
        <div className="copy-link">
          <input id="rename-album" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-primary inline sm" disabled={!name.trim()}>Save</button>
          <button type="button" className="btn btn-outline inline sm" onClick={() => setMode(null)}>Cancel</button>
        </div>
        {error && <p className="field-error">{error}</p>}
      </form>
    );
  }
  return (
    <div className="row-actions album-tools">
      {mode === 'delete' ? (
        <span className="confirm">
          <span>Delete “{album.name}” and its {album.photoCount} photo{album.photoCount === 1 ? '' : 's'}?</span>
          <button type="button" className="btn btn-danger inline sm" onClick={() => run(async () => { await api.deleteAlbum(wedding._id, album._id); onDeleted(); })}>Yes, delete</button>
          <button type="button" className="btn btn-outline inline sm" onClick={() => setMode(null)}>Keep</button>
        </span>
      ) : (
        <>
          <button type="button" className="link-button small" onClick={() => setMode('rename')}>Rename album</button>
          <button type="button" className="link-button small danger" onClick={() => setMode('delete')}>Delete album</button>
        </>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
