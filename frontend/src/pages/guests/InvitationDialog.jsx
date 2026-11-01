import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useWedding } from '../../layout/WeddingContext.js';

const TONES = [
  { id: 'warm', label: 'Warm' },
  { id: 'formal', label: 'Formal' },
  { id: 'fun', label: 'Fun' },
];

// The couple's own invitation words, used in every invitation email and WhatsApp share.
// The AI can draft them; nothing is saved until Save.
export default function InvitationDialog({ onClose }) {
  const { wedding, setWedding } = useWedding();
  const dialog = useRef(null);
  const [tone, setTone] = useState('warm');
  const [notes, setNotes] = useState('');
  const [email, setEmail] = useState(wedding.invitation?.email ?? '');
  const [whatsapp, setWhatsapp] = useState(wedding.invitation?.whatsapp ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function draft() {
    setBusy('draft');
    setError('');
    setSaved(false);
    try {
      const { draft: words } = await api.draftInvitation(wedding._id, { tone, notes });
      setEmail(words.email);
      setWhatsapp(words.whatsapp);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy('save');
    setError('');
    try {
      const res = await api.updateWedding(wedding._id, { invitation: { email, whatsapp } });
      setWedding(res.wedding);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <dialog ref={dialog} className="modal wide" onClose={onClose} aria-labelledby="invitation-title">
      <form onSubmit={save} noValidate>
        <div className="modal-head">
          <h2 id="invitation-title">Invitation words</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          <p className="muted">
            These words go in every invitation email and WhatsApp message. Each guest’s name, their functions and their private RSVP link
            are added automatically. Leave a box empty to use the standard wording.
          </p>

          <div className="invite-ai">
            <div className="chips static" role="group" aria-label="Tone">
              {TONES.map((t) => (
                <button key={t.id} type="button" className="chip" aria-pressed={tone === t.id} onClick={() => setTone(t.id)}>{t.label}</button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="invite-notes">Anything to mention (optional)</label>
              <input id="invite-notes" maxLength={300} placeholder="A small family wedding; dhol at the Sangeet" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button type="button" className="btn btn-outline inline" onClick={draft} disabled={Boolean(busy)}>
              {busy === 'draft' ? 'Writing…' : email || whatsapp ? 'Write again with AI' : 'Write with AI'}
            </button>
          </div>

          <div className="field">
            <label htmlFor="invite-email">Email message</label>
            <textarea id="invite-email" rows={6} maxLength={1500} value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false); }} />
            <p className="muted small">Starts after “Dear (guest name),”. The guest’s functions, dates, venues and link follow.</p>
          </div>
          <div className="field">
            <label htmlFor="invite-whatsapp">WhatsApp message</label>
            <textarea id="invite-whatsapp" rows={3} maxLength={500} value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); setSaved(false); }} />
            <p className="muted small">Used by Share on WhatsApp on each guest. Their RSVP link is added at the end.</p>
          </div>

          {error && <div className="alert" role="alert">{error}</div>}
          {saved && <div className="notice" role="status">Saved. New invitations will use these words.</div>}
        </div>

        <div className="modal-foot">
          <span className="modal-actions">
            <button type="button" className="btn btn-outline inline" onClick={onClose}>Close</button>
            <button type="submit" className="btn btn-primary inline" disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          </span>
        </div>
      </form>
    </dialog>
  );
}
