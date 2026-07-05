import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSeasonal } from '../context/SeasonalContext';

export default function CouponBanner() {
  const { campaign } = useSeasonal();
  const [copied,    setCopied]    = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [dragging,  setDragging]  = useState(false);
  const [pos,       setPos]       = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(`coupon_dismissed_${campaign?._id}`) === '1'; } catch { return false; }
  });

  const dragRef  = useRef(null);
  const stateRef = useRef({ dragging: false, offsetX: 0, offsetY: 0, lastX: 0, lastY: 0, moved: false });
  const campaignId = campaign?._id;

  // ALL hooks must be before any early return
  useEffect(() => { setPos(null); }, [campaignId]);

  const startDrag = useCallback((clientX, clientY) => {
    const el = dragRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    stateRef.current = {
      dragging: true,
      moved: false,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      lastX: clientX,
      lastY: clientY,
    };
    setDragging(true);
  }, []);

  const moveDrag = useCallback((clientX, clientY) => {
    if (!stateRef.current.dragging) return;
    const el = dragRef.current;
    if (!el) return;

    const dx = Math.abs(clientX - stateRef.current.lastX);
    const dy = Math.abs(clientY - stateRef.current.lastY);
    if (dx > 4 || dy > 4) stateRef.current.moved = true;
    stateRef.current.lastX = clientX;
    stateRef.current.lastY = clientY;

    const newX = clientX - stateRef.current.offsetX;
    const newY = clientY - stateRef.current.offsetY;
    const maxX = window.innerWidth  - el.offsetWidth;
    const maxY = window.innerHeight - el.offsetHeight;
    const x = Math.max(0, Math.min(newX, maxX));
    const y = Math.max(0, Math.min(newY, maxY));

    const newPos = { x, y };
    setPos(newPos);
    try { sessionStorage.setItem(`coupon_pos_${campaignId}`, JSON.stringify(newPos)); } catch {}
  }, [campaignId]);

  const endDrag = useCallback(() => {
    stateRef.current.dragging = false;
    setDragging(false);
  }, []);

  const handleRef = useCallback((el) => {
    if (!el) return;
    const onTouchStart = (e) => {
      if (e.target.closest('button')) return;
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY);
    };
    const onTouchMove = (e) => {
      if (!stateRef.current.dragging) return;
      e.preventDefault();
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    };
    const onTouchEnd = () => endDrag();

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });
    el._couponCleanup = () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [startDrag, moveDrag, endDrag]);

  const setCardRef = useCallback((el) => {
    if (dragRef.current?._couponCleanup) dragRef.current._couponCleanup();
    dragRef.current = el;
    if (el) handleRef(el);
  }, [handleRef]);

  // Early return AFTER all hooks
  if (!campaign?.isCouponCampaign || !campaign?.couponCode || dismissed) return null;

  const bg  = campaign.theme?.primaryColor  || '#7c3aed';
  const bg2 = campaign.theme?.secondaryColor || '#a78bfa';

  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(campaign.couponCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const dismiss = (e) => {
    e.stopPropagation();
    setDismissed(true);
    try { sessionStorage.setItem(`coupon_dismissed_${campaign._id}`, '1'); } catch {}
  };

  const onMouseDown = (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
    const onMove = (ev) => moveDrag(ev.clientX, ev.clientY);
    const onUp   = () => {
      endDrag();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  };

  const isMobile = window.innerWidth < 640;
  const defaultPos = isMobile ? { bottom: 72, left: 12 } : { bottom: 80, right: 16 };
  const posStyle = pos ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' } : defaultPos;
  const showCard = !isMobile || expanded;

  return (
    <>
      <style>{`
        @keyframes couponSlideIn {
          from { opacity:0; transform:translateY(10px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
      `}</style>

      {/* Mobile collapsed pill */}
      {isMobile && !expanded && (
        <button
          onClick={() => { setPos(null); setExpanded(true); }}
          style={{
            position: 'fixed', zIndex: 1200, ...defaultPos,
            background: `linear-gradient(135deg,${bg},${bg2})`,
            color: '#fff', border: 'none', borderRadius: 999,
            padding: '8px 14px 8px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
            animation: 'couponSlideIn 0.4s ease',
            whiteSpace: 'nowrap', touchAction: 'manipulation',
          }}
        >
          🏷️ {campaign.couponCode}
          <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>
            {campaign.couponValue}{campaign.couponType === 'percentage' ? '%' : ''} OFF
          </span>
        </button>
      )}

      {/* Full draggable card */}
      {showCard && (
        <div
          ref={setCardRef}
          style={{
            position: 'fixed', zIndex: 1200, ...posStyle,
            background: '#fff', borderRadius: 16,
            boxShadow: dragging ? '0 24px 60px rgba(0,0,0,0.28)' : '0 12px 40px rgba(0,0,0,0.16)',
            border: `2px solid ${bg}30`,
            width: 260, overflow: 'hidden',
            animation: 'couponSlideIn 0.4s ease',
            transition: dragging ? 'none' : 'box-shadow 0.2s',
            userSelect: dragging ? 'none' : 'auto',
            WebkitUserSelect: dragging ? 'none' : 'auto',
          }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={onMouseDown}
            style={{
              background: `linear-gradient(135deg,${bg},${bg2})`,
              padding: '10px 12px', position: 'relative',
              cursor: 'grab', touchAction: 'none',
            }}
          >
            {/* Grip dots */}
            <div style={{
              position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 3, pointerEvents: 'none',
            }}>
              {[0,1,2,3,4,5].map(i => (
                <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />
              ))}
            </div>

            {/* Collapse (mobile only) */}
            {isMobile && (
              <button onClick={(e) => { e.stopPropagation(); setExpanded(false); setPos(null); }} style={{
                position: 'absolute', top: 8, right: 32,
                background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
                cursor: 'pointer', borderRadius: '50%', width: 20, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
                touchAction: 'manipulation',
              }}>▾</button>
            )}

            {/* Dismiss */}
            <button onClick={dismiss} style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
              cursor: 'pointer', borderRadius: '50%', width: 20, height: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
              touchAction: 'manipulation',
            }}>✕</button>

            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, margin: '8px 0 0', fontWeight: 600, pointerEvents: 'none' }}>🏷️ Exclusive Offer</p>
            <p style={{ color: '#fff', fontSize: 13, margin: '2px 0 0', fontWeight: 800, pointerEvents: 'none' }}>
              {campaign.couponValue}{campaign.couponType === 'percentage' ? '% OFF' : ' OFF'} {campaign.name}
            </p>
          </div>

          {/* Body */}
          <div style={{ padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: '#6b7280', margin: '0 0 6px' }}>Your coupon code:</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{
                flex: 1, background: '#f8f7ff', border: `2px dashed ${bg}`,
                borderRadius: 8, padding: '6px 8px', fontFamily: 'monospace',
                fontWeight: 900, fontSize: 15, letterSpacing: '0.12em',
                color: bg, textAlign: 'center',
              }}>
                {campaign.couponCode}
              </div>
              <button onClick={copy} style={{
                background: copied ? '#10b981' : bg, color: '#fff', border: 'none',
                borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                fontWeight: 700, fontSize: 11, transition: 'background 0.2s', flexShrink: 0,
                touchAction: 'manipulation',
              }}>
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
            {campaign.couponMinOrder > 0 && (
              <p style={{ fontSize: 9, color: '#9ca3af', margin: '5px 0 0', textAlign: 'center' }}>
                Min. order: {campaign.couponMinOrder}
              </p>
            )}
            {campaign.endDate && (
              <p style={{ fontSize: 9, color: '#ef4444', margin: '3px 0 0', textAlign: 'center', fontWeight: 600 }}>
                ⏰ Expires: {new Date(campaign.endDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}