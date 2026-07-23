import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errText } from '../api';
import { useLang } from '../lang';
import { API_URL } from '../config';

export function bgUrl(u) {
  if (!u) return '';
  return u.startsWith('http') ? u : `${API_URL}${u}`;
}

// Фон чата: своя картинка на диалог + режим видимости (только я / оба).
export default function ChatBackground({ conversationId, onClose, onChanged }) {
  const { lang } = useLang();
  const ru = lang === 'ru';
  const tr = (r, e) => (ru ? r : e);
  const fileRef = useRef(null);
  const [mine, setMine] = useState(null);
  const [effective, setEffective] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/messages/conversations/${conversationId}/background/`);
      setMine(data.mine);
      setEffective(data.effective);
      setShared(!!data.mine?.is_shared);
    } catch (e) { setErr(errText(e)); }
  }, [conversationId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(e) {
    const f = e.target.files?.[0];
    setErr('');
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr(tr('Нужен файл-изображение', 'Pick an image file')); return; }
    if (f.size > 10 * 1024 * 1024) { setErr(tr('Картинка больше 10 МБ', 'Image is over 10 MB')); return; }
    setFile(f);
  }

  async function save() {
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      if (file) fd.append('image', file);
      fd.append('is_shared', shared ? 'true' : 'false');
      await api.put(`/messages/conversations/${conversationId}/background/`, fd);
      setFile(null);
      await load();
      onChanged?.();
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setErr('');
    try {
      await api.delete(`/messages/conversations/${conversationId}/background/`);
      setFile(null);
      await load();
      onChanged?.();
    } catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }

  const shownPreview = preview || bgUrl(mine?.image) || bgUrl(effective?.image);
  // чужой общий фон — когда своего нет, а показывается чей-то ещё
  const foreignShared = !mine && effective && !effective.is_mine;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={tr('Фон чата', 'Chat background')}>
        <div className="modal-head">
          <span className="green">{tr('ФОН ЧАТА', 'CHAT BACKGROUND')}</span>
          <button className="btn ghost sm" onClick={onClose}>esc ×</button>
        </div>
        <div className="modal-body">
          <div className="bg-preview" style={shownPreview ? { backgroundImage: `url(${shownPreview})` } : undefined}>
            {!shownPreview && <span className="muted">{tr('Фон не выбран', 'No background set')}</span>}
          </div>

          {foreignShared && (
            <div className="hint muted">
              {tr(
                `Сейчас показан общий фон от ${effective.owner_name}. Свой выбор перекроет его.`,
                `Currently showing a shared background from ${effective.owner_name}. Your own choice overrides it.`
              )}
            </div>
          )}

          <div className="row">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} />
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>
              {tr('ВЫБРАТЬ КАРТИНКУ', 'CHOOSE IMAGE')}
            </button>
            <span className="muted">{file ? file.name : tr('JPG / PNG / WEBP, до 10 МБ', 'JPG / PNG / WEBP, up to 10 MB')}</span>
          </div>

          <div>
            <div className="section-title">{tr('КТО ВИДИТ ФОН', 'WHO SEES IT')}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className={`chip ${!shared ? 'active' : ''}`} onClick={() => setShared(false)}>
                {tr('только я', 'only me')}
              </button>
              <button className={`chip ${shared ? 'active' : ''}`} onClick={() => setShared(true)}>
                {tr('оба в чате', 'both of us')}
              </button>
            </div>
            <div className="hint muted" style={{ marginTop: 6 }}>
              {shared
                ? tr('Собеседник увидит этот фон — если сам не поставил свой.',
                     'Your peer will see this background — unless they set their own.')
                : tr('Фон увидите только вы.', 'Only you will see this background.')}
            </div>
          </div>

          {err && <div className="err">! {err}</div>}

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {mine && <button className="btn ghost" disabled={busy} onClick={remove}>{tr('СНЯТЬ ФОН', 'REMOVE')}</button>}
            <button className="btn" disabled={busy || (!file && !mine)} onClick={save}>
              {busy ? '…' : tr('СОХРАНИТЬ', 'SAVE')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
