import { API_URL } from '../config';

function avatarUrl(src, version) {
  if (!src) return '';
  if (src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:')) return src;
  const base = `${API_URL}${src}`;
  if (!version) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${encodeURIComponent(version)}`;
}

// Кружок-аватар с инициалом/картинкой и рамкой-оформлением.
export default function Avatar({ name = '?', accent = '#39ff14', frame = 'none', size, src, version }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const cls = `avatar ${size ? size : ''} av-frame-${frame}`.trim();
  const url = avatarUrl(src, version);
  return (
    <span className={cls} style={{ '--accent': accent }} title={name} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="avatar-initial">{initial}</span>}
    </span>
  );
}

export function avatarVersionOf(user) {
  return user?.avatar_version || undefined;
}
