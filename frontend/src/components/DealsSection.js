/**
 * DealsSection.js
 * Shows Today's Deals and Weekly Deals on the homepage
 * with live countdown timers and deal product cards.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import toast from 'react-hot-toast';

/* ─── Live countdown ─────────────────────────────────────────────────────── */
export function LiveCountdown({ endsAt, accentColor = '#dc2626', size = 'md' }) {
  const [t, setT] = useState({ d: 0, h: 0, m: 0, s: 0, expired: false });

  useEffect(() => {
    const calc = () => {
      const diff = new Date(endsAt) - Date.now();
      if (diff <= 0) { setT(p => ({ ...p, expired: true })); return; }
      setT({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
        expired: false,
      });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (t.expired) return <span className="text-sm font-bold" style={{ color: accentColor }}>⚡ Deal Ended</span>;

  const isSm = size === 'sm';
  const Cell = ({ v, label }) => (
    <div className="flex flex-col items-center">
      <div
        className="font-black tabular-nums flex items-center justify-center rounded-lg text-white"
        style={{
          background: accentColor,
          minWidth:  isSm ? 32 : 44,
          height:    isSm ? 32 : 44,
          fontSize:  isSm ? 14 : 20,
          lineHeight: 1,
          boxShadow: `0 4px 14px ${accentColor}55`,
        }}
      >
        {String(v).padStart(2, '0')}
      </div>
      <span className="text-gray-400 mt-1" style={{ fontSize: isSm ? 9 : 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  );
  const Sep = () => <span className="text-gray-300 font-bold self-start mt-1.5" style={{ fontSize: isSm ? 14 : 20 }}>:</span>;

  return (
    <div className="flex items-end gap-1">
      {t.d > 0 && <><Cell v={t.d} label="Days" /><Sep /></>}
      <Cell v={t.h} label="Hrs" /><Sep />
      <Cell v={t.m} label="Min" /><Sep />
      <Cell v={t.s} label="Sec" />
    </div>
  );
}

/* ─── Deal product card ──────────────────────────────────────────────────── */
function DealCard({ product, accentColor, settings }) {
  const { addItem } = useCart();
  const navigate    = useNavigate();
  const [added, setAdded] = useState(false);

  const sym      = settings?.currencySymbol || 'Rs.';
  const isOnSale = product.isOnSale && product.salePrice;
  const price    = isOnSale ? product.salePrice : product.price;
  const original = isOnSale ? product.price : null;
  const discount = original ? Math.round(((original - price) / original) * 100) : 0;
  const hasVars  = product.variants?.length > 0;
  const outOfStock = product.stock === 0;

  const handleAdd = (e) => {
    e.preventDefault();
    if (outOfStock || hasVars) { navigate(`/product/${product.slug}`); return; }
    addItem(product);
    setAdded(true);
    toast.success(`${product.name} added to cart!`);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <Link
      to={`/product/${product.slug}`}
      className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-300 flex flex-col"
      style={{ '--accent': accentColor }}
    >
      {/* Image */}
      <div className="relative overflow-hidden bg-gray-50" style={{ aspectRatio: '1' }}>
        <img
          src={product.thumbnail || 'https://via.placeholder.com/300'}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {discount > 0 && (
          <div className="absolute top-2 left-2 text-white text-xs font-black px-2 py-1 rounded-lg shadow"
            style={{ background: accentColor }}>
            -{discount}%
          </div>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <span className="text-xs font-bold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full">Out of Stock</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-xs text-gray-400 truncate">{product.category?.name || ''}</p>
        <h4 className="text-sm font-bold text-gray-800 line-clamp-2 mt-0.5 flex-1">{product.name}</h4>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <p className="font-black text-base leading-none" style={{ color: accentColor }}>
              {sym} {price?.toLocaleString()}
            </p>
            {original && (
              <p className="text-xs text-gray-400 line-through mt-0.5">{sym} {original.toLocaleString()}</p>
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={outOfStock}
            className="text-xs font-bold px-3 py-1.5 rounded-xl text-white transition-all flex-shrink-0 disabled:opacity-40"
            style={{ background: added ? '#16a34a' : accentColor }}
          >
            {added ? '✓ Added' : hasVars ? 'Choose' : outOfStock ? 'Out' : 'Add'}
          </button>
        </div>
      </div>
    </Link>
  );
}

/* ─── Single deal section ────────────────────────────────────────────────── */
function DealBlock({ deal, settings }) {
  const accent = deal.accentColor || '#dc2626';
  const [scrollRef] = useState(() => React.createRef());

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 280, behavior: 'smooth' });
  };

  return (
    <section className="py-6 sm:py-10">
      {/* Deal header */}
      <div
        className="rounded-2xl sm:rounded-3xl overflow-hidden mb-5"
        style={{ background: deal.bgGradient || `linear-gradient(135deg, ${accent}15 0%, ${accent}08 100%)`, border: `1px solid ${accent}25` }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-8 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-lg text-lg"
              style={{ background: accent }}>
              {deal.type === 'today' ? '⚡' : deal.type === 'weekly' ? '📅' : '🎯'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display font-black text-xl sm:text-2xl text-gray-900 leading-tight truncate">
                  {deal.title}
                </h2>
                {deal.badgeLabel && (
                  <span className="text-xs font-black px-2.5 py-1 rounded-full text-white flex-shrink-0"
                    style={{ background: deal.badgeColor || accent }}>
                    {deal.badgeLabel}
                  </span>
                )}
              </div>
              {deal.subtitle && <p className="text-sm text-gray-500 mt-0.5">{deal.subtitle}</p>}
            </div>
          </div>

          {/* Countdown */}
          <div className="flex flex-col items-start sm:items-end gap-1 flex-shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ends in</p>
            <LiveCountdown endsAt={deal.endsAt} accentColor={accent} />
          </div>
        </div>
      </div>

      {/* Products row */}
      <div className="relative">
        {/* Scroll arrows (only on desktop when products overflow) */}
        {deal.products.length > 4 && (
          <>
            <button onClick={() => scroll(-1)} className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-9 h-9 items-center justify-center rounded-full bg-white shadow-lg border border-gray-100 hover:border-gray-300 text-gray-600 hover:text-gray-900 transition-all">‹</button>
            <button onClick={() => scroll(1)}  className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-9 h-9 items-center justify-center rounded-full bg-white shadow-lg border border-gray-100 hover:border-gray-300 text-gray-600 hover:text-gray-900 transition-all">›</button>
          </>
        )}

        <div
          ref={scrollRef}
          className="grid gap-3 sm:gap-4"
          style={{
            gridTemplateColumns: deal.products.length <= 4
              ? `repeat(${Math.min(deal.products.length, 4)}, minmax(0,1fr))`
              : 'repeat(2, minmax(0,1fr))',
          }}
        >
          {/* Mobile: 2 cols grid. Desktop 4 cols. If many products, horizontal scroll */}
          <style>{`
            @media (min-width: 640px) {
              .deal-scroll-${deal._id} {
                display: flex !important;
                overflow-x: auto;
                scroll-snap-type: x mandatory;
                scrollbar-width: none;
                gap: 16px;
                padding-bottom: 4px;
              }
              .deal-scroll-${deal._id} > * {
                flex: 0 0 220px;
                scroll-snap-align: start;
              }
            }
          `}</style>
        </div>

        {/* Separate desktop scroll row / mobile grid */}
        <div className="hidden sm:block">
          <div
            ref={scrollRef}
            className="flex overflow-x-auto gap-4 pb-1"
            style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {deal.products.map(p => (
              <div key={p._id} style={{ flex: '0 0 210px', scrollSnapAlign: 'start' }}>
                <DealCard product={p} accentColor={accent} settings={settings} />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile 2-col grid */}
        <div className="grid grid-cols-2 gap-3 sm:hidden">
          {deal.products.slice(0, 6).map(p => (
            <DealCard key={p._id} product={p} accentColor={accent} settings={settings} />
          ))}
          {deal.products.length > 6 && (
            <Link
              to="/shop"
              className="col-span-2 text-center text-sm font-bold py-3 rounded-2xl border border-dashed border-gray-300 text-gray-500 hover:text-gray-700"
            >
              +{deal.products.length - 6} more deals →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── Main exported component ────────────────────────────────────────────── */
export default function DealsSection({ settings }) {
  const [deals, setDeals]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { default: API } = await import('../utils/api');
        const { data } = await API.get('/deals');
        if (!cancelled) setDeals(data);
      } catch {} finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null; // loading screen in Home handles this
  if (deals.length === 0) return null;

  // Separate today vs weekly vs custom — render in order
  const today  = deals.filter(d => d.type === 'today');
  const weekly = deals.filter(d => d.type === 'weekly');
  const custom = deals.filter(d => d.type === 'custom');
  const ordered = [...today, ...weekly, ...custom];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      {ordered.map(deal => (
        <DealBlock key={deal._id} deal={deal} settings={settings} />
      ))}
    </div>
  );
}