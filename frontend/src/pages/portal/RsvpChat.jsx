import { useState } from 'react';
import { api } from '../../api.js';

const MAX_TURNS = 12; // the server reads at most this many recent messages

const describe = (a) =>
  a.status === 'yes'
    ? [`Coming`, `${a.plusOnes + 1} ${a.plusOnes === 0 ? 'person' : 'people'}`, a.mealPreference, a.note && `“${a.note}”`].filter(Boolean).join(' · ')
    : ['Can’t come', a.note && `“${a.note}”`].filter(Boolean).join(' · ');

// The guest answers in their own words; the AI fills in the RSVP and asks back if unsure.
// Nothing is saved until the guest checks the answers and presses Save. The conversation lives
// only on this page and is sent with each message, so the assistant remembers what was said.
export default function RsvpChat({ token, onSaved }) {
  const [messages, setMessages] = useState([]); // { role: 'guest' | 'assistant', text }
  const [text, setText] = useState('');
  const [pending, setPending] = useState(null); // { answers, notes }
  const [busy, setBusy] = useState(null); // 'send' | 'save'
  const [error, setError] = useState('');

  async function send(e) {
    e.preventDefault();
    const said = text.trim();
    if (!said || busy) return;
    const next = [...messages, { role: 'guest', text: said }];
    setMessages(next);
    setText('');
    setBusy('send');
    setError('');
    try {
      const res = await api.portalChat(token, next.slice(-MAX_TURNS));
      setMessages([...next, { role: 'assistant', text: res.reply }]);
      setPending(res.answers.length > 0 ? res : null);
    } catch (err) {
      setMessages(messages);
      setText(said);
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setError('');
    try {
      const answers = pending.answers.map(({ function: fn, status, plusOnes, mealPreference, note }) => ({ function: fn._id, status, plusOnes, mealPreference, note }));
      onSaved(await api.answerPortalRsvps(token, answers));
      setMessages((list) => [...list, { role: 'assistant', text: 'Saved. Thank you! You can change any answer below at any time.' }]);
      setPending(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="gp-card gp-chat" aria-label="Reply in your own words">
      <h2 className="gp-fn">Reply in your own words</h2>
      <p className="gp-line">For example: “We’re 3 for the Sangeet, one of us is Jain. Can’t make the Haldi.”</p>

      {messages.length > 0 && (
        <ol className="gp-messages" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={m.role === 'guest' ? 'from-guest' : 'from-assistant'}>{m.text}</li>
          ))}
          {busy === 'send' && <li className="from-assistant gp-muted" role="status">Reading…</li>}
        </ol>
      )}

      {pending && (
        <div className="gp-understood" aria-label="Your answers">
          <p className="gp-legend">Here’s what I understood</p>
          <ul>
            {pending.answers.map((a) => (
              <li key={a.function._id}><b>{a.function.name}</b>: {describe(a)}</li>
            ))}
          </ul>
          {pending.notes.map((n, i) => <p key={i} className="gp-hint">{n}</p>)}
          <div className="gp-buttons">
            <button type="button" className="gp-yes" disabled={busy !== null} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save these answers'}</button>
          </div>
          <p className="gp-hint">Not quite right? Just reply below to correct it.</p>
        </div>
      )}

      {error && <p className="gp-error" role="alert">{error}</p>}

      <form className="gp-chat-form" onSubmit={send}>
        <label className="gp-field">
          <span className="sr-only">Your reply</span>
          <textarea rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your reply…" />
        </label>
        <button type="submit" className="gp-yes" disabled={busy !== null || !text.trim()}>{busy === 'send' ? 'Sending…' : 'Send'}</button>
      </form>
      <p className="gp-hint">An AI reads your message to fill in your RSVP. Nothing is saved until you press Save.</p>
    </section>
  );
}
