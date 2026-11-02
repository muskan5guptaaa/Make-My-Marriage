import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

const PAGE = { createTask: 'tasks', updateTask: 'tasks', updateExpense: 'expenses', setRsvp: 'guests', updateFunction: 'functions', messageGuests: 'guests' };
export const UNDO_LABEL = { undone: 'Undone', changed: 'Kept: changed since', gone: 'Already deleted', 'not-possible': 'Sent: can’t be taken back' };

// The plan the assistant suggested, as numbered steps. Nothing is saved until the person
// applies it; then every step is saved together (or none), messages go out last, and one tap
// undoes the rest.
export default function Proposals({ weddingId, question, proposals, skipped }) {
  const [items, setItems] = useState(() => proposals.map((p) => ({ ...p, keep: true })));
  const [phase, setPhase] = useState('review'); // review · applying · applied · undoing · undone
  const [error, setError] = useState('');
  const [run, setRun] = useState(null);
  const [whatsapp, setWhatsapp] = useState([]);
  const [notes, setNotes] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  const set = (i, change) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...change } : it)));
  const kept = items.filter((it) => it.keep);
  const sends = kept.some((it) => it.cannotUndo);
  const blankMessage = kept.some((it) => it.kind === 'messageGuests' && !it.body.message.trim());

  async function apply() {
    setPhase('applying');
    setError('');
    try {
      const steps = kept.map(({ kind, ids, body, title, changes }) => ({ kind, ids, body, title, changes }));
      const res = await api.applyPlan(weddingId, { question, steps });
      setRun(res.run);
      setWhatsapp(res.whatsapp);
      setPhase('applied');
    } catch (err) {
      setError(err.message);
      setPhase('review');
    }
  }

  async function undo() {
    setPhase('undoing');
    setError('');
    try {
      const res = await api.undoAgentRun(weddingId, run._id);
      setRun(res.run);
      setNotes(res.notes);
      setPhase('undone');
    } catch (err) {
      setError(err.message);
      setPhase('applied');
    }
  }

  if (dismissed) return <p className="muted small">Suggested changes dismissed. Nothing was saved.</p>;
  const reviewing = phase === 'review' || phase === 'applying';

  return (
    <section className="ask-proposals" aria-label="Suggested changes">
      <h2 className="eyebrow">{reviewing ? 'Suggested changes' : 'Changes made'}</h2>
      {reviewing && items.length > 0 && (
        <ol className="plan-list">
          {items.map((it, i) => (
            <li key={i} className={it.keep ? 'plan-row' : 'plan-row dropped'}>
              <input
                type="checkbox"
                aria-label={`Apply ${it.title}`}
                checked={it.keep}
                disabled={phase === 'applying'}
                onChange={(e) => set(i, { keep: e.target.checked })}
              />
              <div className="plan-main">
                <p className="task-title"><span className="step-no">{i + 1}.</span> {it.title}</p>
                <p className="task-fn">{it.changes.join(' · ')}</p>
                {it.kind === 'messageGuests' && (
                  <>
                    <textarea
                      aria-label={`Message for ${it.title}`}
                      rows={3}
                      maxLength={1000}
                      value={it.body.message}
                      disabled={phase === 'applying' || !it.keep}
                      onChange={(e) => set(i, { body: { ...it.body, message: e.target.value } })}
                    />
                    <p className="muted small">Each guest is greeted by name and gets their own RSVP link. Sent last, and can’t be taken back.</p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {run && (
        <ol className="plan-list">
          {run.steps.map((s, i) => (
            <li key={i} className="plan-row">
              <div className="plan-main">
                <p className="task-title"><span className="step-no">{i + 1}.</span> {s.title}</p>
                <p className="task-fn">{s.changes.join(' · ')}</p>
                <p className="small proposal-saved">
                  {s.undo ? UNDO_LABEL[s.undo] : s.result ? `Emailed ${s.result.emailed}` : 'Saved'}
                  {s.result?.notEmailed > 0 && ` · ${s.result.notEmailed} to send on WhatsApp`}
                  {' · '}<Link to={`/w/${weddingId}/${PAGE[s.kind]}`}>View</Link>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {run && whatsapp.length > 0 && (
        <div className="ask-whatsapp">
          <p className="small">
            {whatsapp.length === 1 ? 'One guest' : `${whatsapp.length} guests`} couldn’t be emailed. Send the message on WhatsApp, already typed:
          </p>
          <ul>
            {whatsapp.map((w, i) => (
              <li key={i}>
                <a className="btn btn-outline inline sm whatsapp" href={w.url} target="_blank" rel="noreferrer">{w.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && reviewing && (
        <div className="muted small">
          <p>Left out:</p>
          <ul>{skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {error && <div className="alert" role="alert">{error}</div>}
      {notes.length > 0 && <p className="small" role="status">{notes.join(' ')}</p>}

      {reviewing && items.length > 0 && (
        <div className="ask-actions">
          <p className="muted small">
            Check each step, then apply them together{sends ? '; changes are saved before any message goes out' : ''}. Untick any you don’t want.
          </p>
          <span className="modal-actions">
            <button type="button" className="btn btn-outline inline" disabled={phase === 'applying'} onClick={() => setDismissed(true)}>Dismiss</button>
            <button type="button" className="btn btn-primary inline" disabled={phase === 'applying' || kept.length === 0 || blankMessage} onClick={apply}>
              {phase === 'applying' ? 'Applying…' : `Apply ${kept.length} change${kept.length === 1 ? '' : 's'}`}
            </button>
          </span>
        </div>
      )}
      {run?.canUndo && (
        <div className="ask-actions">
          <p className="muted small" role="status">Saved. Changed your mind?</p>
          <button type="button" className="btn btn-outline inline" disabled={phase === 'undoing'} onClick={undo}>
            {phase === 'undoing' ? 'Undoing…' : 'Undo'}
          </button>
        </div>
      )}
    </section>
  );
}
