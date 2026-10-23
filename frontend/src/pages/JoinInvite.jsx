import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import { coupleName, formatDateRange, formatDay, formatTime } from '../lib/format.js';
import { setLastWedding } from '../lib/lastWedding.js';

const ROLE = {
  'co-admin': {
    label: 'Co-admin',
    can: 'Plan functions, tasks, guests and the budget with the couple.',
    cannot: 'Only owners invite members, change roles or archive the wedding.',
  },
  owner: { label: 'Owner', can: 'Everything, including members and archiving.', cannot: '' },
};

// Opened from the invite email: /join/<token>. Anyone with the link can read it; accepting
// needs the invited email's account, so the page sends people to Sign in or Create account.
export default function JoinInvite() {
  const { token } = useParams();
  const { user, ready, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getMemberInvite(token)
      .then(({ invite: data }) => setInvite(data))
      .catch((err) => setLoadError(err.message));
  }, [token]);

  async function accept() {
    setBusy(true);
    setError('');
    try {
      const { wedding } = await api.acceptMemberInvite(token);
      setLastWedding(wedding._id);
      await refresh();
      navigate(`/w/${wedding._id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError('');
    try {
      await api.declineInvite(invite.wedding._id);
      await refresh();
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <AuthLayout title="Invitation not found" subtitle={loadError}>
        <Link to="/" className="btn btn-outline">Go to the homepage</Link>
      </AuthLayout>
    );
  }
  if (!invite || !ready) return <div className="splash" role="status">Loading invitation…</div>;

  const w = invite.wedding;
  const role = ROLE[invite.role] ?? ROLE['co-admin'];
  const here = `/join/${token}`;
  const signedInAsInvitee = user && user.email === invite.email;

  return (
    <AuthLayout
      title={coupleName(w)}
      subtitle={`${invite.invitedBy ? `${invite.invitedBy.name} invited you` : 'You’re invited'} to help plan the wedding.`}
    >
      <div className="join">
        <div className="join-eyebrow mono">You&rsquo;re invited to help plan</div>
        {w.dateRange && <p className="join-dates">{formatDateRange(w.dateRange)}</p>}

        <dl className="join-facts">
          <div>
            <dt>Invited email</dt>
            <dd>{invite.email}</dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd><span className="pill accent-soft">{role.label.toUpperCase()}</span></dd>
          </div>
        </dl>
        <p className="join-role">
          {role.can} {role.cannot}
        </p>

        {w.functions.length > 0 && (
          <div className="join-functions">
            <div className="join-label mono">Functions</div>
            <ul>
              {w.functions.map((f) => (
                <li key={f._id}>
                  <span className="join-fn-name">{f.name}</span>
                  <span className="muted small">
                    {formatDay(f.localDate)}
                    {f.startTime && ` · ${formatTime(f.startTime)}`}
                    {f.venue && ` · ${f.venue}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <div className="alert" role="alert">{error}</div>}

        {invite.status === 'expired' ? (
          <div className="alert" role="alert">This invitation has expired. Ask {invite.invitedBy?.name ?? 'the couple'} to send it again.</div>
        ) : invite.status === 'accepted' ? (
          signedInAsInvitee ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={accept}>Open the wedding</button>
          ) : (
            <div className="notice" role="status">
              This invitation was accepted. <Link to="/signin" state={{ from: here, email: invite.email }}>Sign in as {invite.email}</Link> to open the wedding.
            </div>
          )
        ) : !user ? (
          invite.hasAccount ? (
            <>
              <Link to="/signin" state={{ from: here, email: invite.email }} className="btn btn-primary">Sign in to accept</Link>
              <p className="join-alt">
                You already have an account with {invite.email}. Sign in with it and you&rsquo;ll come back here to accept.
              </p>
            </>
          ) : (
            <>
              <Link to="/register" state={{ from: here, email: invite.email }} className="btn btn-primary">Create your account to accept</Link>
              <p className="join-alt">
                Use {invite.email} so the invitation matches.{' '}
                <Link to="/signin" state={{ from: here, email: invite.email }}>Already have an account? Sign in</Link>
              </p>
            </>
          )
        ) : signedInAsInvitee ? (
          <div className="join-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={accept}>
              {busy ? 'Accepting…' : 'Accept invitation'}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={decline}>Decline</button>
          </div>
        ) : (
          <div className="alert" role="alert">
            <p>
              You&rsquo;re signed in as <b>{user.email}</b>, but this invitation is for <b>{invite.email}</b>.
            </p>
            <button type="button" className="btn btn-outline inline sm" onClick={logout}>Sign out and switch account</button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
