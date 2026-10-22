import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useWedding } from '../../layout/WeddingContext.js';

// Add, rename or delete this wedding's expense categories.
export default function CategoriesDialog({ categories, onClose, onChanged }) {
  const { wedding } = useWedding();
  const dialog = useRef(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function run(work) {
    setBusy(true);
    setError('');
    try {
      await work();
      await onChanged();
    } catch (err) {
      setError(err.fields?.name ? `${err.message}` : err.message);
    } finally {
      setBusy(false);
    }
  }

  const add = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    run(async () => {
      await api.createExpenseCategory(wedding._id, newName);
      setNewName('');
    });
  };

  const rename = (e) => {
    e.preventDefault();
    run(async () => {
      await api.renameExpenseCategory(wedding._id, renaming.id, renaming.name);
      setRenaming(null);
    });
  };

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="cat-title">
      <div className="modal-head">
        <h2 id="cat-title">Expense categories</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="modal-body">
        {error && <div className="alert" role="alert">{error}</div>}
        <ul className="cat-manage">
          {categories.map((c) => (
            <li key={c._id}>
              {renaming?.id === c._id ? (
                <form className="cat-rename" onSubmit={rename}>
                  <label className="sr-only" htmlFor={`rename-${c._id}`}>New name for {c.name}</label>
                  <input id={`rename-${c._id}`} value={renaming.name} autoFocus onChange={(e) => setRenaming({ id: c._id, name: e.target.value })} />
                  <button type="submit" className="btn btn-primary inline sm" disabled={busy || !renaming.name.trim()}>Save</button>
                  <button type="button" className="btn btn-outline inline sm" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <span className="cat-name">{c.name}</span>
                  <span className="muted small">{c.expenseCount === 0 ? 'unused' : `${c.expenseCount} expense${c.expenseCount === 1 ? '' : 's'}`}</span>
                  <span className="row-actions">
                    <button type="button" className="link-button small" disabled={busy} onClick={() => setRenaming({ id: c._id, name: c.name })}>Rename</button>
                    <button
                      type="button"
                      className="link-button small danger"
                      disabled={busy || c.expenseCount > 0}
                      title={c.expenseCount > 0 ? 'Move its expenses to another category first' : undefined}
                      onClick={() => run(() => api.deleteExpenseCategory(wedding._id, c._id))}
                    >
                      Delete
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="cat-add" onSubmit={add}>
          <label htmlFor="new-cat">Add a category</label>
          <div className="copy-link">
            <input id="new-cat" placeholder="Mehendi artist" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className="btn btn-primary inline sm" disabled={busy || !newName.trim()}>Add</button>
          </div>
        </form>
        <p className="muted small">A category with expenses can&rsquo;t be deleted until they move to another category.</p>
      </div>
      <div className="modal-foot">
        <span className="modal-actions">
          <button type="button" className="btn btn-outline inline" onClick={onClose}>Done</button>
        </span>
      </div>
    </dialog>
  );
}
