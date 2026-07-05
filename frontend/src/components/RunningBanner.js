import React, { useEffect, useState, useRef } from 'react';
import API from '../utils/api';

/**
 * RunningBanner – Animated marquee/ticker bar shown at top of site.
 * Fetches banners with position=running_top from the API.
 * Supports multiple banners cycling through, per-banner color/speed config.
 */
export default function RunningBanner() {
  const [banners, setBanners] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    API.get('/banners?position=running_top')
      .then(r => {
        const active = (r.data || []).filter(b => {
          if (!b.isActive) return false;
          const now = Date.now();
          if (b.startDate && new Date(b.startDate) > now) return false;
          if (b.endDate && new Date(b.endDate) < now) return false;
          return true;
        });
        setBanners(active);
      })
      .catch(() => {});
  }, []);

  // Cycle through multiple banners every 6s
  useEffect(() => {
    if (banners.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrentIdx(i => (i + 1) % banners.length);
    }, 6000);
    return () => clearInterval(timerRef.current);
  }, [banners.length]);

  if (!visible || banners.length === 0) return null;

  const b = banners[currentIdx];
  const speed = b.runningSpeed || 30;
  const bg = b.runningBgColor || '#1e293b';
  const color = b.runningTextColor || '#ffffff';
  const icon = b.runningIcon || '🔥';
  const text = b.runningText || b.title || '';

  return (
    <div className="running-banner" style={{ background: bg, color, position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .running-banner { height: 36px; display: flex; align-items: center; }
        .running-banner-track {
          display: flex;
          align-items: center;
          white-space: nowrap;
          animation: marquee ${speed}s linear infinite;
          gap: 60px;
        }
        .running-banner-close {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(255,255,255,0.15);
          border: none;
          color: inherit;
          cursor: pointer;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          z-index: 10;
          flex-shrink: 0;
        }
        .running-banner-close:hover { background: rgba(255,255,255,0.3); }
      `}</style>

      <div className="running-banner-track">
        {/* Repeat text 4x for seamless loop */}
        {[0,1,2,3].map(i => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500 }}>
            <span>{icon}</span>
            {b.link ? (
              <a href={b.link} style={{ color: 'inherit', textDecoration: 'none' }}>{text}</a>
            ) : (
              <span>{text}</span>
            )}
            {b.buttonText && b.link && (
              <a href={b.link}
                style={{
                  background: b.buttonBgColor || 'rgba(255,255,255,0.2)',
                  color: b.buttonColor || '#fff',
                  padding: '2px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  marginLeft: '4px',
                }}>
                {b.buttonText}
              </a>
            )}
            <span style={{ opacity: 0.3, margin: '0 20px' }}>•</span>
          </span>
        ))}
      </div>

      {/* Dot nav if multiple banners */}
      {banners.length > 1 && (
        <div style={{
          position: 'absolute', bottom: '3px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '4px',
        }}>
          {banners.map((_, i) => (
            <button key={i} onClick={() => setCurrentIdx(i)}
              style={{
                width: i === currentIdx ? '12px' : '6px', height: '6px',
                borderRadius: '3px', border: 'none', cursor: 'pointer',
                background: i === currentIdx ? color : 'rgba(255,255,255,0.3)',
                transition: 'all 0.3s',
              }} />
          ))}
        </div>
      )}

      <button className="running-banner-close" onClick={() => setVisible(false)} aria-label="Close">✕</button>
    </div>
  );
}
