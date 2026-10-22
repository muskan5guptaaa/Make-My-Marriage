import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [sent, setSent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      await api.forgotPassword({ email });
      setSent(true);
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link that works for 30 minutes.">
      {sent ? (
        <div className="notice" role="status">
          If that email has an account, a reset link is on its way. Check your inbox.
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {error && <div className="alert" role="alert">{error}</div>}
          <Field
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fields.email}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <div className="or"><span /><b className="mono">OR</b><span /></div>
      <Link to="/signin" className="btn btn-outline">Back to sign in</Link>
    </AuthLayout>
  );
}
