import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../utils/api';

export default function PositionBanner({ position, productSlug = '', categorySlug = '', compact = false }) {
  const [banners, setBanners] = useState([]);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);

  useEffect(() => {
    let active = true;
    const load = () => API.get(`/banners?position=${encodeURIComponent(position)}`, { skipCache: true })
      .then(response => { if (active) setBanners(response.data || []); })
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
  }, [position]);

  const banner = useMemo(() => banners.find(row => {
    if (isMobile && row.showOnMobile === false) return false;
    if (!isMobile && row.showOnDesktop === false) return false;
    if (position === 'product_page' && row.targetProducts?.length && !row.targetProducts.includes(productSlug)) return false;
    if (position === 'category_page' && row.targetCategories?.length && !row.targetCategories.includes(categorySlug)) return false;
    return true;
  }), [banners, categorySlug, isMobile, position, productSlug]);

  if (!banner) return null;

  const background = banner.image
    ? `linear-gradient(90deg, rgba(2,6,23,.82), rgba(2,6,23,.25)), url("${banner.image}") center/cover`
    : `linear-gradient(135deg, ${banner.buttonBgColor || 'var(--color-primary, #4f46e5)'}, var(--color-dark, #0f172a))`;
  const content = (
    <>
      <div className="min-w-0">
        {position === 'flash_sale' && <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.18em] text-amber-200">⚡ {banner.flashSaleText || 'Limited-time offer'}</p>}
        <h2 className={`${compact ? 'text-sm sm:text-base' : 'text-xl sm:text-2xl'} font-black text-white leading-tight`}>{banner.title}</h2>
        {banner.subtitle && <p className={`${compact ? 'text-xs' : 'text-sm'} mt-1 text-white/80 line-clamp-2`}>{banner.subtitle}</p>}
      </div>
      {banner.link && (
        <span
          className="flex-shrink-0 rounded-xl px-4 py-2 text-xs sm:text-sm font-extrabold shadow-lg"
          style={{ background: banner.buttonBgColor || '#fff', color: banner.buttonColor || '#111827' }}
        >
          {banner.buttonText || 'Shop Now'} →
        </span>
      )}
    </>
  );

  const classes = `block overflow-hidden ${compact ? '' : 'rounded-2xl shadow-lg'} no-underline`;
  const style = { background, minHeight: compact ? '54px' : '136px' };
  const inner = <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${compact ? 'py-3' : 'py-7'} flex items-center justify-between gap-5`}>{content}</div>;

  if (!banner.link) return <div className={classes} style={style}>{inner}</div>;
  return banner.link.startsWith('/')
    ? <Link to={banner.link} className={classes} style={style}>{inner}</Link>
    : <a href={banner.link} className={classes} style={style}>{inner}</a>;
}
