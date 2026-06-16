import { useCallback, useEffect, useState } from 'react';
import api, { errText } from '../api';
import { API_URL } from '../config';
import { useLang } from '../lang';

const fmt = (iso) => new Date(iso).toLocaleString();
const abs = (u) => (u && u.startsWith('http') ? u : u ? `${API_URL}${u}` : null);

export default function Admin({ onClose }) {
  const { t } = useLang();
  const [tab, setTab] = useState('users');
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={t('admin')}>
        <div className="modal-head">
          <span className="amber">~/{t('admin')} {tab === 'users' ? `/${t('users')}` : `/${t('invites')}`}</span>
          <div className="row">
            <button className={`chip sm ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>{t('users')}</button>
            <button className={`chip sm ${tab === 'invites' ? 'active' : ''}`} onClick={() => setTab('invites')}>{t('invites')}</button>
            <button className="btn ghost sm" onClick={onClose}>esc x</button>
          </div>
        </div>
        <div className="modal-body">
          {tab === 'users' ? <Users /> : <Invites />}
        </div>
      </div>
    </div>
  );
}

function Users() {
  const { t } = useLang();
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null); // user being inspected

  const load = useCallback(async () => {
    try { setUsers((await api.get('/auth/admin/users/')).data); }
    catch (e) { setErr(errText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleBlock(u) {
    try {
      await api.post(`/auth/admin/users/${u.id}/${u.is_blocked ? 'unblock' : 'block'}/`);
      load();
    } catch (e) { setErr(errText(e)); }
  }

  return (
    <>
      {err && <div className="err">! {err}</div>}
      <table className="atable">
        <thead>
          <tr><th>{t('user')}</th><th>email</th><th>{t('msgs')}</th><th>{t('status')}</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="green">{u.username}{u.is_staff && <span className="amber"> ★</span>}</td>
              <td className="muted">{u.email}</td>
              <td>{u.message_count}</td>
              <td>
                {u.is_blocked
                  ? <span className="pill off">{t('blocked')}</span>
                  : <span className="pill on">{t('active')}</span>}
              </td>
              <td>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn ghost sm" onClick={() => setOpen(u)}>{t('inspect')}</button>
                  {!u.is_staff && (
                    <button className="btn sm" onClick={() => toggleBlock(u)}>
                      {u.is_blocked ? t('unblock') : t('block')}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <Inspect user={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Inspect({ user, onClose }) {
  const { t } = useLang();
  const [msgs, setMsgs] = useState([]);
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [m, f] = await Promise.all([
          api.get(`/auth/admin/users/${user.id}/messages/`),
          api.get(`/auth/admin/users/${user.id}/files/`),
        ]);
        setMsgs(m.data); setFiles(f.data);
      } catch (e) { setErr(errText(e)); }
    })();
  }, [user.id]);

  const images = files.filter((f) => f.file_type === 'image' || (f.mime_type || '').startsWith('image/'));

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={`${t('user')} ${user.username}`}>
        <div className="modal-head">
          <span className="green">~/{t('admin')}/{t('users')}/{user.username}</span>
          <button className="btn ghost sm" onClick={onClose}>esc x</button>
        </div>
        <div className="modal-body">
          {err && <div className="err">! {err}</div>}
          <div className="muted">{user.email} · {user.message_count} {t('adminMessages')}</div>

          <div>
            <div className="section-title">{t('adminMessages')} ({msgs.length})</div>
            <div className="mono-list" style={{ marginTop: 8 }}>
              {msgs.length === 0 && <div className="muted">{t('none')}</div>}
              {msgs.map((m) => (
                <div key={m.id} className="msg-content">
                  <span className="ts">[{fmt(m.created_at)}] </span>
                  <span className="muted">#{m.conversation} </span>{m.content}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">{t('images')} ({images.length})</div>
            <div className="row" style={{ marginTop: 8, alignItems: 'flex-start' }}>
              {images.length === 0 && <div className="muted">{t('none')}</div>}
              {images.map((f) => (
                <a key={f.id} href={abs(f.url)} target="_blank" rel="noreferrer">
                  <img className="thumb" src={abs(f.url)} alt={f.file_name} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Invites() {
  const { t } = useLang();
  const [invites, setInvites] = useState([]);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setInvites((await api.get('/auth/admin/invites/')).data); }
    catch (e) { setErr(errText(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true); setErr('');
    try {
      await api.post('/auth/admin/invites/', { count: Number(count) || 1, note });
      setNote('');
      load();
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }

  function copy(t) { navigator.clipboard?.writeText(t); }

  return (
    <>
      {err && <div className="err">! {err}</div>}
      <div className="row">
        <div className="field" style={{ width: 90 }}>
          <label>n:</label>
          <input type="number" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('note')}:</label>
          <input value={note} placeholder={t('notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" disabled={busy} onClick={generate}>{busy ? t('generatedBusy') : t('generate')}</button>
      </div>
      <table className="atable">
        <thead><tr><th>{t('token')}</th><th>{t('status')}</th><th>{t('usedBy')}</th><th>{t('created')}</th><th></th></tr></thead>
        <tbody>
          {invites.map((i) => (
            <tr key={i.id}>
              <td className="cyan" style={{ wordBreak: 'break-all' }}>{i.token}</td>
              <td>{i.is_used ? <span className="pill off">{t('used')}</span> : <span className="pill on">{t('free')}</span>}</td>
              <td className="muted">{i.used_by_name || '—'}</td>
              <td className="muted">{fmt(i.created_at)}</td>
              <td><button className="btn ghost sm" onClick={() => copy(i.token)}>{t('copy')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
