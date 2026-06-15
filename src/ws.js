import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_URL } from './config';
import { tokens } from './api';

// Управляет одним WebSocket-соединением на выбранный диалог.
// onEvent вызывается на каждое входящее серверное сообщение.
export function useChatSocket(conversationId, onEvent) {
  const [status, setStatus] = useState('off'); // off | wait | on
  const wsRef = useRef(null);
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!conversationId) { setStatus('off'); return; }
    let closedByUs = false;
    setStatus('wait');

    const url = `${WS_URL}/chat/${conversationId}/?token=${encodeURIComponent(tokens.access || '')}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setStatus('on');
    ws.onclose = () => { if (!closedByUs) setStatus('off'); };
    ws.onerror = () => setStatus('off');
    ws.onmessage = (ev) => {
      try { cbRef.current && cbRef.current(JSON.parse(ev.data)); }
      catch { /* ignore malformed */ }
    };

    return () => {
      closedByUs = true;
      try { ws.close(); } catch { /* noop */ }
      wsRef.current = null;
    };
  }, [conversationId]);

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  return { status, send };
}
