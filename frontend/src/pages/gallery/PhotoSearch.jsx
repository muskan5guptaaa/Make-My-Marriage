import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

export const DESCRIBE_GAP_MS = 4500; // about 13 photos a minute, under the free plan's limit
export const BUSY_WAIT_MS = 30_000;

// Search photos by what's in them, and the button that makes them searchable: the AI describes
// photos one at a time (one request each) until none are waiting, today's free allowance runs
// out, or the person presses Stop. Photos already described stay searchable.
export default function PhotoSearch({ weddingId, canEdit, onResults, active }) {
  const [status, setStatus] = useState(null); // { total, searchable, failed, waiting }
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const stop = useRef(false);

  useEffect(() => {
    api.photoSearchStatus(weddingId).then(setStatus).catch(() => {});
    return () => {
      stop.current = true;
    };
  }, [weddingId]);

  const wait = (ms) =>
    new Promise((resolve) => {
      const started = Date.now();
      const tick = setInterval(() => {
        if (stop.current || Date.now() - started >= ms) {
          clearInterval(tick);
          resolve();
        }
      }, 200);
    });

  async function describeAll() {
    stop.current = false;
    setRunning(true);
    setError('');
    try {
      while (!stop.current) {
        let res;
        try {
          res = await api.describeNextPhoto(weddingId);
        } catch (err) {
          if (err.code !== 'ai_busy' && err.code !== 'rate_limited') throw err;
          setNote('The free AI is busy. Trying again in 30 seconds…');
          await wait(BUSY_WAIT_MS);
          continue;
        }
        setNote(res.caption ? `Just described: “${res.caption}”` : '');
        setStatus(res);
        if (!res.photo || res.waiting === 0) break;
        await wait(DESCRIBE_GAP_MS);
      }
    } catch (err) {
      setError(
        err.code === 'ai_daily_limit'
          ? 'Today’s free AI allowance is used up. Photos described so far are searchable; press the button again tomorrow to carry on.'
          : err.message,
      );
    } finally {
      setRunning(false);
    }
  }

  async function search(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.searchPhotos(weddingId, q);
      setStatus(res.meta);
      onResults({ query: q, photos: res.data, albums: res.meta.albums });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!status || status.total === 0) return null;
  const left = status.waiting;

  return (
    <section className="card photo-search" aria-label="Search photos">
      <form className="photo-search-form" onSubmit={search} role="search">
        <label htmlFor="photo-q" className="sr-only">Search photos by what's in them</label>
        <input
          id="photo-q"
          type="search"
          maxLength={200}
          placeholder="Search by what’s in the photo: “bride with grandmother at the Mehendi”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-primary inline" disabled={busy || !query.trim() || status.searchable === 0}>
          {busy ? 'Searching…' : 'Search'}
        </button>
        {active && <button type="button" className="btn btn-outline inline" onClick={() => { setQuery(''); onResults(null); }}>Clear</button>}
      </form>
      <div className="photo-search-status">
        <p className="muted small" role="status">
          {status.searchable} of {status.total} photo{status.total === 1 ? ' is' : 's are'} searchable
          {status.failed > 0 && ` · ${status.failed} couldn’t be described`}
          {note && <> · {note}</>}
        </p>
        {canEdit && left > 0 && (running ? (
          <button type="button" className="btn btn-outline inline sm" onClick={() => { stop.current = true; }}>Stop</button>
        ) : (
          <button type="button" className="btn btn-outline inline sm" onClick={describeAll}>
            Make {left} photo{left === 1 ? '' : 's'} searchable
          </button>
        ))}
      </div>
      {running && <p className="muted small">The AI looks at each photo and writes what it sees, about 13 a minute. You can keep using the gallery.</p>}
      {error && <div className="alert" role="alert">{error}</div>}
      <p className="muted small">The AI describes what it sees (clothes, moments, places). It never names or recognises anyone, and no face data is kept.</p>
    </section>
  );
}
