import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';

export default function SignIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
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
      await login({ email: form.email, password: form.password });
      navigate(location.state?.from ?? '/app', { replace: true });
    } catch (err) {
      setFields(err.fields);
      // Field messages show under the inputs; anything else (wrong password, network) goes on top.
      if (Object.keys(err.fields).length === 0) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back — your wedding is waiting."
      footer={
        <p className="guest-note">Invited as a guest? Use the link your hosts sent you &mdash; no account needed.</p>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {error && <div className="alert" role="alert">{error}</div>}

        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={set('email')}
          error={fields.email}
          required
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={form.password}
          onChange={set('password')}
          error={fields.password}
          labelRight={<Link to="/forgot-password" className="small-link">Forgot?</Link>}
          required
        />

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="or"><span /><b className="mono">OR</b><span /></div>

      <Link to="/register" className="btn btn-outline">Create your wedding</Link>
    </AuthLayout>
  );
}
