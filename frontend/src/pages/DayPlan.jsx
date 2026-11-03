import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useWedding } from '../layout/WeddingContext.js';

const dayLabel = (ymd) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// The run sheet for one day: our code flags clashes and loose ends, the AI drafts the steps
// around each function, and the couple edits, saves and prints it. Each function's start comes
// from the Functions page and can't be changed here.
export default function DayPlan() {
  const { wedding } = useWedding();
  const canEdit = wedding.status !== 'archived';
  const [days, setDays] = useState(null);
  const [date, setDate] = useState(null);
  const [day, setDay] = useState(null);
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null); // 'draft' | 'save'
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const nextKey = useRef(0);
  const keyed = (items) => items.map((it) => ({ ...it, key: nextKey.current++ }));

  useEffect(() => {
    api
      .listDayPlans(wedding._id)
      .then((res) => {
        setDays(res.data);
        const upcoming = res.data.find((d) => d.date >= res.meta.today);
        setDate((upcoming ?? res.data.at(-1))?.date ?? null);
      })
      .catch((err) => setError(err.message));
  }, [wedding._id]);

  useEffect(() => {
    if (!date) return;
    let live = true;
    setDay(null);
    setEditing(false);
    setNotice('');
    setError('');
    api
      .getDayPlan(wedding._id, date)
      .then((res) => {
        if (!live) return;
        setDay(res);
        setRows(keyed(res.items));
      })
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [wedding._id, date]);

  const own = rows.filter((r) => !r.fixed);
  const set = (key, change) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));

  async function draft() {
    if (own.length > 0 && !window.confirm('Replace this run sheet with a new draft from the assistant? Unsaved edits are lost.')) return;
    setBusy('draft');
    setError('');
    setNotice('');
    try {
      const res = await api.draftDayPlan(wedding._id, date);
      setDay(res);
      setRows(keyed(res.items));
      setEditing(true);
      setNotice('Here’s a draft. Check each step, change anything, then save. Nothing is saved yet.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const items = own.map(({ time, title, function: fn, who, notes }) => ({ time, title, function: fn?._id ?? null, who, notes }));
      const res = await api.saveDayPlan(wedding._id, date, items);
      setDay(res);
      setRows(keyed(res.items));
      setEditing(false);
      setDays((list) => list.map((d) => (d.date === date ? { ...d, saved: true } : d)));
      setNotice('Run sheet saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function cancel() {
    setRows(keyed(day.items));
    setEditing(false);
    setNotice('');
  }

  if (days && days.length === 0) {
    return (
      <>
        <h1 className="page-title">Day plan</h1>
        <section className="card hero-card">
          <div className="empty">
            <h2>Add a function first</h2>
            <p>A day plan is built from the functions on that day. Add one with its date and start time.</p>
            <Link className="btn btn-primary inline" to={`/w/${wedding._id}/functions`}>Go to Functions</Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Day plan</h1>
          <p className="muted">An hour-by-hour run sheet for each day. Function times come from the Functions page.</p>
        </div>
        {day && !editing && (
          <span className="head-actions">
            <button type="button" className="btn btn-outline inline" onClick={() => window.print()}>Print</button>
            {canEdit && <button type="button" className="btn btn-outline inline" onClick={() => setEditing(true)}>Edit</button>}
            {canEdit && (
              <button type="button" className="btn btn-primary inline" onClick={draft} disabled={busy !== null}>
                {busy === 'draft' ? 'Drafting…' : 'Draft with AI'}
              </button>
            )}
          </span>
        )}
      </div>

      {days && (
        <div className="chips static day-chips" role="group" aria-label="Day">
          {days.map((d) => (
            <button key={d.date} type="button" className="chip" aria-pressed={d.date === date} onClick={() => setDate(d.date)}>
              {dayLabel(d.date)} · {d.functions.join(', ')}
            </button>
          ))}
        </div>
      )}

      {error && <div className="alert" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {!day && !error && <p className="muted" role="status">Loading…</p>}

      {day && day.checks.length > 0 && (
        <section className="card day-checks" aria-label="Checks">
          <h2 className="sub-title">Worth a look</h2>
          <ul>
            {day.checks.map((c, i) => (
              <li key={i} className={c.level}>
                <span className={`pill ${c.level === 'clash' ? 'bad' : ''}`}>{c.level === 'clash' ? 'Clash' : 'Check'}</span> {c.text}
              </li>
            ))}
          </ul>
          {editing && <p className="muted small">Checks update when you save.</p>}
        </section>
      )}

      {day && !editing && (
        <section className="card table-card" aria-label="Run sheet">
          {rows.length === 0 ? (
            <p className="table-foot muted">
              No steps yet{day.functions.some((f) => !f.startTime) ? ', and no start times to place' : ''}.
              {canEdit ? ' Draft one with the assistant, or add steps yourself with Edit.' : ''}
            </p>
          ) : (
            <div className="table-scroll">
              <table className="guest-table run-sheet">
                <thead>
                  <tr><th>Time</th><th>What</th><th>Who</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className={r.fixed ? 'fixed' : undefined}>
                      <td className="mono">{r.time}</td>
                      <td>
                        {r.title}
                        {r.function && !r.fixed && <span className="pill">{r.function.name}</span>}
                      </td>
                      <td className="muted-cell">{r.who ?? ''}</td>
                      <td className="muted-cell">{r.notes ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {day.updatedAt && <p className="table-foot muted small">Last saved {new Date(day.updatedAt).toLocaleString('en-IN')}</p>}
        </section>
      )}

      {day && editing && (
        <form className="card run-edit" aria-label="Edit run sheet" onSubmit={save}>
          <datalist id="day-people">
            {day.people.map((p) => <option key={p} value={p} />)}
          </datalist>
          <ul className="plan-list">
            {rows.map((r) =>
              r.fixed ? (
                <li key={r.key} className="plan-row run-fixed">
                  <span className="mono">{r.time}</span>
                  <span><b>{r.title}</b>{r.notes && ` · ${r.notes}`} <span className="muted small">(change it on Functions)</span></span>
                </li>
              ) : (
                <li key={r.key} className="plan-row run-row">
                  <input type="time" aria-label={`Time for ${r.title || 'new step'}`} required value={r.time} onChange={(e) => set(r.key, { time: e.target.value })} />
                  <input aria-label="What happens" placeholder="What happens" required maxLength={120} value={r.title} onChange={(e) => set(r.key, { title: e.target.value })} />
                  <input aria-label={`Who for ${r.title || 'new step'}`} placeholder="Who" list="day-people" maxLength={80} value={r.who ?? ''} onChange={(e) => set(r.key, { who: e.target.value })} />
                  <select
                    aria-label={`Function for ${r.title || 'new step'}`}
                    value={r.function?._id ?? ''}
                    onChange={(e) => set(r.key, { function: day.functions.find((f) => f._id === e.target.value) ?? null })}
                  >
                    <option value="">Whole day</option>
                    {day.functions.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
                  </select>
                  <input aria-label={`Notes for ${r.title || 'new step'}`} placeholder="Notes" maxLength={300} value={r.notes ?? ''} onChange={(e) => set(r.key, { notes: e.target.value })} />
                  <button type="button" className="icon-button" aria-label={`Remove ${r.title || 'new step'}`} onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}>&times;</button>
                </li>
              ),
            )}
          </ul>
          <button
            type="button"
            className="link-button"
            onClick={() => setRows((list) => [...list, ...keyed([{ time: '', title: '', function: null, who: '', notes: '', fixed: false }])])}
          >
            + Add a step
          </button>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline inline" onClick={cancel} disabled={busy !== null}>Cancel</button>
            <button type="submit" className="btn btn-primary inline" disabled={busy !== null}>{busy === 'save' ? 'Saving…' : 'Save run sheet'}</button>
          </div>
        </form>
      )}
    </>
  );
}
