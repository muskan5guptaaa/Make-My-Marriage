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

// Sign in and Register skip straight to the app when already signed in, or back to the page
// that sent them here (such as an invitation link).
export function GuestOnly() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Splash />;
  if (user) return <Navigate to={location.state?.from ?? '/app'} replace />;
  return <Outlet />;
}
