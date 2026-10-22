import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useWedding } from '../../layout/WeddingContext.js';
import { formatINR, formatINRShort } from '../../lib/format.js';
import CategoriesDialog from './CategoriesDialog.jsx';
import ExpenseDialog from './ExpenseDialog.jsx';
import { PAID_BY, PAYMENT, paidByName } from './expenseLabels.js';

const pct = (part, whole) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0);

// The Expenses screen from the design: total budget, split by who's paying, by category, then every line.
export default function Expenses() {
  const { wedding } = useWedding();
  const canEdit = wedding.status !== 'archived';

  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [categories, setCategories] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ category: '', function: '', paymentStatus: '', paidBy: '' });
  const [editing, setEditing] = useState(undefined); // undefined closed, null adding, object editing
  const [managing, setManaging] = useState(false);

  const loadCategories = useCallback(
    () => api.listExpenseCategories(wedding._id).then(({ data }) => setCategories(data)).catch(() => {}),
    [wedding._id],
  );

  useEffect(() => {
    loadCategories();
    api.listFunctions(wedding._id).then(({ data }) => setFunctions(data)).catch(() => {});
  }, [wedding._id, loadCategories]);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api.expenseSummary(wedding._id), api.listExpenses(wedding._id, filters)]);
      setSummary(s);
      setExpenses(list.data);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [wedding._id, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const filtered = Object.values(filters).some(Boolean);

  async function afterChange() {
    setEditing(undefined);
    await Promise.all([load(), loadCategories()]);
  }

  const total = summary?.total;
  const over = total && total.actualPaise > total.budgetedPaise;
  const payerTotal = summary ? Object.values(summary.byPaidBy).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Expenses</h1>
        {canEdit && (
          <div className="head-actions">
            <button type="button" className="btn btn-outline inline" onClick={() => setManaging(true)}>Categories</button>
            <button type="button" className="btn btn-primary inline" onClick={() => setEditing(null)}>+ Add expense</button>
          </div>
        )}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {summary === null && !error ? (
        <p className="muted" role="status">Loading expenses…</p>
      ) : summary && total.count === 0 ? (
        <section className="card hero-card">
          <div className="empty">
            <h2>No expenses yet</h2>
            <p>
              Add each booking or purchase with its budget, what it actually cost, and who is paying. Totals by
              category and by side fill in as you go.
            </p>
            {canEdit && <button type="button" className="btn btn-outline inline" onClick={() => setEditing(null)}>Add your first expense</button>}
          </div>
        </section>
      ) : summary ? (
        <>
          <div className="money-cards">
            <section className="card money-card">
              <div className="stat-label mono">Total budget</div>
              <div className="money-big">
                {formatINRShort(total.actualPaise)} <span className="stat-of">spent of {formatINRShort(total.budgetedPaise)}</span>
              </div>
              <div className="bar big">
                <div className={`bar-fill${over ? ' over' : ''}`} style={{ width: `${pct(total.actualPaise, total.budgetedPaise)}%` }} />
              </div>
              <p className={`small ${over ? 'over-text' : 'muted'}`}>
                {over
                  ? `${formatINR(total.actualPaise - total.budgetedPaise)} over budget`
                  : `${formatINR(total.budgetedPaise - total.actualPaise)} left · ${total.count} expense${total.count === 1 ? '' : 's'}`}
              </p>
            </section>

            <section className="card money-card">
              <div className="stat-label mono">Split by who&rsquo;s paying</div>
              <div className="split-bar" role="img" aria-label={PAID_BY.map(([k, n]) => `${n} ${formatINR(summary.byPaidBy[k])}`).join(', ')}>
                {PAID_BY.map(([k]) => (
                  <span key={k} className={k} style={{ flexGrow: summary.byPaidBy[k] }} />
                ))}
              </div>
              <div className="legend">
                {PAID_BY.map(([k, name]) => (
                  <span key={k}>
                    <i className={`dot ${k}`} />
                    {name} {formatINRShort(summary.byPaidBy[k])}
                  </span>
                ))}
              </div>
              {payerTotal > 0 && <p className="muted small">Spent so far, or the budget where nothing is spent yet.</p>}
            </section>
          </div>

          {summary.byCategory.length > 0 && (
            <>
              <h2 className="sub-title">By category</h2>
              <section className="card cat-card">
                {summary.byCategory.map((c) => {
                  const catOver = c.actualPaise > c.budgetedPaise;
                  return (
                    <div key={c.category._id} className="cat-row">
                      <div className="cat-line">
                        <span>{c.category.name}</span>
                        <span className={catOver ? 'over-text' : 'muted'}>
                          {formatINRShort(c.actualPaise)} / {formatINRShort(c.budgetedPaise)}
                        </span>
                      </div>
                      <div className="bar">
                        <div className={`bar-fill${catOver ? ' over' : ''}`} style={{ width: `${pct(c.actualPaise, c.budgetedPaise)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </section>
            </>
          )}

          <div className="toolbar">
            <h2 className="sub-title">All expenses</h2>
            <div className="toolbar-selects">
              <label className="sr-only" htmlFor="f-cat">Category</label>
              <select id="f-cat" value={filters.category} onChange={setFilter('category')}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="f-fn">Function</label>
              <select id="f-fn" value={filters.function} onChange={setFilter('function')}>
                <option value="">All functions</option>
                {functions.map((f) => (
                  <option key={f._id} value={f._id}>{f.name}</option>
                ))}
                <option value="none">Whole wedding</option>
              </select>
              <label className="sr-only" htmlFor="f-payer">Paid by</label>
              <select id="f-payer" value={filters.paidBy} onChange={setFilter('paidBy')}>
                <option value="">Anyone paying</option>
                {PAID_BY.map(([k, name]) => (
                  <option key={k} value={k}>{name}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="f-status">Status</label>
              <select id="f-status" value={filters.paymentStatus} onChange={setFilter('paymentStatus')}>
                <option value="">Any status</option>
                {Object.entries(PAYMENT).map(([k, s]) => (
                  <option key={k} value={k}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {expenses?.length === 0 ? (
            <section className="card hero-card">
              <div className="empty">
                <h2>No expenses match</h2>
                <p>Try another category, function, payer or status.</p>
                <button type="button" className="btn btn-outline inline" onClick={() => setFilters({ category: '', function: '', paymentStatus: '', paidBy: '' })}>
                  Show all expenses
                </button>
              </div>
            </section>
          ) : (
            <section className="card table-card">
              <div className="table-scroll">
                <table className="guest-table">
                  <thead>
                    <tr>
                      <th scope="col">Vendor</th>
                      <th scope="col">Category</th>
                      <th scope="col">Function</th>
                      <th scope="col">Paid by</th>
                      <th scope="col" className="num">Amount</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(expenses ?? []).map((e) => (
                      <tr key={e._id}>
                        <td>
                          <button type="button" className="row-link" onClick={() => setEditing(e)} disabled={!canEdit}>
                            <span className="guest-name">{e.vendorName}</span>
                            {e.dueDate && e.paymentStatus !== 'paid' && <span className="guest-contact">due {e.dueDate.split('-').reverse().slice(0, 2).join('/')}</span>}
                          </button>
                        </td>
                        <td className="muted-cell">{e.category?.name ?? '—'}</td>
                        <td className="muted-cell">{e.function?.name ?? 'Whole wedding'}</td>
                        <td className="muted-cell">{paidByName(e.paidBy)}</td>
                        <td className="num">
                          <span className="mono">{formatINR(e.actualAmountPaise || e.budgetedAmountPaise)}</span>
                          {e.actualAmountPaise > 0 && e.actualAmountPaise !== e.budgetedAmountPaise && (
                            <span className={`amount-note${e.actualAmountPaise > e.budgetedAmountPaise ? ' over-text' : ''}`}>
                              budget {formatINR(e.budgetedAmountPaise)}
                            </span>
                          )}
                          {e.actualAmountPaise === 0 && <span className="amount-note">budget</span>}
                        </td>
                        <td>
                          <span className={`pay-pill ${e.paymentStatus}`}>{PAYMENT[e.paymentStatus].label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered && expenses && <p className="table-foot muted small">Showing {expenses.length} of {total.count} expenses</p>}
            </section>
          )}
        </>
      ) : null}

      {editing !== undefined && (
        <ExpenseDialog
          expense={editing}
          categories={categories}
          functions={functions}
          onClose={() => setEditing(undefined)}
          onSaved={afterChange}
        />
      )}
      {managing && (
        <CategoriesDialog
          categories={categories}
          onClose={() => setManaging(false)}
          onChanged={async () => {
            await loadCategories();
            await load();
          }}
        />
      )}
    </>
  );
}
