import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useWedding } from '../../layout/WeddingContext.js';
import GuestDialog from './GuestDialog.jsx';
import { RSVP, SIDES, sideName } from './guestLabels.js';
import ImportDialog from './ImportDialog.jsx';

// The Guests screen from the design: search, then a table of Name, Side, Functions, Plus-ones, RSVP.
export default function Guests() {
  const { wedding } = useWedding();
  const canEdit = wedding.status !== 'archived';

  const [q, setQ] = useState('');
  const [query, setQuery] = useState(''); // q, after typing pauses
  const [side, setSide] = useState('');
  const [fnFilter, setFnFilter] = useState('');
  const [rsvp, setRsvp] = useState('');

  const [guests, setGuests] = useState(null);
  const [summary, setSummary] = useState(null);
  const [functions, setFunctions] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined closed, null adding, id editing
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const loadFunctions = useCallback(
    () => api.listFunctions(wedding._id).then(({ data }) => setFunctions(data)).catch(() => {}),
    [wedding._id],
  );
  useEffect(() => {
    loadFunctions();
  }, [loadFunctions]);

  const load = useCallback(async () => {
    try {
      const res = await api.listGuests(wedding._id, { q: query.trim(), side, function: fnFilter, rsvp });
      setGuests(res.data);
      setSummary(res.meta.summary);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [wedding._id, query, side, fnFilter, rsvp]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = Boolean(query.trim() || side || fnFilter || rsvp);
  const clearFilters = () => {
    setQ('');
    setQuery('');
    setSide('');
    setFnFilter('');
    setRsvp('');
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Guests</h1>
        {canEdit && (
          <div className="head-actions">
            <button type="button" className="btn btn-outline inline" onClick={() => setImporting(true)}>Import CSV</button>
            <button type="button" className="btn btn-primary inline" onClick={() => setEditing(null)}>+ Add guest</button>
          </div>
        )}
      </div>

      {summary && summary.total > 0 && (
        <div className="guest-summary" aria-label="Guest totals">
          <span><b>{summary.invited}</b> invited</span>
          <span className="good"><b>{summary.yes}</b> yes</span>
          <span><b>{summary.pending}</b> pending</span>
          <span><b>{summary.no}</b> no</span>
          <span className="muted">&middot; <b>{summary.heads}</b> people coming, plus-ones included</span>
        </div>
      )}

      <div className="toolbar">
        <div className="search">
          <label className="sr-only" htmlFor="guest-search">Search guests</label>
          <input
            id="guest-search"
            type="search"
            placeholder="Search by name, phone or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="toolbar-selects">
          <label className="sr-only" htmlFor="filter-side">Side</label>
          <select id="filter-side" value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="">Both sides</option>
            {SIDES.map(([v, label]) => (
              <option key={v} value={v}>{v === 'both' ? 'Both (shared)' : `${label}'s side`}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-fn">Function</label>
          <select id="filter-fn" value={fnFilter} onChange={(e) => setFnFilter(e.target.value)}>
            <option value="">All functions</option>
            {functions.map((f) => (
              <option key={f._id} value={f._id}>{f.name}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-rsvp">RSVP</label>
          <select id="filter-rsvp" value={rsvp} onChange={(e) => setRsvp(e.target.value)}>
            <option value="">Any RSVP</option>
            <option value="yes">Yes</option>
            <option value="pending">Pending</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {guests === null && !error ? (
        <p className="muted" role="status">Loading guests…</p>
      ) : guests?.length === 0 ? (
        <section className="card hero-card">
          <div className="empty">
            {filtered ? (
              <>
                <h2>No guests match</h2>
                <p>Try another name, side, function or RSVP.</p>
                <button type="button" className="btn btn-outline inline" onClick={clearFilters}>Show all guests</button>
              </>
            ) : (
              <>
                <h2>No guests yet</h2>
                <p>
                  Add guests one by one, or import a spreadsheet. Each guest gets a private link to RSVP for the
                  functions you invite them to.
                </p>
                {canEdit && (
                  <div className="head-actions">
                    <button type="button" className="btn btn-primary inline" onClick={() => setEditing(null)}>Add your first guest</button>
                    <button type="button" className="btn btn-outline inline" onClick={() => setImporting(true)}>Import CSV</button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="card table-card">
          <div className="table-scroll">
            <table className="guest-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Side</th>
                  <th scope="col">Functions</th>
                  <th scope="col" className="num">Plus-ones</th>
                  <th scope="col">RSVP</th>
                </tr>
              </thead>
              <tbody>
                {(guests ?? []).map((g) => (
                  <tr key={g._id}>
                    <td>
                      <button type="button" className="row-link" onClick={() => setEditing(g._id)}>
                        <span className="guest-name">{g.name}</span>
                        {(g.phone || g.email) && <span className="guest-contact">{g.phone ?? g.email}</span>}
                      </button>
                    </td>
                    <td className="muted-cell">{sideName(g.side)}</td>
                    <td className="muted-cell">
                      {g.invitedFunctions.length ? g.invitedFunctions.map((f) => f.name).join(', ') : '—'}
                    </td>
                    <td className="num mono">{g.plusOnesAllowed}</td>
                    <td>
                      <span className={`rsvp-pill ${g.rsvpStatus}`}>{RSVP[g.rsvpStatus].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered && summary && (
            <p className="table-foot muted small">Showing {guests.length} of {summary.total} guests</p>
          )}
        </section>
      )}

      {editing !== undefined && (
        <GuestDialog
          guestId={editing}
          functions={functions}
          canEdit={canEdit}
          onClose={() => setEditing(undefined)}
          onChanged={load}
          onCreated={(id) => setEditing(id)}
        />
      )}
      {importing && (
        <ImportDialog
          functions={functions}
          onClose={() => setImporting(false)}
          onImported={() => {
            load();
            loadFunctions();
          }}
        />
      )}
    </>
  );
}
