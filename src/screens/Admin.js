import { useCallback, useEffect, useState } from 'react';
import api, { errText } from '../api';
import { API_URL } from '../config';

const fmt = (iso) => new Date(iso).toLocaleString();
const abs = (u) => (u && u.startsWith('http') ? u : u ? `${API_URL}${u}` : null);

export default function Admin({ onClose }) {
  const [tab, setTab] = useState('users');
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Админ-панель">
        <div className="modal-head">
          <span className="amber">~/admin {tab === 'users' ? '/users' : '/invites'}</span>
          <div className="row">
            <button className={`chip sm ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>users</button>
            <button className={`chip sm ${tab === 'invites' ? 'active' : ''}`} onClick={() => setTab('invites')}>invites</button>
            <button className="btn ghost sm" onClick={onClose}>esc ×</button>
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
          <tr><th>user</th><th>email</th><th>msgs</th><th>status</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="green">{u.username}{u.is_staff && <span className="amber"> ★</span>}</td>
              <td className="muted">{u.email}</td>
              <td>{u.message_count}</td>
              <td>
                {u.is_blocked
                  ? <span className="pill off">blocked</span>
                  : <span className="pill on">{u.is_verified ? 'active' : 'unverified'}</span>}
              </td>
              <td>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn ghost sm" onClick={() => setOpen(u)}>inspect</button>
                  {!u.is_staff && (
                    <button className="btn sm" onClick={() => toggleBlock(u)}>
                      {u.is_blocked ? 'unblock' : 'block'}
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
      <div className="modal" role="dialog" aria-label={`Профиль ${user.username}`}>
        <div className="modal-head">
          <span className="green">~/admin/users/{user.username}</span>
          <button className="btn ghost sm" onClick={onClose}>esc ×</button>
        </div>
        <div className="modal-body">
          {err && <div className="err">! {err}</div>}
          <div className="muted">{user.email} · {user.message_count} сообщений</div>

          <div>
            <div className="section-title">сообщения ({msgs.length})</div>
            <div className="mono-list" style={{ marginTop: 8 }}>
              {msgs.length === 0 && <div className="muted">— нет —</div>}
              {msgs.map((m) => (
                <div key={m.id} className="msg-content">
                  <span className="ts">[{fmt(m.created_at)}] </span>
                  <span className="muted">#{m.conversation} </span>{m.content}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title">изображения ({images.length})</div>
            <div className="row" style={{ marginTop: 8, alignItems: 'flex-start' }}>
              {images.length === 0 && <div className="muted">— нет —</div>}
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
          <label>note:</label>
          <input value={note} placeholder="кому/зачем" onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" disabled={busy} onClick={generate}>{busy ? '…' : 'generate'}</button>
      </div>
      <table className="atable">
        <thead><tr><th>token</th><th>status</th><th>used by</th><th>created</th><th></th></tr></thead>
        <tbody>
          {invites.map((i) => (
            <tr key={i.id}>
              <td className="cyan" style={{ wordBreak: 'break-all' }}>{i.token}</td>
              <td>{i.is_used ? <span className="pill off">used</span> : <span className="pill on">free</span>}</td>
              <td className="muted">{i.used_by_name || '—'}</td>
              <td className="muted">{fmt(i.created_at)}</td>
              <td><button className="btn ghost sm" onClick={() => copy(i.token)}>copy</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
