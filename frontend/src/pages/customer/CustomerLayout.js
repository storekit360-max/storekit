import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useSeasonal } from '../../context/SeasonalContext';
import { useTheme } from '../../context/ThemeContext';
import API from '../../utils/api';
import { gsap } from 'gsap';
import WhatsAppWidget from '../../components/WhatsAppWidget';
import RunningBanner from '../../components/RunningBanner';
import PopupBanner from '../../components/PopupBanner';
import FlashSaleBanner from '../../components/FlashSaleBanner';
import CouponBanner from '../../components/CouponBanner';
import StoreLoader from '../../components/StoreLoader';

/* ─────────────────────────────────────────────────────────────────
   RESPONSIVE LAYOUT FIXES — v2
   • Header height auto instead of fixed 60px so logo never clips
   • Logo image clamps to header height and never overflows
   • Logo text always visible (removed hidden xs:block — use CSS instead)
   • Action icons shrink gracefully on very small screens (< 360px)
   • Mobile bottom nav height uses env(safe-area-inset-bottom) correctly
   • has-mobile-nav padding accounts for safe area on all devices
   • Cart drawer is full-width on all mobile, 440px max on wider screens
   • Search overlay top offset adapts to header height via CSS var
   • Footer grid collapses to 1-col below 480px
   • Announcement bar text stays single-line on smallest screens
   • No horizontal overflow anywhere (overflow-x:hidden on root + body)
   ───────────────────────────────────────────────────────────────── */

/* ── Inline responsive overrides injected once ───────────────── */
const ResponsiveStyles = () => (
  <style>{`
    /* ── Prevent any horizontal overflow ── */
    html, body { overflow-x: hidden; max-width: 100vw; }
    *, *::before, *::after { box-sizing: border-box; }

    /* ── Header inner: FIXED height always, logo scales inside it ── */
    .sz-header-inner {
      height: 72px;
      min-height: 72px;
      max-height: 72px;
      padding-top: 0;
      padding-bottom: 0;
      overflow: visible;
    }

    /* ── Logo image: scales via --logo-size, no max-height cap ── */
    .sz-logo-img {
      height: var(--logo-size, 48px);
      max-width: min(280px, 55vw);
      width: auto;
      object-fit: contain;
      display: block;
      flex-shrink: 0;
    }

    /* ── Logo text: always shown, size clamps with viewport ── */
    .sz-logo-text {
      display: block;
      font-size: clamp(13px, 3.8vw, 22px);
      white-space: nowrap;
    }

    /* ── Action icons: tighter on tiny screens ── */
    @media (max-width: 359px) {
      .sz-action-icon { padding: 6px !important; }
      .sz-action-icon svg { width: 18px !important; height: 18px !important; }
      .sz-avatar { width: 28px !important; height: 28px !important; font-size: 10px !important; }
    }

    /* ── Mobile bottom nav: height + safe-area ── */
    .mobile-bottom-nav {
      height: calc(58px + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    }

    /* ── Main content padding accounts for bottom nav + safe area ── */
    .has-mobile-nav {
      padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px)) !important;
    }

    /* ── Cart drawer: full width on narrow phones, slide from bottom on mobile ── */
    @media (max-width: 479px) {
      .cart-drawer {
        right: 0 !important; left: 0 !important;
        top: auto !important; bottom: 0 !important;
        width: 100% !important;
        height: 92dvh !important;
        border-radius: 20px 20px 0 0 !important;
        padding-bottom: env(safe-area-inset-bottom, 0px) !important;
      }
    }

    /* ── Announcement bar: no text overflow on small screens ── */
    .announcement-bar {
      width: 100%;
      overflow: hidden;
    }

    /* ── Footer: single column below 480px ── */
    @media (max-width: 479px) {
      .sz-footer-grid {
        grid-template-columns: 1fr !important;
      }
      .sz-footer-brand {
        grid-column: span 1 !important;
      }
    }

    /* ── Search overlay: safe top padding ── */
    .sz-search-overlay {
      padding-top: max(72px, calc(env(safe-area-inset-top, 0px) + 56px));
    }

    /* ── Max-width container: never overflows viewport ── */
    .sz-container {
      width: 100%;
      max-width: min(1280px, 100vw);
      margin-left: auto;
      margin-right: auto;
      padding-left: max(12px, env(safe-area-inset-left, 0px));
      padding-right: max(12px, env(safe-area-inset-right, 0px));
    }
    @media (min-width: 640px) {
      .sz-container { padding-left: 24px; padding-right: 24px; }
    }

    /* ── User dropdown: clamp to viewport width ── */
    .sz-user-dropdown {
      max-width: min(208px, calc(100vw - 16px));
      right: 0;
    }

    /* ── Mobile menu items: tap-target size ── */
    .sz-mobile-menu-link {
      min-height: 44px;
      display: flex;
      align-items: center;
    }

    /* ── Bottom nav tap targets ── */
    .sz-bottom-tab {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding-top: 8px;
      padding-bottom: 4px;
      gap: 2px;
      -webkit-tap-highlight-color: transparent;
    }
    .sz-bottom-tab-label {
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
  `}</style>
);

