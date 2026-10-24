import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { coupleName, formatDateRange, formatDay, formatTime } from '../../lib/format.js';
import { MEALS } from '../guests/guestLabels.js';
import PortalPhotos from './PortalPhotos.jsx';
import './portal.css';

// The page a guest opens from their private link (/i/<token>). No account: the link is the
// key. It shows only their invitations, and they answer once per function.
export default function GuestPortal() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const { user } = useAuth(); // signing in or out changes what the photos section shows

  useEffect(() => {
    api
      .getPortal(token)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token, user?._id]);

  if (error) {
    return (
      <div className="gp">
        <main className="gp-wrap gp-center">
          <span className="gp-mark">M</span>
          <h1 className="gp-title small">This link isn&rsquo;t working</h1>
          <p className="gp-muted">{error}</p>
        </main>
      </div>
    );
  }
  if (!data) return <div className="gp gp-loading" role="status">Opening your invitation…</div>;

  const { wedding, guest, functions } = data;
  const first = guest.name.split(' ')[0];

  return (
    <div className="gp">
      <main className="gp-wrap">
        <header className="gp-head">
          <div className="gp-eyebrow mono">You&rsquo;re invited</div>
          <h1 className="gp-title">{coupleName(wedding)}</h1>
          <p className="gp-sub">
            are getting married{wedding.dateRange ? ` · ${formatDateRange(wedding.dateRange)}` : ''}
          </p>
          <p className="gp-dear">
            Dear {first}, we would love to celebrate with you. Please let us know for each function below.
          </p>
        </header>

        <h2 className="gp-section mono">Your invitations</h2>
        {functions.length === 0 ? (
          <p className="gp-muted">There are no functions on your invitation yet. Please check back soon.</p>
        ) : (
          <div className="gp-cards">
            {functions.map((f) => (
              <FunctionCard
                key={f._id}
                fn={f}
                token={token}
                plusOnesAllowed={guest.plusOnesAllowed}
                onSaved={setData}
              />
            ))}
          </div>
        )}

        <PortalPhotos token={token} status={data.photos} />

        <footer className="gp-foot mono">Sent with Make My Marriage &middot; this link is just for you</footer>
      </main>
    </div>
  );
}

function FunctionCard({ fn, token, plusOnesAllowed, onSaved }) {
  const r = fn.rsvp;
  const [editing, setEditing] = useState(false);
  const [people, setPeople] = useState(r.status === 'yes' ? r.plusOnes + 1 : 1);
  const [meal, setMeal] = useState(r.mealPreference ?? '');
  const [note, setNote] = useState(r.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(status) {
    setBusy(true);
    setError('');
    try {
      const body = status === 'yes' ? { status, plusOnes: people - 1, mealPreference: meal, note } : { status, note };
      onSaved(await api.answerPortalRsvp(token, fn._id, body));
      setEditing(false);
    } catch (err) {
      setError(err.fields?.plusOnes ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  const answered = r.status !== 'pending' && !editing;
  const choosingYes = editing === 'yes';

  return (
    <article className={`gp-card${r.status === 'yes' ? ' going' : ''}`}>
      <h3 className="gp-fn">{fn.name}</h3>
      <p className="gp-line">
        {formatDay(fn.localDate)}
        {fn.startTime && ` · ${formatTime(fn.startTime)}`}
      </p>
      {(fn.venue || fn.address) && <p className="gp-line">{[fn.venue, fn.address].filter(Boolean).join(', ')}</p>}
      {fn.dressCode && <p className="gp-dress mono">Dress code &middot; {fn.dressCode}</p>}
      {fn.description && <p className="gp-desc">{fn.description}</p>}
      {fn.livestreamUrl && (
        <a className="gp-live" href={fn.livestreamUrl} target="_blank" rel="noreferrer">
          <span aria-hidden="true">&#9679;</span> Watch the livestream on YouTube
        </a>
      )}

      {error && <p className="gp-error" role="alert">{error}</p>}

      {answered ? (
        <div className="gp-answer">
          {r.status === 'yes' ? (
            <span className="gp-going mono">
              You&rsquo;re going &middot; {r.plusOnes + 1} {r.plusOnes === 0 ? 'guest' : 'guests'}
              {r.mealPreference && ` · ${r.mealPreference.toLowerCase()}`}
            </span>
          ) : (
            <span className="gp-notgoing mono">You can&rsquo;t make it</span>
          )}
          <button type="button" className="gp-link" onClick={() => setEditing(r.status === 'yes' ? 'yes' : true)}>
            Change answer
          </button>
        </div>
      ) : choosingYes ? (
        <div className="gp-form">
          <fieldset className="gp-field">
            <legend>How many of you are coming?</legend>
            <div className="gp-chips">
              {Array.from({ length: plusOnesAllowed + 1 }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" aria-pressed={people === n} onClick={() => setPeople(n)}>{n}</button>
              ))}
            </div>
            {plusOnesAllowed === 0 && <p className="gp-hint">This invitation is for you.</p>}
          </fieldset>
          <fieldset className="gp-field">
            <legend>Meal preference</legend>
            <div className="gp-chips">
              {MEALS.map((m) => (
                <button key={m} type="button" aria-pressed={meal === m} onClick={() => setMeal(meal === m ? '' : m)}>{m}</button>
              ))}
            </div>
          </fieldset>
          <label className="gp-field">
            <span className="gp-legend">A note for the couple (optional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Can’t wait!" />
          </label>
          <div className="gp-buttons">
            <button type="button" className="gp-yes" disabled={busy} onClick={() => send('yes')}>
              {busy ? 'Sending…' : 'Send my RSVP'}
            </button>
            <button type="button" className="gp-no" disabled={busy} onClick={() => setEditing(r.status === 'pending' ? false : true)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="gp-buttons">
          <button type="button" className="gp-yes" disabled={busy} onClick={() => setEditing('yes')}>Yes, I&rsquo;ll be there</button>
          <button type="button" className="gp-no" disabled={busy} onClick={() => send('no')}>
            {busy ? 'Sending…' : 'Can’t make it'}
          </button>
        </div>
      )}
    </article>
  );
}
