import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Field from '../components/Field.jsx';
import { useWedding } from '../layout/WeddingContext.js';

const SUGGESTED = ['Haldi', 'Mehendi', 'Sangeet', 'Wedding', 'Reception'];
const KEYS = ['name', 'localDate', 'startTime', 'venue', 'address', 'dressCode', 'description', 'livestreamUrl'];

const toForm = (fn) => Object.fromEntries(KEYS.map((k) => [k, fn?.[k] ?? '']));

// Add or edit one function, in a modal. `fn` is null when adding.
export default function FunctionDialog({ fn, existingNames, onClose, onSaved, onArchived }) {
  const { wedding } = useWedding();
  const dialog = useRef(null);
  const initial = toForm(fn);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const suggestions = SUGGESTED.filter((s) => !existingNames.includes(s.toLowerCase()));

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      if (fn) {
        const changes = Object.fromEntries(KEYS.filter((k) => form[k] !== initial[k]).map((k) => [k, form[k]]));
        if (Object.keys(changes).length === 0) return onClose();
        await api.updateFunction(wedding._id, fn._id, changes);
      } else {
        await api.createFunction(wedding._id, form);
      }
      onSaved();
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Archiving hides the function but keeps guests' answers, tasks, expenses and photos.
  async function onArchive() {
    setBusy(true);
    setError('');
    try {
      await api.archiveFunction(wedding._id, fn._id);
      onArchived();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="fn-dialog-title">
      <form onSubmit={onSubmit} noValidate>
        <div className="modal-head">
          <h2 id="fn-dialog-title">{fn ? `Edit ${fn.name}` : 'Add a function'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert" role="alert">{error}</div>}

          <Field id="fn-name" label="Name" placeholder="Sangeet" value={form.name} onChange={set('name')} error={fields.name} autoFocus />
          {!fn && suggestions.length > 0 && (
            <div className="chips" role="group" aria-label="Common functions">
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip" aria-pressed={form.name === s} onClick={() => setForm((f) => ({ ...f, name: s }))}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="grid-2">
            <Field id="fn-date" label="Date" type="date" value={form.localDate} onChange={set('localDate')} error={fields.localDate} />
            <Field
              id="fn-time"
              label="Start time (optional)"
              type="time"
              value={form.startTime}
              onChange={set('startTime')}
              error={fields.startTime}
              hint={`In ${wedding.timezone}`}
            />
          </div>

          <Field id="fn-venue" label="Venue (optional)" placeholder="The Grand Lawns" value={form.venue} onChange={set('venue')} error={fields.venue} />
          <Field id="fn-address" label="Address (optional)" placeholder="Tonk Road, Jaipur" value={form.address} onChange={set('address')} error={fields.address} />
          <Field
            id="fn-dress"
            label="Dress code (optional)"
            placeholder="Indo-western, gold & emerald"
            value={form.dressCode}
            onChange={set('dressCode')}
            error={fields.dressCode}
          />

          <div className="field">
            <label htmlFor="fn-description">Notes for guests (optional)</label>
            <textarea
              id="fn-description"
              rows={3}
              placeholder="Parking at Gate 2. Dinner from 8 PM."
              value={form.description}
              onChange={set('description')}
              aria-invalid={fields.description ? 'true' : undefined}
            />
            {fields.description && <p className="field-error">{fields.description}</p>}
          </div>

          <Field
            id="fn-live"
            label="YouTube livestream link (optional)"
            type="url"
            placeholder="https://youtube.com/live/…"
            value={form.livestreamUrl}
            onChange={set('livestreamUrl')}
            error={fields.livestreamUrl}
            hint="Guests watch it on their invitation page."
          />
        </div>

        <div className="modal-foot">
          {fn &&
            (confirmArchive ? (
              <span className="confirm">
                <span>Archive {fn.name}? It leaves the timeline and guest pages. You can restore it any time.</span>
                <button type="button" className="btn btn-danger inline sm" disabled={busy} onClick={onArchive}>Yes, archive</button>
                <button type="button" className="btn btn-outline inline sm" disabled={busy} onClick={() => setConfirmArchive(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="link-button small danger" onClick={() => setConfirmArchive(true)}>Archive function</button>
            ))}
          <span className="modal-actions">
            <button type="button" className="btn btn-outline inline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary inline" disabled={busy}>
              {busy ? 'Saving…' : fn ? 'Save changes' : 'Add function'}
            </button>
          </span>
        </div>
      </form>
    </dialog>
  );
}
