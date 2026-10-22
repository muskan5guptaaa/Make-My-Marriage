import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

function Splash() {
  return <div className="splash" role="status">Loading…</div>;
}

// Pages for signed-in people. Everyone else goes to Sign in and comes back afterwards.
export function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

// Sign in and Register skip straight to the app when already signed in.
export function GuestOnly() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (user) return <Navigate to="/app" replace />;
  return <Outlet />;
}