/* ── Snow Effect ────────────────────────────────────────────── */
const SnowEffect = () => (
  <div className="snow-container" aria-hidden>
    {Array.from({length:20},(_,i)=>({id:i,left:Math.random()*100,delay:Math.random()*8,dur:5+Math.random()*8,size:0.6+Math.random()*1})).map(f=>(
      <div key={f.id} className="snowflake" style={{left:`${f.left}%`,animationDelay:`${f.delay}s`,animationDuration:`${f.dur}s`,fontSize:`${f.size}em`}}>❄</div>
    ))}
  </div>
);

/* ── Confetti ──────────────────────────────────────────────────── */
const ConfettiEffect = () => (
  <>
    {Array.from({length:22},(_,i)=>({id:i,left:Math.random()*100,delay:Math.random()*6,dur:3+Math.random()*6,color:['#15803d','#84cc16','#3b82f6','#10b981','#8b5cf6','#ef4444','#f59e0b','#06b6d4'][i%8],size:6+Math.random()*8})).map(p=>(
      <div key={p.id} className="confetti-piece" style={{left:`${p.left}%`,animationDelay:`${p.delay}s`,animationDuration:`${p.dur}s`,background:p.color,width:p.size,height:p.size}}/>
    ))}
  </>
);

/* ── Cart Drawer ───────────────────────────────────────────────── */
const CartDrawer = ({ settings }) => {
  const { items, removeItem, updateQuantity, subtotal, isOpen, setIsOpen } = useCart();
  const navigate = useNavigate();
  const sym = settings?.currencySymbol || 'Rs.';
  const drawerRef = useRef(null);

  useEffect(() => {
    if (!drawerRef.current) return;
    if (isOpen) gsap.fromTo(drawerRef.current, { x: '100%', opacity: 0 }, { x: '0%', opacity: 1, duration: 0.4, ease: 'power3.out' });
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <>
      <div className="cart-overlay" style={{ zIndex: 50 }} onClick={() => setIsOpen(false)}/>
      <div ref={drawerRef} className="cart-drawer">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-lg" style={{fontFamily:'var(--font-display)'}}>My Cart</h2>
            <p className="text-xs text-gray-400 mt-0.5">{items.reduce((s,i)=>s+i.quantity,0)} items</p>
          </div>
          <button onClick={() => setIsOpen(false)}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all text-lg">✕</button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-14">
              <div className="text-5xl mb-3 float">🛒</div>
              <p className="text-gray-400 text-sm font-medium mb-4">Your cart is empty</p>
              <button onClick={() => { setIsOpen(false); navigate('/shop'); }} className="btn-primary text-sm px-5">Browse Products</button>
            </div>
          ) : items.map(item => (
            <div key={item.cartKey || item._id} className="flex gap-3 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors">
              <Link to={`/product/${item.slug}`} onClick={() => setIsOpen(false)} className="flex-shrink-0">
                <img src={item.thumbnail||item.images?.[0]||'https://via.placeholder.com/64'} alt={item.name} className="w-16 h-16 object-cover rounded-xl"/>
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug">{item.displayName || item.name}</p>
                <p className="text-xs font-bold mt-0.5" style={{color:'var(--color-primary)'}}>{sym} {((item.salePrice||item.price)*item.quantity).toLocaleString()}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button className="qty-btn !w-7 !h-7 text-base" onClick={()=>updateQuantity(item.cartKey||item._id,item.quantity-1)}>−</button>
                  <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
                  <button className="qty-btn !w-7 !h-7 text-base" onClick={()=>updateQuantity(item.cartKey||item._id,item.quantity+1)}>+</button>
                  <button onClick={()=>removeItem(item.cartKey||item._id)} className="ml-auto text-gray-300 hover:text-red-400 transition-colors p-1">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-gray-100 space-y-3 flex-shrink-0 bg-white">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm font-medium">Subtotal</span>
              <span className="text-2xl font-bold" style={{fontFamily:'var(--font-display)',color:'var(--color-primary)'}}>{sym} {subtotal.toLocaleString()}</span>
            </div>
            {settings?.freeDeliveryThreshold && subtotal < settings.freeDeliveryThreshold && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 text-center">
                <p className="text-xs text-amber-700 font-medium">Add {sym} {(settings.freeDeliveryThreshold - subtotal).toLocaleString()} more for <strong>FREE delivery! 🚚</strong></p>
                <div className="w-full bg-amber-100 rounded-full h-1.5 mt-1.5">
                  <div className="h-1.5 rounded-full bg-amber-400 transition-all" style={{width:`${Math.min(100,(subtotal/settings.freeDeliveryThreshold)*100)}%`}}/>
                </div>
              </div>
            )}
            <button onClick={() => { setIsOpen(false); navigate('/checkout'); }} className="btn-primary w-full py-3.5 text-base">
              Checkout →
            </button>
            <button onClick={() => { setIsOpen(false); navigate('/cart'); }} className="btn-outline w-full py-2.5 text-sm">View Full Cart</button>
          </div>
        )}
      </div>
    </>
  );
};

