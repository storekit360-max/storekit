import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../utils/api';

export default function PositionBanner({ position, positions, productSlug = '', categorySlug = '', compact = false }) {
  const [banners, setBanners] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const positionKey = Array.isArray(positions) && positions.length ? positions.join(',') : position;
  const requestedPositions = useMemo(() => String(positionKey || '').split(',').filter(Boolean), [positionKey]);

  useEffect(() => {
    let active = true;
    const load = () => Promise.all(requestedPositions.map(requestedPosition =>
      API.get(`/banners?position=${encodeURIComponent(requestedPosition)}`, { skipCache: true })
        .then(response => (response.data || []).map(row => ({ ...row, __position: requestedPosition })))
    ))
      .then(rows => { if (active) setBanners(rows.flat()); })
      .catch(() => {});
    const resize = () => setIsMobile(window.innerWidth < 640);
    load();
    window.addEventListener('resize', resize);
    window.addEventListener('storekit:banners-updated', load);
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('storekit:banners-updated', load);
      window.removeEventListener('focus', load);
    };
  }, [positionKey, requestedPositions]);

  const eligibleBanners = useMemo(() => banners.filter(row => {
    const bannerPosition = row.__position || row.position || position;
    if (isMobile && row.showOnMobile === false) return false;
    if (!isMobile && row.showOnDesktop === false) return false;
    if (bannerPosition === 'product_page' && row.targetProducts?.length && !row.targetProducts.includes(productSlug)) return false;
    if (bannerPosition === 'category_page' && row.targetCategories?.length && !row.targetCategories.includes(categorySlug)) return false;
    return true;
  }), [banners, categorySlug, isMobile, position, productSlug]);

  useEffect(() => {
    setActiveIndex(0);
    if (eligibleBanners.length < 2) return undefined;
    const timer = window.setInterval(() => setActiveIndex(index => (index + 1) % eligibleBanners.length), 7000);
    return () => window.clearInterval(timer);
  }, [eligibleBanners.length, positionKey]);

  const banner = eligibleBanners[activeIndex % Math.max(eligibleBanners.length, 1)];

  if (!banner) return null;

  const bannerPosition = banner.__position || banner.position || position;

  const background = banner.image
    ? `linear-gradient(90deg, rgba(2,6,23,.82), rgba(2,6,23,.25)), url("${banner.image}") center/cover`
    : `linear-gradient(135deg, ${banner.buttonBgColor || 'var(--color-primary, #4f46e5)'}, var(--color-dark, #0f172a))`;
  const content = (
    <>
      <div className="min-w-0">
        {!compact && bannerPosition === 'flash_sale' && <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.18em] text-amber-200">⚡ {banner.flashSaleText || 'Limited-time offer'}</p>}
        <h2
          className="font-black text-white truncate"
          style={{fontSize: compact ? '15px' : '20px', lineHeight: compact ? '20px' : '26px', margin: 0}}
        >
          {compact && bannerPosition === 'flash_sale' ? '⚡ ' : ''}{banner.title}
        </h2>
        {!compact && banner.subtitle && <p className="mt-1 text-white/80 line-clamp-1" style={{fontSize:'13px',lineHeight:'18px',marginBottom:0}}>{banner.subtitle}</p>}
      </div>
      {banner.link && (
        <span
          className={`flex-shrink-0 rounded-xl font-extrabold shadow-lg ${compact ? 'px-3 py-1.5' : 'px-4 py-2'}`}
          style={{ background: banner.buttonBgColor || '#fff', color: banner.buttonColor || '#111827', fontSize: compact ? '12px' : '14px', lineHeight:'18px' }}
        >
          {banner.buttonText || 'Shop Now'} →
        </span>
      )}
    </>
  );

  const isSitewide = requestedPositions.some(value => value === 'global' || value === 'flash_sale');
  const classes = `block overflow-hidden ${isSitewide ? '' : compact ? 'rounded-xl shadow-sm' : 'rounded-2xl shadow-lg'} no-underline`;
  const style = { background, minHeight: compact ? '46px' : '92px' };
  const inner = (
    <div
      className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center justify-between gap-4"
      style={{minHeight: compact ? '46px' : '92px', paddingTop: compact ? '7px' : '15px', paddingBottom: compact ? '7px' : '15px'}}
    >
      {content}
    </div>
  );

  if (!banner.link) return <div className={classes} style={style}>{inner}</div>;
  return banner.link.startsWith('/')
    ? <Link to={banner.link} className={classes} style={style}>{inner}</Link>
    : <a href={banner.link} className={classes} style={style}>{inner}</a>;
}
