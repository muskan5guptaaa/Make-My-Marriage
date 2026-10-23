import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useWedding } from '../../layout/WeddingContext.js';

const AUDIENCES = [
  ['not-sent', 'Guests not emailed yet', 'Everyone invited to at least one function who hasn’t had their link by email.'],
  ['pending', 'Reminder: guests who haven’t answered', 'Everyone with a function still unanswered, even if they were emailed before.'],
];

// Email many guests their private links. Counts first, sends on confirm, then lists failures.
export default function EmailInvitesDialog({ onClose, onSent }) {
  const { wedding } = useWedding();
  const dialog = useRef(null);
  const [audience, setAudience] = useState('not-sent');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setResult(null);
    setError('');
    api
      .sendGuestInvitations(wedding._id, { audience, dryRun: true })
      .then((p) => alive && setPreview(p))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [wedding._id, audience]);

  async function send() {
    setBusy(true);
    setError('');
    try {
      const res = await api.sendGuestInvitations(wedding._id, { audience });
      setResult(res);
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const n = preview?.eligible ?? 0;

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="email-invites-title">
      <div className="modal-head">
        <h2 id="email-invites-title">Email invitations</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="modal-body">
        {result ? (
          <>
            <div className={result.failed.length ? 'warn' : 'notice'} role="status">
              <p>
                Sent {result.sent} invitation{result.sent === 1 ? '' : 's'}.
                {result.failed.length > 0 && ` ${result.failed.length} could not be sent.`}
              </p>
            </div>
            {result.failed.length > 0 && (
              <ul className="fail-list">
                {result.failed.map((f) => (
                  <li key={f._id}>
                    <b>{f.name}</b> <span className="muted small">{f.email}</span>
                    <span className="muted small">{f.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <fieldset className="plain audience">
              <legend className="label-like">Who to email</legend>
              {AUDIENCES.map(([value, label, hint]) => (
                <label key={value} className="radio-card">
                  <input type="radio" name="audience" value={value} checked={audience === value} onChange={() => setAudience(value)} />
                  <span>
                    <b>{label}</b>
                    <span className="muted small">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {error && <div className="alert" role="alert">{error}</div>}
            {preview === null && !error ? (
              <p className="muted" role="status">Counting guests…</p>
            ) : preview ? (
              <p className="email-count">
                {n === 0 ? 'Nobody to email right now.' : `${n} guest${n === 1 ? '' : 's'} will get an email with their own link.`}
                {preview.withoutEmail > 0 && (
                  <span className="muted small">
                    {' '}
                    {preview.withoutEmail} more {preview.withoutEmail === 1 ? 'has' : 'have'} no email address. Share
                    their links on WhatsApp from each guest.
                  </span>
                )}
              </p>
            ) : null}
          </>
        )}
      </div>
      <div className="modal-foot">
        <span className="modal-actions">
          <button type="button" className="btn btn-outline inline" onClick={onClose}>{result ? 'Done' : 'Cancel'}</button>
          {!result && (
            <button type="button" className="btn btn-primary inline" disabled={busy || n === 0} onClick={send}>
              {busy ? `Sending ${n}…` : `Send to ${n} guest${n === 1 ? '' : 's'}`}
            </button>
          )}
        </span>
      </div>
    </dialog>
  );
}
