import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  DashboardIcon, ExpensesIcon, FunctionsIcon, GalleryIcon, GuestsIcon, SettingsIcon, TasksIcon,
} from '../components/icons.jsx';
import { coupleName, initials } from '../lib/format.js';
import { setLastWedding } from '../lib/lastWedding.js';
import { WeddingContext } from './WeddingContext.js';

const NAV = [
  { to: '', label: 'Dashboard', Icon: DashboardIcon, end: true },
  { to: 'functions', label: 'Functions', Icon: FunctionsIcon },
  { to: 'tasks', label: 'Tasks', Icon: TasksIcon },
  { to: 'guests', label: 'Guests', Icon: GuestsIcon },
  { to: 'expenses', label: 'Expenses', Icon: ExpensesIcon },
  { to: 'gallery', label: 'Gallery', Icon: GalleryIcon },
  { to: 'settings', label: 'Settings', Icon: SettingsIcon },
];

// The sidebar from the design, around whichever page of the wedding is open.
export default function AppShell() {
  const { weddingId } = useParams();
  const { user, weddings, invites, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', wedding: null, error: null });
  const switcher = useRef(null);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading', wedding: null, error: null });
    api
      .getWedding(weddingId)
      .then(({ wedding }) => {
        if (!alive) return;
        setState({ status: 'ready', wedding, error: null });
        setLastWedding(wedding._id);
      })
      .catch((error) => {
        if (!alive) return;
        setLastWedding(null); // don't send the next sign-in back here
        setState({ status: 'error', wedding: null, error });
      });
    return () => {
      alive = false;
    };
  }, [weddingId]);

  const ctx = useMemo(
    () => ({
      wedding: state.wedding,
      setWedding(wedding) {
        setState({ status: 'ready', wedding, error: null });
        refresh().catch(() => {});
      },
      // Re-reads the wedding, e.g. after functions change its dates.
      async reloadWedding() {
        const { wedding } = await api.getWedding(weddingId);
        setState({ status: 'ready', wedding, error: null });
      },
    }),
    [state.wedding, refresh, weddingId],
  );

  const closeSwitcher = () => switcher.current?.removeAttribute('open');

  async function onSignOut() {
    await logout();
    navigate('/signin', { replace: true });
  }

  if (state.status === 'loading') return <div className="splash" role="status">Loading…</div>;
  if (state.status === 'error') {
    return (
      <div className="placeholder">
        <div className="placeholder-card">
          <h1>Wedding not found</h1>
          <p>{state.error.message}</p>
          <Link to="/app" className="btn btn-outline">Go to my weddings</Link>
        </div>
      </div>
    );
  }

  const { wedding } = state;
  return (
    <WeddingContext.Provider value={ctx}>
      <div className="shell">
        <nav className="sidebar" aria-label="Wedding">
          <Link to="/app" className="side-logo">
            <span className="logo-mark small">M</span>
            <span className="side-logo-name">Make My<br />Marriage</span>
          </Link>

          <div className="side-label mono">Wedding</div>
          <details className="switcher" ref={switcher}>
            <summary>
              <span className="switcher-name">{coupleName(wedding)}</span>
              <span className="switcher-caret" aria-hidden="true">&#9662;</span>
            </summary>
            <ul className="switcher-menu">
              {weddings.map((w) => (
                <li key={w._id}>
                  <Link to={`/w/${w._id}`} onClick={closeSwitcher} aria-current={w._id === wedding._id ? 'true' : undefined}>
                    <span>{coupleName(w)}</span>
                    {w.status === 'archived' && <span className="pill">Archived</span>}
                  </Link>
                </li>
              ))}
              {invites.length > 0 && (
                <li>
                  <Link to="/invites" onClick={closeSwitcher} className="switcher-invites">
                    <span>Invitations</span>
                    <span className="pill accent">{invites.length}</span>
                  </Link>
                </li>
              )}
              <li>
                <Link to="/weddings/new" onClick={closeSwitcher} className="switcher-new">+ Create another wedding</Link>
              </li>
            </ul>
          </details>

          <div className="nav-links">
            {NAV.map(({ to, label, Icon, end }) => (
              <NavLink key={label} to={to} end={end} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
                <Icon />
                {label}
              </NavLink>
            ))}
          </div>

          <div className="side-user">
            <span className="avatar">{initials(user.name)}</span>
            <span className="side-user-text">
              <span className="side-user-name">{user.name}</span>
              <span className="side-user-role mono">{wedding.role === 'owner' ? 'Owner' : 'Co-admin'}</span>
            </span>
            <button type="button" className="link-button" onClick={onSignOut}>Sign out</button>
          </div>
        </nav>

        <main className="main">
          {wedding.status === 'archived' && (
            <div className="banner" role="status">
              This wedding is archived, so nothing can be changed.{' '}
              {wedding.role === 'owner' ? <Link to="settings">Restore it in Settings</Link> : 'Ask an owner to restore it.'}
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </WeddingContext.Provider>
  );
}
