import { useEffect, useRef, useState } from 'react';
import api, { errText } from '../api';
import { useAuth } from '../auth';
import { THEMES, useTheme } from '../theme';
import { LANGUAGES, useLang } from '../lang';
import Avatar from '../components/Avatar';
import { AVATAR_FRAMES, MESSAGE_FRAMES, ACCENTS } from '../frames';

// Модалка оформления профиля: рамка аватара, рамка сообщений, акцент.
export default function Settings({ onClose }) {
  const { user, reload } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const fileRef = useRef(null);
  const [email, setEmail] = useState(user.email || '');
  const [avatarFrame, setAvatarFrame] = useState(user.avatar_frame || 'none');
  const [messageFrame, setMessageFrame] = useState(user.message_frame || 'none');
  const [accent, setAccent] = useState(user.accent_color || '#39ff14');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function chooseAvatar(e) {
    const file = e.target.files?.[0];
    setSaved(false);
    setErr('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarFile(null);
      setErr(t('invalidImage'));
      return;
    }
    setAvatarFile(file);
  }

  async function chooseTheme(nextTheme) {
    setTheme(nextTheme);
    setErr('');
    setSaved(false);
    try {
      await api.patch('/auth/users/update_profile/', { ui_theme: nextTheme });
      await reload();
      setSaved(true);
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function save() {
    setBusy(true); setErr(''); setSaved(false);
    try {
      const fd = new FormData();
      fd.append('email', email.trim());
      fd.append('avatar_frame', avatarFrame);
      fd.append('message_frame', messageFrame);
      fd.append('accent_color', accent);
      fd.append('ui_theme', theme);
      if (avatarFile) fd.append('avatar', avatarFile);
      await api.patch('/auth/users/update_profile/', fd);
      await reload();
      setAvatarFile(null);
      setSaved(true);
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={t('settingsTitle')}>
        <div className="modal-head">
          <span className="green">{t('settingsTitle')}</span>
          <button className="btn ghost sm" onClick={onClose}>esc x</button>
        </div>
        <div className="modal-body">
          <div className="preview-box">
            <Avatar
              name={user.username}
              accent={accent}
              frame={avatarFrame}
              size="lg"
              src={avatarPreview || user.avatar}
            />
            <div className="msg me" style={{ animation: 'none', opacity: 1, transform: 'none' }}>
              <div className={`msg-body msg-frame-${messageFrame}`} style={{ '--accent': accent }}>
                <div className="msg-meta">
                  <span className="ts">[12:34] </span>
                  <span className="who">{user.username}</span>
                  <span className="muted"> $ </span>
                </div>
                <div className="msg-content">{t('previewMessage')}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="section-title">email</div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>email:</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSaved(false);
                }}
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <div className="section-title">{t('language')}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {LANGUAGES.map((l) => (
                <button
                  key={l.key}
                  className={`chip ${lang === l.key ? 'active' : ''}`}
                  type="button"
                  onClick={() => setLang(l.key)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">{t('colorScheme')}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {THEMES.map((themeOption) => (
                <button
                  key={themeOption.key}
                  className={`chip theme-chip theme-${themeOption.key} ${theme === themeOption.key ? 'active' : ''}`}
                  onClick={() => chooseTheme(themeOption.key)}
                >
                  <span className="theme-dot" />
                  {themeOption.labelKey ? t(themeOption.labelKey) : themeOption.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">{t('avatar')}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseAvatar} />
              <button className="btn ghost" type="button" onClick={() => fileRef.current?.click()}>
                {t('chooseImage')}
              </button>
              <span className="muted">{avatarFile ? avatarFile.name : t('imageTypes')}</span>
            </div>
          </div>

          <div>
            <div className="section-title">{t('avatarFrame')}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {AVATAR_FRAMES.map((f) => (
                <button key={f.key}
                        className={`chip ${avatarFrame === f.key ? 'active' : ''}`}
                        onClick={() => setAvatarFrame(f.key)}>
                  {f.key === 'none' ? t('noFrame') : f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">{t('messageFrame')}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {MESSAGE_FRAMES.map((f) => (
                <button key={f.key}
                        className={`chip ${messageFrame === f.key ? 'active' : ''}`}
                        onClick={() => setMessageFrame(f.key)}>
                  {f.key === 'none' ? t('noFrame') : f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">{t('accentColor')}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {ACCENTS.map((c) => (
                <span key={c}
                      className={`swatch ${accent === c ? 'active' : ''}`}
                      style={{ background: c, color: c }}
                      onClick={() => setAccent(c)} />
              ))}
            </div>
          </div>

          {err && <div className="err">! {err}</div>}
          {saved && <div className="ok">✓ {t('saved')}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={onClose}>{t('close')}</button>
            <button className="btn" disabled={busy} onClick={save}>{busy ? t('saving') : t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
