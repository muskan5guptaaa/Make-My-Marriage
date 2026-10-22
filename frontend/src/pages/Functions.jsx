import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useWedding } from '../layout/WeddingContext.js';
import { formatDay, formatTime } from '../lib/format.js';
import FunctionDialog from './FunctionDialog.jsx';

export const STATUS_LABEL = { done: 'DONE', next: 'NEXT', upcoming: 'UPCOMING' };

// The Functions screen from the design: one card per function, in date order.
export default function Functions() {
  const { wedding, reloadWedding } = useWedding();
  const canEdit = wedding.status !== 'archived';
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined: closed, null: adding, object: editing

  const load = useCallback(async () => {
    try {
      setList((await api.listFunctions(wedding._id)).data);
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
      ) : list?.length === 0 ? (
        <section className="card hero-card">
          <div className="empty">
            <h2>No functions yet</h2>
            <p>Add each function with its date, venue and dress code. Guests only see the functions they&rsquo;re invited to.</p>
            {canEdit && (
              <button type="button" className="btn btn-outline inline" onClick={() => setEditing(null)}>Add your first function</button>
            )}
          </div>
        </section>
      ) : (
        <div className="fn-list">
          {(list ?? []).map((f) => (
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

      {editing !== undefined && (
        <FunctionDialog
          fn={editing}
          existingNames={(list ?? []).map((f) => f.name.toLowerCase())}
          onClose={() => setEditing(undefined)}
          onSaved={afterChange}
          onDeleted={afterChange}
        />
      )}
    </>
  );
}
