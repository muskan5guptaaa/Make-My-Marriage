import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { UNDO_LABEL } from './Proposals.jsx';

const when = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Plans approved in Ask, newest first, each with Undo while it can still be undone.
export default function RecentChanges({ weddingId, canChange }) {
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(null);
  const [notes, setNotes] = useState({}); // run id → what undo did
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.listAgentRuns(weddingId).then((res) => live && setRuns(res.data)).catch(() => {});
    return () => {
      live = false;
    };
  }, [weddingId]);

  async function undo(run) {
    setBusy(run._id);
    setError('');
    try {
      const res = await api.undoAgentRun(weddingId, run._id);
      setRuns((list) => list.map((r) => (r._id === run._id ? res.run : r)));
      setNotes((n) => ({ ...n, [run._id]: res.notes.join(' ') }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (runs.length === 0) return null;
  return (
    <section className="card recent-runs" aria-label="Recent changes by the assistant">
      <h2 className="sub-title">Recent changes by the assistant</h2>
      {error && <div className="alert" role="alert">{error}</div>}
      <ul className="plan-list">
        {runs.map((run) => (
          <li key={run._id} className="plan-row">
            <div className="plan-main">
              <p className="task-title">{run.question ?? run.steps[0]?.title}</p>
              <p className="task-fn">
                {run.steps.map((s) => (s.undo ? `${s.title} (${UNDO_LABEL[s.undo].toLowerCase()})` : s.title)).join(' · ')}
              </p>
              <p className="muted small">
                {when(run.createdAt)}{run.createdBy && ` · ${run.createdBy.name}`}{run.undoneAt && ' · undone'}
              </p>
              {notes[run._id] && <p className="small" role="status">{notes[run._id]}</p>}
            </div>
            {canChange && run.canUndo && (
              <button type="button" className="btn btn-outline inline sm" disabled={busy !== null} onClick={() => undo(run)}>
                {busy === run._id ? 'Undoing…' : 'Undo'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
