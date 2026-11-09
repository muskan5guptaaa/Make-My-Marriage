import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { canListen, canSpeak, defaultVoiceLanguage, languageOfText, listen, speak, VOICE_LANGUAGES } from '../../lib/speech.js';

const MAX_TURNS = 12; // the server reads at most this many recent messages

const describe = (a) =>
  a.status === 'yes'
    ? [`Coming`, `${a.plusOnes + 1} ${a.plusOnes === 0 ? 'person' : 'people'}`, a.mealPreference, a.note && `“${a.note}”`].filter(Boolean).join(' · ')
    : ['Can’t come', a.note && `“${a.note}”`].filter(Boolean).join(' · ');

// Said after Save, in the language the guest has been using.
const SAVED = {
  en: 'Saved. Thank you! You can change any answer below at any time.',
  hi: 'सहेज लिया गया। धन्यवाद! आप नीचे कभी भी कोई भी जवाब बदल सकते हैं।',
  ta: 'சேமிக்கப்பட்டது. நன்றி! கீழே எந்தப் பதிலையும் எப்போது வேண்டுமானாலும் மாற்றலாம்.',
};

// The guest answers in their own words, typed or spoken (English, Hindi or Tamil); the AI fills
// in the RSVP and asks back if unsure. Spoken words land in the box first, so the guest can fix
// them before sending. Nothing is saved until they check the answers and press Save. The
// conversation lives only on this page and is sent with each message (the assistant's memory).
export default function RsvpChat({ token, onSaved }) {
  const [messages, setMessages] = useState([]); // { role: 'guest' | 'assistant', text }
  const [text, setText] = useState('');
  const [pending, setPending] = useState(null); // { answers, notes }
  const [busy, setBusy] = useState(null); // 'send' | 'save'
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('en'); // of the conversation, from the server
  const [voiceLang, setVoiceLang] = useState(defaultVoiceLanguage);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState(''); // words while still speaking
  const stopListening = useRef(null);
  const voice = canListen();

  useEffect(() => () => stopListening.current?.(), []);

  function toggleMic() {
    if (listening) {
      stopListening.current?.();
      return;
    }
    setError('');
    setListening(true);
    stopListening.current = listen(voiceLang, {
      onInterim: setHeard,
      onText: (words) => setText((t) => (t.trim() ? `${t.trim()} ${words}` : words)),
      onError: setError,
      onEnd: () => {
        setListening(false);
        setHeard('');
      },
    });
  }

  function listenTo(reply) {
    if (!speak(reply, languageOfText(reply))) setError('This device has no voice for that language, so it can’t be read aloud.');
  }

  async function send(e) {
    e.preventDefault();
    stopListening.current?.();
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
      if (res.language) setLanguage(res.language);
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
      setMessages((list) => [...list, { role: 'assistant', text: SAVED[language] ?? SAVED.en }]);
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
      <p className="gp-line">
        Type or {voice ? 'speak' : 'write'} in English, हिन्दी or தமிழ். For example: “We’re 3 for the Sangeet, one of us is Jain. Can’t make the Haldi.”
      </p>

      {messages.length > 0 && (
        <ol className="gp-messages" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={m.role === 'guest' ? 'from-guest' : 'from-assistant'}>
              {m.text}
              {m.role === 'assistant' && canSpeak() && (
                <button type="button" className="gp-listen" aria-label="Listen to this reply" onClick={() => listenTo(m.text)}>🔊</button>
              )}
            </li>
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
          <textarea rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? 'Listening…' : 'Type your reply…'} />
        </label>
        {voice && (
          <div className="gp-voice">
            <select aria-label="Language you speak" value={voiceLang} disabled={listening} onChange={(e) => setVoiceLang(e.target.value)}>
              {VOICE_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <button type="button" className={`gp-mic${listening ? ' on' : ''}`} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Speak your reply'} disabled={busy !== null} onClick={toggleMic}>
              🎤
            </button>
          </div>
        )}
        <button type="submit" className="gp-yes" disabled={busy !== null || !text.trim()}>{busy === 'send' ? 'Sending…' : 'Send'}</button>
      </form>
      {listening && <p className="gp-hint" role="status">Listening{heard ? `: “${heard}”` : '… speak now'}</p>}
      <p className="gp-hint">
        An AI reads your message to fill in your RSVP. Nothing is saved until you press Save.
        {voice && ' Speaking uses your browser’s speech service (in Chrome, Google’s); your words appear in the box for you to check first.'}
      </p>
    </section>
  );
}
