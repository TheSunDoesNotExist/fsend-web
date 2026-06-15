import { API_URL } from '../config';

function avatarUrl(src) {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:')) return src;
  return `${API_URL}${src}`;
}

// Кружок-аватар с инициалом/картинкой и рамкой-оформлением.
export default function Avatar({ name = '?', accent = '#39ff14', frame = 'none', size, src }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const cls = `avatar ${size ? size : ''} av-frame-${frame}`.trim();
  const url = avatarUrl(src);
  return (
    <span className={cls} style={{ '--accent': accent }} title={name} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span className="avatar-initial">{initial}</span>}
    </span>
  );
}