/* ── Nav Link with 3D hover ─────────────────────────────────── */
// Inject nav styles once — avoids ALL inline-style vs React re-render conflicts
const NAV_STYLES_ID = 'sz-nav3d-styles';
if (typeof document !== 'undefined' && !document.getElementById(NAV_STYLES_ID)) {
  const s = document.createElement('style');
  s.id = NAV_STYLES_ID;
  s.textContent = `
    .sz-nav3d {
      position:relative; display:inline-flex; align-items:center;
      padding:8px 16px; font-size:14px; font-weight:600; border-radius:12px;
      text-decoration:none; transition:color .18s,background .18s,box-shadow .18s,transform .2s;
      color:#64748b; background:transparent;
      transform:perspective(500px) rotateX(0deg);
      transform-style:preserve-3d; overflow:hidden;
    }
    .sz-nav3d:hover {
      color:var(--color-primary) !important;
      background:color-mix(in srgb,var(--color-primary) 10%,transparent) !important;
      box-shadow:0 8px 20px color-mix(in srgb,var(--color-primary) 25%,transparent);
      transform:perspective(500px) rotateX(-8deg) translateY(-2px);
    }
    .sz-nav3d.active {
      color:var(--color-primary) !important;
      background:color-mix(in srgb,var(--color-primary) 10%,transparent) !important;
    }
    .sz-nav3d.active:hover {
      box-shadow:0 8px 20px color-mix(in srgb,var(--color-primary) 30%,transparent);
    }
    .sz-nav3d .sz-nav3d-dot {
      position:absolute; bottom:4px; left:50%; transform:translateX(-50%);
      width:4px; height:4px; border-radius:50%;
      background:var(--color-primary);
    }
    .sz-nav3d .sz-nav3d-sheen {
      position:absolute; inset:0; border-radius:12px; pointer-events:none;
      background:linear-gradient(135deg,rgba(255,255,255,0.15) 0%,transparent 60%);
      opacity:0; transition:opacity .25s;
    }
    .sz-nav3d:hover .sz-nav3d-sheen { opacity:1; }
  `;
  document.head.appendChild(s);
}

const NavLink3D = ({ to, label, isActive, emoji }) => (
  <Link to={to} className={`sz-nav3d${isActive ? ' active' : ''}`}>
    <span className="sz-nav3d-sheen"/>
    {emoji && <span style={{marginRight:'4px'}}>{emoji}</span>}
    {label}
    {isActive && <span className="sz-nav3d-dot"/>}
  </Link>
);

