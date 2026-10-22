import { formatDayShort, initials } from '../../lib/format.js';
import { TASK_STATUS } from './taskStatus.js';

// One row from the Tasks design: status, title + function, assignee, due date.
// Clicking the status moves it to the next one; clicking the title opens the task.
export default function TaskRow({ task, canEdit, busy, onCycle, onOpen }) {
  const s = TASK_STATUS[task.status];
  const next = TASK_STATUS[s.next];
  return (
    <li className={`taskrow${task.status === 'done' ? ' is-done' : ''}`}>
      <button
        type="button"
        className={`status-pill ${task.status} as-button`}
        disabled={!canEdit || busy}
        onClick={onCycle}
        aria-label={`Status: ${s.name}. Change to ${next.name}`}
        title={canEdit ? `Mark as ${next.name}` : undefined}
      >
        {s.label}
      </button>
      <button type="button" className="task-main" onClick={onOpen} disabled={!onOpen}>
        <span className="task-title">{task.title}</span>
        <span className="task-fn">{task.function?.name ?? 'Whole wedding'}</span>
      </button>
      <span
        className={`avatar sm${task.assignee ? '' : ' faded'}`}
        title={task.assignee ? task.assignee.name : 'Unassigned'}
        aria-label={task.assignee ? `Assigned to ${task.assignee.name}` : 'Unassigned'}
      >
        {task.assignee ? initials(task.assignee.name) : '–'}
      </span>
      <span className={`task-due${task.overdue ? ' overdue' : ''}`}>
        {task.dueDate ? formatDayShort(task.dueDate) : ''}
        {task.overdue && <span className="sr-only"> (overdue)</span>}
      </span>
    </li>
  );
}
