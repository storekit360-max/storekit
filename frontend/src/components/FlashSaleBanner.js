import React, { useEffect, useState } from 'react';
import { useSeasonal } from '../context/SeasonalContext';

const CountdownTimer = ({ endTime }) => {
  const [time, setTime] = useState({ d:0, h:0, m:0, s:0 });
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const calc = () => {
      const diff = new Date(endTime) - Date.now();
      if (diff <= 0) { setExpired(true); return; }
      setTime({ d:Math.floor(diff/86400000), h:Math.floor((diff%86400000)/3600000), m:Math.floor((diff%3600000)/60000), s:Math.floor((diff%60000)/1000) });
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [endTime]);

  if (expired) return null;

  const Cell = ({ v, label }) => (
    <div style={{ textAlign:'center' }}>
      <div style={{
        background:'rgba(0,0,0,0.3)', color:'#fff', borderRadius:6,
        padding:'2px 7px', fontSize:15, fontWeight:900,
        fontVariantNumeric:'tabular-nums', minWidth:30, lineHeight:1.4,
      }}>{String(v).padStart(2,'0')}</div>
      <div style={{ fontSize:8, color:'rgba(255,255,255,0.7)', marginTop:1, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
    </div>
  );

  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:4 }}>
      {time.d > 0 && <><Cell v={time.d} label="d"/><span style={{color:'rgba(255,255,255,0.5)',fontSize:14,paddingBottom:8}}>:</span></>}
      <Cell v={time.h} label="h"/>
      <span style={{color:'rgba(255,255,255,0.5)',fontSize:14,paddingBottom:8}}>:</span>
      <Cell v={time.m} label="m"/>
      <span style={{color:'rgba(255,255,255,0.5)',fontSize:14,paddingBottom:8}}>:</span>
      <Cell v={time.s} label="s"/>
    </div>
  );
};

export default function FlashSaleBanner() {
  const { campaign } = useSeasonal();
  const [dismissed, setDismissed] = useState(false);

  if (!campaign?.isFlashSale || !campaign?.flashSaleEndTime || dismissed) return null;
  if (new Date(campaign.flashSaleEndTime) < new Date()) return null;

  const bg = campaign.theme?.primaryColor || '#dc2626';
  const bg2 = campaign.theme?.secondaryColor || '#f59e0b';

  return (
    <div style={{
      background: `linear-gradient(135deg, ${bg}, ${bg2})`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Single compact row — never wraps on mobile */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '7px 40px 7px 12px',  /* right pad for dismiss btn */
        flexWrap: 'nowrap',
        overflowX: 'hidden',
        minHeight: 44,
      }}>
        {/* Title + coupon — shrinks first */}
        <div style={{ color:'#fff', flexShrink:1, minWidth:0, overflow:'hidden' }}>
          <p style={{ fontWeight:900, fontSize:13, margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', textShadow:'0 1px 4px rgba(0,0,0,0.3)' }}>
            {campaign.flashSaleTitle || '⚡ Flash Sale'}
            {campaign.discountPercent > 0 && (
              <span style={{ marginLeft:6, fontWeight:700, opacity:0.9 }}>
                · Up to <strong>{campaign.discountPercent}% OFF</strong>
                {campaign.couponCode && (
                  <> · <span style={{ fontFamily:'monospace', letterSpacing:'0.05em', background:'rgba(0,0,0,0.2)', padding:'1px 5px', borderRadius:4 }}>{campaign.couponCode}</span></>
                )}
              </span>
            )}
          </p>
        </div>

        {/* Countdown — fixed size, never shrinks away */}
        <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ color:'rgba(255,255,255,0.75)', fontSize:9, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>Ends:</span>
          <CountdownTimer endTime={campaign.flashSaleEndTime} />
        </div>

        {/* Shop link — hidden on very small screens via inline media trick */}
        {campaign.pageSlug && (
          <a href={`/campaign/${campaign.pageSlug}`} style={{
            flexShrink:0,
            background:'rgba(255,255,255,0.22)', color:'#fff', padding:'5px 12px',
            borderRadius:8, fontWeight:700, fontSize:11, textDecoration:'none',
            border:'1px solid rgba(255,255,255,0.3)',
            whiteSpace:'nowrap',
            // Hide on narrow screens using a className approach below
          }} className="flash-sale-cta">
            Sale →
          </a>
        )}
      </div>

      {/* Hide the CTA link on very small phones */}
      <style>{`
        @media (max-width: 400px) { .flash-sale-cta { display: none !important; } }
      `}</style>

      <button onClick={() => setDismissed(true)} style={{
        position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
        background:'rgba(0,0,0,0.2)', border:'none', color:'rgba(255,255,255,0.8)',
        cursor:'pointer', borderRadius:'50%', width:22, height:22,
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:11,
        flexShrink:0,
      }}>✕</button>
    </div>
  );
}