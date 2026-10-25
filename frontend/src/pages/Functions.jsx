import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useWedding } from '../layout/WeddingContext.js';
import { formatDay, formatTime } from '../lib/format.js';
import FunctionDialog from './FunctionDialog.jsx';

export const STATUS_LABEL = { done: 'DONE', next: 'NEXT', upcoming: 'UPCOMING', archived: 'ARCHIVED' };

// The Functions screen from the design: one card per function, in date order. Archived functions
// sit in their own section, where they can be restored or, only then, deleted for good.
export default function Functions() {
  const { wedding, reloadWedding } = useWedding();
  const canEdit = wedding.status !== 'archived';
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined: closed, null: adding, object: editing
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      setList((await api.listFunctions(wedding._id, { includeArchived: true })).data);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [wedding._id]);

  useEffect(() => {
    load();
  }, [load]);

  async function afterChange() {
    setEditing(undefined);
    await load();
    reloadWedding().catch(() => {}); // the wedding's dates come from its functions
  }

  const active = (list ?? []).filter((f) => f.status !== 'archived');
  const archived = (list ?? []).filter((f) => f.status === 'archived');

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Functions</h1>
        {canEdit && (
          <button type="button" className="btn btn-primary inline" onClick={() => setEditing(null)}>+ Add function</button>
        )}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {list === null && !error ? (
        <p className="muted" role="status">Loading functions…</p>
      ) : active.length === 0 ? (
        <section className="card hero-card">
          <div className="empty">
            <h2>{archived.length ? 'No active functions' : 'No functions yet'}</h2>
            <p>Add each function with its date, venue and dress code. Guests only see the functions they&rsquo;re invited to.</p>
            {canEdit && (
              <button type="button" className="btn btn-outline inline" onClick={() => setEditing(null)}>Add a function</button>
            )}
          </div>
        </section>
      ) : (
        <div className="fn-list">
          {active.map((f) => (
            <article key={f._id} className={`fn-card ${f.status}`}>
              <div className="fn-main">
                <div className="fn-title">
                  <h2>{f.name}</h2>
                  <span className={`status-pill ${f.status}`}>{STATUS_LABEL[f.status]}</span>
                </div>
                <div className="fn-line">
                  {formatDay(f.localDate)}
                  {f.startTime && <> &middot; {formatTime(f.startTime)}</>}
                </div>
                {(f.venue || f.address) && <div className="fn-line">{[f.venue, f.address].filter(Boolean).join(', ')}</div>}
                {f.dressCode && <div className="fn-dress mono">DRESS CODE &middot; {f.dressCode}</div>}
                {f.livestreamUrl && (
                  <a className="fn-live mono" href={f.livestreamUrl} target="_blank" rel="noreferrer">LIVESTREAM &#8599;</a>
                )}
              </div>
              <div className="fn-side">
                <div className="muted small">
                  {f.invitedCount === 0 ? 'No guests invited yet' : `${f.invitedCount} guest${f.invitedCount === 1 ? '' : 's'} invited`}
                </div>
                {canEdit && (
                  <button type="button" className="link-button small" onClick={() => setEditing(f)} aria-label={`Edit ${f.name}`}>
                    Edit
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="archived-section">
          <button type="button" className="archived-toggle" aria-expanded={showArchived} onClick={() => setShowArchived((s) => !s)}>
            <span aria-hidden="true">{showArchived ? '▾' : '▸'}</span> Archived ({archived.length})
          </button>
          {showArchived && (
            <>
              <p className="muted small">
                Archived functions are hidden from the timeline, the dashboard and guest pages. Guests&rsquo; answers, tasks,
                expenses and photos are kept, and come back when you restore.
              </p>
              <ul className="archived-list">
                {archived.map((f) => (
                  <ArchivedRow key={f._id} fn={f} canEdit={canEdit} onChanged={afterChange} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {editing !== undefined && (
        <FunctionDialog
          fn={editing}
          existingNames={active.map((f) => f.name.toLowerCase())}
          onClose={() => setEditing(undefined)}
          onSaved={afterChange}
          onArchived={afterChange}
        />
      )}
    </>
  );
}

function ArchivedRow({ fn, canEdit, onChanged }) {
  const { wedding } = useWedding();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(work) {
    setBusy(true);
    setError('');
    try {
      await work();
      await onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <li className="archived-row">
      <span className="archived-name">
        <b>{fn.name}</b>
        <span className="muted small">
          {formatDay(fn.localDate)}
          {fn.invitedCount > 0 && ` · ${fn.invitedCount} guest${fn.invitedCount === 1 ? '' : 's'} invited`}
        </span>
      </span>
      {canEdit &&
        (confirm ? (
          <span className="confirm">
            <span className="small">Delete {fn.name} for good? Guests lose this invitation and its answers.</span>
            <button type="button" className="btn btn-danger inline sm" disabled={busy} onClick={() => run(() => api.deleteFunction(wedding._id, fn._id))}>
              Delete permanently
            </button>
            <button type="button" className="btn btn-outline inline sm" disabled={busy} onClick={() => setConfirm(false)}>Keep</button>
          </span>
        ) : (
          <span className="row-actions">
            <button type="button" className="btn btn-outline inline sm" disabled={busy} onClick={() => run(() => api.restoreFunction(wedding._id, fn._id))}>
              Restore
            </button>
            <button type="button" className="link-button small danger" disabled={busy} onClick={() => setConfirm(true)}>Delete permanently</button>
          </span>
        ))}
      {error && <span className="field-error">{error}</span>}
    </li>
  );
}
