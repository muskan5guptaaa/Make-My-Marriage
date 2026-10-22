import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';
import { timezoneOptions } from '../lib/format.js';
import { setLastWedding } from '../lib/lastWedding.js';

export default function CreateWedding() {
  const { weddings, invites, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ brideName: '', groomName: '', timezone: 'Asia/Kolkata' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const { wedding } = await api.createWedding(form);
      setLastWedding(wedding._id);
      await refresh();
      navigate(`/w/${wedding._id}`, { replace: true });
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    await logout();
    navigate('/signin', { replace: true });
  }

  return (
    <AuthLayout
      title="Create your wedding"
      subtitle="You can add functions, guests and co-admins next."
      footer={
        <p className="guest-note">
          {weddings.length > 0 ? (
            <Link to="/app">Back to my wedding</Link>
          ) : (
            <button type="button" className="link-button" onClick={onSignOut}>Sign out</button>
          )}
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {invites.length > 0 && (
          <div className="notice" role="status">
            You have {invites.length === 1 ? 'an invitation' : `${invites.length} invitations`} to help plan a wedding.{' '}
            <Link to="/invites">See invitations</Link>
          </div>
        )}
        {error && <div className="alert" role="alert">{error}</div>}

        <Field
          id="brideName"
          label="Bride's name"
          placeholder="Aisha"
          value={form.brideName}
          onChange={set('brideName')}
          error={fields.brideName}
          autoFocus
          required
        />
        <Field
          id="groomName"
          label="Groom's name"
          placeholder="Rohan"
          value={form.groomName}
          onChange={set('groomName')}
          error={fields.groomName}
          required
        />

        <div className="field">
          <label htmlFor="timezone">Timezone</label>
          <select id="timezone" value={form.timezone} onChange={set('timezone')} aria-describedby="timezone-hint">
            {timezoneOptions(form.timezone).map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <p id="timezone-hint" className={fields.timezone ? 'field-error' : 'field-hint'}>
            {fields.timezone ?? 'Function dates and times are shown in this timezone.'}
          </p>
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create wedding'}
        </button>
      </form>
    </AuthLayout>
  );
}
