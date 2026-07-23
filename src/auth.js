import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { devicePayload, tokens } from './api';
import { useTheme } from './theme';

const AuthCtx = createContext(null);
const PROFILE_SYNC_MS = 300_000;

function profileChanged(prev, next) {
  if (!prev || !next) return true;
  return prev.avatar !== next.avatar
    || prev.avatar_version !== next.avatar_version
    || prev.display_name !== next.display_name
    || prev.ui_theme !== next.ui_theme
    || prev.accent_color !== next.accent_color
    || prev.avatar_frame !== next.avatar_frame
    || prev.message_frame !== next.message_frame;
}

export function AuthProvider({ children }) {
  const { setTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!tokens.access) { setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/users/me/');
      setUser((prev) => (profileChanged(prev, data) ? data : prev));
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
    const id = setInterval(loadMe, PROFILE_SYNC_MS);
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
