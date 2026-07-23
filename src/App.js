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

export default function App() {
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
