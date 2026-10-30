import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useWedding } from '../../layout/WeddingContext.js';
import PlanDialog from './PlanDialog.jsx';
import TaskDialog from './TaskDialog.jsx';
import TaskRow from './TaskRow.jsx';
import { TASK_FILTERS, TASK_STATUS } from './taskStatus.js';

// The Tasks screen from the design: status chips, then one row per task.
export default function Tasks() {
  const { user } = useAuth();
  const { wedding } = useWedding();
  const canEdit = wedding.status !== 'archived';

  const [status, setStatus] = useState('all');
  const [fnFilter, setFnFilter] = useState(''); // '' all, 'none', or a function id
  const [who, setWho] = useState(''); // '' anyone, 'mine', 'none', or a user id

  const [tasks, setTasks] = useState(null);
  const [counts, setCounts] = useState(null);
  const [functions, setFunctions] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined closed, null adding, object editing
  const [planning, setPlanning] = useState(false);

  // Functions and members fill the filters and the task form.
  useEffect(() => {
    api.listFunctions(wedding._id).then(({ data }) => setFunctions(data)).catch(() => {});
    api
      .listMembers(wedding._id)
      .then(({ data }) =>
        setMembers(data.filter((m) => m.status === 'active' && m.user).map((m) => ({ _id: m.user._id, name: m.user.name }))),
      )
      .catch(() => {});
  }, [wedding._id]);

  const load = useCallback(async () => {
    try {
      const params = {
        status: status === 'all' ? '' : status,
        function: fnFilter,
        assignee: who === 'mine' ? '' : who,
        mine: who === 'mine' ? 'true' : '',
      };
      const res = await api.listTasks(wedding._id, params);
      setTasks(res.data);
      setCounts(res.meta.counts);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [wedding._id, status, fnFilter, who]);

  useEffect(() => {
    load();
  }, [load]);

  async function cycle(task) {
    setBusyId(task._id);
    try {
      await api.updateTask(wedding._id, task._id, { status: TASK_STATUS[task.status].next });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function afterSave() {
    setEditing(undefined);
    await load();
  }

  const filtered = status !== 'all' || fnFilter || who;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Tasks</h1>
        {canEdit && (
          <span className="head-actions">
            <button type="button" className="btn btn-outline inline" onClick={() => setPlanning(true)}>Plan with AI</button>
            <button type="button" className="btn btn-primary inline" onClick={() => setEditing(null)}>+ Add task</button>
          </span>
        )}
      </div>

      <div className="toolbar">
        <div className="chips static" role="group" aria-label="Filter by status">
          {TASK_FILTERS.map(([value, label]) => (
            <button key={value} type="button" className="chip big" aria-pressed={status === value} onClick={() => setStatus(value)}>
              {label}
              {counts && <span className="chip-count">{counts[value]}</span>}
            </button>
          ))}
        </div>
        <div className="toolbar-selects">
          <label className="sr-only" htmlFor="filter-function">Function</label>
          <select id="filter-function" value={fnFilter} onChange={(e) => setFnFilter(e.target.value)}>
            <option value="">All functions</option>
            {functions.map((f) => (
              <option key={f._id} value={f._id}>{f.name}</option>
            ))}
            <option value="none">Whole wedding</option>
          </select>
          <label className="sr-only" htmlFor="filter-who">Assigned to</label>
          <select id="filter-who" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Anyone</option>
            <option value="mine">My tasks</option>
            {members.filter((m) => m._id !== user._id).map((m) => (
              <option key={m._id} value={m._id}>{m.name}</option>
            ))}
            <option value="none">Nobody yet</option>
          </select>
        </div>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {tasks === null && !error ? (
        <p className="muted" role="status">Loading tasks…</p>
      ) : tasks?.length === 0 ? (
        <section className="card hero-card">
          <div className="empty">
            {filtered ? (
              <>
                <h2>No tasks match</h2>
                <p>Try another status, function or person.</p>
                <button type="button" className="btn btn-outline inline" onClick={() => { setStatus('all'); setFnFilter(''); setWho(''); }}>
                  Show all tasks
                </button>
              </>
            ) : (
              <>
                <h2>No tasks yet</h2>
                <p>Add things like &ldquo;Book caterer for Sangeet&rdquo;, give each one a due date, and assign it to someone in the family.</p>
                {canEdit && (
                  <span className="head-actions">
                    <button type="button" className="btn btn-primary inline" onClick={() => setPlanning(true)}>Draft a plan with AI</button>
                    <button type="button" className="btn btn-outline inline" onClick={() => setEditing(null)}>Add your first task</button>
                  </span>
                )}
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="card task-card">
          <ul className="task-list">
            {(tasks ?? []).map((t) => (
              <TaskRow
                key={t._id}
                task={t}
                canEdit={canEdit}
                busy={busyId === t._id}
                onCycle={() => cycle(t)}
                onOpen={canEdit ? () => setEditing(t) : undefined}
              />
            ))}
          </ul>
        </section>
      )}

      {editing !== undefined && (
        <TaskDialog
          task={editing}
          functions={functions}
          members={members}
          defaults={{
            function: fnFilter && fnFilter !== 'none' ? fnFilter : '',
            assignee: who === 'mine' ? user._id : who && who !== 'none' ? who : '',
            status: status === 'all' ? 'todo' : status,
          }}
          onClose={() => setEditing(undefined)}
          onSaved={afterSave}
        />
      )}

      {planning && (
        <PlanDialog
          functions={functions}
          onClose={() => setPlanning(false)}
          onSaved={async () => {
            setPlanning(false);
            await load();
          }}
        />
      )}
    </>
  );
}
