import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import CopyLink from '../components/CopyLink.jsx';
import Field from '../components/Field.jsx';
import { useWedding } from '../layout/WeddingContext.js';
import { initials } from '../lib/format.js';

const roleLabel = (m) => (m.status === 'invited' ? 'INVITED' : m.role === 'owner' ? 'OWNER' : 'CO-ADMIN');

// The Members card from the Settings design: list, invite, change role, remove, leave.
export default function MembersCard() {
  const { user, refresh } = useAuth();
  const { wedding, setWedding } = useWedding();
  const navigate = useNavigate();
  const isOwner = wedding.role === 'owner';
  const canEdit = isOwner && wedding.status !== 'archived';

  const [members, setMembers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [rowError, setRowError] = useState('');
  const [confirmId, setConfirmId] = useState(null); // member awaiting "Yes, remove"
  const [busyId, setBusyId] = useState(null);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.listMembers(wedding._id);
      setMembers(data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [wedding._id]);

  useEffect(() => {
    load();
  }, [load]);

  const isSelf = (m) => m.user?._id === user._id;

  async function changeRole(m, role) {
    setBusyId(m._id);
    setRowError('');
    try {
      await api.changeMemberRole(wedding._id, m._id, role);
      if (isSelf(m)) setWedding((await api.getWedding(wedding._id)).wedding); // my own role changed
      await load();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(m) {
    setBusyId(m._id);
    setRowError('');
    try {
      await api.removeMember(wedding._id, m._id);
      if (isSelf(m)) {
        await refresh();
        navigate('/app', { replace: true }); // I left this wedding
        return;
      }
      setConfirmId(null);
      await load();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card settings-card">
      <div className="panel-head">
        <h2>Members</h2>
        {canEdit && !showInvite && (
          <button type="button" className="btn btn-outline inline" onClick={() => setShowInvite(true)}>
            + Invite co-admin
          </button>
        )}
      </div>

      {showInvite && <InviteForm onDone={() => setShowInvite(false)} onInvited={load} />}
      {loadError && <div className="alert" role="alert">{loadError}</div>}
      {rowError && <div className="alert" role="alert">{rowError}</div>}

      {members === null && !loadError ? (
        <p className="muted" role="status">Loading members…</p>
      ) : (
        <ul className="member-list">
          {(members ?? []).map((m) => {
            const self = isSelf(m);
            const busy = busyId === m._id;
            const confirming = confirmId === m._id;
            const removeLabel = m.status === 'invited' ? 'Cancel invite' : self ? 'Leave' : 'Remove';
            const canRemove = wedding.status !== 'archived' && (isOwner || self);

            return (
              <li key={m._id}>
                <span className={`avatar${m.status === 'invited' ? ' faded' : ''}`}>
                  {initials(m.user?.name ?? m.email)}
                </span>
                <span className="member-text">
                  <span className="member-name">
                    {m.user?.name ?? m.email}
                    {self && <span className="muted"> (you)</span>}
                  </span>
                  <span className="muted">
                    {m.status === 'invited'
                      ? `Invited${m.invitedBy ? ` by ${m.invitedBy.name}` : ''} · waiting to accept`
                      : m.email}
                  </span>
                </span>
                <span className={`pill${m.status === 'invited' ? ' gold' : ''}`}>{roleLabel(m)}</span>

                {confirming ? (
                  <span className="row-actions" role="group" aria-label={`Confirm ${removeLabel.toLowerCase()}`}>
                    <button type="button" className="btn btn-danger inline sm" disabled={busy} onClick={() => remove(m)}>
                      {busy ? 'Working…' : `Yes, ${removeLabel.toLowerCase()}`}
                    </button>
                    <button type="button" className="btn btn-outline inline sm" disabled={busy} onClick={() => setConfirmId(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <span className="row-actions">
                    {canEdit && m.status === 'active' && (
                      <button
                        type="button"
                        className="link-button small"
                        disabled={busy}
                        onClick={() => changeRole(m, m.role === 'owner' ? 'co-admin' : 'owner')}
                      >
                        {m.role === 'owner' ? 'Make co-admin' : 'Make owner'}
                      </button>
                    )}
                    {canRemove && (
                      <button type="button" className="link-button small danger" disabled={busy} onClick={() => setConfirmId(m._id)}>
                        {removeLabel}
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!isOwner && <p className="muted small">Only owners can invite co-admins or change roles.</p>}
    </section>
  );
}

function InviteForm({ onDone, onInvited }) {
  const { wedding } = useWedding();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [result, setResult] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    setResult(null);
    try {
      const res = await api.inviteMember(wedding._id, { email });
      setResult({ email: res.member.email, emailSent: res.emailSent, inviteUrl: res.inviteUrl });
      setEmail('');
      onInvited();
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="invite-form" onSubmit={onSubmit} noValidate>
      {result &&
        (result.emailSent ? (
          <div className="notice" role="status">
            Invite emailed to {result.email}. They join once they accept.
          </div>
        ) : (
          <div className="warn" role="status">
            <p>
              Invite saved for <b>{result.email}</b>, but <b>no email was sent</b>. Send them this link yourself and ask
              them to sign up or sign in with that email:
            </p>
            <CopyLink url={result.inviteUrl} label="Invite link" />
          </div>
        ))}
      {error && <div className="alert" role="alert">{error}</div>}
      <Field
        id="inviteEmail"
        label="Email of the person to invite"
        type="email"
        placeholder="rekha@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fields.email}
        hint="They can plan everything except members and archiving. They don't need an account yet."
        autoFocus
      />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary inline" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Send invite'}
        </button>
        <button type="button" className="btn btn-outline inline" onClick={onDone}>Done</button>
      </div>
    </form>
  );
}
