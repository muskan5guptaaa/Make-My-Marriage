import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { getLastWedding } from '../lib/lastWedding.js';

// After sign-in: no wedding → invitations if any, else create one;
// otherwise the last one opened, else the newest active one.
export default function HomeRedirect() {
  const { weddings, invites } = useAuth();
  if (weddings.length === 0) return <Navigate to={invites.length > 0 ? '/invites' : '/weddings/new'} replace />;

  const last = getLastWedding();
  const pick =
    weddings.find((w) => w._id === last) ?? weddings.find((w) => w.status === 'active') ?? weddings[0];
  return <Navigate to={`/w/${pick._id}`} replace />;
}
