import React, { useState, useEffect, useRef } from 'react';
import API from '../utils/api';

/* ── Floating WhatsApp Chat Widget ─────────────────────────────────────────── */
export default function WhatsAppWidget() {
  const [config, setConfig] = useState(null);
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const popupRef = useRef(null);

  useEffect(() => {
    API.get('/whatsapp/config')
      .then(r => setConfig(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!config?.whatsappEnabled || !config?.whatsappNumber) return null;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile && config.whatsappShowOnMobile === false) return null;
  if (!isMobile && config.whatsappShowOnDesktop === false) return null;

  const phone = config.whatsappNumber.replace(/[^0-9]/g, '');
  const position = config.whatsappButtonPosition || 'bottom-right';
  const posStyles = {
    'bottom-right': { bottom: '80px', right: '20px' },
    'bottom-left':  { bottom: '80px', left: '20px' },
    'top-right':    { top: '80px', right: '20px' },
    'top-left':     { top: '80px', left: '20px' },
  };

  const isOnline = () => {
    if (!config.whatsappOnlineHours) return true;
    try {
      const { start, end } = config.whatsappOnlineHours;
      const now = new Date();
      const hour = now.getHours();
      const [sh] = start.split(':').map(Number);
      const [eh] = end.split(':').map(Number);
      return hour >= sh && hour < eh;
    } catch { return true; }
  };

  const online = isOnline();

  const buildUrl = (message) => {
    const text = message || config.whatsappPrefilledMessage || '';
    return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  };

  const handleOpen = () => {
    setAnimating(true);
    setOpen(true);
    setTimeout(() => setAnimating(false), 350);
  };

  const handleStartChat = (message) => {
    window.open(buildUrl(message), '_blank', 'noopener,noreferrer');
  };

  const agentName = config.whatsappAgentName || 'Support Team';
  const welcomeMsg = config.whatsappWelcomeMessage || `Hi there 👋 Welcome! How can we help you today?`;
  const offlineMsg = config.whatsappOfflineMessage || `We're currently offline but will reply as soon as possible.`;

  return (
    <div style={{ position: 'fixed', zIndex: 9000, ...posStyles[position], fontFamily: 'var(--font-body, sans-serif)' }}>
      {/* Popup panel */}
      {open && (
        <div
          ref={popupRef}
          style={{
            position: 'absolute',
            bottom: '70px',
            right: position.includes('right') ? '0' : 'auto',
            left: position.includes('left') ? '0' : 'auto',
            width: '310px',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            background: '#fff',
            transform: animating ? 'scale(0.85) translateY(10px)' : 'scale(1) translateY(0)',
            opacity: animating ? 0 : 1,
            transition: 'transform 0.3s cubic-bezier(.34,1.56,.64,1), opacity 0.25s ease',
          }}
        >
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)', padding: '16px', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', flexShrink: 0, overflow: 'hidden'
              }}>
                {config.whatsappAgentAvatar
                  ? <img src={config.whatsappAgentAvatar} alt={agentName} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                  : '👤'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '15px', margin: 0 }}>{agentName}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                  <span style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: online ? '#a8ff78' : '#ffd700',
                    boxShadow: online ? '0 0 6px #a8ff78' : 'none'
                  }}/>
                  <span style={{ fontSize: '12px', opacity: 0.9 }}>{online ? 'Online' : 'Away'}</span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', color: '#fff', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>
          </div>

          {/* Message bubble */}
          <div style={{ padding: '16px', background: '#e5ddd5', minHeight: '90px' }}>
            <div style={{
              background: '#fff', borderRadius: '0 12px 12px 12px',
              padding: '10px 14px', fontSize: '13.5px', lineHeight: '1.5',
              color: '#333', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              maxWidth: '88%'
            }}>
              {online ? welcomeMsg : offlineMsg}
              <span style={{ display: 'block', fontSize: '11px', color: '#aaa', marginTop: '4px', textAlign: 'right' }}>
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* CTA */}
          <div style={{ padding: '14px 16px', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
            <button
              onClick={() => handleStartChat(config.whatsappPrefilledMessage)}
              style={{
                width: '100%', background: 'linear-gradient(135deg, #25d366, #20b858)',
                color: '#fff', border: 'none', borderRadius: '10px',
                padding: '11px 16px', fontWeight: 700, fontSize: '14px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={e => e.target.style.opacity = '0.9'}
              onMouseLeave={e => e.target.style.opacity = '1'}
            >
              <WhatsAppIcon size={18} />
              Start Chat on WhatsApp
            </button>
            <p style={{ textAlign: 'center', fontSize: '11px', color: '#aaa', marginTop: '8px' }}>
              Opens in WhatsApp
            </p>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        title="Chat on WhatsApp"
        style={{
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #25d366, #128c7e)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(37,211,102,0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          position: 'relative',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(37,211,102,0.55)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(37,211,102,0.4)'; }}
      >
        {open
          ? <span style={{ color: '#fff', fontSize: '20px', lineHeight: 1 }}>✕</span>
          : <WhatsAppIcon size={28} color="#fff" />}
        {/* Online pulse dot */}
        {!open && online && (
          <span style={{
            position: 'absolute', top: '2px', right: '2px',
            width: '12px', height: '12px', borderRadius: '50%',
            background: '#a8ff78', border: '2px solid #fff',
            animation: 'whatsapp-pulse 2s infinite'
          }}/>
        )}
      </button>

      <style>{`
        @keyframes whatsapp-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

/* ── Shared: product inquiry link helper ─────────────────────────────────────── */
export function WhatsAppProductInquiry({ productName, productUrl, waNumber, waMessage }) {
  if (!waNumber) return null;
  const phone = waNumber.replace(/[^0-9]/g, '');
  const text = waMessage
    ? waMessage.replace('{product}', productName).replace('{url}', productUrl || '')
    : `Hi! I'm interested in: ${productName}${productUrl ? '\n' + productUrl : ''}`;
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        background: 'linear-gradient(135deg, #25d366, #20b858)',
        color: '#fff', textDecoration: 'none',
        borderRadius: '10px', padding: '10px 18px',
        fontWeight: 600, fontSize: '14px',
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <WhatsAppIcon size={16} />
      Inquire on WhatsApp
    </a>
  );
}

/* ── SVG Icon ───────────────────────────────────────────────────────────────── */
function WhatsAppIcon({ size = 24, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}
