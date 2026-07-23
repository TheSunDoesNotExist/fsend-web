// Каталог оформлений профиля. Ключи совпадают с backend (AVATAR_FRAMES / MESSAGE_FRAMES).
// Рендеринг — через классы av-frame-<key> и msg-frame-<key> в styles.css.

export const AVATAR_FRAMES = [
  { key: 'none', label: 'без рамки' },
  { key: 'pulse', label: 'pulse' },
  { key: 'gold', label: 'gold' },
  { key: 'neon', label: 'neon' },
  { key: 'holo', label: 'holo' },
  { key: 'inset', label: 'inset' },
  { key: 'ember', label: 'ember' },
];

export const MESSAGE_FRAMES = [
  { key: 'none', label: 'no frame' },
  { key: 'bracket', label: 'brackets' },
  { key: 'glow', label: 'glow' },
  { key: 'dashed', label: 'dashed' },
  { key: 'double', label: 'double' },
  { key: 'scan', label: 'scanline' },
  { key: 'pulse', label: 'pulse' },
  { key: 'neon', label: 'neon' },
  { key: 'shimmer', label: 'shimmer' },
];

export const ACCENTS = ['#39ff14', '#2ee6d6', '#ffb000', '#ff5f8f', '#9b8cff', '#ff7847'];
