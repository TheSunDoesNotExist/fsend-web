import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { devicePayload, tokens } from './api';
import { useTheme } from './theme';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const { setTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!tokens.access) { setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/users/me/');
      setUser(data);
      if (data.ui_theme) setTheme(data.ui_theme);
    } catch {
      tokens.clear();
    } finally {
      setLoading(false);
    }
  }, [setTheme]);

  useEffect(() => { loadMe(); }, [loadMe]);

  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(loadMe, 15_000);
    return () => clearInterval(id);
  }, [user, loadMe]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('fsend:logout', onLogout);
    return () => window.removeEventListener('fsend:logout', onLogout);
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/users/login/', { username, password, ...devicePayload() });
    tokens.set({ access: data.access, refresh: data.refresh });
    setUser(data.user);
    if (data.user?.ui_theme) setTheme(data.user.ui_theme);
    return data.user;
  }, [setTheme]);

  const loginWithTokens = useCallback(async ({ access, refresh, user: nextUser }) => {
    tokens.set({ access, refresh });
    if (nextUser) {
      setUser(nextUser);
      if (nextUser.ui_theme) setTheme(nextUser.ui_theme);
      return nextUser;
    }
    const { data } = await api.get('/auth/users/me/');
    setUser(data);
    if (data.ui_theme) setTheme(data.ui_theme);
    return data;
  }, [setTheme]);

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login, loginWithTokens, logout, reload: loadMe }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
