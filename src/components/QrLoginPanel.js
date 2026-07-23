import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import api, { errText } from '../api';
import { useLang } from '../lang';

const QR_CACHE_KEY = 'fsend_qr_session';
const QR_TTL_MS = 10 * 60 * 1000;
const POLL_MS = 15 * 1000;

function readCachedSession() {
  try {
    const raw = sessionStorage.getItem(QR_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.token || !cached?.pairUrl || !cached?.createdAt) return null;
    if (Date.now() - cached.createdAt >= QR_TTL_MS) {
      sessionStorage.removeItem(QR_CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    sessionStorage.removeItem(QR_CACHE_KEY);
    return null;
  }
}

function writeCachedSession(session) {
  sessionStorage.setItem(QR_CACHE_KEY, JSON.stringify(session));
}

function clearCachedSession() {
  sessionStorage.removeItem(QR_CACHE_KEY);
}

export default function QrLoginPanel({ onSuccess }) {
  const { t } = useLang();
  const [pairUrl, setPairUrl] = useState('');
  const [token, setToken] = useState('');
  const [qrSrc, setQrSrc] = useState('');
  const [phase, setPhase] = useState('loading');
  const [err, setErr] = useState('');
  const pollRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const createSession = useCallback(async (force = false) => {
    if (!force) {
      const cached = readCachedSession();
      if (cached) {
        setToken(cached.token);
        setPairUrl(cached.pairUrl);
        setPhase('ready');
        return;
      }
    }

    clearCachedSession();
    setPhase('loading');
    setErr('');
    setQrSrc('');
    try {
      const { data } = await api.post('/auth/users/qr_login_create/');
      writeCachedSession({
        token: data.token,
        pairUrl: data.pair_url,
        createdAt: Date.now(),
      });
      setToken(data.token);
      setPairUrl(data.pair_url);
      setPhase('ready');
    } catch (e) {
      setErr(errText(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    createSession();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [createSession]);

  useEffect(() => {
    if (!pairUrl) return undefined;
    let cancelled = false;
    QRCode.toDataURL(pairUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#070709', light: '#fffdf5' },
    }).then((url) => {
      if (!cancelled) setQrSrc(url);
    }).catch(() => {
      if (!cancelled) setErr(t('qrGenerateError'));
    });
    return () => { cancelled = true; };
  }, [pairUrl, t]);

  useEffect(() => {
    if (phase !== 'ready' || !token) return undefined;

    async function poll() {
      if (!readCachedSession()) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase('expired');
        return;
      }
      try {
        const { data } = await api.get('/auth/users/qr_login_status/', { params: { token } });
        if (data.status === 'approved') {
          if (pollRef.current) clearInterval(pollRef.current);
          clearCachedSession();
          setPhase('done');
          onSuccessRef.current(data);
        } else if (data.status === 'expired' || data.status === 'invalid' || data.status === 'consumed') {
          if (pollRef.current) clearInterval(pollRef.current);
          clearCachedSession();
          setPhase('expired');
        }
      } catch (e) {
        const code = e?.response?.status;
        if (code === 404 || code === 410) {
          if (pollRef.current) clearInterval(pollRef.current);
          clearCachedSession();
          setPhase('expired');
        }
      }
    }

    pollRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, token]);

  return (
    <div className="qr-login">
      <div className="eyebrow">{t('qrLoginEyebrow')}</div>
      <h2>{t('qrLoginTitle')}</h2>
      <div className="qr-login-frame">
        {phase === 'loading' && <div className="qr-login-placeholder">{t('qrLoading')}</div>}
        {phase === 'ready' && qrSrc && (
          <img className="qr-login-image" src={qrSrc} alt={t('qrLoginTitle')} />
        )}
        {phase === 'done' && <div className="qr-login-placeholder ok">{t('qrApproved')}</div>}
        {(phase === 'expired' || phase === 'error') && (
          <div className="qr-login-placeholder err">{err || t('qrExpired')}</div>
        )}
      </div>
      <p className="tile-copy">{t('qrLoginHint')}</p>
      {(phase === 'expired' || phase === 'error') && (
        <button type="button" className="tile-action secondary qr-login-refresh" onClick={() => createSession(true)}>
          {t('qrRefresh')}  ↻
        </button>
      )}
    </div>
  );
}
