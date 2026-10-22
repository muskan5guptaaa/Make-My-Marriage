import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useWedding } from '../layout/WeddingContext.js';
import { addDays, formatDay, formatDayShort, formatINRShort, greeting, todayIn, todayLabel } from '../lib/format.js';
import { STATUS_LABEL } from './Functions.jsx';
import { RSVP } from './guests/guestLabels.js';
import TaskRow from './tasks/TaskRow.jsx';

const countdown = (days) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`);

// Layout of the dashboard design. The countdown and timeline come from Functions; the
// numbers fill in as Guests, Tasks and Expenses are built.
export default function Dashboard() {
  const { user } = useAuth();
  const { wedding } = useWedding();
  const first = user.name.split(' ')[0];
  const archived = wedding.status === 'archived';
  const [functions, setFunctions] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [rsvps, setRsvps] = useState(null);
  const [budget, setBudget] = useState(null);

  useEffect(() => {
    api
      .expenseSummary(wedding._id)
      .then((s) => setBudget(s.total))
      .catch(() => setBudget({ budgetedPaise: 0, actualPaise: 0, count: 0 }));
    api
      .rsvpSummary(wedding._id)
      .then(setRsvps)
      .catch(() => setRsvps({ overall: { invited: 0, yes: 0, no: 0, pending: 0, heads: 0 }, recent: [] }));
    api
      .listFunctions(wedding._id)
      .then(({ data }) => setFunctions(data))
      .catch(() => setFunctions([]));
    api
      .listTasks(wedding._id)
      .then(({ data }) => setTasks(data))
      .catch(() => setTasks([]));
  }, [wedding._id]);

  const next = functions?.find((f) => f.status === 'next');
  // Open tasks due in the next 7 days, overdue ones included.
  const weekEnd = addDays(todayIn(wedding.timezone), 6);
  const open = (tasks ?? []).filter((t) => t.status !== 'done');
  const dueThisWeek = open.filter((t) => t.dueDate && t.dueDate <= weekEnd).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow mono">{todayLabel(wedding.timezone)}</div>
          <h1 className="page-title">{greeting(wedding.timezone)}, {first}</h1>
        </div>
        {!archived && <Link to="functions" className="btn btn-primary inline">+ Add function</Link>}
      </div>

      <section className="card hero-card">
        {functions === null ? (
          <p className="muted" role="status">Loading…</p>
        ) : functions.length === 0 ? (
          <div className="empty">
            <h2>No functions yet</h2>
            <p>Add Haldi, Mehendi, Sangeet or any other function. The countdown to the next one shows here.</p>
            {!archived && <Link to="functions" className="btn btn-outline inline">Add your first function</Link>}
          </div>
        ) : (
          <>
            <div className="countdown">
              {next ? (
                <>
                  <div className="countdown-big">{countdown(next.daysLeft)}</div>
                  <div className="muted">
                    {next.daysLeft === 0 ? `${next.name} is today` : `until ${next.name}`} &middot; {formatDay(next.localDate)}
                  </div>
                </>
              ) : (
                <>
                  <div className="countdown-big">All done</div>
                  <div className="muted">Every function has happened. Congratulations!</div>
                </>
              )}
            </div>
            <div className="timeline">
              {functions.map((f) => (
                <Link key={f._id} to="functions" className={`tl-chip ${f.status}`}>
                  <span className="tl-status mono">{STATUS_LABEL[f.status]}</span>
                  <span className="tl-name">{f.name}</span>
                  <span className="tl-date">{formatDayShort(f.localDate)}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="stats">
        <Stat label="Guests invited" value={rsvps ? String(rsvps.overall.invited) : '–'} />
        <Stat label="RSVP'd yes" value={rsvps ? String(rsvps.overall.yes) : '–'} tone="good" />
        <Stat label="Tasks due this week" value={tasks === null ? '–' : String(dueThisWeek)} />
        <Link to="expenses" className="card stat stat-link">
          <div className="stat-label mono">Budget used</div>
          {budget === null ? (
            <div className="stat-value small">–</div>
          ) : budget.count === 0 ? (
            <div className="stat-value small">&#8377;0 <span className="stat-of">/ not set</span></div>
          ) : (
            <div className="stat-value small">
              {formatINRShort(budget.actualPaise)} <span className="stat-of">/ {formatINRShort(budget.budgetedPaise)}</span>
            </div>
          )}
          <div className="bar">
            <div
              className={`bar-fill${budget && budget.actualPaise > budget.budgetedPaise ? ' over' : ''}`}
              style={{ width: `${budget?.budgetedPaise ? Math.min(100, Math.round((budget.actualPaise / budget.budgetedPaise) * 100)) : 0}%` }}
            />
          </div>
        </Link>
      </div>

      <div className="panels">
        <section className="card panel wide">
          <div className="panel-head">
            <h2>Tasks</h2>
            <Link to="tasks" className="small-link">View all</Link>
          </div>
          {tasks === null ? (
            <p className="muted" role="status">Loading…</p>
          ) : open.length === 0 ? (
            <p className="muted">
              {tasks.length === 0
                ? 'No tasks yet. Add tasks like “Book caterer for Sangeet” and assign them to family.'
                : 'Every task is done.'}
            </p>
          ) : (
            <ul className="task-list">
              {open.slice(0, 4).map((t) => (
                <TaskRow key={t._id} task={t} canEdit={false} />
              ))}
            </ul>
          )}
        </section>
        <section className="card panel">
          <div className="panel-head">
            <h2>RSVPs</h2>
            <Link to="guests" className="small-link">View guests</Link>
          </div>
          {rsvps === null ? (
            <p className="muted" role="status">Loading…</p>
          ) : rsvps.overall.invited === 0 ? (
            <p className="muted">Answers from guests appear here once you add guests and send their links.</p>
          ) : (
            <>
              <div className="rsvp-bar" role="img" aria-label={`Yes ${rsvps.overall.yes}, pending ${rsvps.overall.pending}, no ${rsvps.overall.no}`}>
                <span className="yes" style={{ flexGrow: rsvps.overall.yes }} />
                <span className="pending" style={{ flexGrow: rsvps.overall.pending }} />
                <span className="no" style={{ flexGrow: rsvps.overall.no }} />
              </div>
              <div className="legend">
                <span><i className="dot yes" />Yes {rsvps.overall.yes}</span>
                <span><i className="dot pending" />Pending {rsvps.overall.pending}</span>
                <span><i className="dot no" />No {rsvps.overall.no}</span>
              </div>
              {rsvps.overall.heads > 0 && <p className="muted small">{rsvps.overall.heads} people coming, plus-ones included.</p>}
              {rsvps.recent.length > 0 && (
                <ul className="recent-list">
                  {rsvps.recent.slice(0, 3).map((g) => (
                    <li key={g._id}>
                      <span>
                        <span className="recent-name">{g.name}</span>
                        <span className="muted small">{g.functions.join(', ')}</span>
                      </span>
                      <span className={`rsvp-pill ${g.rsvpStatus}`}>{RSVP[g.rsvpStatus].label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="card stat">
      <div className="stat-label mono">{label}</div>
      <div className={`stat-value${tone ? ` ${tone}` : ''}`}>{value}</div>
    </div>
  );
}
