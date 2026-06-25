import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { errText } from '../api';
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

export default function Chat() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const [convs, setConvs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ incoming: [], deferred: [], outgoing: [] });
  const [section, setSection] = useState('chats');
  const [activeId, setActiveId] = useState(null);
  const [activeFriendId, setActiveFriendId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [typingUser, setTypingUser] = useState('');
  const [online, setOnline] = useState({});
  const [err, setErr] = useState('');
  const [showNew, setShowNew] = useState(false);
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
      if (markRead) {
        api.post(`/messages/conversations/${activeId}/mark_as_read/`).catch(() => {});
        setConvs((cs) => cs.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c)));
      }
    } catch (e) {
      if (!quiet && !isThrottleError(e)) setErr(errText(e));
    }
  }, [activeId, t, user.id]);

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
      if (!document.hidden) api.post('/auth/users/heartbeat/').catch(() => {});
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
    } else if (ev.type === 'user_typing') {
      if (ev.user !== user.username) setTypingUser(ev.typing ? ev.user : '');
    } else if (ev.type === 'user_status') {
      updatePresence(ev.user, ev.status === 'online');
    }
  }, [updatePresence, user.username]);

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
      is_encrypted: false,
    });
    appendApiMessage(data);
    return data;
  }, [activeId, appendApiMessage]);

  const sendContent = useCallback(async (content) => {
    if (send({ action: 'message', content, is_encrypted: false })) {
      setErr('');
      return;
    }
    await sendMessageRest(content);
    setErr('');
  }, [send, sendMessageRest]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typingUser]);

  async function submit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !activeId) return;
    setDraft('');
    if (send({ action: 'message', content: text, is_encrypted: false })) {
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

  return (
    <Terminal status={section === 'chats' && activeId ? status : 'on'} statusText={statusText}
              title={`fsend@secure: ~/${section === 'friends' ? t('friends') : active ? convTitle(active, user, t) : t('chats')}`}>
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
                <span className="green">{convTitle(active, user, t)}</span>
              </div>
              <span className="muted">{messages.length} {t('messagesShort')}</span>
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

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showAdmin && <Admin onClose={() => setShowAdmin(false)} />}
    </Terminal>
  );
}

