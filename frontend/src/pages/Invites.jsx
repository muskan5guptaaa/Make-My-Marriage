import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import { coupleName } from '../lib/format.js';
import { setLastWedding } from '../lib/lastWedding.js';

// Weddings the signed-in person was invited to help plan. Invite emails link here.
export default function Invites() {
  const { user, invites, weddings, refresh } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null); // wedding id being answered
  const [error, setError] = useState('');

  async function answer(weddingId, accept) {
    setBusy(weddingId);
    setError('');
    try {
      if (accept) {
        await api.acceptInvite(weddingId);
        setLastWedding(weddingId);
        await refresh();
        navigate(`/w/${weddingId}`, { replace: true });
      } else {
        await api.declineInvite(weddingId);
        await refresh();
      }
    } catch (err) {
      setError(err.message);
      await refresh().catch(() => {});
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthLayout
      title="Invitations"
      subtitle={`Weddings you've been invited to help plan, sent to ${user.email}.`}
      footer={
        <p className="guest-note">
          {weddings.length > 0 ? <Link to="/app">Back to my wedding</Link> : <Link to="/weddings/new">Create your own wedding instead</Link>}
        </p>
      }
    >
      {error && <div className="alert" role="alert">{error}</div>}

      {invites.length === 0 ? (
        <div className="notice" role="status">
          No invitations right now. If someone invited you, check they used {user.email}.
        </div>
      ) : (
        <ul className="invite-list">
          {invites.map((inv) => (
            <li key={inv.wedding._id} className="invite">
              <div>
                <div className="invite-name">{coupleName(inv.wedding)}</div>
                <div className="muted small">
                  {inv.invitedBy ? `${inv.invitedBy.name} invited you` : 'You were invited'} as a co-admin
                </div>
              </div>
              <div className="invite-actions">
                <button
                  type="button"
                  className="btn btn-primary inline"
                  disabled={busy === inv.wedding._id}
                  onClick={() => answer(inv.wedding._id, true)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn-outline inline"
                  disabled={busy === inv.wedding._id}
                  onClick={() => answer(inv.wedding._id, false)}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AuthLayout>
  );
}
