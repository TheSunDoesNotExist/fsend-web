import { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth';
import { ThemeProvider } from './theme';
import { LangProvider, useLang } from './lang';
import Terminal from './components/Terminal';
import Auth from './screens/Auth';
import Chat from './screens/Chat';

function Shell() {
  const { user, loading } = useAuth();
  const { t } = useLang();
  if (loading) {
    return (
      <Terminal status="wait" statusText={t('connecting')}>
        <div className="empty"><span className="green">fsend</span> {t('connecting')}<span className="cursor" /></div>
      </Terminal>
    );
  }
  return user ? <Chat /> : <Auth />;
}

// Клавиатура на мобильных перекрывает вёрстку: 100vh/100% её не учитывают.
// Пишем реальную высоту видимой области в --vvh, CSS использует её как height.
function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const apply = () => {
      document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);
}

export default function App() {
  useViewportHeight();
  return (
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <div className="app">
            <Shell />
          </div>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
