import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import Field from '../components/Field.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
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
      const body = { name: form.name, email: form.email, password: form.password };
      if (form.phone.trim()) body.phone = form.phone; // optional: leave it out when blank
      await register(body);
      navigate('/app', { replace: true }); // invitations if they were invited, else Create your wedding
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start planning every function in one place."
      footer={
        <p className="guest-note">Invited as a guest? Use the link your hosts sent you &mdash; no account needed.</p>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {error && <div className="alert" role="alert">{error}</div>}

        <Field
          id="name"
          label="Your name"
          autoComplete="name"
          placeholder="Aisha Sharma"
          value={form.name}
          onChange={set('name')}
          error={fields.name}
          required
        />
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
          id="phone"
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          value={form.phone}
          onChange={set('phone')}
          error={fields.phone}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          hint="At least 8 characters."
          value={form.password}
          onChange={set('password')}
          error={fields.password}
          required
        />

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="or"><span /><b className="mono">OR</b><span /></div>

      <Link to="/signin" className="btn btn-outline">I already have an account</Link>
    </AuthLayout>
  );
}
