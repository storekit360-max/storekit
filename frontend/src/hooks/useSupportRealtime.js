import { useEffect, useRef, useState } from 'react';

const apiBase = (process.env.REACT_APP_API_URL || '/api').replace(/\/$/, '');

export default function useSupportRealtime(path, onEvent) {
  const callback = useRef(onEvent);
  const [status, setStatus] = useState('connecting');
  useEffect(() => { callback.current = onEvent; }, [onEvent]);

  useEffect(() => {
    let stopped = false; let controller = null; let retryTimer = null; let attempts = 0;
    async function connect() {
      if (stopped) return;
      controller = new AbortController(); setStatus(attempts ? 'reconnecting' : 'connecting');
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${apiBase}${path}`, { headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token || ''}`, 'X-Tenant-Domain': window.location.hostname }, credentials: 'include', cache: 'no-store', signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(`Realtime support returned ${response.status}`);
        setStatus('live'); attempts = 0;
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (!stopped) {
          const { done, value } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            if (!block || block.startsWith(':')) continue;
            const event = block.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
            const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
            try { callback.current?.({ event, data: JSON.parse(data) }); } catch (_) {}
          }
        }
        if (!stopped) throw new Error('Realtime support stream ended');
      } catch (error) {
        if (stopped || error.name === 'AbortError') return;
        setStatus('reconnecting'); attempts += 1;
        retryTimer = window.setTimeout(connect, Math.min(30000, 1000 * (2 ** Math.min(attempts, 5))));
      }
    }
    connect();
    return () => { stopped = true; controller?.abort(); window.clearTimeout(retryTimer); };
  }, [path]);
  return status;
}
