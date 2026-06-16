import { useState } from 'react';
import api, { errText } from '../api';
import { useAuth } from '../auth';
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
      setMsg('Аккаунт создан. Теперь войдите.');
    } catch (e2) {
      setErr(errText(e2));
    } finally { setBusy(false); }
  }

  async function doRequestReset(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      const { data } = await api.post('/auth/users/request_password_reset/', {
        identifier: resetIdentifier.trim(),
      });
      reset('reset');
      setMsg(data.message || 'Если аккаунт найден, код отправлен на email.');
    } catch (e2) {
      setErr(errText(e2));
    } finally { setBusy(false); }
  }

  async function doResetPassword(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      const { data } = await api.post('/auth/users/reset_password/', {
        token: resetToken.trim(),
        new_password: newPassword,
        new_password_confirm: newConfirm,
      });
      setMsg(data.message || 'Пароль изменён. Теперь войдите.');
      setPassword('');
      setNewPassword('');
      setNewConfirm('');
      reset('login');
      setMsg(data.message || 'Пароль изменён. Теперь войдите.');
    } catch (e2) {
      setErr(errText(e2));
    } finally { setBusy(false); }
  }

  return (
    <Terminal status="off" statusText="offline" title="fsend@secure: ~/login">
      <div className="auth">
        <pre className="banner">{BANNER}</pre>

        <div className="tabs">
          <span className={`tab ${tab === 'login' ? 'active' : ''}`} onClick={() => reset('login')}>login</span>
          <span className={`tab ${tab === 'register' ? 'active' : ''}`} onClick={() => reset('register')}>register</span>
          <span className={`tab ${tab === 'forgot' || tab === 'reset' ? 'active' : ''}`} onClick={() => reset('forgot')}>forgot</span>
        </div>

        {tab === 'login' && (
          <form className="form" onSubmit={doLogin}>
            <Field label="login:   " value={username} autoFocus
                   onChange={(e) => setUsername(e.target.value)} placeholder="username" />
            <Field label="password:" type="password" value={password}
                   onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            <button className="btn" disabled={busy || !username || !password}>
              {busy ? 'authenticating…' : 'sign in'}
            </button>
            <button type="button" className="btn ghost" onClick={() => {
              setResetIdentifier(username.trim());
              reset('forgot');
            }}>
              forgot password
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form className="form" onSubmit={doRegister}>
            <Field label="invite:  " value={invite} autoFocus
                   onChange={(e) => setInvite(e.target.value)} placeholder="одноразовый инвайт-код" />
            <Field label="login:   " value={username}
                   onChange={(e) => setUsername(e.target.value)} placeholder="username" />
            <Field label="email:   " type="email" value={email}
                   onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <Field label="password:" type="password" value={password}
                   onChange={(e) => setPassword(e.target.value)} placeholder="min 8 символов" />
            <Field label="confirm: " type="password" value={confirm}
                   onChange={(e) => setConfirm(e.target.value)} placeholder="повтор пароля" />
            <button className="btn" disabled={busy || !invite || !username || !email || !password}>
              {busy ? 'creating…' : 'create account'}
            </button>
          </form>
        )}

        {tab === 'forgot' && (
          <form className="form" onSubmit={doRequestReset}>
            <p className="hint muted">Введите email или login. Если аккаунт найден, код восстановления придёт на email.</p>
            <Field label="account:" value={resetIdentifier} autoFocus
                   onChange={(e) => setResetIdentifier(e.target.value)} placeholder="username или email" />
            <button className="btn" disabled={busy || !resetIdentifier.trim()}>
              {busy ? 'sending…' : 'send reset code'}
            </button>
            <button type="button" className="btn ghost" onClick={() => reset('reset')}>
              i have a code
            </button>
          </form>
        )}

        {tab === 'reset' && (
          <form className="form" onSubmit={doResetPassword}>
            <p className="hint muted">Введите код восстановления и новый пароль.</p>
            <Field label="token:" value={resetToken} autoFocus
                   onChange={(e) => setResetToken(e.target.value)} placeholder="код восстановления" />
            <Field label="new:" type="password" value={newPassword}
                   onChange={(e) => setNewPassword(e.target.value)} placeholder="min 8 символов" />
            <Field label="confirm:" type="password" value={newConfirm}
                   onChange={(e) => setNewConfirm(e.target.value)} placeholder="повтор пароля" />
            <button className="btn" disabled={busy || !resetToken || !newPassword || !newConfirm}>
              {busy ? 'updating…' : 'reset password'}
            </button>
          </form>
        )}

        {err && <div className="err">! {err}</div>}
        {msg && <div className="ok">✓ {msg}</div>}
      </div>
    </Terminal>
  );
}
