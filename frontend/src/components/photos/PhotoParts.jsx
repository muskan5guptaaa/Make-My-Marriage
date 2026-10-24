import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCEPT, uploadPhotos } from '../../lib/uploadPhotos.js';

// Pieces shared by the planner Gallery and the guest page: grid, uploader, full-screen viewer.

export function PhotoGrid({ photos, onOpen }) {
  return (
    <ul className="photo-grid">
      {photos.map((p, i) => (
        <li key={p._id} className={p.hidden ? 'is-hidden' : undefined}>
          <button type="button" className="photo-tile" onClick={() => onOpen(i)} aria-label={`Open photo ${i + 1}${p.hidden ? ' (hidden from guests)' : ''}`}>
            <img src={p.thumbUrl} alt="" loading="lazy" />
            {p.hidden && <span className="photo-badge mono">Hidden</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

// A button that opens the file picker, then shows each file's progress.
export function UploadButton({ label = '+ Upload photos', sign, complete, onDone, className = 'btn btn-primary inline' }) {
  const input = useRef(null);
  const [items, setItems] = useState([]); // { name, status, progress, error }
  const busy = items.some((it) => it.status === 'uploading' || it.status === 'finishing' || it.status === 'waiting');

  async function onPick(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) return;
    setItems(files.map((f) => ({ name: f.name, status: 'waiting', progress: 0 })));
    await uploadPhotos(files, {
      sign,
      complete,
      onUpdate: (i, patch) => setItems((all) => all.map((it, j) => (j === i ? { ...it, ...patch } : it))),
    });
    onDone();
  }

  const ok = items.filter((it) => it.status === 'done').length;
  const failed = items.filter((it) => it.status === 'error');

  return (
    <div className="uploader">
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={onPick} />
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : label}
      </button>
      {items.length > 0 && (
        <div className="upload-panel" role="status" aria-live="polite">
          <div className="upload-summary">
            {busy ? `Uploading ${items.length} photo${items.length === 1 ? '' : 's'}…` : `Uploaded ${ok} of ${items.length}.`}
            {!busy && (
              <button type="button" className="link-button small" onClick={() => setItems([])}>Dismiss</button>
            )}
          </div>
          {(busy || failed.length > 0) && (
            <ul className="upload-list">
              {items.map((it, i) => (
                <li key={i} className={it.status}>
                  <span className="upload-name">{it.name}</span>
                  {it.status === 'error' ? (
                    <span className="upload-error">{it.error}</span>
                  ) : (
                    <span className="upload-bar"><span style={{ width: `${it.progress}%` }} /></span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Full-screen viewer with previous/next (arrow keys too). `actions(photo)` adds buttons.
export function Lightbox({ photos, index, onIndex, onClose, actions }) {
  const dialog = useRef(null);
  const photo = photos[index];
  const go = useCallback((step) => onIndex((index + step + photos.length) % photos.length), [index, photos.length, onIndex]);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (!photo) onClose();
  }, [photo, onClose]);

  if (!photo) return null;
  return (
    <dialog
      ref={dialog}
      className="lightbox"
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1);
        if (e.key === 'ArrowLeft') go(-1);
      }}
      aria-label={`Photo ${index + 1} of ${photos.length}`}
    >
      <div className="lb-top">
        <span className="lb-count mono">{index + 1} / {photos.length}</span>
        <span className="lb-meta">
          {photo.uploaderName && `Shared by ${photo.uploaderName}`}
          {photo.uploadedAt && ` · ${new Date(photo.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
          {photo.hidden && ' · Hidden from guests'}
        </span>
        <button type="button" className="lb-close" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="lb-stage">
        {photos.length > 1 && <button type="button" className="lb-nav prev" onClick={() => go(-1)} aria-label="Previous photo">&#8249;</button>}
        <img key={photo._id} src={photo.fullUrl} alt={`Photo ${index + 1}`} />
        {photos.length > 1 && <button type="button" className="lb-nav next" onClick={() => go(1)} aria-label="Next photo">&#8250;</button>}
      </div>
      <div className="lb-actions">
        <a className="btn btn-outline inline sm lb-btn" href={photo.downloadUrl} target="_blank" rel="noreferrer">Download</a>
        {actions?.(photo)}
      </div>
    </dialog>
  );
}
