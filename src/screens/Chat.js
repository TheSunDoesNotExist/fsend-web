import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { devicePayload, errText } from '../api';
import { useAuth } from '../auth';
import { useLang } from '../lang';
import { useChatSocket } from '../ws';
import { API_URL } from '../config';
import Terminal from '../components/Terminal';
import Avatar from '../components/Avatar';
import Settings from './Settings';
import Admin from './Admin';

const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '--:--'
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fmtLastSeen = (iso, t) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('unknown');
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('justNow');
  if (min < 60) return t('minAgo', { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t('hourAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('dayAgo', { n: days });
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
};

const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
const ATTACH_PREFIX = 'fsend://attachment/';
const LIVE_REFRESH_MS = 15000;
const HEARTBEAT_MS = 30000;

function isThrottleError(e) {
  return e?.response?.status === 429;
}

function fileTypeOf(file) {
  const mime = file.type || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

function fileUrl(file) {
  if (!file?.file) return '';
  return file.file.startsWith('http') ? file.file : `${API_URL}${file.file}`;
}

function makeAttachmentContent(file, kind = file.file_type || 'other') {
  return `${ATTACH_PREFIX}${encodeURIComponent(JSON.stringify({
    id: file.id,
    url: fileUrl(file),
    name: file.file_name || 'file',
    kind,
    mime: file.mime_type || '',
    size: file.file_size || 0,
  }))}`;
}

function parseAttachment(c) {
  const index = typeof c === 'string' ? c.indexOf(ATTACH_PREFIX) : -1;
  if (index < 0) return null;
  try {
    let payload = c.slice(index + ATTACH_PREFIX.length);
    for (let i = 0; i < 2; i += 1) {
      const decoded = decodeURIComponent(payload);
      if (decoded === payload) break;
      payload = decoded;
    }
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function attachmentLabel(att) {
  if (!att) return '';
  if (att.kind === 'voice' || att.kind === 'audio') return 'Голосовушка';
  if (att.kind === 'video_note') return 'Кружочек';
  if (att.kind === 'video') return 'Видео';
  if (att.kind === 'image') return 'Фото';
  return att.name || 'Файл';
}

function messagePreview(content) {
  const attachment = parseAttachment(content);
  if (attachment) return attachmentLabel(attachment);
  if (typeof content === 'string' && content.includes(ATTACH_PREFIX)) return 'Вложение';
  return content || '—';
}

function renderAttachment(att) {
  if (att.kind === 'image') {
    return <a href={att.url} target="_blank" rel="noreferrer"><img className="thumb" src={att.url} alt={att.name} /></a>;
  }
  if (att.kind === 'audio' || att.kind === 'voice') {
    return <VoiceAttachment att={att} />;
  }
  if (att.kind === 'video_note') {
    return <div className="attachment video-note"><span>Кружочек</span><video controls playsInline src={att.url} /></div>;
  }
  if (att.kind === 'video') {
    return <div className="attachment video"><video controls playsInline src={att.url} /></div>;
  }
  return <a className="attachment file" href={att.url} target="_blank" rel="noreferrer">{att.name || att.url}</a>;
}

function VoiceAttachment({ att }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  return (
    <div className={`attachment voice ${playing ? 'playing' : ''}`}>
      <button type="button" className="voice-orb" onClick={toggle} aria-label={playing ? 'Пауза' : 'Играть'}>
        {playing ? 'Ⅱ' : '▶'}
      </button>
      <div className="voice-main">
        <div className="voice-top">
          <span className="voice-title">Голосовушка</span>
          <span className="voice-time">{fmtAudioTime(current)} / {fmtAudioTime(duration)}</span>
          <a className="voice-link" href={att.url} target="_blank" rel="noreferrer">открыть</a>
        </div>
        <button type="button" className="voice-wave" onClick={toggle} aria-label="Переключить воспроизведение">
          {Array.from({ length: 24 }).map((_, i) => <i key={i} style={{ '--h': `${22 + ((i * 17) % 46)}%` }} />)}
        </button>
        <audio
          ref={audioRef}
          src={att.url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
        />
      </div>
    </div>
  );
}

function fmtAudioTime(value) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const total = Math.floor(value);
  const min = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

function renderContent(c) {
  const attachment = parseAttachment(c);
  if (attachment) return renderAttachment(attachment);
  if (/^https?:\/\//.test(c)) {
    if (IMG_RE.test(c.split('?')[0])) {
      return <a href={c} target="_blank" rel="noreferrer"><img className="thumb" src={c} alt="" /></a>;
    }
    return <a href={c} target="_blank" rel="noreferrer">{c}</a>;
  }
  return c;
}

function otherOf(conv, me) {
  return (conv.participants_info || []).find((p) => p.username !== me.username) || null;
}
function convTitle(conv, me, t) {
  if (conv.type === 'group') return conv.name || `${t('group')}#${conv.id}`;
  const o = otherOf(conv, me);
  return o ? o.username : `${t('direct')}#${conv.id}`;
}

function SignalBars() {
  return <span className="signal-bars" aria-hidden="true"><i /><i /><i /></span>;
}

function preference(key, fallback = true) {
  try { return JSON.parse(localStorage.getItem('fsend_preferences') || '{}')[key] ?? fallback; }
  catch { return fallback; }
}

function TileCard({ tone = 'paper', eyebrow, title, copy, className = '', onClick, children }) {
  const Tag = onClick ? 'button' : 'section';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`tile nav-tile ${tone} ${className}`} onClick={onClick}>
      <span className="eyebrow">{eyebrow}</span>
      <strong>{title}</strong>
      {copy && <span className="tile-copy">{copy}</span>}
      {children}
    </Tag>
  );
}

function GlobalMenu({ user, convs, contacts, requests, onOpen, onSettings, onNew, lang, setLang, logout }) {
  const unread = convs.reduce((total, conv) => total + (conv.unread_count || 0), 0);
  const onlineCount = contacts.filter((item) => item.contact_info?.is_online).length;
  const now = new Date();
  const ru = lang === 'ru';
  return (
    <main className="global-menu">
      <section className="tile paper identity-tile">
        <span className="eyebrow">{ru ? 'С ВОЗВРАЩЕНИЕМ / СЕССИЯ ПОДТВЕРЖДЕНА' : 'WELCOME BACK / VERIFIED SESSION'}</span>
        <h1>{ru ? 'ПРИВЕТ' : 'HELLO'} /<br />{user.username}</h1>
        <time>{now.toLocaleTimeString(ru ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</time>
        <span className="tile-copy">{now.toLocaleDateString(ru ? 'ru-RU' : 'en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
      </section>
      <TileCard tone="lavender" eyebrow={`01 / ${unread} ${ru ? 'НЕПРОЧИТАНО' : 'UNREAD'}`} title={ru ? 'ЧАТЫ' : 'CHATS'}
        copy={ru ? `${convs.length} активных диалогов · защищённая прямая доставка.` : `${convs.length} active rooms · direct encrypted delivery.`} className="menu-chats" onClick={() => onOpen('chats')} />
      <TileCard tone="lime" eyebrow={ru ? '02 / ЛЮДИ' : '02 / PEOPLE'} title={ru ? 'ДРУЗЬЯ' : 'FRIENDS'}
        copy={ru ? `${contacts.length} контактов · ${onlineCount} в сети · ${requests.incoming.length} заявок.` : `${contacts.length} contacts · ${onlineCount} online · ${requests.incoming.length} requests.`} className="menu-friends" onClick={() => onOpen('friends')} />
      <TileCard tone="sand" eyebrow={ru ? '03 / СВОДКА' : '03 / INTELLIGENCE'} title={ru ? 'ИНФО' : 'INFO'}
        copy={ru ? 'Саммари диалогов, решения и задачи из важных чатов.' : 'Dialogue summaries, decisions and follow-ups from important rooms.'} className="menu-info" onClick={() => onOpen('info')} />
      <TileCard tone="paper" eyebrow={ru ? '04 / УПРАВЛЕНИЕ' : '04 / CONTROL'} title={ru ? 'НАСТРОЙКИ' : 'SETTINGS'}
        copy={ru ? 'Приватность, оформление, уведомления и хранилище.' : 'Privacy, appearance, notifications and storage.'} className="menu-settings" onClick={onSettings} />
      <TileCard tone="paper" eyebrow={ru ? 'БЫСТРОЕ ДЕЙСТВИЕ' : 'QUICK ACTION'} title={ru ? 'НОВЫЙ ЧАТ +' : 'NEW ROOM +'}
        copy={ru ? 'Начать защищённый прямой диалог.' : 'Start a direct encrypted conversation.'} className="menu-new" onClick={onNew} />
      <TileCard tone="lime" eyebrow={ru ? 'БЕЗОПАСНОСТЬ' : 'SECURITY'} title={ru ? 'УСТРОЙСТВА' : 'DEVICES'}
        copy={ru ? 'Активные входы и проверенные сессии.' : 'Active sign-ins and verified sessions.'} className="menu-devices" onClick={() => onOpen('devices')}><SignalBars /></TileCard>
      <TileCard tone="lavender" eyebrow={ru ? 'АККАУНТ / В СЕТИ' : 'ACCOUNT / ONLINE'} title={ru ? 'ВЫ' : 'YOU'}
        copy={ru ? `ID ${String(user.id).padStart(4, '0')} · Прямое подключение активно.` : `ID ${String(user.id).padStart(4, '0')} · Direct route active.`} className="menu-profile" onClick={onSettings}>
        <i className="presence-pulse" />
      </TileCard>
      <div className="menu-actions">
        <button className="tile-control" onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}>{lang.toUpperCase()} / {ru ? 'ЯЗЫК' : 'LANGUAGE'}</button>
        <button className="tile-control" onClick={logout}>{ru ? 'ВЫЙТИ / СЕССИЯ' : 'EXIT / SESSION'}</button>
      </div>
    </main>
  );
}

function InfoDashboard({ convs, contacts, requests, lang }) {
  const active = convs.filter((conv) => conv.last_message).slice(0, 5);
  const unread = convs.reduce((total, conv) => total + (conv.unread_count || 0), 0);
  const ru = lang === 'ru';
  const online = contacts.filter((item) => item.contact_info?.is_online).length;
  return (
    <main className="info-dashboard">
      <TileCard tone="lavender" eyebrow={ru ? 'СВОДКА / ЛОКАЛЬНО' : 'INTELLIGENCE / LOCAL'} title={ru ? 'САММАРИ ДИАЛОГОВ' : 'DIALOGUE SUMMARIES'}
        copy={ru ? `${active.length} важных диалогов обработано локально на устройстве.` : `${active.length} important rooms condensed locally on your device.`} />
      <TileCard tone="paper" eyebrow={ru ? 'СЕГОДНЯ / РЕШЕНИЯ' : 'TODAY / DECISIONS'} title={ru ? 'ЧТО ИЗМЕНИЛОСЬ' : 'WHAT CHANGED'} className="info-changed">
        <ol className="summary-list">
          <li>{ru ? `${unread} непрочитанных сообщений требуют внимания.` : `${unread} unread messages need attention.`}</li>
          <li>{ru ? `${online} доверенных контактов сейчас в сети.` : `${online} trusted contacts are online.`}</li>
          <li>{ru ? `${requests.incoming.length} заявок в друзья ожидают ответа.` : `${requests.incoming.length} friend requests are waiting.`}</li>
        </ol>
      </TileCard>
      <TileCard tone="lime" eyebrow={ru ? 'СЛЕДУЮЩИЕ ШАГИ' : 'FOLLOW-UPS'} title={ru ? 'ДЕЙСТВИЯ' : 'NEXT ACTIONS'}
        copy={unread ? (ru ? 'Проверить непрочитанные · сверить решения · ответить.' : 'Review unread rooms · verify decisions · reply.') : (ru ? 'Срочных ответов нет. Все диалоги просмотрены.' : 'No urgent replies. Your rooms are up to date.')} />
      <TileCard tone="paper" eyebrow={ru ? 'ПРИВАТНОСТЬ' : 'PRIVACY'} title={ru ? 'ЛОКАЛЬНЫЙ ИИ' : 'LOCAL AI'} copy={ru ? 'Саммари остаются на устройстве. Содержимое диалогов не загружается.' : 'Summaries remain on this device. No dialogue content is uploaded.'} />
      <TileCard tone="sand" eyebrow={ru ? 'ИСТОЧНИК' : 'SOURCE'} title={`${active.length} ${ru ? 'ДИАЛОГОВ' : 'DIALOGUES'}`}>
        <ul className="source-list">{active.map((conv) => <li key={conv.id}>{conv.name || conv.participants_info?.[0]?.username || `${ru ? 'ЧАТ' : 'ROOM'} ${conv.id}`}</li>)}</ul>
      </TileCard>
      <TileCard tone="lavender" eyebrow={ru ? 'ЭКСПОРТ' : 'EXPORT'} title={ru ? 'КОПИРОВАТЬ ОТЧЁТ +' : 'COPY REPORT +'} copy={ru ? 'Обычный текст · без метаданных.' : 'Plain text · no metadata.'} onClick={() => {
        const report = active.map((conv) => `${conv.name || `${ru ? 'Чат' : 'Room'} ${conv.id}`}: ${messagePreview(conv.last_message?.content)}`).join('\n');
        navigator.clipboard?.writeText(report);
      }} />
    </main>
  );
}

function DevicesPanel({ lang }) {
  const ru = lang === 'ru';
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/auth/users/devices/', { params: { device_id: devicePayload().device_id } });
      setDevices(data.results || data);
    } catch (e) { setError(errText(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <main className="devices-dashboard">
      <TileCard tone="lime" eyebrow={ru ? 'БЕЗОПАСНОСТЬ / СЕССИИ' : 'SECURITY / SESSIONS'} title={ru ? 'ВАШИ УСТРОЙСТВА' : 'YOUR DEVICES'}
        copy={ru ? 'Здесь показаны устройства, на которых выполнен вход в Fsend.' : 'Devices currently signed in to your Fsend account.'}>
        <button className="tile-control devices-refresh" onClick={load}>{ru ? 'ОБНОВИТЬ' : 'REFRESH'}</button>
      </TileCard>
      {loading && <TileCard tone="paper" eyebrow="FSEND" title={ru ? 'ЗАГРУЗКА…' : 'LOADING…'} />}
      {error && <TileCard tone="paper" eyebrow={ru ? 'ОШИБКА' : 'ERROR'} title="!" copy={error} />}
      {!loading && !error && devices.length === 0 && <TileCard tone="paper" eyebrow={ru ? 'УСТРОЙСТВА / 00' : 'DEVICES / 00'} title={ru ? 'СПИСОК ПУСТ' : 'NO DEVICES'} copy={ru ? 'Текущее устройство появится после следующего обновления связи.' : 'This device will appear after the next heartbeat.'} />}
      {devices.map((device, index) => (
        <TileCard key={device.id} tone={device.is_current ? 'lavender' : index % 2 ? 'sand' : 'paper'}
          eyebrow={`${String(index + 1).padStart(2, '0')} / ${device.is_current ? (ru ? 'ТЕКУЩЕЕ' : 'CURRENT') : device.is_active ? (ru ? 'АКТИВНО' : 'ACTIVE') : (ru ? 'НЕ В СЕТИ' : 'OFFLINE')}`}
          title={device.name}
          copy={`${device.platform === 'web' && ru ? 'веб' : device.platform || (ru ? 'неизвестная платформа' : 'unknown platform')} · ${device.ip_address || (ru ? 'IP скрыт' : 'IP hidden')} · ${new Date(device.last_seen).toLocaleString(ru ? 'ru-RU' : 'en-US')}`} />
      ))}
    </main>
  );
}

export default function Chat() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const [convs, setConvs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ incoming: [], deferred: [], outgoing: [] });
  const [section, setSection] = useState('home');
  const [activeId, setActiveId] = useState(null);
  const [activeFriendId, setActiveFriendId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [typingUser, setTypingUser] = useState('');
  const [online, setOnline] = useState({});
  const [err, setErr] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [recording, setRecording] = useState(null);
  const logRef = useRef(null);
  const typingTimer = useRef(null);
  const fileRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [dragging, setDragging] = useState(false);

  const active = useMemo(() => convs.find((c) => c.id === activeId), [convs, activeId]);
  const friends = useMemo(() => contacts.map((c) => c.contact_info).filter(Boolean), [contacts]);
  const activeFriend = useMemo(
    () => friends.find((f) => f.id === activeFriendId) || friends[0] || null,
    [friends, activeFriendId]
  );

  // username -> профиль (рамки/акцент), для рендера аватаров и рамок сообщений
  const people = useMemo(() => {
    const map = {};
    if (user) map[user.username] = user;
    (active?.participants_info || []).forEach((p) => { map[p.username] = p; });
    return map;
  }, [active, user]);
  const profileOf = useCallback((username) => people[username] || {}, [people]);

  const loadConvs = useCallback(async ({ quiet = false } = {}) => {
    try {
      const { data } = await api.get('/messages/conversations/');
      const items = data.results || data;
      setConvs(items);
      setOnline((prev) => {
        const next = { ...prev };
        items.forEach((conv) => {
          (conv.participants_info || []).forEach((p) => {
            if (p.username && p.username !== user.username) next[p.username] = p.is_online;
          });
        });
        return next;
      });
    } catch (e) {
      if (!quiet && !isThrottleError(e)) setErr(errText(e));
    }
  }, [user.username]);
  useEffect(() => { loadConvs(); }, [loadConvs]);

  const loadContacts = useCallback(async ({ quiet = false } = {}) => {
    try {
      const { data } = await api.get('/auth/contacts/');
      const items = data.results || data;
      setContacts(items);
      setOnline((prev) => {
        const next = { ...prev };
        items.forEach((item) => {
          if (item.contact_info?.username) next[item.contact_info.username] = item.contact_info.is_online;
        });
        return next;
      });
      setActiveFriendId((id) => id || items[0]?.contact_info?.id || null);
    } catch (e) {
      if (!quiet && !isThrottleError(e)) setErr(errText(e));
    }
  }, []);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  const loadFriendRequests = useCallback(async ({ quiet = false } = {}) => {
    try {
      const { data } = await api.get('/auth/friend-requests/');
      setFriendRequests({
        incoming: data.incoming || [],
        deferred: data.deferred || [],
        outgoing: data.outgoing || [],
      });
    } catch (e) {
      if (!quiet && !isThrottleError(e)) setErr(errText(e));
    }
  }, []);
  useEffect(() => { loadFriendRequests(); }, [loadFriendRequests]);

  const loadMessages = useCallback(async ({ quiet = false, markRead = false } = {}) => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    try {
      const { data } = await api.get(`/messages/conversations/${activeId}/messages/`, { params: { limit: 100 } });
      setMessages((data.results || []).map((m) => ({
        id: m.id,
        who: m.sender_info?.username || t('unknown'),
        mine: m.sender === user.id,
        content: m.content,
        ts: m.created_at,
      })));
      if (markRead && (active?.is_secret || preference('readReceipts'))) {
        api.post(`/messages/conversations/${activeId}/mark_as_read/`).catch(() => {});
        setConvs((cs) => cs.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c)));
      }
    } catch (e) {
      if (!quiet && !isThrottleError(e)) setErr(errText(e));
    }
  }, [active?.is_secret, activeId, t, user.id]);

  useEffect(() => { loadMessages({ markRead: true }); }, [loadMessages]);

  const refreshLiveData = useCallback(async () => {
    if (document.hidden) return;
    await Promise.allSettled([
      loadConvs({ quiet: true }),
      loadContacts({ quiet: true }),
      loadFriendRequests({ quiet: true }),
      activeId ? loadMessages({ quiet: true }) : Promise.resolve(),
    ]);
  }, [activeId, loadConvs, loadContacts, loadFriendRequests, loadMessages]);

  useEffect(() => {
    refreshLiveData();
    const liveTimer = setInterval(refreshLiveData, LIVE_REFRESH_MS);
    const heartbeatTimer = setInterval(() => {
      if (!document.hidden && preference('onlineStatus')) api.post('/auth/users/heartbeat/', devicePayload()).catch(() => {});
    }, HEARTBEAT_MS);
    const onVisibility = () => {
      if (!document.hidden) refreshLiveData();
    };
    window.addEventListener('focus', refreshLiveData);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(liveTimer);
      clearInterval(heartbeatTimer);
      window.removeEventListener('focus', refreshLiveData);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshLiveData]);

  const updatePresence = useCallback((username, isOnline) => {
    setOnline((o) => ({ ...o, [username]: isOnline }));
    setContacts((items) => items.map((item) => (
      item.contact_info?.username === username
        ? { ...item, contact_info: { ...item.contact_info, is_online: isOnline, last_seen: new Date().toISOString() } }
        : item
    )));
    setConvs((items) => items.map((conv) => ({
      ...conv,
      participants_info: (conv.participants_info || []).map((p) => (
        p.username === username
          ? { ...p, is_online: isOnline, last_seen: new Date().toISOString() }
          : p
      )),
    })));
  }, []);

  const onEvent = useCallback((ev) => {
    if (ev.type === 'message') {
      setMessages((prev) => prev.some((m) => m.id === ev.id) ? prev : [...prev, {
        id: ev.id, who: ev.sender, mine: ev.sender === user.username,
        content: ev.content, ts: ev.timestamp,
      }]);
      if (ev.sender !== user.username) setTypingUser('');
      if (ev.sender !== user.username && activeId && !document.hidden && (active?.is_secret || preference('readReceipts'))) {
        api.post(`/messages/conversations/${activeId}/mark_as_read/`).catch(() => {});
      }
      if (ev.sender !== user.username && document.hidden && preference('desktopNotifications') && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(ev.sender, { body: preference('messagePreview') ? ev.content : (lang === 'ru' ? 'Новое сообщение' : 'New message') });
      }
    } else if (ev.type === 'user_typing') {
      if (ev.user !== user.username) setTypingUser(ev.typing ? ev.user : '');
    } else if (ev.type === 'user_status') {
      updatePresence(ev.user, ev.status === 'online');
    }
  }, [active?.is_secret, activeId, lang, updatePresence, user.username]);

  const { status, send } = useChatSocket(section === 'chats' ? activeId : null, onEvent);

  const appendApiMessage = useCallback((m) => {
    setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, {
      id: m.id,
      who: m.sender_info?.username || user.username,
      mine: m.sender === user.id || m.sender_info?.username === user.username,
      content: m.content,
      ts: m.created_at,
    }]);
  }, [user.id, user.username]);

  const sendMessageRest = useCallback(async (content) => {
    const { data } = await api.post('/messages/messages/', {
      conversation: activeId,
      content,
      is_encrypted: !!active?.is_secret,
    });
    appendApiMessage(data);
    return data;
  }, [active?.is_secret, activeId, appendApiMessage]);

  const sendContent = useCallback(async (content) => {
    if (send({ action: 'message', content, is_encrypted: !!active?.is_secret })) {
      setErr('');
      return;
    }
    await sendMessageRest(content);
    setErr('');
  }, [active?.is_secret, send, sendMessageRest]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typingUser]);

  async function submit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !activeId) return;
    setDraft('');
    if (send({ action: 'message', content: text, is_encrypted: !!active?.is_secret })) {
      send({ action: 'typing', typing: false });
      return;
    }
    try {
      await sendMessageRest(text);
      setErr('');
    } catch (e2) {
      setDraft(text);
      setErr(errText(e2));
    }
  }

  async function uploadFiles(files) {
    if (!activeId || !files?.length) return;
    for (const f of files) {
      await uploadBlob(f, f.name, fileTypeOf(f), f.type || '');
    }
  }

  async function uploadBlob(blob, name, kind, mime) {
    if (!activeId) return;
      const fd = new FormData();
      fd.append('conversation', activeId);
    fd.append('file', blob, name);
    fd.append('file_name', name);
    fd.append('mime_type', mime || blob.type || '');
    fd.append('file_type', kind === 'voice' ? 'audio' : kind === 'video_note' ? 'video' : kind);
      try {
        const { data } = await api.post('/files/shared/', fd);
      await sendContent(makeAttachmentContent(data, kind));
      } catch (e2) { setErr(errText(e2)); }
  }

  async function startRecording(kind) {
    if (!activeId || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setErr('Запись не поддерживается этим браузером');
      return;
    }
    try {
      const isVideo = kind === 'video_note';
      const stream = await navigator.mediaDevices.getUserMedia(isVideo
        ? { audio: true, video: { facingMode: 'user', width: { ideal: 360 }, height: { ideal: 360 } } }
        : { audio: true });
      const mime = isVideo
        ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm')
        : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        audioBitsPerSecond: 48000,
        videoBitsPerSecond: isVideo ? 420000 : undefined,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const cleanMime = mime.split(';')[0];
        const blob = new Blob(chunksRef.current, { type: cleanMime });
        setRecording(null);
        if (blob.size > 0) {
          await uploadBlob(blob, `${kind}-${Date.now()}.webm`, kind, cleanMime);
        }
      };
      recorder.start();
      setRecording(kind);
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, isVideo ? 30000 : 120000);
    } catch (e) {
      setRecording(null);
      setErr(e?.message || 'Не удалось начать запись');
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    uploadFiles(e.dataTransfer.files);
  }

  function onDraft(v) {
    setDraft(v);
    if (!preference('typingStatus')) return;
    send({ action: 'typing', typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => send({ action: 'typing', typing: false }), 1500);
  }

  async function startDirectChat(friend) {
    if (!friend) return;
    try {
      const { data } = await api.post('/messages/conversations/create_direct/', { contact_id: friend.id });
      setConvs((cs) => cs.some((x) => x.id === data.id) ? cs : [data, ...cs]);
      setActiveId(data.id);
      setSection('chats');
      setShowNew(false);
    } catch (e) { setErr(errText(e)); }
  }

  const statusText = section === 'friends' ? `${user.username} • ${t('friends')}`
    : !activeId ? `${user.username} • ${t('idle')}`
    : status === 'on' ? `${user.username} • ${t('live')}`
    : status === 'wait' ? t('connecting') : t('disconnected');

  const shellStatusText = section === 'home' ? `${user.username} · ${lang === 'ru' ? 'ГЛАВНАЯ' : 'HOME'}`
    : section === 'info' ? `${user.username} · ${lang === 'ru' ? 'ЛОКАЛЬНО' : 'LOCAL'}`
    : section === 'devices' ? `${user.username} · ${lang === 'ru' ? 'УСТРОЙСТВА' : 'DEVICES'}`
    : statusText;
  const routeTitle = section === 'home' ? (lang === 'ru' ? 'ГЛАВНАЯ / МЕНЮ' : 'HOME / GLOBAL MENU')
    : section === 'info' ? (lang === 'ru' ? 'ГЛАВНАЯ / ИНФО' : 'HOME / INFO')
    : section === 'devices' ? (lang === 'ru' ? 'ГЛАВНАЯ / УСТРОЙСТВА' : 'HOME / DEVICES')
    : section === 'friends' ? `${lang === 'ru' ? 'ГЛАВНАЯ' : 'HOME'} / ${t('friends').toUpperCase()}`
    : active ? `${lang === 'ru' ? 'ЧАТ' : 'CHAT'} / ${convTitle(active, user, t).toUpperCase()}` : (lang === 'ru' ? 'ГЛАВНАЯ / ЧАТЫ' : 'HOME / CHATS');

  return (
    <Terminal status={section === 'chats' && activeId ? status : 'on'} statusText={shellStatusText}
              title={routeTitle} onHome={() => { setSection('home'); setActiveId(null); }}>
      {section === 'home' ? (
        <GlobalMenu
          user={user}
          convs={convs}
          contacts={contacts}
          requests={friendRequests}
          onOpen={setSection}
          onSettings={() => setShowSettings(true)}
          onNew={() => setShowSecret(true)}
          lang={lang}
          setLang={setLang}
          logout={logout}
        />
      ) : section === 'info' ? (
        <InfoDashboard convs={convs} contacts={contacts} requests={friendRequests} lang={lang} />
      ) : section === 'devices' ? (
        <DevicesPanel lang={lang} />
      ) : (
      <div className={`main-shell section-${section} ${activeId ? 'has-active-chat' : ''}`}>
      <div className="sidebar">
        <div className="side-tabs">
          <button className={`side-tab ${section === 'chats' ? 'active' : ''}`} onClick={() => setSection('chats')}>
            {t('chats')}
          </button>
          <button className={`side-tab ${section === 'friends' ? 'active' : ''}`} onClick={() => setSection('friends')}>
            {t('friends')}
            {friendRequests.incoming.length > 0 && <span className="tab-badge">{friendRequests.incoming.length}</span>}
          </button>
        </div>
        <div className="sidebar-head">
          <span className="muted">{section === 'chats' ? t('conversations') : t('friends')}</span>
          {section === 'chats' && (
            <button className="btn ghost sm" onClick={() => setShowNew((s) => !s)}>{showNew ? 'x' : t('newChat')}</button>
          )}
        </div>
        {section === 'chats' && showNew && <NewChat onCreated={(c) => {
          setConvs((cs) => cs.some((x) => x.id === c.id) ? cs : [c, ...cs]);
          setActiveId(c.id); setShowNew(false);
        }} me={user} />}
        <div className="conv-list">
          {section === 'chats' && convs.length === 0 && <div className="muted" style={{ padding: 12 }}>{t('emptyChats')}</div>}
          {section === 'chats' && convs.map((c) => {
            const title = convTitle(c, user, t);
            const o = otherOf(c, user);
            const isOnline = online[title] ?? o?.is_online;
            return (
              <div key={c.id} className={`conv ${c.id === activeId ? 'active' : ''}`}
                   onClick={() => setActiveId(c.id)}>
                <Avatar
                  name={title}
                  accent={o?.accent_color || '#39ff14'}
                  frame={o?.avatar_frame || 'none'}
                  src={o?.avatar}
                />
                <div className="conv-text">
                  <div className="conv-name">
                    {c.is_secret && <span title={lang === 'ru' ? 'секретный чат' : 'secret chat'}>◈ </span>}
                    {title}
                    {isOnline && <span className="green">●</span>}
                  </div>
                  <div className="conv-last">{messagePreview(c.last_message?.content)}</div>
                </div>
                {c.unread_count > 0 && c.id !== activeId && <span className="badge">{c.unread_count}</span>}
              </div>
            );
          })}
          {section === 'friends' && friends.length === 0 && <div className="muted" style={{ padding: 12 }}>{t('friendsEmpty')}</div>}
          {section === 'friends' && friends.map((f) => (
            <div key={f.id} className={`conv ${f.id === activeFriend?.id ? 'active' : ''}`}
                 onClick={() => setActiveFriendId(f.id)}>
              <Avatar
                name={f.username}
                accent={f.accent_color || '#39ff14'}
                frame={f.avatar_frame || 'none'}
                src={f.avatar}
              />
              <div className="conv-text">
                <div className="conv-name">
                  {f.username}
                  {f.is_online && <span className="green">●</span>}
                </div>
                <div className="conv-last">{f.is_online ? t('online') : `${t('lastSeenPrefix')} ${fmtLastSeen(f.last_seen, t)}`}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="sidebar-head" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>
          <div className="row" style={{ gap: 8, minWidth: 0 }}>
            <Avatar
              name={user.username}
              accent={user.accent_color}
              frame={user.avatar_frame}
              src={user.avatar}
              size="sm"
            />
            <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.username}</span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn ghost sm"
              title={t('language')}
              onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
            >
              {lang === 'ru' ? 'RU' : 'EN'}
            </button>
            <button className="btn ghost sm" title={t('appearance')} onClick={() => setShowSettings(true)}>⚙</button>
            {user.is_staff && <button className="btn ghost sm" title={t('admin')} onClick={() => setShowAdmin(true)}>{t('admin')}</button>}
            <button className="btn ghost sm" onClick={logout}>{t('exit')}</button>
          </div>
        </div>
      </div>

      {section === 'friends' ? (
        <FriendsDashboard
          friends={friends}
          activeFriend={activeFriend}
          onSelect={(f) => setActiveFriendId(f.id)}
          onStartChat={startDirectChat}
          sharedRooms={convs.filter((c) => otherOf(c, user)?.id === activeFriend?.id).map((c) => convTitle(c, user, t))}
          onContactsChanged={loadContacts}
          requests={friendRequests}
          onRequestsChanged={loadFriendRequests}
        />
      ) : (
      <div className={`chat ${dragging ? 'drag' : ''}`}
           onDragOver={(e) => { if (activeId) { e.preventDefault(); setDragging(true); } }}
           onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
           onDrop={onDrop}>
        {!activeId ? (
          <div className="empty">{t('chooseDialog')}</div>
        ) : (
          <>
            <div className="chat-head">
              <div className="who-block">
                <button type="button" className="btn ghost sm mobile-back" onClick={() => setActiveId(null)}>
                  {t('back')}
                </button>
                <Avatar
                  name={convTitle(active, user, t)}
                  accent={otherOf(active, user)?.accent_color || '#39ff14'}
                  frame={otherOf(active, user)?.avatar_frame || 'none'}
                  src={otherOf(active, user)?.avatar}
                />
                <span className="green">{active.is_secret && '◈ '}{convTitle(active, user, t)}</span>
              </div>
              <span className="muted">{active.is_secret
                ? (lang === 'ru' ? 'секретный · удаление через 5 мин после прочтения' : 'secret · deletes 5 min after reading')
                : `${messages.length} ${t('messagesShort')}`}</span>
            </div>
            <div className="log" ref={logRef}>
              {messages.length === 0 && <div className="sys">{t('historyStart')}</div>}
              {messages.map((m) => {
                const p = profileOf(m.who);
                const accent = p.accent_color || '#39ff14';
                return (
                  <div key={m.id} className={`msg ${m.mine ? 'me' : ''}`}>
                    <Avatar name={m.who} accent={accent} frame={p.avatar_frame || 'none'} src={p.avatar} size="sm" />
                    <div className={`msg-body msg-frame-${p.message_frame || 'none'}`} style={{ '--accent': accent }}>
                      <div className="msg-meta">
                        <span className="ts">[{fmtTime(m.ts)}] </span>
                        <span className="who">{m.who}</span>
                        <span className="muted"> $</span>
                      </div>
                      <div className="msg-content">{renderContent(m.content)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="typing">
              {typingUser ? <>{t('typing', { user: typingUser })}<span className="d">.</span><span className="d">.</span><span className="d">.</span></> : ''}
            </div>
            <form className="composer" onSubmit={submit}>
              <input ref={fileRef} type="file" multiple hidden
                     onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />
              <button type="button" className="btn ghost" title={t('attachFile')}
                      onClick={() => fileRef.current?.click()}>📎</button>
              <button type="button" className={`btn ghost ${recording === 'voice' ? 'rec' : ''}`}
                      title="Голосовое"
                      onClick={() => recording === 'voice' ? stopRecording() : startRecording('voice')}>
                {recording === 'voice' ? '■' : '🎙'}
              </button>
              <button type="button" className={`btn ghost ${recording === 'video_note' ? 'rec' : ''}`}
                      title="Кружочек"
                      onClick={() => recording === 'video_note' ? stopRecording() : startRecording('video_note')}>
                {recording === 'video_note' ? '■' : '◉'}
              </button>
              <span className="sigil">{user.username}$</span>
              <input value={draft} autoFocus placeholder={t('messagePlaceholder')}
                     onChange={(e) => onDraft(e.target.value)} />
              <button className="btn" disabled={!draft.trim() || !activeId}>{t('send')}</button>
            </form>
          </>
        )}
        {err && <div className="err" style={{ padding: '4px 14px' }}>! {err}</div>}
      </div>
      )}
      </div>
      )}

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showAdmin && <Admin onClose={() => setShowAdmin(false)} />}
      {showSecret && <SecretChatModal
        friends={friends}
        onClose={() => setShowSecret(false)}
        onCreated={(conversation) => {
          setConvs((items) => items.some((item) => item.id === conversation.id) ? items : [conversation, ...items]);
          setSection('chats');
          setActiveId(conversation.id);
          setShowSecret(false);
        }}
      />}
    </Terminal>
  );
}

function FriendsDashboard({ friends, activeFriend, onSelect, onStartChat, sharedRooms, onContactsChanged, requests, onRequestsChanged }) {
  const { t, lang } = useLang();
  const ru = lang === 'ru';
  const tr = (russian, english) => ru ? russian : english;
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const query = q.trim();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/auth/contacts/search/', { params: { q: query } });
        if (alive) setResults(data);
      } catch (e) { if (alive && !isThrottleError(e)) setErr(errText(e)); }
      finally { if (alive) setSearching(false); }
    }, query ? 250 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  async function addFriend(u) {
    setBusy(true); setErr('');
    try {
      await api.post('/auth/friend-requests/', { to_user: u.id });
      await Promise.all([onRequestsChanged(), onContactsChanged()]);
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }

  async function actOnRequest(req, action) {
    setBusy(true); setErr('');
    try {
      await api.post(`/auth/friend-requests/${req.id}/${action}/`);
      await onRequestsChanged();
      if (action === 'accept') await onContactsChanged();
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }

  const outgoingIds = new Set((requests.outgoing || []).map((r) => r.to_user));
  const incomingIds = new Set([...(requests.incoming || []), ...(requests.deferred || [])].map((r) => r.from_user));
  const friendIds = new Set(friends.map((friend) => friend.id));
  const pendingRequests = [...(requests.incoming || []), ...(requests.deferred || [])];
  const onlineCount = friends.filter((friend) => friend.is_online).length;

  return (
    <div className="friends-view">
      <section className="friends-directory-column">
        <div className="friend-tile tone-lime directory-summary">
          <span className="friend-tile-label">{tr('ЛЮДИ', 'PEOPLE')} / {String(friends.length).padStart(2, '0')}</span>
          <strong><span className="friends-desktop-copy">{tr('ДИРЕКТОРИЯ', 'DIRECTORY')}</span><span className="friends-mobile-copy">{tr('ДРУЗЬЯ', 'FRIENDS')}</span></strong>
          <p>{onlineCount} {tr('в сети', 'online')} · {pendingRequests.length} {tr('заявок', 'requests')}.</p>
        </div>
        {friends.length === 0 && (
          <div className="friend-tile tone-paper"><span className="friend-tile-label">{tr('КОНТАКТЫ / 00', 'CONTACTS / 00')}</span><strong>{tr('ПОКА ПУСТО', 'EMPTY')}</strong><p>{tr('Добавьте первого доверенного контакта.', 'Add your first trusted contact.')}</p></div>
        )}
        {friends.map((friend, index) => (
          <button key={friend.id} className={`friend-tile friend-person tone-${index % 3 === 0 ? 'lavender' : index % 3 === 1 ? 'paper' : 'cream'} ${friend.id === activeFriend?.id ? 'selected' : ''}`} onClick={() => window.matchMedia('(max-width: 900px)').matches ? onStartChat(friend) : onSelect(friend)}>
            <span className="friend-tile-label">{friend.is_online ? tr('В СЕТИ', 'ONLINE') : tr('НЕ В СЕТИ', 'OFFLINE')}</span>
            <strong>{friend.username}</strong>
            <p>{friend.is_online ? tr('Проверенный контакт · сейчас в сети.', 'Verified contact · online now.') : `${tr('Последняя активность', 'Last seen')} ${fmtLastSeen(friend.last_seen, t)}.`}</p>
          </button>
        ))}
      </section>

      <section className="friends-detail-column">
        <div className="friend-tile tone-paper friend-selected-card">
          <span className="friend-tile-label">{tr('ВЫБРАННЫЙ КОНТАКТ', 'SELECTED PERSON')}</span>
          <strong>{activeFriend?.username || tr('ВЫБЕРИТЕ ДРУГА', 'SELECT A FRIEND')}</strong>
          <p>{activeFriend ? tr('Проверенный контакт. Прямые сообщения защищены; ключ и рамки профиля сохранены.', 'Trusted contact. Direct messages are protected; profile key and frames are preserved.') : tr('Выберите плитку слева, чтобы открыть контакт.', 'Choose a tile on the left to open a contact.')}</p>
        </div>
        <button className="friend-tile tone-lavender friend-actions-card" disabled={!activeFriend} onClick={() => activeFriend && onStartChat(activeFriend)}>
          <span className="friend-tile-label">{tr('ДЕЙСТВИЯ', 'ACTIONS')}</span>
          <strong>{tr('СООБЩЕНИЕ / ЧАТ', 'MESSAGE / CHAT')}</strong>
          <p>{tr('Открыть прямой зашифрованный диалог.', 'Open the direct encrypted room.')}</p>
        </button>
        <div className="friend-tile tone-cream friend-shared-card">
          <span className="friend-tile-label">{tr('ОБЩИЕ', 'SHARED')}</span>
          <strong>{String(sharedRooms.length).padStart(2, '0')} {tr('КОМНАТ', 'ROOMS')}</strong>
          <p>{sharedRooms.length ? sharedRooms.slice(0, 3).join(' · ') : tr('Общих диалогов пока нет.', 'No shared rooms yet.')}</p>
        </div>
      </section>

      <aside className="friends-tools-column">
        <div className="friend-tile tone-lime friend-request-card">
          <span className="friend-tile-label">{tr('ЗАЯВКИ', 'REQUESTS')} / {String(pendingRequests.length).padStart(2, '0')}</span>
          {pendingRequests.length === 0 ? <><strong>{tr('НЕТ НОВЫХ', 'ALL CLEAR')}</strong><p>{tr('Новых заявок нет.', 'No pending requests.')}</p></> : (
            <div className="friend-request-stack">
              {pendingRequests.map((req) => (
                <div className="friend-request-tile" key={req.id}>
                  <strong>+ {req.from_user_info?.username || `#${req.from_user}`}</strong>
                  <div className="friend-request-actions">
                    <button disabled={busy} onClick={() => actOnRequest(req, 'accept')}>{t('accept')}</button>
                    {req.status !== 'deferred' && <button disabled={busy} onClick={() => actOnRequest(req, 'defer')}>{t('defer')}</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="friend-tile tone-paper friend-add-card">
          <span className="friend-tile-label">{tr('ДОБАВИТЬ ДРУГА', 'ADD FRIEND')}</span>
          <strong>{tr('ПОИСК +', 'SEARCH +')}</strong>
          <div className="friend-search-field">
            <input value={q} aria-label={tr('Поиск зарегистрированных пользователей', 'Search registered users')} placeholder={tr('Найти по логину', 'Find by username')} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="friend-search-caption">
            {q.trim() ? tr('НАЙДЕНО', 'FOUND') : tr('ЗАРЕГИСТРИРОВАНЫ', 'REGISTERED')} / {String(results.length).padStart(2, '0')}
          </div>
          <div className="friend-search-results" aria-live="polite">
            {searching && <div className="friend-search-empty">{tr('Ищем…', 'Searching…')}</div>}
            {!searching && results.length === 0 && <div className="friend-search-empty">{tr('Пользователи не найдены.', 'No users found.')}</div>}
            {!searching && results.map((u) => {
              const isFriend = friendIds.has(u.id);
              const isOutgoing = outgoingIds.has(u.id);
              const isIncoming = incomingIds.has(u.id);
              const action = isFriend ? tr('ДРУГ', 'FRIEND') : isOutgoing ? tr('ОЖИДАЕТ', 'PENDING') : isIncoming ? tr('ПРИНЯТЬ', 'ACCEPT') : '+';
              return (
                <button key={u.id} disabled={busy || isFriend || isOutgoing} onClick={() => addFriend(u)}>
                  <Avatar name={u.username} accent={u.accent_color || '#39ff14'} frame={u.avatar_frame || 'none'} src={u.avatar} size="sm" />
                  <span className="friend-search-person"><strong>{u.username}</strong><small>{u.is_online ? tr('в сети', 'online') : tr('зарегистрирован', 'registered')}</small></span>
                  <span className="friend-search-action">{action}</span>
                </button>
              );
            })}
          </div>
          {err && <span className="err friend-search-error">! {err}</span>}
        </div>

        <div className="friend-tile tone-lavender friend-trust-card">
          <span className="friend-tile-label">{tr('ДОВЕРИЕ', 'TRUST')}</span>
          <strong>{String(friends.length).padStart(2, '0')} {tr('ПРОВЕРЕНО', 'VERIFIED')}</strong>
          <p>{requests.outgoing?.length || 0} {tr('ожидают подтверждения.', 'pending review.')}</p>
        </div>
      </aside>
    </div>
  );
}

function SecretChatModal({ friends, onClose, onCreated }) {
  const { lang } = useLang();
  const ru = lang === 'ru';
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');

  async function start(friend) {
    setBusyId(friend.id); setErr('');
    try {
      const { data } = await api.post('/messages/conversations/create_direct/', {
        contact_id: friend.id,
        secret: true,
      });
      onCreated(data);
    } catch (e) { setErr(errText(e)); }
    finally { setBusyId(null); }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal secret-chat-modal" role="dialog" aria-modal="true" aria-label={ru ? 'Новый секретный чат' : 'New secret chat'}>
        <div className="modal-head">
          <span>{ru ? 'НОВЫЙ СЕКРЕТНЫЙ ЧАТ' : 'NEW SECRET CHAT'}</span>
          <button className="btn ghost sm" onClick={onClose}>esc ×</button>
        </div>
        <div className="modal-body">
          <section className="tile lime secret-explainer">
            <span className="eyebrow">{ru ? 'АВТОУДАЛЕНИЕ / 05:00' : 'AUTO DELETE / 05:00'}</span>
            <strong>{ru ? 'ТАЙМЕР ПОСЛЕ ПРОЧТЕНИЯ' : 'TIMER AFTER READING'}</strong>
            <span className="tile-copy">{ru
              ? 'Отсчёт начинается только когда получатель прочитает сообщение. Непрочитанные сообщения не удаляются.'
              : 'The countdown starts only when the recipient reads a message. Unread messages do not expire.'}</span>
          </section>
          <div className="section-title">{ru ? 'ВЫБЕРИТЕ ДРУГА' : 'CHOOSE A FRIEND'}</div>
          <div className="secret-friend-list">
            {friends.length === 0 && <div className="muted">{ru ? 'Сначала добавьте пользователя в друзья.' : 'Add someone as a friend first.'}</div>}
            {friends.map((friend) => (
              <button key={friend.id} className="secret-friend" disabled={busyId !== null} onClick={() => start(friend)}>
                <Avatar name={friend.username} accent={friend.accent_color || '#39ff14'} frame={friend.avatar_frame || 'none'} src={friend.avatar} />
                <span><strong>{friend.username}</strong><small>{friend.is_online ? (ru ? 'в сети' : 'online') : (ru ? 'не в сети' : 'offline')}</small></span>
                <b>{busyId === friend.id ? '…' : '◈'}</b>
              </button>
            ))}
          </div>
          {err && <div className="err">! {err}</div>}
        </div>
      </div>
    </div>
  );
}

function NewChat({ onCreated, me }) {
  const { t } = useLang();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const query = q.trim();
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/auth/contacts/search/', { params: { q: query } });
        if (alive) setResults(data);
      } catch (e) { if (alive && !isThrottleError(e)) setErr(errText(e)); }
    }, query ? 250 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  async function start(u) {
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/messages/conversations/create_direct/', { contact_id: u.id });
      onCreated(data);
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
      <div className="field">
        <label>{t('find')}:</label>
        <input value={q} autoFocus placeholder={t('friendSearchNewPlaceholder')} onChange={(e) => setQ(e.target.value)} />
      </div>
      {results.filter((u) => u.username !== me.username).map((u) => (
        <div key={u.id} className="conv" onClick={() => !busy && start(u)}>
          <Avatar
            name={u.username}
            accent={u.accent_color || '#39ff14'}
            frame={u.avatar_frame || 'none'}
            src={u.avatar}
            size="sm"
          />
          <div className="conv-text"><div className="conv-name">{u.username}</div></div>
        </div>
      ))}
      {err && <div className="err">! {err}</div>}
    </div>
  );
}
