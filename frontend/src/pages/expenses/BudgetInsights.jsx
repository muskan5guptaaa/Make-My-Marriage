import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { formatDayShort, formatINR } from '../../lib/format.js';

// What needs attention in the budget. The facts come from code (exact, free); the AI only adds
// suggestions when asked, each naming the expenses it is about. Nothing here changes data.
export default function BudgetInsights({ weddingId, refreshKey, onOpen }) {
  const [facts, setFacts] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.expenseInsights(weddingId).then(setFacts).catch(() => setFacts(null));
  }, [weddingId, refreshKey]);

  async function suggest() {
    setBusy(true);
    setError('');
    try {
      setSuggestions((await api.suggestSavings(weddingId)).suggestions);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!facts || facts.totals.count === 0) return null;
  const { overCategories, overExpenses, duplicates, duePayments } = facts;
  const nothing = !overCategories.length && !overExpenses.length && !duplicates.length && !duePayments.length;
  const name = (line) => (
    <button type="button" className="link-button" onClick={() => onOpen(line.expenseId)}>{line.vendorName}</button>
  );

  return (
    <section className="card insights-card" aria-labelledby="insights-title">
      <div className="insights-head">
        <h2 id="insights-title" className="sub-title">Needs attention</h2>
        <button type="button" className="btn btn-outline inline sm" onClick={suggest} disabled={busy}>
          {busy ? 'Thinking…' : suggestions ? 'Suggest again' : 'Suggest where to save'}
        </button>
      </div>

      {nothing && <p className="muted small">Nothing over budget, no likely duplicates, and nothing due in the next two weeks.</p>}

      <ul className="insights-list">
        {overCategories.map((c) => (
          <li key={`c-${c.categoryId}`} className="bad">
            <b>{c.name}</b> is {formatINR(c.overPaise)} over budget ({formatINR(c.spentPaise)} spent of {formatINR(c.budgetPaise)}).
          </li>
        ))}
        {overExpenses.map((e) => (
          <li key={`e-${e.expenseId}`} className="bad">
            {name(e)} cost {formatINR(e.overPaise)} more than budgeted.
          </li>
        ))}
        {duplicates.map((d) => (
          <li key={`d-${d.lines[0].expenseId}`} className="warn">
            Possible duplicate: {d.vendorName}, {formatINR(d.amountPaise)}, entered {d.lines.length} times
            {' ('}{d.lines.map((l, i) => <span key={l.expenseId}>{i > 0 && ', '}{name(l)}</span>)}{').'}
          </li>
        ))}
        {duePayments.map((p) => (
          <li key={`p-${p.expenseId}`} className={p.overdue ? 'bad' : 'warn'}>
            {name(p)} {p.overdue ? 'was due' : 'is due'} {formatDayShort(p.dueDate)}
            {p.owedPaise > 0 ? `, ${formatINR(p.owedPaise)} still to pay` : ''}.
          </li>
        ))}
      </ul>

      {error && <div className="alert" role="alert">{error}</div>}
      {suggestions && (
        <div className="insights-ai" aria-label="Suggestions">
          <h3 className="eyebrow">Suggestions</h3>
          {suggestions.length === 0 ? (
            <p className="muted small">No suggestions: the budget looks on track.</p>
          ) : (
            <ul>
              {suggestions.map((s, i) => (
                <li key={i}>
                  {s.text}{' '}
                  <span className="muted small">
                    {s.expenses.map((e, j) => (
                      <span key={e._id}>{j > 0 && ' · '}<button type="button" className="link-button small" onClick={() => onOpen(e._id)}>{e.vendorName}</button></span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">Suggestions come from AI and can be wrong. Amounts above are worked out exactly.</p>
        </div>
      )}
    </section>
  );
}
