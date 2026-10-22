import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import Field from '../../components/Field.jsx';
import { useWedding } from '../../layout/WeddingContext.js';
import { formatINR, paiseToRupeesInput, rupeesToPaise } from '../../lib/format.js';
import { PAID_BY, PAYMENT } from './expenseLabels.js';

const toForm = (e, categories) => ({
  vendorName: e?.vendorName ?? '',
  category: e?.category?._id ?? categories[0]?._id ?? '',
  function: e?.function?._id ?? '',
  budget: paiseToRupeesInput(e?.budgetedAmountPaise),
  actual: paiseToRupeesInput(e?.actualAmountPaise),
  paidBy: e?.paidBy ?? 'shared',
  paymentStatus: e?.paymentStatus ?? 'pending',
  dueDate: e?.dueDate ?? '',
  notes: e?.notes ?? '',
});

// Add or edit one expense, in a modal. Amounts are typed in rupees and sent as paise.
export default function ExpenseDialog({ expense, categories, functions, onClose, onSaved }) {
  const { wedding } = useWedding();
  const dialog = useRef(null);
  const [form, setForm] = useState(() => toForm(expense, categories));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const budgetPaise = rupeesToPaise(form.budget);
  const actualPaise = rupeesToPaise(form.actual);

  async function onSubmit(e) {
    e.preventDefault();
    const local = {};
    if (budgetPaise === null) local.budgetedAmountPaise = 'Enter an amount in rupees, like 180000.';
    if (actualPaise === null) local.actualAmountPaise = 'Enter an amount in rupees, like 175000.';
    if (Object.keys(local).length) {
      setFields(local);
      return;
    }

    setBusy(true);
    setError('');
    setFields({});
    const body = {
      vendorName: form.vendorName,
      category: form.category,
      function: form.function,
      budgetedAmountPaise: budgetPaise,
      actualAmountPaise: actualPaise,
      paidBy: form.paidBy,
      paymentStatus: form.paymentStatus,
      dueDate: form.dueDate,
      notes: form.notes,
    };
    try {
      if (expense) await api.updateExpense(wedding._id, expense._id, body);
      else await api.createExpense(wedding._id, body);
      onSaved();
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    try {
      await api.deleteExpense(wedding._id, expense._id);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const diff = budgetPaise !== null && actualPaise !== null && actualPaise > 0 ? actualPaise - budgetPaise : 0;

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="exp-title">
      <form onSubmit={onSubmit} noValidate>
        <div className="modal-head">
          <h2 id="exp-title">{expense ? `Edit ${expense.vendorName}` : 'Add an expense'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert" role="alert">{error}</div>}

          <Field id="exp-vendor" label="Vendor or item" placeholder="Taj Caterers" value={form.vendorName} onChange={set('vendorName')} error={fields.vendorName} autoFocus />

          <div className="grid-2">
            <div className="field">
              <label htmlFor="exp-cat">Category</label>
              <select id="exp-cat" value={form.category} onChange={set('category')}>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
              {fields.category && <p className="field-error">{fields.category}</p>}
            </div>
            <div className="field">
              <label htmlFor="exp-fn">Function</label>
              <select id="exp-fn" value={form.function} onChange={set('function')}>
                <option value="">Whole wedding</option>
                {functions.map((f) => (
                  <option key={f._id} value={f._id}>{f.name}</option>
                ))}
              </select>
              {fields.function && <p className="field-error">{fields.function}</p>}
            </div>
          </div>

          <div className="grid-2">
            <Field
              id="exp-budget"
              label="Budget (₹)"
              inputMode="decimal"
              placeholder="180000"
              value={form.budget}
              onChange={set('budget')}
              error={fields.budgetedAmountPaise}
              hint={budgetPaise ? formatINR(budgetPaise) : 'What you planned to spend.'}
            />
            <Field
              id="exp-actual"
              label="Actual cost (₹, optional)"
              inputMode="decimal"
              placeholder="175000"
              value={form.actual}
              onChange={set('actual')}
              error={fields.actualAmountPaise}
              hint={
                diff > 0
                  ? `${formatINR(diff)} over budget`
                  : diff < 0
                    ? `${formatINR(-diff)} under budget`
                    : 'What it really cost, once you know.'
              }
            />
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="exp-payer">Paid by</label>
              <select id="exp-payer" value={form.paidBy} onChange={set('paidBy')}>
                {PAID_BY.map(([k, name]) => (
                  <option key={k} value={k}>{name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="exp-status">Payment</label>
              <select id="exp-status" value={form.paymentStatus} onChange={set('paymentStatus')}>
                {Object.entries(PAYMENT).map(([k, s]) => (
                  <option key={k} value={k}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <Field id="exp-due" label="Payment due (optional)" type="date" value={form.dueDate} onChange={set('dueDate')} error={fields.dueDate} />
          <div className="field">
            <label htmlFor="exp-notes">Notes (optional)</label>
            <textarea id="exp-notes" rows={2} placeholder="50% advance paid on 10 Oct" value={form.notes} onChange={set('notes')} />
            {fields.notes && <p className="field-error">{fields.notes}</p>}
          </div>
        </div>
        <div className="modal-foot">
          {expense &&
            (confirmDelete ? (
              <span className="confirm">
                <span>Delete this expense?</span>
                <button type="button" className="btn btn-danger inline sm" disabled={busy} onClick={onDelete}>Yes, delete</button>
                <button type="button" className="btn btn-outline inline sm" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="link-button small danger" onClick={() => setConfirmDelete(true)}>Delete expense</button>
            ))}
          <span className="modal-actions">
            <button type="button" className="btn btn-outline inline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary inline" disabled={busy || categories.length === 0}>
              {busy ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
            </button>
          </span>
        </div>
      </form>
    </dialog>
  );
}
