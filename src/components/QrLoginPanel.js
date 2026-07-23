import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import api, { errText } from '../api';
import { useLang } from '../lang';

const POLL_MS = 2000;

export default function QrLoginPanel({ onSuccess }) {
  const { t } = useLang();
  const [pairUrl, setPairUrl] = useState('');
  const [token, setToken] = useState('');
  const [qrSrc, setQrSrc] = useState('');
  const [phase, setPhase] = useState('loading');
  const [err, setErr] = useState('');
  const pollRef = useRef(null);
  const sessionRef = useRef(null);

  async function createSession() {
    setPhase('loading');
    setErr('');
    try {
      const { data } = await api.post('/auth/users/qr_login_create/');
      sessionRef.current = data.token;
      setToken(data.token);
      setPairUrl(data.pair_url);
      setPhase('ready');
    } catch (e) {
      setErr(errText(e));
      setPhase('error');
    }
  }

  useEffect(() => {
    createSession();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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
      try {
        const { data } = await api.get('/auth/users/qr_login_status/', { params: { token } });
        if (data.status === 'approved') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase('done');
          onSuccess(data);
        } else if (data.status === 'expired' || data.status === 'invalid' || data.status === 'consumed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase('expired');
        }
      } catch (e) {
        const code = e?.response?.status;
        if (code === 429) return;
        if (code === 404 || code === 410) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase('expired');
        }
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, token, onSuccess]);

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
        <button type="button" className="tile-action secondary qr-login-refresh" onClick={createSession}>
          {t('qrRefresh')}  ↻
        </button>
      )}
    </div>
  );
}
