import React, { useEffect, useRef, useState } from 'react';
import API from '../../utils/api';

const GIS_SCRIPT_ID = 'storekit-google-identity-script';

function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function GoogleAuthBridge() {
  const buttonRef = useRef(null);
  const [status, setStatus] = useState('Preparing secure Google Sign-In…');
  const [failed, setFailed] = useState(false);
  const [store, setStore] = useState({ storeName: 'Your Store', logoUrl: '' });
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const returnOrigin = params.get('returnOrigin') || '';
    const requestId = params.get('requestId') || '';

    const fail = message => {
      if (!active) return;
      setFailed(true);
      setStatus(message || 'Google Sign-In could not be started.');
    };

    const start = async () => {
      if (!window.opener || !returnOrigin || !requestId) {
        fail('This sign-in window is invalid. Close it and try again from your store.');
        return;
      }

      try {
        const { data } = await API.get('/auth/google/bridge-config', {
          params: { returnOrigin },
          skipCache: true,
        });
        if (!active) return;
        setStore({
          storeName: data.store?.storeName || 'Your Store',
          logoUrl: data.store?.logoUrl || '',
        });
        setLogoFailed(false);

        await loadGoogleIdentity();
        if (!active || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: data.clientId,
          callback: response => {
            if (!response?.credential || !window.opener) {
              fail('Google did not return a valid sign-in credential.');
              return;
            }
            setStatus('Sign-in successful. Returning to your store…');
            window.opener.postMessage({
              type: 'storekit:google-credential',
              credential: response.credential,
              requestId,
            }, data.returnOrigin);
            window.setTimeout(() => window.close(), 250);
          },
          auto_select: false,
          cancel_on_tap_outside: false,
          ux_mode: 'popup',
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 300,
        });
        setStatus('Choose your Google account to continue');
      } catch (err) {
        fail(err?.response?.data?.message || 'Unable to initialize Google Sign-In.');
      }
    };

    start();
    return () => { active = false; };
  }, []);

  return (
    <main style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24,
      background: 'linear-gradient(145deg,#f8fafc,#eef2ff)', fontFamily: 'Inter,system-ui,sans-serif',
    }}>
      <section style={{
        width: '100%', maxWidth: 390, padding: '34px 28px', borderRadius: 24,
        background: '#fff', boxShadow: '0 24px 70px rgba(15,23,42,.14)', textAlign: 'center',
      }}>
        {store.logoUrl && !logoFailed ? (
          <div style={{ height: 72, margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={store.logoUrl}
              alt={`${store.storeName} logo`}
              onError={() => setLogoFailed(true)}
              style={{ display: 'block', maxWidth: 220, maxHeight: 72, objectFit: 'contain' }}
            />
          </div>
        ) : (
          <div style={{
            width: 54, height: 54, margin: '0 auto 18px', borderRadius: 16,
            display: 'grid', placeItems: 'center', background: '#111827', color: '#fff',
            fontSize: 24, fontWeight: 900,
          }}>{String(store.storeName || 'Store').charAt(0).toUpperCase()}</div>
        )}
        <h1 style={{ margin: 0, color: '#0f172a', fontSize: 23 }}>Continue to {store.storeName}</h1>
        <p style={{ margin: '9px 0 24px', color: failed ? '#dc2626' : '#64748b', fontSize: 14, lineHeight: 1.55 }}>
          {status}
        </p>
        <div ref={buttonRef} style={{ minHeight: failed ? 0 : 44, display: 'flex', justifyContent: 'center' }} />
        {failed && (
          <button type="button" onClick={() => window.close()} style={{
            border: 0, borderRadius: 12, padding: '10px 18px', background: '#0f172a',
            color: '#fff', fontWeight: 700, cursor: 'pointer',
          }}>Close window</button>
        )}
        <p style={{ margin: '22px 0 0', color: '#94a3b8', fontSize: 11 }}>
          Secure authentication handled by Google.
        </p>
      </section>
    </main>
  );
}