function FriendsDashboard({ friends, activeFriend, onSelect, onStartChat, onContactsChanged, requests, onRequestsChanged }) {
  const { t } = useLang();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/auth/contacts/search/', { params: { q: q.trim() } });
        if (alive) setResults(data);
      } catch (e) { if (alive && !isThrottleError(e)) setErr(errText(e)); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  async function addFriend(u) {
    setBusy(true); setErr('');
    try {
      await api.post('/auth/friend-requests/', { to_user: u.id });
      setQ('');
      setResults([]);
      await onRequestsChanged();
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

  return (
    <div className="friends-view">
      <div className="friends-main">
        <div className="chat-head">
          <div className="who-block">
            {activeFriend ? (
              <>
                <Avatar
                  name={activeFriend.username}
                  accent={activeFriend.accent_color || '#39ff14'}
                  frame={activeFriend.avatar_frame || 'none'}
                  src={activeFriend.avatar}
                />
                <div>
                  <div className="green">{activeFriend.username}</div>
                  <div className="muted">
                    {activeFriend.is_online ? t('onlineNow') : `${t('lastSeenPrefix')} ${fmtLastSeen(activeFriend.last_seen, t)}`}
                  </div>
                </div>
              </>
            ) : (
              <span className="green">{t('friendsDashboard')}</span>
            )}
          </div>
          {activeFriend && <button className="btn ghost sm" onClick={() => onStartChat(activeFriend)}>{t('message')}</button>}
        </div>

        <div className="friend-panel">
          {activeFriend ? (
            <>
              <div className="friend-hero">
                <Avatar
                  name={activeFriend.username}
                  accent={activeFriend.accent_color || '#39ff14'}
                  frame={activeFriend.avatar_frame || 'none'}
                  src={activeFriend.avatar}
                  size="lg"
                />
                <div>
                  <div className="friend-name">{activeFriend.username}</div>
                  <div className="muted">{activeFriend.email}</div>
                </div>
              </div>
              <div className="friend-stats">
                <div className="stat">
                  <span className="muted">{t('status')}</span>
                  <strong className={activeFriend.is_online ? 'green' : 'muted'}>
                    {activeFriend.is_online ? t('online') : t('offline')}
                  </strong>
                </div>
                <div className="stat">
                  <span className="muted">{t('lastSeen')}</span>
                  <strong>{fmtLastSeen(activeFriend.last_seen, t)}</strong>
                </div>
                <div className="stat">
                  <span className="muted">{t('accent')}</span>
                  <strong style={{ color: activeFriend.accent_color || 'var(--green)' }}>
                    {activeFriend.accent_color || t('accent')}
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <div className="empty">{t('addFriend')}</div>
          )}
        </div>
      </div>

      <aside className="friends-rail">
        {(requests.incoming?.length > 0 || requests.deferred?.length > 0) && (
          <>
            <div className="section-title">{t('friendRequests')}</div>
            <div className="friend-list">
              {requests.incoming.map((req) => (
                <div key={req.id} className="friend-request">
                  <Avatar
                    name={req.from_user_info?.username}
                    accent={req.from_user_info?.accent_color || '#39ff14'}
                    frame={req.from_user_info?.avatar_frame || 'none'}
                    src={req.from_user_info?.avatar}
                    size="sm"
                  />
                  <div className="request-text">
                    <span>{req.from_user_info?.username}</span>
                    <span className="muted">{t('wantsFriend')}</span>
                  </div>
                  <button className="btn sm" disabled={busy} onClick={() => actOnRequest(req, 'accept')}>{t('accept')}</button>
                  <button className="btn ghost sm" disabled={busy} onClick={() => actOnRequest(req, 'defer')}>{t('defer')}</button>
                </div>
              ))}
              {requests.deferred.map((req) => (
                <div key={req.id} className="friend-request deferred">
                  <Avatar
                    name={req.from_user_info?.username}
                    accent={req.from_user_info?.accent_color || '#39ff14'}
                    frame={req.from_user_info?.avatar_frame || 'none'}
                    src={req.from_user_info?.avatar}
                    size="sm"
                  />
                  <div className="request-text">
                    <span>{req.from_user_info?.username}</span>
                    <span className="muted">{t('deferred')}</span>
                  </div>
                  <button className="btn sm" disabled={busy} onClick={() => actOnRequest(req, 'accept')}>{t('accept')}</button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="section-title">{t('addFriend')}</div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>{t('find')}:</label>
          <input value={q} placeholder={t('friendSearchPlaceholder')} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="friend-search">
          {results
            .filter((u) => !friends.some((f) => f.id === u.id))
            .map((u) => (
              <div key={u.id} className="friend-mini">
                <Avatar
                  name={u.username}
                  accent={u.accent_color || '#39ff14'}
                  frame={u.avatar_frame || 'none'}
                  src={u.avatar}
                  size="sm"
                />
                <span>{u.username}</span>
                {outgoingIds.has(u.id)
                  ? <span className="muted">{t('sent')}</span>
                  : <button className="btn ghost sm" disabled={busy} onClick={() => addFriend(u)}>{t('request')}</button>}
              </div>
            ))}
        </div>

        {requests.outgoing?.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 18 }}>{t('outgoing')}</div>
            <div className="friend-list">
              {requests.outgoing.map((req) => (
                <div key={req.id} className="friend-mini">
                  <Avatar
                    name={req.to_user_info?.username}
                    accent={req.to_user_info?.accent_color || '#39ff14'}
                    frame={req.to_user_info?.avatar_frame || 'none'}
                    src={req.to_user_info?.avatar}
                    size="sm"
                  />
                  <span>{req.to_user_info?.username}</span>
                  <span className="muted">{t('pending')}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="section-title" style={{ marginTop: 18 }}>{t('otherFriends')}</div>
        <div className="friend-list">
          {friends.length === 0 && <div className="muted">{t('noFriendsYet')}</div>}
          {friends.map((f) => (
            <button key={f.id} className={`friend-mini as-button ${f.id === activeFriend?.id ? 'active' : ''}`}
                    onClick={() => onSelect(f)}>
              <Avatar
                name={f.username}
                accent={f.accent_color || '#39ff14'}
                frame={f.avatar_frame || 'none'}
                src={f.avatar}
                size="sm"
              />
              <span>{f.username}</span>
              <span className={f.is_online ? 'green' : 'muted'}>{f.is_online ? t('online') : fmtLastSeen(f.last_seen, t)}</span>
            </button>
          ))}
        </div>
        {err && <div className="err">! {err}</div>}
      </aside>
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
    if (q.trim().length < 2) { setResults([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/auth/contacts/search/', { params: { q: q.trim() } });
        if (alive) setResults(data);
      } catch (e) { if (alive && !isThrottleError(e)) setErr(errText(e)); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
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
