import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import Field from '../../components/Field.jsx';
import { useWedding } from '../../layout/WeddingContext.js';
import { formatDayShort } from '../../lib/format.js';
import { TASK_STATUS } from './taskStatus.js';

const toForm = (t) => ({
  title: t?.title ?? '',
  function: t?.function?._id ?? '',
  assignee: t?.assignee?._id ?? '',
  dueDate: t?.dueDate ?? '',
  status: t?.status ?? 'todo',
  description: t?.description ?? '',
});

// Add or edit one task, in a modal. `task` is null when adding.
export default function TaskDialog({ task, functions, members, defaults, onClose, onSaved }) {
  const { wedding } = useWedding();
  const dialog = useRef(null);
  const initial = { ...toForm(task), ...(task ? {} : defaults) };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      if (task) {
        const changes = Object.fromEntries(Object.keys(form).filter((k) => form[k] !== initial[k]).map((k) => [k, form[k]]));
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        await api.updateTask(wedding._id, task._id, changes);
      } else {
        await api.createTask(wedding._id, form);
      }
      onSaved();
    } catch (err) {
      setFields(err.fields);
      if (Object.keys(err.fields).length === 0) setError(err.message);
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    setError('');
    try {
      await api.deleteTask(wedding._id, task._id);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="task-dialog-title">
      <form onSubmit={onSubmit} noValidate>
        <div className="modal-head">
          <h2 id="task-dialog-title">{task ? 'Edit task' : 'Add a task'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert" role="alert">{error}</div>}

          <Field
            id="task-title"
            label="What needs doing"
            placeholder="Book caterer for Sangeet"
            value={form.title}
            onChange={set('title')}
            error={fields.title}
            autoFocus
          />

          <div className="grid-2">
            <div className="field">
              <label htmlFor="task-function">Function</label>
              <select id="task-function" value={form.function} onChange={set('function')} aria-invalid={fields.function ? 'true' : undefined}>
                <option value="">Whole wedding</option>
                {functions.map((f) => (
                  <option key={f._id} value={f._id}>{f.name} · {formatDayShort(f.localDate)}</option>
                ))}
              </select>
              {fields.function && <p className="field-error">{fields.function}</p>}
            </div>
            <div className="field">
              <label htmlFor="task-assignee">Assigned to</label>
              <select id="task-assignee" value={form.assignee} onChange={set('assignee')} aria-invalid={fields.assignee ? 'true' : undefined}>
                <option value="">Nobody yet</option>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>{m.name}</option>
                ))}
              </select>
              {fields.assignee && <p className="field-error">{fields.assignee}</p>}
            </div>
          </div>

          <div className="grid-2">
            <Field id="task-due" label="Due date (optional)" type="date" value={form.dueDate} onChange={set('dueDate')} error={fields.dueDate} />
            <div className="field">
              <label htmlFor="task-status">Status</label>
              <select id="task-status" value={form.status} onChange={set('status')}>
                {Object.entries(TASK_STATUS).map(([value, s]) => (
                  <option key={value} value={value}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="task-notes">Notes (optional)</label>
            <textarea
              id="task-notes"
              rows={3}
              placeholder="Get 3 quotes. Budget ₹1.8L."
              value={form.description}
              onChange={set('description')}
              aria-invalid={fields.description ? 'true' : undefined}
            />
            {fields.description && <p className="field-error">{fields.description}</p>}
          </div>

          {task?.createdBy && (
            <p className="muted small">
              Added by {task.createdBy.name}
              {task.completedAt && ` · done ${new Date(task.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
            </p>
          )}
        </div>

        <div className="modal-foot">
          {task &&
            (confirmDelete ? (
              <span className="confirm">
                <span>Delete this task?</span>
                <button type="button" className="btn btn-danger inline sm" disabled={busy} onClick={onDelete}>Yes, delete</button>
                <button type="button" className="btn btn-outline inline sm" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="link-button small danger" onClick={() => setConfirmDelete(true)}>Delete task</button>
            ))}
          <span className="modal-actions">
            <button type="button" className="btn btn-outline inline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary inline" disabled={busy}>
              {busy ? 'Saving…' : task ? 'Save changes' : 'Add task'}
            </button>
          </span>
        </div>
      </form>
    </dialog>
  );
}
