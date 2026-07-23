import { useEffect, useRef, useState } from 'react';
import api, { errText } from '../api';
import { useAuth } from '../auth';
import { THEMES, useTheme } from '../theme';
import { LANGUAGES, useLang } from '../lang';
import Avatar from '../components/Avatar';
import { AVATAR_FRAMES, MESSAGE_FRAMES, ACCENTS } from '../frames';

const DEFAULT_PREFS = {
  desktopNotifications: true,
  sounds: true,
  messagePreview: true,
  callNotifications: true,
  readReceipts: true,
  typingStatus: true,
  onlineStatus: true,
  autoImages: true,
  autoFiles: false,
  cacheLimit: '512',
};

function SettingToggle({ label, hint, checked, onChange }) {
  return (
    <label className="setting-toggle">
      <span><strong>{label}</strong><small>{hint}</small></span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

// Модалка оформления профиля: рамка аватара, рамка сообщений, акцент.
export default function Settings({ onClose }) {
  const { user, reload } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const fileRef = useRef(null);
  const [displayName, setDisplayName] = useState(user.display_name || user.username || '');
  const [email, setEmail] = useState(user.email || '');
  const [bio, setBio] = useState(user.bio || '');
  const [avatarFrame, setAvatarFrame] = useState(user.avatar_frame || 'none');
  const [messageFrame, setMessageFrame] = useState(user.message_frame || 'none');
  const [accent, setAccent] = useState(user.accent_color || '#39ff14');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const [prefs, setPrefs] = useState(() => {
    try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('fsend_preferences') || '{}') }; }
    catch { return DEFAULT_PREFS; }
  });

  useEffect(() => { localStorage.setItem('fsend_preferences', JSON.stringify(prefs)); }, [prefs]);
  const setPref = (key, value) => setPrefs((current) => ({ ...current, [key]: value }));
  const ru = lang === 'ru';

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
      fd.append('display_name', displayName.trim());
      fd.append('email', email.trim());
      fd.append('bio', bio.trim());
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
              name={displayName || user.username}
              accent={accent}
              frame={avatarFrame}
              size="lg"
              src={avatarPreview || user.avatar}
            />
            <div className="msg me" style={{ animation: 'none', opacity: 1, transform: 'none' }}>
              <div className={`msg-body msg-frame-${messageFrame}`} style={{ '--accent': accent }}>
                <div className="msg-meta">
                  <span className="ts">[12:34] </span>
                  <span className="who">{displayName || user.username}</span>
                  <span className="muted"> $ </span>
                </div>
                <div className="msg-content">{t('previewMessage')}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="section-title">{ru ? 'ник' : 'nickname'}</div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>{ru ? 'ник:' : 'name:'}</label>
              <input
                value={displayName}
                maxLength={64}
                onChange={(e) => { setDisplayName(e.target.value); setSaved(false); }}
                placeholder={ru ? 'Как вас видят другие' : 'How others see you'}
              />
            </div>
            <div className="hint muted" style={{ marginTop: 6 }}>
              ID: <span className="cyan">{user.username}</span> — {ru
                ? 'постоянный логин, не меняется. По нему вас находят друзья.'
                : 'permanent login, cannot change. Friends find you by it.'}
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
            <div className="section-title">{ru ? 'о себе' : 'bio'}</div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>{ru ? 'текст:' : 'text:'}</label>
              <input value={bio} maxLength={500} onChange={(e) => { setBio(e.target.value); setSaved(false); }} placeholder={ru ? 'Коротко о себе' : 'A short bio'} />
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

          <div className="settings-group">
            <div className="section-title">{ru ? 'уведомления' : 'notifications'}</div>
            <SettingToggle label={ru ? 'Уведомления на устройстве' : 'Device notifications'} hint={ru ? 'Новые сообщения вне открытого чата' : 'New messages outside the open chat'} checked={prefs.desktopNotifications} onChange={async (value) => {
              if (value && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
              setPref('desktopNotifications', value);
            }} />
            <SettingToggle label={ru ? 'Звуки' : 'Sounds'} hint={ru ? 'Сообщения и звонки' : 'Messages and calls'} checked={prefs.sounds} onChange={(value) => setPref('sounds', value)} />
            <SettingToggle label={ru ? 'Предпросмотр сообщений' : 'Message previews'} hint={ru ? 'Показывать текст в уведомлении' : 'Show message text in notifications'} checked={prefs.messagePreview} onChange={(value) => setPref('messagePreview', value)} />
            <SettingToggle label={ru ? 'Входящие звонки' : 'Incoming calls'} hint={ru ? 'Уведомлять о голосовых и видеозвонках' : 'Voice and video call alerts'} checked={prefs.callNotifications} onChange={(value) => setPref('callNotifications', value)} />
          </div>

          <div className="settings-group">
            <div className="section-title">{ru ? 'приватность' : 'privacy'}</div>
            <SettingToggle label={ru ? 'Отчёты о прочтении' : 'Read receipts'} hint={ru ? 'Показывать, что сообщение прочитано' : 'Let others know messages were read'} checked={prefs.readReceipts} onChange={(value) => setPref('readReceipts', value)} />
            <SettingToggle label={ru ? 'Статус набора' : 'Typing status'} hint={ru ? 'Показывать, когда вы печатаете' : 'Show when you are typing'} checked={prefs.typingStatus} onChange={(value) => setPref('typingStatus', value)} />
            <SettingToggle label={ru ? 'Статус в сети' : 'Online status'} hint={ru ? 'Показывать вашу активность контактам' : 'Share activity with contacts'} checked={prefs.onlineStatus} onChange={(value) => setPref('onlineStatus', value)} />
          </div>

          <div className="settings-group">
            <div className="section-title">{ru ? 'данные и хранилище' : 'data and storage'}</div>
            <SettingToggle label={ru ? 'Автозагрузка изображений' : 'Auto-download images'} hint={ru ? 'Загружать изображения в Wi-Fi и мобильной сети' : 'Download images on Wi-Fi and mobile'} checked={prefs.autoImages} onChange={(value) => setPref('autoImages', value)} />
            <SettingToggle label={ru ? 'Автозагрузка файлов' : 'Auto-download files'} hint={ru ? 'Может расходовать мобильный трафик' : 'May use mobile data'} checked={prefs.autoFiles} onChange={(value) => setPref('autoFiles', value)} />
            <label className="setting-select"><span>{ru ? 'Лимит кэша' : 'Cache limit'}</span><select value={prefs.cacheLimit} onChange={(e) => setPref('cacheLimit', e.target.value)}><option value="256">256 MB</option><option value="512">512 MB</option><option value="1024">1 GB</option><option value="2048">2 GB</option></select></label>
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
                  {ru ? ({ none: 'без рамки', pulse: 'пульс', gold: 'золото', neon: 'неон', holo: 'голограмма', inset: 'внутренняя', ember: 'искра' }[f.key]) : f.label}
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
                  {ru ? ({ none: 'без рамки', bracket: 'скобки', glow: 'свечение', dashed: 'пунктир', double: 'двойная', scan: 'скан-линия' }[f.key]) : f.label}
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
