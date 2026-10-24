import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [weddings, setWeddings] = useState([]);
  const [invites, setInvites] = useState([]);
  const [guestOf, setGuestOf] = useState([]); // weddings where I am a guest
  const [ready, setReady] = useState(false);

  // Re-reads the user, their weddings and pending invites, e.g. after creating or accepting.
  const refresh = useCallback(async () => {
    const data = await api.me();
    setUser(data.user);
    setWeddings(data.weddings);
    setInvites(data.invites ?? []);
    setGuestOf(data.guestOf ?? []);
  }, []);

  // On load, ask the server who the session cookie belongs to.
  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      weddings,
      invites,
      guestOf,
      ready,
      refresh,
      async register(body) {
        await api.register(body);
        await refresh(); // a new account may already have invites waiting
      },
      async login(body) {
        await api.login(body);
        await refresh();
      },
      async resetPassword(body) {
        await api.resetPassword(body);
        await refresh();
      },
      async logout() {
        await api.logout().catch(() => {});
        setUser(null);
        setWeddings([]);
        setInvites([]);
        setGuestOf([]);
      },
    }),
    [user, weddings, invites, guestOf, ready, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
