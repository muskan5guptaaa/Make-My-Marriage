import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';

// Opened from the emailed link: /reset-password?token=...
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      await resetPassword({ token, password });
      navigate('/app', { replace: true });
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll be signed in on this device, and signed out everywhere else.">
      {!token ? (
        <div className="alert" role="alert">
          This link is missing its token. Open the link from your email again, or <Link to="/forgot-password">ask for a new one</Link>.
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="alert" role="alert">
              {error} <Link to="/forgot-password">Ask for a new link</Link>
            </div>
          )}
          <Field
            id="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            hint="At least 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fields.password}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
