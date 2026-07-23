import { useEffect, useState } from 'react';
import api, { errText } from '../api';
import { useAuth } from '../auth';
import { useLang } from '../lang';
import Terminal from '../components/Terminal';

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

function LatencyGraph() {
  return (
    <span className="latency-graph" aria-label="network latency">
      {[35, 28, 48, 38, 62, 46, 70].map((height, index) => (
        <i key={height} style={{ '--h': `${height}%`, '--delay': `${index * 90}ms` }} />
      ))}
    </span>
  );
}

export default function Auth() {
  const { login } = useAuth();
  const { lang, setLang, t } = useLang();
  const [tab, setTab] = useState('login');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirm, setConfirm] = useState('');
  const [invite, setInvite] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');
  const [tokenFromLink, setTokenFromLink] = useState(false);

  const reset = (next) => { setTab(next); setErr(''); setMsg(''); };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset')?.trim();
    if (!token) return;
    setResetToken(token);
    setTokenFromLink(true);
    setTab('reset');
    params.delete('reset');
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, []);

  async function doLogin(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(username.trim(), password); }
    catch (e2) { setErr(errText(e2)); }
    finally { setBusy(false); }
  }

  async function doRegister(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      await api.post('/auth/users/register/', {
        username: username.trim(), email: email.trim(), password,
        password_confirm: confirm, invite_token: invite.trim(),
      });
      reset('login'); setMsg(t('registerDone'));
    } catch (e2) { setErr(errText(e2)); }
    finally { setBusy(false); }
  }

  async function doRequestReset(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      await api.post('/auth/users/request_password_reset/', { email: resetEmail.trim() });
      setMsg(t('resetRequestDone'));
    } catch (e2) { setErr(errText(e2)); }
    finally { setBusy(false); }
  }

  async function doResetPassword(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      await api.post('/auth/users/reset_password/', {
        token: resetToken.trim(), new_password: newPassword, new_password_confirm: newConfirm,
      });
      setPassword(''); setNewPassword(''); setNewConfirm(''); setResetToken(''); setTokenFromLink(false);
      reset('login'); setMsg(t('resetDone'));
    } catch (e2) { setErr(errText(e2)); }
    finally { setBusy(false); }
  }

  const forms = {
    login: (
      <form className="form" onSubmit={doLogin}>
        <Field label={`${t('username')}:`} value={username} autoFocus
          onChange={(e) => setUsername(e.target.value)} placeholder={t('usernamePlaceholder')} />
        <Field label={`${t('password')}:`} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        <button className="tile-action primary" disabled={busy || !username || !password}>
          <span>PRIMARY ACTION</span>{busy ? t('signingIn') : `${t('signIn')}  →`}
        </button>
        <button type="button" className="tile-action secondary" onClick={() => {
          setResetEmail(''); reset('forgot');
        }}>{t('forgotPassword')}  +</button>
      </form>
    ),
    register: (
      <form className="form" onSubmit={doRegister}>
        <Field label={`${t('invite')}:`} value={invite} autoFocus onChange={(e) => setInvite(e.target.value)} placeholder={t('invitePlaceholder')} />
        <Field label={`${t('username')}:`} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('usernamePlaceholder')} />
        <Field label="email:" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Field label={`${t('password')}:`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('minPasswordPlaceholder')} />
        <Field label={`${t('confirm')}:`} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('repeatPasswordPlaceholder')} />
        <button className="tile-action primary" disabled={busy || !invite || !username || !email || !password}>
          {busy ? t('creating') : `${t('createAccount')}  →`}
        </button>
      </form>
    ),
    forgot: (
      <form className="form" onSubmit={doRequestReset}>
        <p className="hint muted">{t('resetRequestHint')}</p>
        <Field label="email:" type="email" value={resetEmail} autoFocus autoComplete="email"
          onChange={(e) => setResetEmail(e.target.value)} placeholder={t('emailPlaceholder')} />
        <button className="tile-action primary" disabled={busy || !resetEmail.trim()}>{busy ? t('sending') : `${t('sendResetLink')}  →`}</button>
        <button type="button" className="tile-action secondary" onClick={() => reset('reset')}>{t('haveResetLink')}  +</button>
      </form>
    ),
    reset: (
      <form className="form" onSubmit={doResetPassword}>
        <p className="hint muted">{tokenFromLink ? t('resetLinkHint') : t('resetHint')}</p>
        {!tokenFromLink && (
          <Field label={`${t('token')}:`} value={resetToken} autoFocus onChange={(e) => setResetToken(e.target.value)} placeholder={t('resetTokenPlaceholder')} />
        )}
        <Field label={`${t('newPassword')}:`} type="password" value={newPassword} autoFocus={tokenFromLink}
          onChange={(e) => setNewPassword(e.target.value)} placeholder={t('minPasswordPlaceholder')} />
        <Field label={`${t('confirm')}:`} type="password" value={newConfirm} onChange={(e) => setNewConfirm(e.target.value)} placeholder={t('repeatPasswordPlaceholder')} />
        <button className="tile-action primary" disabled={busy || !resetToken || !newPassword || !newConfirm}>{busy ? t('updating') : `${t('resetPassword')}  →`}</button>
      </form>
    ),
  };
  const ru = lang === 'ru';

  return (
    <Terminal status="off" statusText={t('offline')} title={ru ? 'ВХОД / АВТОРИЗАЦИЯ' : 'ENTRY / AUTH'}>
      <main className="auth-workspace">
        <section className="auth-primary tile paper">
          <div className="eyebrow">{ru ? 'ЗАЩИЩЁННАЯ СЕССИЯ / ВХОД' : 'SECURE SESSION / LOGIN'}</div>
          <h1>{ru ? 'ВОЙТИ В' : 'ENTER'}<br />FSEND</h1>
          <p className="tile-copy">{ru ? 'Приватные сообщения, локальные саммари и проверенные устройства.' : 'Private messaging with direct delivery, local-first summaries and verified devices.'}</p>
          <div className="tabs" role="tablist">
            <button className={`tab ${tab === 'login' ? 'active' : ''}`} onClick={() => reset('login')}>{t('login')}</button>
            <button className={`tab ${tab === 'register' ? 'active' : ''}`} onClick={() => reset('register')}>{t('register')}</button>
            <button className={`tab ${tab === 'forgot' || tab === 'reset' ? 'active' : ''}`} onClick={() => reset('forgot')}>{t('forgot')}</button>
            <button className="tab lang-tab" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>{lang.toUpperCase()}</button>
          </div>
          {forms[tab]}
          {err && <div className="err">! {err}</div>}
          {msg && <div className="ok">✓ {msg}</div>}
        </section>
        <aside className="auth-side">
          <section className="tile sand pair-tile">
            <div className="eyebrow">{ru ? 'НОВОЕ УСТРОЙСТВО / НЕОБЯЗАТЕЛЬНО' : 'NEW DEVICE / OPTIONAL'}</div>
            <h2>{ru ? 'ПОДКЛЮЧИТЬ ПО КОДУ' : 'PAIR WITH CODE'}</h2>
            <strong>RIV · MINT · 42</strong>
            <p className="tile-copy">{ru ? 'Откройте Fsend на другом устройстве и введите этот код.' : 'Open Fsend on another device and enter this code.'}</p>
          </section>
          <div className="status-grid">
            <section className="tile lime status-card"><div className="eyebrow">{ru ? 'БЕЗОПАСНОСТЬ' : 'SECURITY'}</div><h2>E2E</h2><span>{ru ? 'ЛОКАЛЬНЫЕ КЛЮЧИ' : 'LOCAL KEYS'}</span><span className="signal-bars"><i /><i /><i /></span></section>
            <section className="tile paper status-card network-card"><div className="eyebrow">{ru ? 'СЕТЬ' : 'NETWORK'}</div><h2>{ru ? 'ГОТОВО' : 'READY'}</h2><span>{ru ? '24 МС' : '24 MS'}</span><LatencyGraph /></section>
          </div>
        </aside>
      </main>
    </Terminal>
  );
}
