import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useWedding } from '../../layout/WeddingContext.js';
import { formatDayShort, todayIn } from '../../lib/format.js';

// "Plan with AI": choose functions, the assistant drafts tasks from our checklist library,
// then the couple edits, unticks and saves. Nothing is saved until Save.
export default function PlanDialog({ functions, onClose, onSaved }) {
  const { wedding } = useWedding();
  const dialog = useRef(null);
  const today = todayIn(wedding.timezone);
  const upcoming = functions.filter((f) => f.localDate >= today);

  const [chosen, setChosen] = useState(() => new Set(upcoming.map((f) => f._id)));
  const [wholeWedding, setWholeWedding] = useState(true);
  const [drafts, setDrafts] = useState(null); // null until drafted; each has `keep`
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const toggle = (id) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const edit = (i, changes) => setDrafts((list) => list.map((d, j) => (j === i ? { ...d, ...changes } : d)));

  async function draft() {
    setBusy(true);
    setError('');
    try {
      const res = await api.planTasks(wedding._id, { functions: [...chosen], wholeWedding });
      setDrafts(res.data.map((d) => ({ ...d, keep: true })));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const kept = drafts.filter((d) => d.keep && d.title.trim());
    setBusy(true);
    setError('');
    try {
      await api.saveTasks(
        wedding._id,
        kept.map((d) => ({ title: d.title.trim(), description: d.description, function: d.function?._id ?? null, dueDate: d.dueDate || null })),
      );
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const keptCount = drafts?.filter((d) => d.keep && d.title.trim()).length ?? 0;

  return (
    <dialog ref={dialog} className="modal wide" onClose={onClose} aria-labelledby="plan-title">
      <form onSubmit={(e) => { e.preventDefault(); if (drafts) save(); else draft(); }} noValidate>
        <div className="modal-head">
          <h2 id="plan-title">Plan tasks with AI</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert" role="alert">{error}</div>}

          {drafts === null ? (
            upcoming.length === 0 ? (
              <p className="muted">Add an upcoming function first. The plan counts each task back from its function’s date.</p>
            ) : (
              <>
                <p className="muted">
                  The assistant starts from a checklist for each kind of function (Mehendi, Haldi, Sangeet and more), fits it to your
                  wedding and skips tasks you already have. You review every task before anything is saved.
                </p>
                <div className="field">
                  <span className="label-like" id="plan-functions-label">Plan for</span>
                  <div className="check-grid" role="group" aria-labelledby="plan-functions-label">
                    {upcoming.map((f) => (
                      <label key={f._id} className="check">
                        <input type="checkbox" checked={chosen.has(f._id)} onChange={() => toggle(f._id)} />
                        <span>{f.name}</span>
                        <span className="muted small">{formatDayShort(f.localDate)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="check solo">
                  <input type="checkbox" checked={wholeWedding} onChange={(e) => setWholeWedding(e.target.checked)} />
                  Include whole-wedding tasks (budget, cards, guest travel)
                </label>
              </>
            )
          ) : drafts.length === 0 ? (
            <p className="muted" role="status">No new tasks to suggest: your list already covers these functions.</p>
          ) : (
            <>
              <p className="muted small" role="status">
                {drafts.length} suggested task{drafts.length === 1 ? '' : 's'}. Untick any you don’t want and edit the wording or dates.
              </p>
              <ul className="plan-list">
                {drafts.map((d, i) => (
                  <li key={i} className={d.keep ? 'plan-row' : 'plan-row dropped'}>
                    <input type="checkbox" aria-label={`Keep ${d.title}`} checked={d.keep} onChange={(e) => edit(i, { keep: e.target.checked })} />
                    <div className="plan-main">
                      <input aria-label="Task" value={d.title} maxLength={120} onChange={(e) => edit(i, { title: e.target.value })} />
                      <p className="task-fn">
                        {d.function?.name ?? 'Whole wedding'}
                        {d.source ? ` · from the ${d.source} checklist` : ' · suggested for your wedding'}
                        {d.late && ' · already due'}
                      </p>
                      {d.description && <p className="muted small">{d.description}</p>}
                    </div>
                    <input type="date" aria-label={`Due date for ${d.title}`} value={d.dueDate ?? ''} onChange={(e) => edit(i, { dueDate: e.target.value })} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="modal-foot">
          {drafts && <button type="button" className="link-button small" onClick={() => setDrafts(null)} disabled={busy}>Start over</button>}
          <span className="modal-actions">
            <button type="button" className="btn btn-outline inline" onClick={onClose}>Cancel</button>
            {drafts === null ? (
              <button type="submit" className="btn btn-primary inline" disabled={busy || chosen.size === 0 || upcoming.length === 0}>
                {busy ? 'Drafting…' : 'Draft tasks'}
              </button>
            ) : (
              drafts.length > 0 && (
                <button type="submit" className="btn btn-primary inline" disabled={busy || keptCount === 0}>
                  {busy ? 'Saving…' : `Save ${keptCount} task${keptCount === 1 ? '' : 's'}`}
                </button>
              )
            )}
          </span>
        </div>
      </form>
    </dialog>
  );
}
