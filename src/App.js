import { AuthProvider, useAuth } from './auth';
import { ThemeProvider } from './theme';
import Terminal from './components/Terminal';
import Auth from './screens/Auth';
import Chat from './screens/Chat';

function Shell() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <Terminal status="wait" statusText="booting…">
        <div className="empty"><span className="green">fsend</span> initializing<span className="cursor" /></div>
      </Terminal>
    );
  }
  return user ? <Chat /> : <Auth />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="app">
          <Shell />
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
