import { useEffect, useRef, useState } from 'react';
import api, { errText } from '../api';
import { useAuth } from '../auth';
import { THEMES, useTheme } from '../theme';
import Avatar from '../components/Avatar';
import { AVATAR_FRAMES, MESSAGE_FRAMES, ACCENTS } from '../frames';

// Модалка оформления профиля: рамка аватара, рамка сообщений, акцент.
export default function Settings({ onClose }) {
  const { user, reload } = useAuth();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef(null);
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
      setErr('Выберите файл изображения');
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
      <div className="modal" role="dialog" aria-label="Оформление профиля">
        <div className="modal-head">
          <span className="green">~/profile/appearance</span>
          <button className="btn ghost sm" onClick={onClose}>esc ×</button>
        </div>
        <div className="modal-body">
          {/* live preview */}
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
                <div className="msg-content">привет, это превью сообщения</div>
              </div>
            </div>
          </div>

          <div>
            <div className="section-title">цветовая схема</div>
            <div className="row" style={{ marginTop: 8 }}>
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  className={`chip theme-chip theme-${t.key} ${theme === t.key ? 'active' : ''}`}
                  onClick={() => chooseTheme(t.key)}
                >
                  <span className="theme-dot" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">аватар</div>
            <div className="row" style={{ marginTop: 8 }}>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseAvatar} />
              <button className="btn ghost" type="button" onClick={() => fileRef.current?.click()}>
                choose image
              </button>
              <span className="muted">{avatarFile ? avatarFile.name : 'png / jpg / webp'}</span>
            </div>
          </div>

          <div>
            <div className="section-title">рамка аватара</div>
            <div className="row" style={{ marginTop: 8 }}>
              {AVATAR_FRAMES.map((f) => (
                <button key={f.key}
                        className={`chip ${avatarFrame === f.key ? 'active' : ''}`}
                        onClick={() => setAvatarFrame(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">рамка сообщений</div>
            <div className="row" style={{ marginTop: 8 }}>
              {MESSAGE_FRAMES.map((f) => (
                <button key={f.key}
                        className={`chip ${messageFrame === f.key ? 'active' : ''}`}
                        onClick={() => setMessageFrame(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">акцентный цвет</div>
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
          {saved && <div className="ok">✓ сохранено</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={onClose}>close</button>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'saving…' : 'save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
