import { useState } from 'react';
import api, { errText } from '../api';
import { useAuth } from '../auth';
import { useLang } from '../lang';
import Terminal from '../components/Terminal';

const BANNER = `   __                     _
  / _|___ ___ _ _  __ _   | |
 |  _(_-</ -_) ' \\/ _\` |  |_|
 |_| /__/\\___|_||_\\__,_|  (_)   secure shell`;

function Field({ label, ...props }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input {...props} />
    </div>
  );
}

export default function Auth() {
  const { login } = useAuth();
  const { t } = useLang();
  const [tab, setTab] = useState('login');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // поля
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [confirm, setConfirm] = useState('');
  const [invite, setInvite] = useState('');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirm, setNewConfirm] = useState('');

  const reset = (t) => { setTab(t); setErr(''); setMsg(''); };

  async function doLogin(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (e2) {
      setErr(errText(e2));
    } finally { setBusy(false); }
  }

  async function doRegister(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      await api.post('/auth/users/register/', {
        username: username.trim(),
        email: email.trim(),
        password,
        password_confirm: confirm,
        invite_token: invite.trim(),
      });
      reset('login');
      setMsg(t('registerDone'));
    } catch (e2) {
      setErr(errText(e2));
    } finally { setBusy(false); }
  }

  async function doRequestReset(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      await api.post('/auth/users/request_password_reset/', {
        identifier: resetIdentifier.trim(),
      });
      reset('reset');
      setMsg(t('resetRequestDone'));
    } catch (e2) {
      setErr(errText(e2));
    } finally { setBusy(false); }
  }

  async function doResetPassword(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      await api.post('/auth/users/reset_password/', {
        token: resetToken.trim(),
        new_password: newPassword,
        new_password_confirm: newConfirm,
      });
      setMsg(t('resetDone'));
      setPassword('');
      setNewPassword('');
      setNewConfirm('');
      reset('login');
      setMsg(t('resetDone'));
    } catch (e2) {
      setErr(errText(e2));
    } finally { setBusy(false); }
  }

  return (
    <Terminal status="off" statusText={t('offline')} title={`fsend@secure: ~/${t('login')}`}>
      <div className="auth">
        <pre className="banner">{BANNER}</pre>

        <div className="tabs">
          <span className={`tab ${tab === 'login' ? 'active' : ''}`} onClick={() => reset('login')}>{t('login')}</span>
          <span className={`tab ${tab === 'register' ? 'active' : ''}`} onClick={() => reset('register')}>{t('register')}</span>
          <span className={`tab ${tab === 'forgot' || tab === 'reset' ? 'active' : ''}`} onClick={() => reset('forgot')}>{t('forgot')}</span>
        </div>

        {tab === 'login' && (
          <form className="form" onSubmit={doLogin}>
            <Field label={`${t('username')}:`} value={username} autoFocus
                   onChange={(e) => setUsername(e.target.value)} placeholder={t('usernamePlaceholder')} />
            <Field label={`${t('password')}:`} type="password" value={password}
                   onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            <button className="btn" disabled={busy || !username || !password}>
              {busy ? t('signingIn') : t('signIn')}
            </button>
            <button type="button" className="btn ghost" onClick={() => {
              setResetIdentifier(username.trim());
              reset('forgot');
            }}>
              {t('forgotPassword')}
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form className="form" onSubmit={doRegister}>
            <Field label={`${t('invite')}:`} value={invite} autoFocus
                   onChange={(e) => setInvite(e.target.value)} placeholder={t('invitePlaceholder')} />
            <Field label={`${t('username')}:`} value={username}
                   onChange={(e) => setUsername(e.target.value)} placeholder={t('usernamePlaceholder')} />
            <Field label="email:   " type="email" value={email}
                   onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <Field label={`${t('password')}:`} type="password" value={password}
                   onChange={(e) => setPassword(e.target.value)} placeholder={t('minPasswordPlaceholder')} />
            <Field label={`${t('confirm')}:`} type="password" value={confirm}
                   onChange={(e) => setConfirm(e.target.value)} placeholder={t('repeatPasswordPlaceholder')} />
            <button className="btn" disabled={busy || !invite || !username || !email || !password}>
              {busy ? t('creating') : t('createAccount')}
            </button>
          </form>
        )}

        {tab === 'forgot' && (
          <form className="form" onSubmit={doRequestReset}>
            <p className="hint muted">{t('resetRequestHint')}</p>
            <Field label={`${t('account')}:`} value={resetIdentifier} autoFocus
                   onChange={(e) => setResetIdentifier(e.target.value)} placeholder={t('accountPlaceholder')} />
            <button className="btn" disabled={busy || !resetIdentifier.trim()}>
              {busy ? t('sending') : t('sendResetCode')}
            </button>
            <button type="button" className="btn ghost" onClick={() => reset('reset')}>
              {t('haveCode')}
            </button>
          </form>
        )}

        {tab === 'reset' && (
          <form className="form" onSubmit={doResetPassword}>
            <p className="hint muted">{t('resetHint')}</p>
            <Field label={`${t('token')}:`} value={resetToken} autoFocus
                   onChange={(e) => setResetToken(e.target.value)} placeholder={t('resetTokenPlaceholder')} />
            <Field label={`${t('newPassword')}:`} type="password" value={newPassword}
                   onChange={(e) => setNewPassword(e.target.value)} placeholder={t('minPasswordPlaceholder')} />
            <Field label={`${t('confirm')}:`} type="password" value={newConfirm}
                   onChange={(e) => setNewConfirm(e.target.value)} placeholder={t('repeatPasswordPlaceholder')} />
            <button className="btn" disabled={busy || !resetToken || !newPassword || !newConfirm}>
              {busy ? t('updating') : t('resetPassword')}
            </button>
          </form>
        )}

        {err && <div className="err">! {err}</div>}
        {msg && <div className="ok">✓ {msg}</div>}
      </div>
    </Terminal>
  );
}
