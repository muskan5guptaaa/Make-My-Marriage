import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Field from '../components/Field.jsx';
import { useWedding } from '../layout/WeddingContext.js';
import { coupleName, formatDateRange, timezoneOptions } from '../lib/format.js';
import MembersCard from './MembersCard.jsx';

export default function Settings() {
  const { wedding } = useWedding();
  const isOwner = wedding.role === 'owner';

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Settings</h1>
      </div>
      {!isOwner && (
        <div className="notice role-note" role="note">
          You&rsquo;re a <b>co-admin</b>. You can plan functions, tasks, guests and the budget, and edit the wedding details.
          Only owners can invite people, change roles or archive the wedding.
        </div>
      )}
      <WeddingDetails key={wedding._id} />
      <MembersCard />
      {isOwner && <ArchiveSection />}
    </>
  );
}

function WeddingDetails() {
  const { wedding, setWedding } = useWedding();
  const archived = wedding.status === 'archived';
  const initial = { brideName: wedding.brideName, groomName: wedding.groomName, timezone: wedding.timezone };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [saved, setSaved] = useState(false);

  const set = (name) => (e) => {
    setSaved(false);
    setForm((f) => ({ ...f, [name]: e.target.value }));
  };
  const changes = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== initial[k]));
  const dirty = Object.keys(changes).length > 0;

  async function onSubmit(e) {
    e.preventDefault();
    if (!dirty) return;
    setBusy(true);
    setError('');
    setFields({});
    try {
      const res = await api.updateWedding(wedding._id, changes);
      setWedding(res.wedding);
      setSaved(true);
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card settings-card">
      <h2>Wedding details</h2>
      <form onSubmit={onSubmit} noValidate>
        {error && <div className="alert" role="alert">{error}</div>}
        <fieldset disabled={archived || busy} className="plain">
          <div className="grid-2">
            <Field id="brideName" label="Bride's name" value={form.brideName} onChange={set('brideName')} error={fields.brideName} />
            <Field id="groomName" label="Groom's name" value={form.groomName} onChange={set('groomName')} error={fields.groomName} />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="dates">Dates</label>
              <input
                id="dates"
                value={wedding.dateRange ? formatDateRange(wedding.dateRange) : 'No functions yet'}
                readOnly
                aria-describedby="dates-hint"
              />
              <p id="dates-hint" className="field-hint">From your first to your last function. Change them in Functions.</p>
            </div>
            <div className="field">
              <label htmlFor="timezone">Timezone</label>
              <select id="timezone" value={form.timezone} onChange={set('timezone')}>
                {timezoneOptions(form.timezone).map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              {fields.timezone && <p className="field-error">{fields.timezone}</p>}
            </div>
          </div>
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary inline" disabled={archived || busy || !dirty}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="saved" role="status">Saved</span>}
        </div>
      </form>
    </section>
  );
}

function ArchiveSection() {
  const { wedding, setWedding } = useWedding();
  const archived = wedding.status === 'archived';
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setConfirming(false), [archived]);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      const res = action === 'archive' ? await api.archiveWedding(wedding._id) : await api.restoreWedding(wedding._id);
      setWedding(res.wedding);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card settings-card danger">
      <h2>{archived ? 'Restore this wedding' : 'Archive this wedding'}</h2>
      <p className="muted">
        {archived
          ? 'Brings the wedding back to everyone’s dashboard so it can be edited again.'
          : 'Hides the wedding from everyone’s dashboard. Nothing is deleted, and an owner can restore it later.'}
      </p>
      {error && <div className="alert" role="alert">{error}</div>}

      {archived ? (
        <button type="button" className="btn btn-primary inline" disabled={busy} onClick={() => run('restore')}>
          {busy ? 'Restoring…' : 'Restore wedding'}
        </button>
      ) : confirming ? (
        <div className="confirm" role="group" aria-label="Confirm archive">
          <span>Archive {coupleName(wedding)}?</span>
          <button type="button" className="btn btn-danger inline" disabled={busy} onClick={() => run('archive')}>
            {busy ? 'Archiving…' : 'Yes, archive'}
          </button>
          <button type="button" className="btn btn-outline inline" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-danger-outline inline" onClick={() => setConfirming(true)}>
          Archive wedding
        </button>
      )}
    </section>
  );
}