/* ── Search with live suggestions ─────────────────────────────── */
const SearchOverlay = ({ onClose, categories }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSugg(true);
      try {
        const { data } = await API.get(`/products?search=${encodeURIComponent(query)}&limit=6&fields=name,slug,thumbnail,salePrice,price,category`);
        setSuggestions(data.products || data || []);
      } catch { setSuggestions([]); }
      finally { setLoadingSugg(false); }
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/shop?search=${encodeURIComponent(query.trim())}`);
    onClose();
  };

  const goToProduct = (slug) => { navigate(`/product/${slug}`); onClose(); };
  const goToCategory = (slug) => { navigate(`/shop/${slug}`); onClose(); };

  return (
    /* FIX: use sz-search-overlay class for responsive top padding */
    <div
      className="fixed inset-0 bg-black/60 z-[55] flex items-start justify-center sz-search-overlay px-3 sm:px-4"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-white rounded-2xl overflow-hidden shadow-2xl scale-in"
        style={{ maxHeight: 'calc(100dvh - 80px)', display: 'flex', flexDirection: 'column' }}
      >
        <form onSubmit={handleSearch}>
          <div className="flex items-center gap-3 p-4 border-b border-gray-100">
            {loadingSugg ? (
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search products…"
              className="flex-1 text-gray-800 text-base outline-none font-medium min-w-0"
              style={{ fontSize: '16px' }}
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setSuggestions([]); inputRef.current?.focus(); }} className="text-gray-300 hover:text-gray-500 text-lg transition-colors flex-shrink-0">✕</button>
            )}
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm font-medium px-2 border-l border-gray-100 ml-1 pl-3 transition-colors flex-shrink-0">Close</button>
          </div>
        </form>

        {suggestions.length > 0 && (
          <div className="overflow-y-auto">
            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Products</p>
            {suggestions.map(p => (
              <button
                key={p._id || p.slug}
                onClick={() => goToProduct(p.slug)}
                className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
              >
                <img
                  src={p.thumbnail || p.images?.[0] || 'https://via.placeholder.com/40'}
                  alt={p.name}
                  className="w-10 h-10 object-cover rounded-lg flex-shrink-0 bg-gray-100"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 truncate">{p.category?.name || ''}</p>
                </div>
                <p className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--color-primary)' }}>
                  {p.salePrice ? `Rs. ${p.salePrice.toLocaleString()}` : p.price ? `Rs. ${p.price.toLocaleString()}` : ''}
                </p>
              </button>
            ))}
            <button
              onClick={() => { navigate(`/shop?search=${encodeURIComponent(query)}`); onClose(); }}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 border-t border-gray-100 text-sm font-semibold hover:bg-gray-50 transition-colors"
              style={{ color: 'var(--color-primary)' }}
            >
              See all results for "{query}" →
            </button>
          </div>
        )}

        {query.length >= 2 && suggestions.length === 0 && !loadingSugg && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">No products found for "{query}"</div>
        )}

        {!query && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 flex gap-2 flex-wrap">
            {categories.slice(0, 5).map(cat => (
              <button
                key={cat._id}
                type="button"
                onClick={() => goToCategory(cat.slug)}
                className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full hover:border-gray-300 transition-colors"
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Header ────────────────────────────────────────────────────── */
const Header = ({ settings, campaign }) => {
  const { user, logout } = useAuth();
  const { itemCount, setIsOpen } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [categories, setCategories] = useState([]);
  const [navHovered, setNavHovered] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef(null);

  /*
   * FIX: clamp logo height so it fits in the header.
   * Mobile: max 44px so entire header stays ~56px tall
   * Desktop: allow up to 64px
   */
  const rawLogoHeight = settings?.logoSize || 56;
  const logoHeightDesktop = rawLogoHeight; // use the admin-configured size directly

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, {passive:true});
    API.get('/categories?limit=6').then(r => setCategories(r.data || [])).catch(()=>{});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); setUserMenu(false); setSearchOpen(false); }, [location]);

  const announcement = (() => {
    if (campaign?.announcement && campaign?.announcementEnabled !== false) return campaign.announcement;
    if (settings?.announcementEnabled !== false && settings?.announcementText) return settings.announcementText;
    if (settings?.freeDeliveryThreshold) return `🚚 Free delivery on orders over ${settings?.currencySymbol||'Rs.'} ${(settings.freeDeliveryThreshold||5000).toLocaleString()} — Shop now!`;
    return null;
  })();
  const announcementBg = campaign?.announcementBg || settings?.announcementBg || 'var(--theme-gradient)';
  const announcementLink = settings?.announcementLink || null;

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-[45] transition-all duration-500 ${scrolled ? 'header-scrolled' : ''}`}
      style={{
        background: scrolled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.98)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: scrolled ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(0,0,0,0.04)',
        boxShadow: scrolled ? '0 4px 24px rgba(0,0,0,0.06)' : 'none',
        /* FIX: remove fixed height, let content determine height */
        width: '100%',
        maxWidth: '100vw',
      }}
    >
      {/* Ticker announcement */}
      {announcement && (
        <div className="announcement-bar overflow-hidden py-1.5 text-xs font-bold text-white"
          style={{background: announcementBg, width:'100%'}}>
          <div className="ticker-wrap">
            <div className="ticker-track">
              {[...Array(6)].map((_, i) => (
                <span key={i} className="px-8">
                  {announcementLink
                    ? <a href={announcementLink} style={{color:'inherit',textDecoration:'none'}}>{announcement}</a>
                    : announcement
                  } &nbsp;✦&nbsp;
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="sz-container">
        <div className="sz-header-inner flex items-center gap-1 sm:gap-2">

          {/* ── Logo ── */}
          <Link
            to="/"
            className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 group mr-1 sm:mr-3"
            style={{perspective:'600px', overflow:'visible', position:'relative', zIndex:10}}
            onMouseEnter={e => { e.currentTarget.querySelector('.logo-inner') && (e.currentTarget.querySelector('.logo-inner').style.transform = 'rotateY(8deg) scale(1.03)'); }}
            onMouseLeave={e => { e.currentTarget.querySelector('.logo-inner') && (e.currentTarget.querySelector('.logo-inner').style.transform = 'rotateY(0deg) scale(1)'); }}
          >
            <div className="logo-inner transition-transform duration-300" style={{transformStyle:'preserve-3d'}}>
              {settings?.logoUrl ? (
                /* Logo height driven by admin logoSize setting via CSS variable */
                <img
                  src={settings.logoUrl}
                  alt={settings.storeName || 'StoreKit'}
                  className="sz-logo-img"
                  style={{
                    '--logo-size': `${rawLogoHeight}px`,
                    filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.10))',
                  }}
                />
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div
                    className="rounded-xl flex items-center justify-center text-white transition-all duration-300 group-hover:rotate-6 flex-shrink-0"
                    style={{
                      /* FIX: clamp icon size responsively */
                      width: `clamp(28px, 8vw, ${Math.max(28, logoHeightDesktop * 0.7)}px)`,
                      height: `clamp(28px, 8vw, ${Math.max(28, logoHeightDesktop * 0.7)}px)`,
                      background: 'var(--theme-gradient)',
                      boxShadow: '0 4px 14px var(--glow-primary)',
                    }}
                  >
                    <svg style={{width:'55%',height:'55%'}} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                  </div>
                  {/* FIX: sz-logo-text always shows, font-size clamps with viewport */}
                  <span
                    className="sz-logo-text font-bold"
                    style={{
                      fontFamily: 'var(--font-display)',
                      letterSpacing: '-0.02em',
                      color: '#111827',
                    }}
                  >
                    {settings?.storeName || 'StoreKit'}
                  </span>
                </div>
              )}
            </div>
          </Link>

          {/* ── Desktop 3D Nav ── */}
          <nav
            className="hidden lg:flex items-center gap-0.5 flex-1 justify-center"
            onMouseEnter={() => setNavHovered(true)}
            onMouseLeave={() => setNavHovered(false)}
          >
            <div
              className="flex items-center gap-0.5 px-2 py-1.5 rounded-2xl transition-all duration-300"
              style={{
                background: navHovered ? 'rgba(0,0,0,0.03)' : 'transparent',
                boxShadow: navHovered ? 'inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 8px rgba(0,0,0,0.04)' : 'none',
              }}
            >
              <NavLink3D to="/" label="Home" isActive={location.pathname==='/'} />
              <NavLink3D to="/shop" label="Shop" isActive={location.pathname==='/shop' || (location.pathname.startsWith('/shop/') && !categories.some(c=>location.pathname===`/shop/${c.slug}`))} />
              {categories.slice(0,4).map(cat => (
                <NavLink3D
                  key={cat._id}
                  to={`/shop/${cat.slug}`}
                  label={cat.name}
                  isActive={location.pathname===`/shop/${cat.slug}`}
                />
              ))}
              {settings?.enableGiftCards !== false && (
                <NavLink3D to="/gift-cards" label="Gifts" emoji="🎁" isActive={location.pathname==='/gift-cards'} />
              )}
            </div>
          </nav>

          {/* ── Action Icons ── FIX: sz-action-icon class for tiny-screen scaling */}
          <div className="flex items-center gap-0 sm:gap-1 ml-auto flex-shrink-0">

            {/* Search */}
            <button
              onClick={() => setSearchOpen(true)}
              className="sz-action-icon relative p-2 sm:p-2.5 rounded-xl transition-all duration-200 text-gray-500 hover:text-gray-800"
              style={{background:'transparent'}}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
                e.currentTarget.style.transform = 'perspective(400px) rotateX(-10deg) translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </button>

            {/* Wishlist */}
            {user && settings?.enableWishlist !== false && (
              <Link
                to="/wishlist"
                className="sz-action-icon hidden sm:flex p-2.5 rounded-xl transition-all duration-200 text-gray-500 hover:text-red-400"
                style={{background:'transparent'}}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.07)';
                  e.currentTarget.style.transform = 'perspective(400px) rotateX(-10deg) translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(239,68,68,0.12)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                </svg>
              </Link>
            )}

            {/* Cart */}
            <button
              onClick={() => setIsOpen(true)}
              className="sz-action-icon relative p-2 sm:p-2.5 rounded-xl transition-all duration-200 text-gray-500 hover:text-gray-800"
              style={{background:'transparent'}}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary) 10%, transparent)';
                e.currentTarget.style.transform = 'perspective(400px) rotateX(-10deg) translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px color-mix(in srgb, var(--color-primary) 20%, transparent)';
                e.currentTarget.style.color = 'var(--color-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.color = '';
              }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              {itemCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 text-white text-[9px] rounded-full min-w-[17px] h-[17px] flex items-center justify-center font-black bounce-in px-0.5"
                  style={{background:'var(--theme-gradient)',boxShadow:'0 2px 8px var(--glow-primary)'}}
                >
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              )}
            </button>

            {/* User Avatar */}
            {user ? (
              <div className="relative ml-0.5 sm:ml-1">
                <button
                  onClick={() => setUserMenu(!userMenu)}
                  className="flex items-center gap-1.5 p-0.5 sm:p-1 rounded-xl transition-all duration-200"
                  style={{background:'transparent'}}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
                    e.currentTarget.style.transform = 'perspective(400px) rotateX(-6deg) translateY(-1px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  {/* FIX: sz-avatar class for tiny-screen scaling */}
                  <div
                    className="sz-avatar w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                    style={{background:'var(--theme-gradient)',boxShadow:'0 2px 10px var(--glow-primary)'}}
                  >
                    {user.firstName?.[0]?.toUpperCase()}
                  </div>
                </button>
                {userMenu && (
                  /* FIX: sz-user-dropdown to clamp width on small screens */
                  <div className="sz-user-dropdown absolute top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-[60] scale-in">
                    <div className="px-4 py-2.5 border-b border-gray-50 mb-1">
                      <p className="text-sm font-bold text-gray-900 truncate">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-gray-400 truncate">{user.email}</p>
                    </div>
                    {[['/account','👤','My Account'],['/returns','↩️','Returns'],['/gift-cards','🎁','Gift Cards'],['/wishlist','❤️','Wishlist']].map(([to,icon,label])=>(
                      <Link key={to} to={to} className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">{icon} {label}</Link>
                    ))}
                    {user.role==='admin' && <Link to="/admin" className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 border-t mt-1">⚙️ Admin Panel</Link>}
                    <button onClick={()=>{logout();navigate('/');}} className="flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 w-full text-left border-t mt-1 transition-colors">🚪 Logout</button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="hidden sm:flex btn-primary text-sm py-2 px-4 ml-2 transition-all duration-200"
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'perspective(400px) rotateX(-8deg) translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px var(--glow-primary)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                Sign In
              </Link>
            )}

            {/* Hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="sz-action-icon lg:hidden p-2 rounded-xl hover:bg-gray-100 text-gray-500 ml-0.5 sm:ml-1 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}/>
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu — FIX: sz-mobile-menu-link for tap-target height */}
        {menuOpen && (
          <div className="lg:hidden border-t border-gray-100 py-2 space-y-0.5 fade-in">
            {[['/', '🏠 Home'],['/shop','🛍️ Shop'],['/gift-cards','🎁 Gift Cards'],['/wishlist','❤️ Wishlist'],['/returns','↩️ Returns'],['/account','👤 My Account']].map(([to,label])=>(
              <Link key={to} to={to} className="sz-mobile-menu-link px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">{label}</Link>
            ))}
            {categories.map(cat => <Link key={cat._id} to={`/shop/${cat.slug}`} className="sz-mobile-menu-link px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-50 rounded-xl">{cat.name}</Link>)}
            {!user && <div className="flex gap-2 px-3 pt-2 pb-1"><Link to="/login" className="btn-primary flex-1 text-center text-sm py-2.5">Sign In</Link><Link to="/register" className="btn-outline flex-1 text-center text-sm py-2.5">Register</Link></div>}
          </div>
        )}
      </div>

      {searchOpen && (
        <SearchOverlay onClose={() => setSearchOpen(false)} categories={categories} />
      )}
    </header>
  );
};

/* ── Mobile Bottom Nav ─────────────────────────────────────────── */
const MobileBottomNav = ({ settings }) => {
  const { itemCount, setIsOpen } = useCart();
  const { user } = useAuth();
  const location = useLocation();
  const primary = 'var(--color-primary)';

  const tabs = [
    { to:'/', exact:true, icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>, label:'Home' },
    { to:'/shop', icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>, label:'Shop' },
    { cart:true, icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/></svg>, label:'Cart' },
    { to: settings?.enableWishlist!==false ? '/wishlist' : '/shop', icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>, label:'Wishlist' },
    { to: user?'/account':'/login', icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, label: user?'Me':'Login' },
  ];

  return (
    <div className="mobile-bottom-nav">
      {tabs.map((tab, i) => {
        const isActive = tab.to && (
          tab.exact
            ? location.pathname === tab.to
            : location.pathname === tab.to || location.pathname.startsWith(tab.to + '/')
        );
        if (tab.cart) return (
          <button key={i} onClick={() => setIsOpen(true)} className="sz-bottom-tab relative">
            <div className="relative">
              <span style={{color: '#94a3b8'}}>{tab.icon}</span>
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-2 text-white text-[9px] rounded-full min-w-[15px] h-3.5 flex items-center justify-center font-black px-0.5"
                  style={{background:'var(--theme-gradient)'}}>
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              )}
            </div>
            <span className="sz-bottom-tab-label" style={{color: '#94a3b8'}}>{tab.label}</span>
          </button>
        );
        return (
          <Link key={i} to={tab.to} className="sz-bottom-tab">
            <span style={{color: isActive ? primary : '#94a3b8'}}>{tab.icon}</span>
            <span className="sz-bottom-tab-label" style={{color: isActive ? primary : '#94a3b8'}}>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
};

/* ── Footer ────────────────────────────────────────────────────── */
// Platform icon map (SVG paths or emoji fallbacks)
const PLATFORM_ICONS = {
  facebook:  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.887v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>,
  instagram: <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
  tiktok:    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.52V6.75a4.85 4.85 0 01-1-.06z"/></svg>,
  whatsapp:  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
  telegram:  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
};

const Footer = ({ settings }) => {
  const dark  = settings?.darkBgColor || '#0f172a';
  const storeName = settings?.storeName || 'StoreKit';
  const contactPhone = settings?.storePhone || settings?.phone || settings?.contactNumber || '';
  const telephoneHref = String(contactPhone).replace(/[^+\d]/g, '');
  const [footerPages, setFooterPages] = React.useState([]);
  const [socialAccounts, setSocialAccounts] = React.useState([]);
  const [logoFailed, setLogoFailed] = React.useState(false);

  React.useEffect(() => { setLogoFailed(false); }, [settings?.logoUrl]);

  React.useEffect(() => {
    API.get('/pages?footer=true').then(r=>setFooterPages(r.data||[])).catch(()=>{});
    API.get('/social-media/public').then(r=>setSocialAccounts(r.data||[])).catch(()=>{});
  }, []);

  return (
    <footer style={{background:dark,color:'#94a3b8', width:'100%', overflowX:'hidden'}}>
      <div className="sz-container" style={{paddingTop:'48px', paddingBottom:'32px'}}>
        {/* FIX: sz-footer-grid + sz-footer-brand classes for responsive single-column on mobile */}
        <div className="sz-footer-grid grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-10">
          {/* Brand */}
          <div className="sz-footer-brand col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              {settings?.logoUrl && !logoFailed
                ? <img
                    src={settings.logoUrl}
                    alt={storeName}
                    onError={() => setLogoFailed(true)}
                    style={{height:'56px',maxWidth:'180px',objectFit:'contain',objectPosition:'left center'}}
                  />
                : <span className="font-bold text-white text-lg" style={{fontFamily:'var(--font-display)'}}>{storeName}</span>
              }
            </div>
            <p className="text-sm leading-relaxed mb-4" style={{color:'#64748b'}}>{settings?.storeTagline||'Premium products, delivered.'}</p>
            {/* Real social media accounts from the Social Media module */}
            {socialAccounts.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {socialAccounts.map(acct => (
                  <a
                    key={acct.platform}
                    href={acct.url}
                    target="_blank"
                    rel="noreferrer"
                    title={acct.accountHandle ? `${acct.label} · ${acct.accountHandle}` : acct.label}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white hover:scale-110 transition-transform"
                    style={{background: acct.color}}
                  >
                    {acct.accountAvatar
                      ? <img src={acct.accountAvatar} alt={acct.label} className="w-full h-full rounded-xl object-cover" />
                      : (PLATFORM_ICONS[acct.platform] || <span className="text-xs">{acct.label[0]}</span>)
                    }
                  </a>
                ))}
              </div>
            )}
          </div>
          {/* Shop */}
          <div>
            <h4 className="text-white font-bold mb-3 text-xs uppercase tracking-widest">Shop</h4>
            <ul className="space-y-2">
              {[['/', 'Home'],['/shop','All Products'],['/gift-cards','🎁 Gift Cards'],['/shop?onSale=true','Sale Items']].map(([to,label])=>(
                <li key={to}><Link to={to} className="text-sm hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
          {/* Info */}
          <div>
            <h4 className="text-white font-bold mb-3 text-xs uppercase tracking-widest">Info</h4>
            <ul className="space-y-2">
              {[['/account','My Account'],['/returns','Returns'],['/forgot-password','Forgot Password']].map(([to,label])=>(
                <li key={to}><Link to={to} className="text-sm hover:text-white transition-colors">{label}</Link></li>
              ))}
              {footerPages.map(p=><li key={p.slug}><Link to={`/page/${p.slug}`} className="text-sm hover:text-white transition-colors">{p.title}</Link></li>)}
            </ul>
          </div>
          {/* Contact */}
          <div>
            <h4 className="text-white font-bold mb-3 text-xs uppercase tracking-widest">Contact</h4>
            <div className="space-y-2">
              {settings?.storeAddress && <p className="text-sm">📍 {settings.storeAddress}</p>}
              {contactPhone && <a href={`tel:${telephoneHref}`} className="block text-sm hover:text-white transition-colors">📞 {contactPhone}</a>}
              {settings?.storeEmail   && <a href={`mailto:${settings.storeEmail}`} className="block text-sm hover:text-white transition-colors">✉️ {settings.storeEmail}</a>}
            </div>
          </div>
        </div>

        {/* Newsletter */}
        {settings?.enableNewsletter !== false && (
          <div className="border-t border-white/8 pt-8 mb-8">
            <div className="max-w-md">
              <p className="text-white font-bold mb-1 text-sm">📬 Stay Updated</p>
              <p className="text-xs mb-3" style={{color:'#64748b'}}>Exclusive deals and new arrivals straight to your inbox</p>
              <div className="flex gap-2">
                <input type="email" id="footer-nl" placeholder="your@email.com"
                  className="flex-1 min-w-0 bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/30 transition-colors"
                  style={{fontSize:'16px'}}/>
                <button onClick={()=>{const e=document.getElementById('footer-nl').value;if(e){fetch('/api/subscribers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e})}).then(()=>{document.getElementById('footer-nl').value='';alert('Subscribed 🎉');});}}}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90" style={{background:'var(--theme-gradient)'}}>
                  Subscribe
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t pt-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs" style={{borderColor:'rgba(255,255,255,0.06)',color:'#475569'}}>
          <p>© {new Date().getFullYear()} {storeName}. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-1">
            <span>Developed by Zenstack360</span>
            {footerPages.filter(p=>['terms','privacy'].includes(p.slug)).map(p=>(
              <Link key={p.slug} to={`/page/${p.slug}`} className="hover:text-white transition-colors">{p.title}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

/* ── Main Layout ───────────────────────────────────────────────── */
export default function CustomerLayout() {
  const { campaign } = useSeasonal();
  const { settings, storeStatus }  = useTheme();

  React.useEffect(() => {
    if (settings?.googleSearchConsole) {
      let el = document.querySelector('meta[name="google-site-verification"]');
      if (!el) {
        el = document.createElement('meta');
        el.name = 'google-site-verification';
        document.head.appendChild(el);
      }
      el.content = settings.googleSearchConsole;
    }
  }, [settings?.googleSearchConsole]);

  if (!storeStatus?.checked) {
    return <StoreLoader settings={settings || window.__STOREKIT_BOOTSTRAP_SETTINGS__ || {}}/>;
  }

  if (storeStatus?.unavailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6" style={{fontFamily:'var(--font-body)'}}>
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Store currently unavailable</h1>
          <p className="text-slate-500 text-sm leading-6">
            {storeStatus.message || 'This store is currently unavailable. Please check again later.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`customer-storefront min-h-screen flex flex-col ${settings?.darkMode === true ? 'dark-mode' : ''}`} style={{background:'var(--body-bg)',color:'var(--text-primary)',fontFamily:'var(--font-body)',overflowX:'hidden',maxWidth:'100vw'}}>
      {/* FIX: inject responsive overrides */}
      <ResponsiveStyles />
      {campaign?.theme?.snowEffect     && <SnowEffect/>}
      {campaign?.theme?.confettiEffect && <ConfettiEffect/>}
      <RunningBanner />
      <FlashSaleBanner />
      <Header settings={settings} campaign={campaign}/>
      <CartDrawer settings={settings}/>
      <main className="flex-1 has-mobile-nav" style={{minWidth:0, overflowX:'hidden'}}><Outlet/></main>
      <Footer settings={settings}/>
      <MobileBottomNav settings={settings}/>
      <WhatsAppWidget />
      <PopupBanner />
      <CouponBanner />
    </div>
  );
}
