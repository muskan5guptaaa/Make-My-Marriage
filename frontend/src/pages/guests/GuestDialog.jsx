import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import CopyLink from '../../components/CopyLink.jsx';
import Field from '../../components/Field.jsx';
import { useWedding } from '../../layout/WeddingContext.js';
import { formatDayShort } from '../../lib/format.js';
import { GROUPS, MEALS, PHOTO_ACCESS, SIDES } from './guestLabels.js';

const blank = {
  name: '',
  phone: '',
  email: '',
  side: 'bride',
  groupTag: 'family',
  invitedFunctions: [],
  plusOnesAllowed: '0',
  accommodationNeeded: false,
  photoAccess: 'none',
  travelNotes: '',
  notes: '',
};

const toForm = (g) => ({
  name: g.name,
  phone: g.phone ?? '',
  email: g.email ?? '',
  side: g.side,
  groupTag: g.groupTag,
  invitedFunctions: g.invitedFunctions.map((f) => String(f._id)),
  plusOnesAllowed: String(g.plusOnesAllowed),
  accommodationNeeded: g.accommodationNeeded,
  photoAccess: g.photoAccess ?? 'none',
  travelNotes: g.travelNotes ?? '',
  notes: g.notes ?? '',
});

const same = (a, b) => (Array.isArray(a) ? a.join() === b.join() : a === b);

