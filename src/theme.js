import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const THEMES = [
  { key: 'matrix', label: 'matrix', labelKey: 'themeMatrix' },
  { key: 'graphite', label: 'dark gray', labelKey: 'themeGraphite' },
  { key: 'paper', label: 'white', labelKey: 'themePaper' },
];

const STORAGE_KEY = 'fsend_theme';
const ThemeCtx = createContext(null);

function readTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return THEMES.some((t) => t.key === stored) ? stored : 'matrix';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (THEMES.some((t) => t.key === next)) setThemeState(next);
  }, []);

  const value = useMemo(() => ({
    theme,
    setTheme,
  }), [theme, setTheme]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
