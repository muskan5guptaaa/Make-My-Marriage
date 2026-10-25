import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useWedding } from '../../layout/WeddingContext.js';
import Answer from './Answer.jsx';

const STARTERS = [
  'Who hasn’t replied for the next function?',
  'How many people are coming to each function?',
  'Which tasks are overdue?',
  'Are we over budget anywhere?',
  'Who needs accommodation?',
];

// Where each kind of cited record lives in the app.
const PAGE = { function: 'functions', guest: 'guests', task: 'tasks', expense: 'expenses', budget: 'expenses', album: 'gallery' };
const KIND = { function: 'Function', guest: 'Guest', task: 'Task', expense: 'Expense', budget: 'Budget', album: 'Album' };

// "Ask your wedding": questions answered from this wedding's own records, with sources.
export default function Ask() {
  const { wedding } = useWedding();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState([]); // { id, question, answer, sources, status, error }
  const [busy, setBusy] = useState(false);
  const stopper = useRef(null);
  const bottom = useRef(null);

  useEffect(() => () => stopper.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [turns.length]);

  const update = (id, change) => setTurns((list) => list.map((t) => (t.id === id ? { ...t, ...change(t) } : t)));

  async function ask(text) {
    const q = text.trim();
    if (!q || busy) return;
    const id = Date.now();
    setTurns((list) => [...list, { id, question: q, answer: '', sources: [], status: 'streaming', error: '' }]);
    setQuestion('');
    setBusy(true);
    stopper.current = new AbortController();
    try {
      const sources = await api.askWedding(wedding._id, q, {
        signal: stopper.current.signal,
        onText: (piece) => update(id, (t) => ({ answer: t.answer + piece })),
      });
      update(id, () => ({ sources, status: 'done' }));
    } catch (err) {
      if (stopper.current?.signal.aborted) update(id, () => ({ status: 'stopped' }));
      else update(id, () => ({ status: 'error', error: err.message }));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    ask(question);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(question);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Ask your wedding</h1>
          <p className="muted">
            Answers come only from your guests, functions, tasks, expenses and photo albums, with links to where each answer came from.
          </p>
        </div>
      </div>

      {turns.length === 0 && (
        <section className="card hero-card">
          <div className="empty">
            <h2>Try asking</h2>
            <div className="chips static" role="group" aria-label="Example questions">
              {STARTERS.map((s) => (
                <button key={s} type="button" className="chip big" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        </section>
      )}

      {turns.length > 0 && (
        <ol className="ask-thread" aria-live="polite">
          {turns.map((t) => (
            <li key={t.id} className="ask-turn">
              <p className="ask-question">{t.question}</p>
              <div className="card ask-answer">
                {t.answer && <Answer text={t.answer} sources={t.sources} streaming={t.status === 'streaming'} />}
                {!t.answer && t.status === 'streaming' && <p className="muted" role="status">Reading your wedding…</p>}
                {t.status === 'stopped' && <p className="muted small">Stopped.</p>}
                {t.status === 'error' && <div className="alert" role="alert">{t.error}</div>}
                {t.sources.length > 0 && (
                  <div className="ask-sources">
                    <h2 className="eyebrow">Sources</h2>
                    <ol>
                      {t.sources.map((s) => (
                        <li key={s.ref}>
                          <Link to={`/w/${wedding._id}/${PAGE[s.kind]}`}>{s.label}</Link>
                          <span className="pill">{KIND[s.kind]}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div ref={bottom} />

      <form className="ask-form card" onSubmit={onSubmit}>
        <label htmlFor="ask-question" className="sr-only">Your question</label>
        <textarea
          id="ask-question"
          rows={2}
          maxLength={500}
          placeholder="Ask about guests, RSVPs, tasks, the budget or photos…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="ask-actions">
          <p className="muted small">Phone numbers and emails are never sent to the AI. Answers can be wrong; check the sources.</p>
          {busy ? (
            <button type="button" className="btn btn-outline inline" onClick={() => stopper.current?.abort()}>Stop</button>
          ) : (
            <button type="submit" className="btn btn-primary inline" disabled={!question.trim()}>Ask</button>
          )}
        </div>
      </form>
    </>
  );
}