// Add a guest, or see and change one: details, an RSVP per function, and their private link.
export default function GuestDialog({ guestId, functions, canEdit, onClose, onChanged, onCreated }) {
  const { wedding } = useWedding();
  const dialog = useRef(null);
  const [guest, setGuest] = useState(null);
  const [form, setForm] = useState(blank);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const load = useCallback(async () => {
    if (!guestId) return;
    try {
      const { guest: g } = await api.getGuest(wedding._id, guestId);
      setGuest(g);
      setForm(toForm(g));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, [wedding._id, guestId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (name) => (e) => {
    setSaved(false);
    setForm((f) => ({ ...f, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  };
  const toggleFunction = (id) => {
    setSaved(false);
    setForm((f) => ({
      ...f,
      invitedFunctions: f.invitedFunctions.includes(id) ? f.invitedFunctions.filter((x) => x !== id) : [...f.invitedFunctions, id],
    }));
  };

  const initial = guest ? toForm(guest) : blank;
  const changes = Object.fromEntries(Object.keys(form).filter((k) => !same(form[k], initial[k])).map((k) => [k, form[k]]));
  const dirty = Object.keys(changes).length > 0;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      if (guest) {
        if (!dirty) return;
        const res = await api.updateGuest(wedding._id, guest._id, changes);
        setGuest(res.guest);
        setForm(toForm(res.guest));
        setSaved(true);
        onChanged();
      } else {
        const res = await api.createGuest(wedding._id, form);
        onChanged();
        onCreated(res.guest._id); // stay open on the new guest, so their link can be copied
      }
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    try {
      await api.deleteGuest(wedding._id, guest._id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const title = guestId ? guest?.name ?? 'Guest' : 'Add a guest';

  return (
    <dialog ref={dialog} className="modal wide" onClose={onClose} aria-labelledby="guest-dialog-title">
      <div className="modal-head">
        <h2 id="guest-dialog-title">{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
      </div>

      <div className="modal-body">
        {loadError && <div className="alert" role="alert">{loadError}</div>}
        {guestId && !guest && !loadError && <p className="muted" role="status">Loading…</p>}

        {(!guestId || guest) && (
          <>
            {guest && (
              <LinkSection
                guest={guest}
                canEdit={canEdit}
                onChange={(link) => setGuest((g) => ({ ...g, link }))}
                onEmailed={(g) => {
                  setGuest(g);
                  onChanged();
                }}
              />
            )}
            {guest && guest.rsvps.length > 0 && <RsvpSection guest={guest} canEdit={canEdit} onSaved={(g) => { setGuest(g); onChanged(); }} />}

            <form id="guest-form" onSubmit={onSubmit} noValidate>
              <h3 className="section-title">{guest ? 'Details' : 'Who'}</h3>
              {error && <div className="alert" role="alert">{error}</div>}
              <fieldset className="plain" disabled={!canEdit || busy}>
                <Field id="g-name" label="Name" placeholder="Priya Mehta" value={form.name} onChange={set('name')} error={fields.name} autoFocus={!guest} />
                <div className="grid-2">
                  <Field id="g-phone" label="Phone (optional)" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} error={fields.phone} hint="10-digit mobile, or with country code. Saved as +91…" />
                  <Field id="g-email" label="Email (optional)" type="email" placeholder="priya@email.com" value={form.email} onChange={set('email')} error={fields.email} />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="g-side">Side</label>
                    <select id="g-side" value={form.side} onChange={set('side')}>
                      {SIDES.map(([v, label]) => (
                        <option key={v} value={v}>{v === 'both' ? 'Both' : `${label}'s side`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="g-group">Group</label>
                    <select id="g-group" value={form.groupTag} onChange={set('groupTag')}>
                      {GROUPS.map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <span className="label-like" id="g-functions-label">Invited to</span>
                  {functions.length === 0 ? (
                    <p className="field-hint">Add functions first, then choose which ones this guest is invited to.</p>
                  ) : (
                    <div className="check-grid" role="group" aria-labelledby="g-functions-label">
                      {functions.map((f) => {
                        const id = String(f._id);
                        return (
                          <label key={id} className="check">
                            <input type="checkbox" checked={form.invitedFunctions.includes(id)} onChange={() => toggleFunction(id)} />
                            <span>{f.name}</span>
                            <span className="muted small">{formatDayShort(f.localDate)}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {fields.invitedFunctions && <p className="field-error">{fields.invitedFunctions}</p>}
                </div>

                <div className="grid-2">
                  <Field
                    id="g-plus"
                    label="Plus-ones allowed"
                    type="number"
                    min="0"
                    max="10"
                    value={form.plusOnesAllowed}
                    onChange={set('plusOnesAllowed')}
                    error={fields.plusOnesAllowed}
                    hint="People they can bring, on top of themselves."
                  />
                  <div className="field">
                    <span className="label-like">Stay</span>
                    <label className="check solo">
                      <input type="checkbox" checked={form.accommodationNeeded} onChange={set('accommodationNeeded')} />
                      <span>Needs accommodation</span>
                    </label>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="g-photos">Wedding photos</label>
                  <select id="g-photos" value={form.photoAccess} onChange={set('photoAccess')} aria-describedby="g-photos-hint">
                    {PHOTO_ACCESS.map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                  <p id="g-photos-hint" className="field-hint">
                    {form.photoAccess === 'none'
                      ? 'They won’t see photos on their invitation.'
                      : form.email
                        ? `They sign in with ${form.email} to ${form.photoAccess === 'upload' ? 'see and add' : 'see'} photos.`
                        : 'Add their email above: guests sign in with it to see photos.'}
                  </p>
                </div>
                <Field id="g-travel" label="Travel notes (optional)" placeholder="Arriving 23 Oct by train" value={form.travelNotes} onChange={set('travelNotes')} error={fields.travelNotes} />
                <div className="field">
                  <label htmlFor="g-notes">Notes (optional)</label>
                  <textarea id="g-notes" rows={2} value={form.notes} onChange={set('notes')} />
                  {fields.notes && <p className="field-error">{fields.notes}</p>}
                </div>
              </fieldset>
            </form>
          </>
        )}
      </div>

      <div className="modal-foot">
        {guest && canEdit &&
          (confirmDelete ? (
            <span className="confirm">
              <span>Delete {guest.name}? Their link stops working.</span>
              <button type="button" className="btn btn-danger inline sm" disabled={busy} onClick={onDelete}>Yes, delete</button>
              <button type="button" className="btn btn-outline inline sm" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep</button>
            </span>
          ) : (
            <button type="button" className="link-button small danger" onClick={() => setConfirmDelete(true)}>Delete guest</button>
          ))}
        <span className="modal-actions">
          {saved && <span className="saved" role="status">Saved</span>}
          <button type="button" className="btn btn-outline inline" onClick={onClose}>{guest ? 'Close' : 'Cancel'}</button>
          {canEdit && (!guestId || guest) && (
            <button type="submit" form="guest-form" className="btn btn-primary inline" disabled={busy || (guest && !dirty)}>
              {busy ? 'Saving…' : guest ? 'Save details' : 'Add guest'}
            </button>
          )}
        </span>
      </div>
    </dialog>
  );
}

// The guest's private invitation link: copy it, replace it, or turn it off.
function LinkSection({ guest, canEdit, onChange, onEmailed }) {
  const { wedding } = useWedding();
  const [confirm, setConfirm] = useState(null); // 'regenerate' | 'revoke'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailNote, setEmailNote] = useState('');

  async function emailIt() {
    setBusy(true);
    setError('');
    setEmailNote('');
    try {
      const res = await api.sendGuestInvitation(wedding._id, guest._id);
      onEmailed(res.guest);
      setEmailNote(`Invitation emailed to ${guest.email}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const whatsapp = guest.link ? whatsappUrl(guest, wedding) : null;

  // Why "Email invitation" can't be used yet, shown under the button rather than only on hover.
  const emailBlocked = !guest.email
    ? 'To email the invitation, add their email address under Details below and save. Or share it on WhatsApp.'
    : guest.invitedFunctions.length === 0
      ? 'To email the invitation, tick at least one function under "Invited to" below and save. The email lists their functions.'
      : null;

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      const res = action === 'revoke' ? await api.revokeLink(wedding._id, guest._id) : await api.regenerateLink(wedding._id, guest._id);
      onChange(res.link);
      setConfirm(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dialog-section">
      <h3 className="section-title">Private invitation link</h3>
      {error && <div className="alert" role="alert">{error}</div>}
      {guest.link ? (
        <>
          <CopyLink url={guest.link.url} label={`Invitation link for ${guest.name}`} />
          <div className="share-row">
            {canEdit && (
              <button
                type="button"
                className="btn btn-primary inline sm"
                disabled={busy || Boolean(emailBlocked)}
                aria-describedby={emailBlocked ? 'email-blocked' : undefined}
                onClick={emailIt}
              >
                {busy ? 'Sending…' : guest.invitationSentAt ? 'Email again' : 'Email invitation'}
              </button>
            )}
            <a className="btn btn-outline inline sm whatsapp" href={whatsapp} target="_blank" rel="noreferrer">
              Share on WhatsApp
            </a>
          </div>
          {canEdit && emailBlocked && (
            <p id="email-blocked" className="email-blocked small">{emailBlocked}</p>
          )}
          {emailNote && <p className="saved small" role="status">{emailNote}</p>}
          <p className="muted small">
            {guest.invitationSentAt &&
              `Emailed ${new Date(guest.invitationSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. `}
            It opens only their invitations, with no login.{' '}
            {guest.link.lastUsedAt ? `Last opened ${new Date(guest.link.lastUsedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : 'Not opened yet.'}
          </p>
        </>
      ) : (
        <p className="muted small">This guest has no working link. Make a new one to send them.</p>
      )}
      {canEdit &&
        (confirm ? (
          <div className="confirm">
            <span>{confirm === 'revoke' ? 'Turn off this link? It stops working right away.' : 'Make a new link? The old one stops working.'}</span>
            <button type="button" className="btn btn-danger inline sm" disabled={busy} onClick={() => run(confirm)}>
              {confirm === 'revoke' ? 'Turn off' : 'Make new link'}
            </button>
            <button type="button" className="btn btn-outline inline sm" disabled={busy} onClick={() => setConfirm(null)}>Keep</button>
          </div>
        ) : (
          <div className="row-actions">
            {guest.link ? (
              <>
                <button type="button" className="link-button small" onClick={() => setConfirm('regenerate')}>Make a new link</button>
                <button type="button" className="link-button small danger" onClick={() => setConfirm('revoke')}>Turn off link</button>
              </>
            ) : (
              <button type="button" className="link-button small" disabled={busy} onClick={() => run('regenerate')}>Make a new link</button>
            )}
          </div>
        ))}
    </section>
  );
}

// One row per invited function. Changing the answer or plus-ones saves straight away.
function RsvpSection({ guest, canEdit, onSaved }) {
  return (
    <section className="dialog-section">
      <h3 className="section-title">RSVP</h3>
      <p className="muted small">Guests answer on their link. Record an answer here if they told you directly.</p>
      <ul className="rsvp-rows">
        {guest.rsvps.map((r) => (
          <RsvpRow key={r.function._id} guest={guest} rsvp={r} canEdit={canEdit} onSaved={onSaved} />
        ))}
      </ul>
    </section>
  );
}

function RsvpRow({ guest, rsvp, canEdit, onSaved }) {
  const { wedding } = useWedding();
  const [meal, setMeal] = useState(rsvp.mealPreference ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(patch) {
    setBusy(true);
    setError('');
    try {
      const body = { status: rsvp.status, plusOnes: rsvp.plusOnes, mealPreference: meal, ...patch };
      const res = await api.setRsvp(wedding._id, guest._id, rsvp.function._id, body);
      onSaved(res.guest);
    } catch (err) {
      setError(err.fields?.plusOnes ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  const disabled = !canEdit || busy;
  return (
    <li className="rsvp-row">
      <div className="rsvp-fn">
        <span className="rsvp-fn-name">{rsvp.function.name}</span>
        {rsvp.respondedAt && (
          <span className="muted small">answered {new Date(rsvp.respondedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        )}
        {rsvp.note && <span className="muted small">&ldquo;{rsvp.note}&rdquo;</span>}
      </div>
      <div className="segmented" role="group" aria-label={`Answer for ${rsvp.function.name}`}>
        {[
          ['yes', 'Yes'],
          ['pending', 'Pending'],
          ['no', 'No'],
        ].map(([v, label]) => (
          <button key={v} type="button" className={v} aria-pressed={rsvp.status === v} disabled={disabled} onClick={() => save({ status: v })}>
            {label}
          </button>
        ))}
      </div>
      {rsvp.status === 'yes' && (
        <div className="rsvp-extra">
          {guest.plusOnesAllowed > 0 && (
            <label className="inline-field">
              <span>Bringing</span>
              <select value={rsvp.plusOnes} disabled={disabled} onChange={(e) => save({ plusOnes: Number(e.target.value) })}>
                {Array.from({ length: guest.plusOnesAllowed + 1 }, (_, n) => (
                  <option key={n} value={n}>{n === 0 ? 'nobody' : `+${n}`}</option>
                ))}
              </select>
            </label>
          )}
          <label className="inline-field">
            <span>Meal</span>
            <input
              list="meal-options"
              value={meal}
              disabled={disabled}
              placeholder="Veg"
              onChange={(e) => setMeal(e.target.value)}
              onBlur={() => meal !== (rsvp.mealPreference ?? '') && save({})}
            />
          </label>
          <datalist id="meal-options">
            {MEALS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </li>
  );
}

// WhatsApp with the message and link already typed. With a phone number it opens that chat
// (10-digit numbers are taken as Indian, +91); without one, WhatsApp asks who to send it to.
function whatsappUrl(guest, wedding) {
  const text =
    `Dear ${guest.name}, you're invited to ${wedding.brideName} & ${wedding.groomName}'s wedding! ` +
    `See the functions and RSVP here: ${guest.link.url}`;
  let digits = (guest.phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
  const to = digits.length >= 11 ? digits : '';
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
