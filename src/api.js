import axios from 'axios';
import { API_URL } from './config';

const ACCESS = 'fsend_access';
const REFRESH = 'fsend_refresh';
const DEVICE = 'fsend_device_id';

function deviceId() {
  let id = localStorage.getItem(DEVICE);
  if (!id) {
    id = window.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE, id);
  }
  return id;
}

export function devicePayload() {
  return {
    device_id: deviceId(),
    device_name: navigator.platform || 'Web',
    device_platform: 'web',
  };
}

export const tokens = {
  get access() { return localStorage.getItem(ACCESS); },
  get refresh() { return localStorage.getItem(REFRESH); },
  set({ access, refresh }) {
    if (access) localStorage.setItem(ACCESS, access);
    if (refresh) localStorage.setItem(REFRESH, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};

const api = axios.create({ baseURL: `${API_URL}/api/v1` });

const PUBLIC_AUTH_PATHS = [
  '/auth/users/login/',
  '/auth/users/register/',
  '/auth/users/verify_email/',
  '/auth/users/request_password_reset/',
  '/auth/users/reset_password/',
  '/auth/token/refresh/',
];

function isPublicAuthRequest(url = '') {
  return PUBLIC_AUTH_PATHS.some((path) => url.endsWith(path) || url === path);
}

api.interceptors.request.use((cfg) => {
  const t = tokens.access;
  if (t && !isPublicAuthRequest(cfg.url)) {
    cfg.headers.Authorization = `Bearer ${t}`;
  }
  return cfg;
});

// При 401 пробуем один раз обновить access по refresh-токену.
let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { config, response } = error;
    if (response && response.status === 401 && !config._retry && tokens.refresh) {
      config._retry = true;
      try {
        refreshing = refreshing || axios.post(`${API_URL}/api/v1/auth/token/refresh/`, {
          refresh: tokens.refresh,
        });
        const { data } = await refreshing;
        refreshing = null;
        tokens.set({ access: data.access });
        config.headers.Authorization = `Bearer ${data.access}`;
        return api(config);
      } catch (e) {
        refreshing = null;
        tokens.clear();
        window.dispatchEvent(new Event('fsend:logout'));
      }
    }
    return Promise.reject(error);
  }
);

// Превращает DRF-ошибку в читабельную строку.
export function errText(e) {
  const d = e?.response?.data;
  if (!d) return e?.message || 'Ошибка сети';
  if (typeof d === 'string') return d;
  if (d.error || d.detail) return d.error || d.detail;
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
}

export default api;
