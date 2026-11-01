import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

// Each kind of suggested change goes through the same API call as the matching page, so the
// server checks it exactly as if it were made there.
const APPLY = {
  createTask: (w, p) => api.createTask(w, p.body),
  updateTask: (w, p) => api.updateTask(w, p.ids.task, p.body),
  updateExpense: (w, p) => api.updateExpense(w, p.ids.expense, p.body),
  setRsvp: (w, p) => api.setRsvp(w, p.ids.guest, p.ids.function, p.body),
};
const PAGE = { createTask: 'tasks', updateTask: 'tasks', updateExpense: 'expenses', setRsvp: 'guests' };

// Changes the assistant suggested. Nothing is saved until the person approves.
export default function Proposals({ weddingId, proposals, skipped }) {
  const [items, setItems] = useState(() => proposals.map((p) => ({ ...p, keep: true, state: 'new', error: '' })));
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const set = (i, change) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...change } : it)));
  const open = items.filter((it) => it.keep && it.state !== 'saved');
  const saved = items.filter((it) => it.state === 'saved');
  const finished = items.length > 0 && items.every((it) => it.state === 'saved' || !it.keep);

  // One at a time, in the order suggested, so a new task exists before anything depends on it.
  async function apply() {
    setBusy(true);
    for (const [i, it] of items.entries()) {
      if (!it.keep || it.state === 'saved') continue;
      set(i, { state: 'saving', error: '' });
      try {
        await APPLY[it.kind](weddingId, it);
        set(i, { state: 'saved' });
      } catch (err) {
        set(i, { state: 'failed', error: err.message });
      }
    }
    setBusy(false);
  }

  if (dismissed) return <p className="muted small">Suggested changes dismissed. Nothing was saved.</p>;

  return (
    <section className="ask-proposals" aria-label="Suggested changes">
      <h2 className="eyebrow">Suggested changes</h2>
      {items.length > 0 && (
        <ul className="plan-list">
          {items.map((it, i) => (
            <li key={i} className={it.keep ? 'plan-row' : 'plan-row dropped'}>
              <input
                type="checkbox"
                aria-label={`Apply ${it.title}`}
                checked={it.keep}
                disabled={busy || it.state === 'saved'}
                onChange={(e) => set(i, { keep: e.target.checked })}
              />
              <div className="plan-main">
                <p className="task-title">{it.title}</p>
                <p className="task-fn">{it.changes.join(' · ')}</p>
                {it.state === 'saving' && <p className="muted small" role="status">Saving…</p>}
                {it.state === 'saved' && (
                  <p className="small proposal-saved" role="status">
                    Saved · <Link to={`/w/${weddingId}/${PAGE[it.kind]}`}>View</Link>
                  </p>
                )}
                {it.state === 'failed' && <p className="field-error" role="alert">{it.error}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {skipped.length > 0 && (
        <div className="muted small">
          <p>Left out:</p>
          <ul>{skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {items.length > 0 && !finished && (
        <div className="ask-actions">
          <p className="muted small">Check each change before applying. Untick any you don’t want.</p>
          <span className="modal-actions">
            {saved.length === 0 && (
              <button type="button" className="btn btn-outline inline" disabled={busy} onClick={() => setDismissed(true)}>Dismiss</button>
            )}
            <button type="button" className="btn btn-primary inline" disabled={busy || open.length === 0} onClick={apply}>
              {busy ? 'Applying…' : `Apply ${open.length} change${open.length === 1 ? '' : 's'}`}
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
