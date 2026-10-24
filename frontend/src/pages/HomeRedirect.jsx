import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { getLastWedding } from '../lib/lastWedding.js';

// After sign-in: no wedding → co-admin invitations or guest invitations if any, else create one;
// otherwise the last one opened, else the newest active one.
export default function HomeRedirect() {
  const { weddings, invites, guestOf } = useAuth();
  if (weddings.length === 0) {
    // Someone who is only a guest goes to their invitation, never the planning screens.
    if (invites.length === 0 && guestOf.length === 1) return <Navigate to={guestOf[0].path} replace />;
    return <Navigate to={invites.length > 0 || guestOf.length > 0 ? '/invites' : '/weddings/new'} replace />;
  }

  const last = getLastWedding();
  const pick =
    weddings.find((w) => w._id === last) ?? weddings.find((w) => w.status === 'active') ?? weddings[0];
  return <Navigate to={`/w/${pick._id}`} replace />;
}
