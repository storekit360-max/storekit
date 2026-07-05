import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../utils/api';

/**
 * PopupBanner – Premium overlay popup shown on site entry.
 * Text + buttons are overlaid directly on the image — no whitespace gap.
 */
export default function PopupBanner() {
  const navigate = useNavigate();
  const [banner, setBanner] = useState(null);
  const [show,   setShow]   = useState(false);

  useEffect(() => {
    API.get('/banners?position=popup')
      .then(r => {
        const active = (r.data || []).filter(b => {
          if (!b.isActive) return false;
          const now = Date.now();
          if (b.startDate && new Date(b.startDate) > now) return false;
          if (b.endDate   && new Date(b.endDate)   < now) return false;
          return true;
        });
        if (active.length === 0) return;
        const b = active[0];

        const freq = b.popupFrequency || 'once_per_session';
        const key  = `popup_${b._id}`;
        if (freq === 'once_per_session' && sessionStorage.getItem(key)) return;
        if (freq === 'once_per_day') {
          const last = localStorage.getItem(key);
          if (last && Date.now() - Number(last) < 86400000) return;
        }

        setBanner(b);
        const delay = (b.popupDelay || 3) * 1000;
        const timer = setTimeout(() => {
          setShow(true);
          if (freq === 'once_per_session') sessionStorage.setItem(key, '1');
          if (freq === 'once_per_day')     localStorage.setItem(key, Date.now());
        }, delay);
        return () => clearTimeout(timer);
      })
      .catch(() => {});
  }, []);

  if (!show || !banner) return null;

  const widthMap = { sm: '380px', md: '500px', lg: '680px' };
  const maxW = widthMap[banner.popupWidth || 'md'];
  const btnBg  = banner.buttonBgColor || 'var(--color-primary, #6366f1)';
  const btnCol = banner.buttonColor   || '#fff';
  const close  = () => setShow(false);
  const hasImg = !!banner.image;

  return (
    <div
      onClick={close}
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(0,0,0,0.65)',
        backdropFilter:'blur(6px)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'16px',
        animation:'szp-bg-in 0.3s ease',
      }}
    >
      <style>{`
        @keyframes szp-bg-in  { from{opacity:0}   to{opacity:1} }
        @keyframes szp-pop-in { from{opacity:0;transform:scale(0.88) translateY(24px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .szp-shop-btn:hover   { transform:translateY(-2px) !important; box-shadow:0 12px 32px rgba(0,0,0,0.35) !important; }
        .szp-close-btn:hover  { background:rgba(0,0,0,0.55) !important; }
        .szp-dismiss:hover    { color:rgba(255,255,255,0.85) !important; }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:'100%', maxWidth:maxW,
          borderRadius:'24px', overflow:'hidden',
          position:'relative',
          animation:'szp-pop-in 0.38s cubic-bezier(0.34,1.46,0.64,1)',
          boxShadow:'0 48px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {/* ── CASE A: has image — overlay everything on it ── */}
        {hasImg ? (
          <div style={{ position:'relative' }}>
            {/* Image */}
            <img
              src={banner.image}
              alt={banner.title || ''}
              style={{ width:'100%', display:'block', maxHeight:'520px', objectFit:'cover' }}
            />

            {/* Gradient overlay — dark at bottom for text legibility */}
            <div style={{
              position:'absolute', inset:0,
              background:'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 35%, rgba(0,0,0,0.72) 70%, rgba(0,0,0,0.88) 100%)',
            }}/>

            {/* Close button — top right on image */}
            <button
              className="szp-close-btn"
              onClick={close}
              style={{
                position:'absolute', top:'14px', right:'14px',
                width:'34px', height:'34px', borderRadius:'50%',
                background:'rgba(0,0,0,0.35)',
                border:'1px solid rgba(255,255,255,0.18)',
                cursor:'pointer', color:'#fff', fontSize:'15px',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'background 0.2s',
                backdropFilter:'blur(4px)',
              }}
            >✕</button>

            {/* Content overlaid at bottom of image */}
            <div style={{
              position:'absolute', bottom:0, left:0, right:0,
              padding:'28px 28px 24px',
            }}>
              {/* Badge / label above title */}
              {banner.subtitle && (
                <p style={{
                  display:'inline-block',
                  fontSize:'11px', fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase',
                  color:'rgba(255,255,255,0.7)',
                  marginBottom:'8px',
                }}>{banner.subtitle}</p>
              )}

              {banner.title && (
                <h2 style={{
                  fontSize:'clamp(22px,4vw,32px)', fontWeight:900,
                  color:'#fff', lineHeight:1.15,
                  marginBottom:'18px',
                  textShadow:'0 2px 12px rgba(0,0,0,0.4)',
                  letterSpacing:'-0.02em',
                }}>{banner.title}</h2>
              )}

              {/* Buttons row */}
              <div style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
                {banner.link && (
                  <button
                    className="szp-shop-btn"
                    onClick={() => { close(); navigate(banner.link); }}
                    style={{
                      background: btnBg,
                      color: btnCol,
                      padding:'12px 28px',
                      borderRadius:'14px',
                      fontWeight:800,
                      fontSize:'14px',
                      border:'none',
                      cursor:'pointer',
                      transition:'transform 0.2s, box-shadow 0.2s',
                      boxShadow:`0 6px 20px rgba(0,0,0,0.3)`,
                      letterSpacing:'0.01em',
                    }}
                  >{banner.buttonText || 'Shop Now'}</button>
                )}
                <button
                  className="szp-dismiss"
                  onClick={close}
                  style={{
                    background:'none', border:'none', cursor:'pointer',
                    color:'rgba(255,255,255,0.55)',
                    fontSize:'13px', fontWeight:500,
                    padding:'4px 2px',
                    transition:'color 0.2s',
                  }}
                >No thanks</button>
              </div>
            </div>
          </div>

        ) : (
          /* ── CASE B: no image — gradient card with centered content ── */
          <div style={{
            background:`linear-gradient(135deg, ${btnBg}22 0%, #fff 60%)`,
            padding:'44px 36px 36px',
            position:'relative',
          }}>
            {/* Decorative circle accent */}
            <div style={{
              position:'absolute', top:'-40px', right:'-40px',
              width:'160px', height:'160px', borderRadius:'50%',
              background: btnBg, opacity:0.12, filter:'blur(30px)',
              pointerEvents:'none',
            }}/>

            <button
              className="szp-close-btn"
              onClick={close}
              style={{
                position:'absolute', top:'14px', right:'14px',
                width:'32px', height:'32px', borderRadius:'50%',
                background:'rgba(0,0,0,0.08)', border:'none',
                cursor:'pointer', color:'#374151', fontSize:'14px',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'background 0.2s',
              }}
            >✕</button>

            {banner.title && (
              <h2 style={{
                fontSize:'clamp(24px,4vw,36px)', fontWeight:900,
                color:'#111827', lineHeight:1.15, marginBottom:'10px',
                letterSpacing:'-0.025em',
              }}>{banner.title}</h2>
            )}
            {banner.subtitle && (
              <p style={{
                fontSize:'15px', color:'#6b7280',
                marginBottom:'28px', lineHeight:1.55,
              }}>{banner.subtitle}</p>
            )}

            <div style={{ display:'flex', alignItems:'center', gap:'14px', flexWrap:'wrap' }}>
              {banner.link && (
                <button
                  className="szp-shop-btn"
                  onClick={() => { close(); navigate(banner.link); }}
                  style={{
                    background: btnBg, color: btnCol,
                    padding:'13px 32px', borderRadius:'14px',
                    fontWeight:800, fontSize:'14px',
                    border:'none', cursor:'pointer',
                    transition:'transform 0.2s, box-shadow 0.2s',
                    boxShadow:`0 8px 24px ${btnBg}55`,
                    letterSpacing:'0.01em',
                  }}
                >{banner.buttonText || 'Shop Now'}</button>
              )}
              <button
                className="szp-dismiss"
                onClick={close}
                style={{
                  background:'none', border:'none', cursor:'pointer',
                  color:'#9ca3af', fontSize:'13px', fontWeight:500,
                  padding:'4px 2px', transition:'color 0.2s',
                }}
              >No thanks</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}