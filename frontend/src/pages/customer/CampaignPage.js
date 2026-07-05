import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';

const CountdownTimer = ({ endTime, color }) => {
  const [time, setTime] = useState({ d:0,h:0,m:0,s:0 });
  const [expired, setExpired] = useState(false);
  useEffect(()=>{
    const calc=()=>{const diff=new Date(endTime)-Date.now();if(diff<=0){setExpired(true);return;}setTime({d:Math.floor(diff/86400000),h:Math.floor((diff%86400000)/3600000),m:Math.floor((diff%3600000)/60000),s:Math.floor((diff%60000)/1000)});};
    calc();const t=setInterval(calc,1000);return()=>clearInterval(t);
  },[endTime]);
  if(expired)return<span style={{color:'#ef4444',fontWeight:700}}>Sale Ended</span>;
  const Cell=({v,label})=>(<div style={{textAlign:'center',minWidth:60}}><div style={{background:color||'#dc2626',color:'#fff',borderRadius:12,padding:'10px 14px',fontSize:28,fontWeight:900,fontVariantNumeric:'tabular-nums',boxShadow:`0 4px 16px ${color||'#dc2626'}55`}}>{String(v).padStart(2,'0')}</div><div style={{fontSize:11,color:'#6b7280',marginTop:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div></div>);
  return(<div style={{display:'flex',alignItems:'flex-end',gap:8,justifyContent:'center'}}>
    {time.d>0&&<><Cell v={time.d} label="days"/><span style={{fontSize:28,color:'#d1d5db',paddingBottom:20}}>:</span></>}
    <Cell v={time.h} label="hrs"/>
    <span style={{fontSize:28,color:'#d1d5db',paddingBottom:20}}>:</span>
    <Cell v={time.m} label="min"/>
    <span style={{fontSize:28,color:'#d1d5db',paddingBottom:20}}>:</span>
    <Cell v={time.s} label="sec"/>
  </div>);
};

export default function CampaignPage() {
  const { slug } = useParams();
  const { settings } = useTheme();
  const [campaign, setCampaign] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const sym = settings?.currencySymbol || 'Rs.';

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get(`/seasonal/page/${slug}`);
        setCampaign(data);
        // Load sale products
        const prods = await API.get('/products?onSale=true&limit=20');
        setProducts(prods.data?.products || prods.data || []);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center"><div className="text-4xl mb-3 float">🎊</div><p className="text-gray-400">Loading campaign...</p></div>
    </div>
  );

  if (!campaign) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-3">🔍</div>
        <h2 className="font-bold text-gray-800 text-xl mb-2">Campaign Not Found</h2>
        <p className="text-gray-400 mb-5">This campaign may have ended or doesn't exist.</p>
        <Link to="/shop" className="btn-primary">Browse All Products</Link>
      </div>
    </div>
  );

  const primaryColor = campaign.theme?.primaryColor || '#15803d';
  const bgColor = campaign.theme?.bgColor || '#0f172a';
  const accentColor = campaign.theme?.secondaryColor || '#84cc16';

  const copyCoupon = () => {
    if (!campaign.couponCode) return;
    navigator.clipboard.writeText(campaign.couponCode).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2500); });
  };

  return (
    <div style={{ background: '#f8f7ff' }}>
      {/* Hero Banner */}
      <div style={{
        background: campaign.pageBannerImage
          ? `linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.6)), url(${campaign.pageBannerImage}) center/cover`
          : `linear-gradient(135deg, ${primaryColor}, ${bgColor})`,
        padding: '60px 20px', textAlign: 'center', color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        {/* Snow/confetti effects */}
        {campaign.theme?.snowEffect && (
          <div className="snow-container" aria-hidden>
            {Array.from({length:15},(_,i)=>({id:i,left:Math.random()*100,delay:Math.random()*6,dur:4+Math.random()*6})).map(f=>(
              <div key={f.id} className="snowflake" style={{left:`${f.left}%`,animationDelay:`${f.delay}s`,animationDuration:`${f.dur}s`}}>❄</div>
            ))}
          </div>
        )}

        <div style={{ position:'relative', zIndex:1, maxWidth:700, margin:'0 auto' }}>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, marginBottom:10, letterSpacing:'0.1em', textTransform:'uppercase' }}>
            🎊 Special Campaign
          </p>
          <h1 style={{ fontSize:'clamp(28px,5vw,52px)', fontWeight:900, margin:'0 0 12px', lineHeight:1.15, textShadow:'0 2px 20px rgba(0,0,0,0.4)' }}>
            {campaign.pageTitle || campaign.name}
          </h1>
          {campaign.pageDescription && (
            <p style={{ fontSize:16, color:'rgba(255,255,255,0.85)', margin:'0 0 24px', lineHeight:1.6 }}>{campaign.pageDescription}</p>
          )}
          {campaign.discountPercent > 0 && (
            <div style={{
              display:'inline-block', background:'rgba(255,255,255,0.2)', backdropFilter:'blur(10px)',
              border:'1px solid rgba(255,255,255,0.3)', borderRadius:16, padding:'10px 28px', marginBottom:20,
            }}>
              <span style={{ fontSize:28, fontWeight:900, color:'#fbbf24' }}>UP TO {campaign.discountPercent}% OFF</span>
            </div>
          )}
        </div>
      </div>

      {/* Flash Sale Countdown */}
      {campaign.isFlashSale && campaign.flashSaleEndTime && (
        <div style={{ background:`linear-gradient(135deg,${primaryColor}15,${accentColor}10)`, borderBottom:`3px solid ${primaryColor}30`, padding:'28px 20px', textAlign:'center' }}>
          <p style={{ fontWeight:800, fontSize:18, color:primaryColor, margin:'0 0 16px' }}>
            {campaign.flashSaleTitle || '⚡ Flash Sale'} — Ends in:
          </p>
          <CountdownTimer endTime={campaign.flashSaleEndTime} color={primaryColor}/>
          {campaign.flashSaleSubtitle && <p style={{ color:'#6b7280', fontSize:13, marginTop:12 }}>{campaign.flashSaleSubtitle}</p>}
        </div>
      )}

      {/* Coupon code strip */}
      {campaign.isCouponCampaign && campaign.couponCode && (
        <div style={{ background:`linear-gradient(135deg,${primaryColor},${accentColor})`, padding:'20px', textAlign:'center' }}>
          <p style={{ color:'rgba(255,255,255,0.85)', fontSize:13, margin:'0 0 12px', fontWeight:600 }}>
            {campaign.couponDescription || 'Use this exclusive code at checkout!'}
          </p>
          <div style={{ display:'inline-flex', alignItems:'center', gap:12 }}>
            <div style={{
              background:'rgba(255,255,255,0.95)', color:primaryColor, fontFamily:'monospace',
              fontWeight:900, fontSize:24, letterSpacing:'0.2em', padding:'12px 28px', borderRadius:12,
              boxShadow:'0 4px 20px rgba(0,0,0,0.2)',
            }}>
              {campaign.couponCode}
            </div>
            <button onClick={copyCoupon} style={{
              background: copied ? '#10b981':'rgba(255,255,255,0.25)', color:'#fff', border:'2px solid rgba(255,255,255,0.5)',
              borderRadius:10, padding:'12px 24px', cursor:'pointer', fontWeight:700, fontSize:14,
              transition:'all 0.2s',
            }}>
              {copied ? '✓ Copied!' : 'Copy Code'}
            </button>
          </div>
          {campaign.couponMinOrder > 0 && (
            <p style={{ color:'rgba(255,255,255,0.7)', fontSize:12, marginTop:10 }}>Min. order: {sym} {campaign.couponMinOrder.toLocaleString()}</p>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Custom content */}
        {campaign.pageContent && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8 prose max-w-none"
            dangerouslySetInnerHTML={{ __html: campaign.pageContent }}/>
        )}

        {/* Sale Products */}
        {products.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 style={{ fontFamily:'var(--font-display)', fontWeight:900, fontSize:24, color:'#111827' }}>
                  {campaign.featuredBannerTitle || '🏷️ Campaign Products'}
                </h2>
                {campaign.featuredBannerSubtitle && (
                  <p className="text-gray-500 text-sm mt-1">{campaign.featuredBannerSubtitle}</p>
                )}
              </div>
              <Link to="/shop?onSale=true" className="btn-outline text-sm">View All Sale →</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(p => (
                <Link key={p._id} to={`/product/${p.slug}`}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="relative aspect-square bg-gray-50 overflow-hidden">
                    <img src={p.images?.[0]||'https://via.placeholder.com/300'} alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/>
                    {p.salePrice && p.price > p.salePrice && (
                      <div className="absolute top-2 left-2 text-white text-xs font-bold px-2 py-1 rounded-lg"
                        style={{ background:primaryColor }}>
                        -{Math.round(((p.price-p.salePrice)/p.price)*100)}%
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug mb-1">{p.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base" style={{color:primaryColor}}>{sym} {(p.salePrice||p.price).toLocaleString()}</span>
                      {p.salePrice && p.price > p.salePrice && (
                        <span className="text-xs text-gray-400 line-through">{sym} {p.price.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="text-center mt-12 py-10 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">🛍️</div>
          <h3 className="font-bold text-gray-800 text-xl mb-2">Don't miss out!</h3>
          <p className="text-gray-500 text-sm mb-6">{campaign.endDate ? `Offer ends ${new Date(campaign.endDate).toLocaleDateString()}` : 'Limited time offer'}</p>
          <Link to="/shop" className="btn-primary text-base px-8 py-3">Shop All Products →</Link>
        </div>
      </div>
    </div>
  );
}
