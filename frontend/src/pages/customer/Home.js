import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import API from '../../utils/api';
import useSEO from '../../hooks/useSEO';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import { useSeasonal } from '../../context/SeasonalContext';
import { useAnimation } from '../../context/AnimationContext';
import {
  use3DTilt, useScrollReveal, MagneticButton
} from '../../components/Cinematic';
import toast from 'react-hot-toast';
import DealsSection from '../../components/DealsSection';

gsap.registerPlugin(ScrollTrigger);

const HOME_DATA_CACHE_TTL = 5 * 60 * 1000;

const getHomeDataCacheKey = () => {
  try { return window.location.hostname || 'default'; }
  catch { return 'default'; }
};

const readHomeDataCache = () => {
  try {
    const cache = window.__STOREKIT_HOME_DATA_CACHE__;
    const entry = cache?.[getHomeDataCacheKey()];
    if (!entry || Date.now() - entry.savedAt > HOME_DATA_CACHE_TTL) return null;
    return entry.data || null;
  } catch {
    return null;
  }
};

const writeHomeDataCache = (data) => {
  try {
    window.__STOREKIT_HOME_DATA_CACHE__ = window.__STOREKIT_HOME_DATA_CACHE__ || {};
    window.__STOREKIT_HOME_DATA_CACHE__[getHomeDataCacheKey()] = { data, savedAt: Date.now() };
    window.__STOREKIT_HOME_LOADED_ONCE__ = true;
  } catch {}
};

const hasLoadedHomeOnce = () => {
  try { return !!window.__STOREKIT_HOME_LOADED_ONCE__; }
  catch { return false; }
};

/* ── Stars ─────────────────────────────────────────────────────────────── */
const Stars = ({ r = 0 }) => (
  <div className="flex gap-0.5">
    {[1,2,3,4,5].map(s => (
      <svg key={s} className={`w-3 h-3 ${s<=Math.round(r)?'text-yellow-400':'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
      </svg>
    ))}
  </div>
);

/* ── 3D Product Card ────────────────────────────────────────────────────── */
const ProductCard = ({ product, settings, priority = false }) => {
  const { addItem }   = useCart();
  const { config }    = useAnimation();
  const cardRef       = useRef(null);
  const imgRef        = useRef(null);
  const shineRef      = useRef(null);
  const btnRef        = useRef(null);
  const [added, setAdded] = useState(false);

  const sym      = settings?.currencySymbol || 'Rs.';
  const isOnSale = product.isOnSale && product.salePrice;
  const discount = isOnSale ? Math.round(((product.price-product.salePrice)/product.price)*100) : 0;
  const price    = isOnSale ? product.salePrice : product.price;
  const hasVars  = product.variants?.length > 0;

  use3DTilt(cardRef, { rotMax: config.cardTiltMax||16, scaleHover: 1.03, glowColor: 'var(--glow-primary)' });

  /* Image parallax inside card */
  useEffect(() => {
    if (!config.cardImageParallax) return;
    const card = cardRef.current, img = imgRef.current;
    if (!card || !img) return;
    const onMove = (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX-rect.left)/rect.width-0.5;
      const y = (e.clientY-rect.top)/rect.height-0.5;
      gsap.to(img, { x: x*14, y: y*10, scale: 1.1, duration: 0.45, ease: 'power2.out' });
    };
    const onLeave = () => gsap.to(img, { x:0, y:0, scale:1, duration: 0.7, ease: 'elastic.out(1,0.4)' });
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
    return () => { card.removeEventListener('mousemove', onMove); card.removeEventListener('mouseleave', onLeave); };
  }, [config.cardImageParallax]);

  /* Shine sweep */
  useEffect(() => {
    if (!config.cardShine) return;
    const card = cardRef.current, shine = shineRef.current;
    if (!card || !shine) return;
    const enter = () => gsap.fromTo(shine, { x:'-120%' }, { x:'230%', duration:0.75, ease:'power2.out' });
    card.addEventListener('mouseenter', enter);
    return () => card.removeEventListener('mouseenter', enter);
  }, [config.cardShine]);

  const handleAdd = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (product.stock===0 || hasVars) return;
    addItem(product);
    setAdded(true);

    /* Button spring */
    const btn = btnRef.current;
    if (btn) {
      gsap.timeline()
        .to(btn, { scale:0, duration:0.1, ease:'power2.in' })
        .to(btn, { scale:1.5, duration:0.2, ease:'back.out(2)' })
        .to(btn, { scale:1, duration:0.35, ease:'elastic.out(1,0.4)' });
    }
    /* Card shake */
    gsap.to(cardRef.current, { keyframes:[{x:-5,duration:0.07},{x:5,duration:0.07},{x:-3,duration:0.07},{x:3,duration:0.07},{x:0,duration:0.07}] });

    /* Toast */
    const toastStyle = config.cartToastStyle || 'cinematic';
    if (toastStyle === 'pill') {
      toast.success(`Added: ${product.name.slice(0,24)}`, { duration: config.cartToastDuration||3000, position: config.cartToastPos||'bottom-right' });
    } else {
      toast.custom(t => (
        <div onClick={() => toast.dismiss(t.id)}
          className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border-2 cursor-pointer ${t.visible?'fade-up':''}`}
          style={{ background:'var(--card-bg)', borderColor:'var(--color-primary)', minWidth:250, maxWidth:320 }}>
          <div className="relative flex-shrink-0">
            <img src={product.thumbnail||product.images?.[0]||'https://via.placeholder.com/48'} alt=""
              className="w-12 h-12 rounded-xl object-cover"/>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-black"
              style={{ background:'var(--theme-gradient)' }}>✓</div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black" style={{ color:'var(--color-primary)', fontFamily:'var(--font-display)' }}>Added to Cart! 🛒</p>
            <p className="text-xs text-gray-500 truncate mt-0.5">{product.name}</p>
            <p className="text-xs font-bold mt-0.5" style={{ color:'var(--color-primary)' }}>{sym} {price?.toLocaleString()}</p>
          </div>
          <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2}/></svg>
        </div>
      ), { duration: config.cartToastDuration||3000, position: config.cartToastPos||'bottom-right' });
    }
    setTimeout(() => setAdded(false), 1600);
  };

  return (
    <article ref={cardRef} className="product-card group" style={{ transformStyle:'preserve-3d', willChange:'transform' }}>
      <Link to={`/product/${product.slug}`} className="block relative overflow-hidden bg-gray-50" style={{ aspectRatio:'1/1' }}>
        <img ref={imgRef} src={product.thumbnail||product.images?.[0]||'https://via.placeholder.com/300'} alt={product.name}
          loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'}
          className="w-full h-full object-cover" style={{ willChange: config.reducedMotion ? 'auto' : 'transform' }}/>
        <div ref={shineRef} className="absolute inset-0 pointer-events-none z-10"
          style={{ background:'linear-gradient(105deg,transparent 20%,rgba(255,255,255,0.3) 50%,transparent 80%)', transform:'translateX(-120%)' }}/>
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500"/>
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 z-20">
          {isOnSale && <span className="badge badge-sale">{discount}% OFF</span>}
          {product.isFeatured && !isOnSale && <span className="badge badge-featured">Featured</span>}
          {product.stock===0 && <span className="badge badge-hot">Sold Out</span>}
          {product.stock>0 && product.stock<=(product.lowStockThreshold||5) && !isOnSale && <span className="badge badge-sale">Low Stock</span>}
        </div>
        {hasVars && (
          <div className="absolute bottom-2.5 right-2.5 z-20 glass text-[10px] font-bold text-gray-700 px-2 py-1 rounded-full">
            {product.variants.map(v=>v.name).join(' · ')}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-3 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-400 z-20">
          <Link to={`/product/${product.slug}`} className="block text-center text-xs font-bold text-white py-2 rounded-xl"
            style={{ background:'rgba(0,0,0,0.55)', backdropFilter:'blur(10px)' }}>
            Quick View →
          </Link>
        </div>
      </Link>
      <div className="p-3.5 sm:p-4" style={{ background:'var(--card-bg)' }}>
        <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color:'var(--color-primary)', opacity:0.65 }}>
          {product.category?.name||''}
        </p>
        <Link to={`/product/${product.slug}`}>
          <h3 className="font-bold text-sm sm:text-[15px] leading-snug line-clamp-2 mb-2 hover:opacity-60 transition-opacity"
            style={{ fontFamily:'var(--font-display)', color:'var(--color-dark)' }}>{product.name}</h3>
        </Link>
        {product.ratings?.count>0 && (
          <div className="flex items-center gap-1 mb-2"><Stars r={product.ratings.average}/><span className="text-[11px] text-gray-400">({product.ratings.count})</span></div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="font-black text-base sm:text-lg" style={{ fontFamily:'var(--font-display)', color:'var(--color-dark)' }}>
              {sym} {price?.toLocaleString()}
            </span>
            {isOnSale && <span className="text-xs text-gray-400 line-through ml-1.5 hidden sm:inline">{sym} {product.price?.toLocaleString()}</span>}
          </div>
          {hasVars ? (
            <Link to={`/product/${product.slug}`} className="flex-shrink-0 text-xs px-3 py-1.5 rounded-xl font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{ background:'var(--theme-gradient)' }}>Select</Link>
          ) : (
            <button ref={btnRef} onClick={handleAdd} disabled={product.stock===0}
              className={`relative w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden transition-colors ${product.stock>0?'text-white':'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
              style={product.stock>0 ? { background:added?'#16a34a':'var(--theme-gradient)', boxShadow:added?'0 6px 24px rgba(22,163,74,0.5)':'0 4px 18px var(--glow-primary)' } : {}}>
              {added
                ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              }
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

/* ── Hero Slider ─────────────────────────────────────────────────────────── */
const HeroSlider = ({ banners, settings, campaign, anim }) => {
  const [current, setCurrent] = useState(0);
  const [trans, setTrans]     = useState(false);
  const sectionRef = useRef(null);
  const bgRef      = useRef(null);
  const textRef    = useRef(null);
  const orbRef0=useRef(null),orbRef1=useRef(null),orbRef2=useRef(null),orbRef3=useRef(null);
  const orbs=useMemo(()=>[orbRef0,orbRef1,orbRef2,orbRef3],[]);
  const navigate   = useNavigate();
  const timerRef   = useRef(null);

  /* Parse settings */
  const heroStats  = useMemo(() => { try { return JSON.parse(settings?.heroStats||'[]'); } catch { return []; } }, [settings?.heroStats]);
  const showStats  = settings?.heroShowStats !== false;
  const browseLabel = settings?.heroBrowseAllLabel || 'Browse All';

  const defaultSlides = useMemo(() => [{
    title:      settings?.storeName || 'StoreKit',
    subtitle:   settings?.storeTagline || 'Premium products, delivered fast',
    buttonText: 'Shop Now', link: '/shop',
  }], [settings]);

  const slides = useMemo(() =>
    banners.length>0 ? banners
    : campaign?.featuredBannerTitle ? [{title:campaign.featuredBannerTitle,subtitle:campaign.featuredBannerSubtitle,buttonText:'Shop Deals',link:'/shop?onSale=true'}]
    : defaultSlides,
  [banners, campaign, defaultSlides]);

  /* Orb animation */
  useEffect(() => {
    if (!anim.heroOrbs) return;
    orbs.forEach((orb, i) => {
      if (!orb.current) return;
      gsap.to(orb.current, { x:30+i*10, y:-25+i*8, duration:5+i*2, yoyo:true, repeat:-1, ease:'sine.inOut', delay:i*0.8 });
    });
  }, [anim.heroOrbs, orbs]);

  /* Scroll parallax */
  useEffect(() => {
    if (!bgRef.current || !sectionRef.current || !anim.heroParallax) return;
    const pi = anim.parallaxIntensity ?? 1;
    const st = ScrollTrigger.create({
      trigger: sectionRef.current, start:'top top', end:'bottom top', scrub:1.5,
      onUpdate: s => gsap.set(bgRef.current, { y: s.progress*200*pi, scale:1+s.progress*0.05 }),
    });
    return () => st.kill();
  }, [anim.heroParallax, anim.parallaxIntensity]);

  /* Mount entrance */
  useEffect(() => {
    if (!textRef.current?.children) return;
    const style = anim.heroTextStyle || '3d';
    const fromMap = {
      '3d':         { opacity:0, y:80, rotateX:32, transformPerspective:750 },
      'slide':      { opacity:0, y:60 },
      'fade':       { opacity:0, scale:0.94 },
      'typewriter': { opacity:0, x:-20 },
    };
    gsap.fromTo([...textRef.current.children], fromMap[style]||fromMap['3d'],
      { opacity:1, y:0, x:0, rotateX:0, scale:1, duration:1.1, stagger:0.15, ease:'power3.out', delay:0.25 }
    );
  }, [anim.heroTextStyle]);

  const goToRef=useRef(null);
  const startTimerRef=useRef(null);
  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    if (!anim.heroAutoplay || slides.length<2) return;
    timerRef.current = setInterval(() => setCurrent(c => { const n=(c+1)%slides.length; if(goToRef.current) goToRef.current(n); return c; }), anim.heroInterval||6000);
  }, [anim.heroAutoplay, anim.heroInterval, slides.length]);

  const goTo = useCallback((idx) => {
    if (trans || idx===current) return;
    setTrans(true);
    clearInterval(timerRef.current);
    const style = anim.heroTextStyle || '3d';
    const exitMap = {
      '3d':    { opacity:0, y:-55, rotateX:-28, rotateY:-6, transformPerspective:800 },
      'slide': { opacity:0, y:-50 },
      'fade':  { opacity:0, scale:0.92 },
      'typewriter':{ opacity:0, x:40 },
    };
    const enterMap = {
      '3d':    { opacity:0, y:65, rotateX:28, rotateY:6, transformPerspective:800 },
      'slide': { opacity:0, y:55 },
      'fade':  { opacity:0, scale:0.92 },
      'typewriter':{ opacity:0, x:-40 },
    };
    gsap.timeline({ onComplete: () => {
      setCurrent(idx);
      gsap.fromTo([...textRef.current.children], enterMap[style]||enterMap['3d'],
        { opacity:1, y:0, x:0, rotateX:0, rotateY:0, scale:1, duration:0.85, stagger:0.12, ease:'power3.out',
          onComplete: () => { setTrans(false); if(startTimerRef.current) startTimerRef.current(); } }
      );
      gsap.fromTo(bgRef.current, { opacity:0.35, scale:1.08 }, { opacity:1, scale:1, duration:1, ease:'power2.out' });
    }})
    .to([...textRef.current.children], { ...exitMap[style]||exitMap['3d'], duration:0.45, stagger:0.07, ease:'power2.in' }, 0)
    .to(bgRef.current, { scale:1.08, duration:0.45, ease:'power2.in' }, 0);
  }, [trans, current, anim.heroTextStyle]);
  useEffect(()=>{goToRef.current=goTo;},[goTo]);
  useEffect(()=>{startTimerRef.current=startTimer;},[startTimer]);

  useEffect(() => { startTimer(); return () => clearInterval(timerRef.current); }, [startTimer]);

  const slide = slides[current]||slides[0];
  const showOrbs = anim.heroOrbs && !slide.image;
  const orbCount = Math.min(anim.heroOrbCount||4, 4);

  return (
    <section ref={sectionRef} className="relative overflow-hidden" style={{ minHeight:'clamp(440px,64vw,700px)' }}>
      {/* BG */}
      <div ref={bgRef} className="absolute will-change-transform" style={{ inset:0, top:'-14%', height:'128%', transformOrigin:'center center' }}>
        {slide.image
          ? <img src={slide.image} alt="" className="w-full h-full object-cover" loading="eager" decoding="async" fetchPriority="high"/>
          : (
            <div className="w-full h-full relative" style={{ background:'var(--hero-gradient)' }}>
              {/* Animated orbs */}
              {showOrbs && orbs.slice(0,orbCount).map((orb,i) => (
                <div key={i} ref={orb} className="absolute will-change-transform" style={{
                  top: i===0?'8%':i===1?'65%':i===2?'35%':'15%',
                  left: i===0?'auto':i===1?'auto':i===2?'40%':'60%',
                  right: i===0?'12%':i===1?'6%':'auto',
                  width:300+i*60, height:300+i*60,
                }}>
                  <div className="w-full h-full rounded-full morph-blob" style={{
                    background: i%2===0 ? 'var(--color-accent)' : 'var(--color-primary-light)',
                    filter:'blur(70px)', opacity:0.28-i*0.04,
                  }}/>
                </div>
              ))}
              {anim.heroDotGrid && <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none"/>}
              {anim.heroScanlines && (
                <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
                  style={{ backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.09) 3px,rgba(255,255,255,0.09) 4px)' }}/>
              )}
              {/* Noise overlay */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`, opacity:0.4 }}/>
            </div>
          )
        }
        {slide.image && <div className="absolute inset-0" style={{ background:'linear-gradient(110deg,rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.45) 55%,rgba(0,0,0,0.12) 100%)' }}/>}
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 flex items-center" style={{ minHeight:'clamp(440px,64vw,700px)' }}>
        <div className="max-w-2xl" style={{ transformStyle:'preserve-3d' }}>
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-5 border border-white/20"
            style={{ background:'rgba(255,255,255,0.1)', backdropFilter:'blur(16px)' }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75"/>
              <span className="relative h-2 w-2 rounded-full bg-green-400"/>
            </span>
            <span className="text-white/90 text-xs font-black uppercase tracking-widest">
              {campaign?.name || settings?.storeTagline?.split(' ').slice(0,3).join(' ') || settings?.storeName || 'Premium Store'}
            </span>
          </div>

          <div ref={textRef} className="space-y-4 sm:space-y-5">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.01]"
              style={{ fontFamily:'var(--font-display)', letterSpacing:'-0.04em',
                textShadow:slide.image?'0 4px 32px rgba(0,0,0,0.5)':'0 2px 40px rgba(0,0,0,0.25)' }}>
              {slide.title}
            </h1>
            {slide.subtitle && (
              <p className="text-white/80 text-base sm:text-xl leading-relaxed max-w-lg">
                {slide.subtitle}
              </p>
            )}
            <div className="flex flex-wrap gap-3 pt-1">
              <MagneticButton onClick={() => navigate(slide.link||'/shop')}
                className="btn-primary text-sm sm:text-base px-8 sm:px-10 py-4 inline-flex items-center gap-2">
                {slide.buttonText||'Shop Now'}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </MagneticButton>
              <Link to="/shop" className="btn-ghost text-sm sm:text-base px-7 py-4">{browseLabel}</Link>
            </div>
            {!slide.image && showStats && heroStats.length>0 && (
              <div className="flex gap-8 pt-3">
                {heroStats.map(s => (
                  <div key={s.label}>
                    <p className="text-2xl sm:text-3xl font-black text-white" style={{ fontFamily:'var(--font-display)', letterSpacing:'-0.03em' }}>{s.number}</p>
                    <p className="text-xs text-white/50 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      {slides.length>1 && (
        <>
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {slides.map((_,i) => (
              <button key={i} onClick={()=>goTo(i)}
                className="rounded-full transition-all duration-500"
                style={{ width:i===current?28:10, height:10, background:i===current?'white':'rgba(255,255,255,0.35)' }}/>
            ))}
          </div>
          {[['left-4','‹',(current-1+slides.length)%slides.length],['right-4','›',(current+1)%slides.length]].map(([pos,ch,idx])=>(
            <button key={pos} onClick={()=>goTo(idx)}
              className="absolute top-1/2 -translate-y-1/2 z-20 glass-dark w-12 h-12 rounded-2xl text-white text-2xl font-light items-center justify-center hover:bg-white/20 transition-all hidden sm:flex"
              style={{ [pos.split('-')[0]]: '1rem' }}>{ch}</button>
          ))}
        </>
      )}

      {/* Wave */}
      {anim.heroWave && (
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 90" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ display:'block', height:90 }}>
            <path d="M0 90L48 78C96 66 192 42 288 33C384 24 480 30 576 36C672 42 768 48 864 45C960 42 1056 30 1152 24C1248 18 1344 18 1392 18L1440 18V90H0Z" fill="var(--body-bg)"/>
          </svg>
        </div>
      )}
    </section>
  );
};

/* ── Trust Bar — fully from settings ──────────────────────────────────── */
const TrustBar = ({ settings }) => {
  const ref = useRef(null);
  const { config } = useAnimation();
  const badges = useMemo(() => {
    try { return JSON.parse(settings?.trustBadges||'[]').filter(b=>b.enabled!==false); }
    catch { return []; }
  }, [settings?.trustBadges]);

  useEffect(() => {
    if (!ref.current || !badges.length) return;
    if (config.reducedMotion) return;
    const items = [...ref.current.children];
    gsap.fromTo(items,
      { opacity:0, y:20, scale:0.9 },
      { opacity:1, y:0, scale:1, duration:0.55, stagger:0.1, ease:'back.out(1.5)',
        scrollTrigger:{ trigger:ref.current, start:'top 90%', toggleActions:'play none none none' } }
    );
  }, [badges, config.reducedMotion]);

  if (!badges.length) return null;

  return (
    <div className="border-b overflow-x-auto" style={{ background:'var(--card-bg)', borderColor:'var(--card-border)' }}>
      <div ref={ref} className="flex items-center max-w-7xl mx-auto">
        {badges.map((b, i) => (
          <div key={i} className="flex items-center gap-2.5 px-5 sm:px-8 py-3 sm:py-4 flex-shrink-0 border-r last:border-r-0"
            style={{ borderColor:'var(--card-border)' }}>
            <span className="text-xl sm:text-2xl">{b.icon}</span>
            <div className="hidden sm:block">
              <p className="text-xs font-bold whitespace-nowrap" style={{ color:'var(--color-dark)' }}>{b.title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 whitespace-nowrap">{b.subtitle}</p>
            </div>
            <p className="text-xs font-bold sm:hidden whitespace-nowrap" style={{ color:'var(--color-dark)' }}>{b.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Category Card ────────────────────────────────────────────────────── */
const CategoryCard = ({ cat }) => {
  const ref     = useRef(null);
  const iconRef = useRef(null);
  const ICONS   = {electronics:'📱',household:'🏠',appliances:'🔌',furniture:'🛋️',clothing:'👕',fashion:'👗',accessories:'💼',audio:'🎧','smart-home':'💡',food:'🍕',pharmacy:'💊',books:'📚',sports:'⚽',auto:'🚗',grocery:'🛒',jewelry:'💍',beauty:'💄',toys:'🧸'};
  use3DTilt(ref, { rotMax:22, scaleHover:1.08 });
  useEffect(() => {
    const card=ref.current, icon=iconRef.current;
    if(!card||!icon) return;
    const enter=()=>gsap.to(icon,{y:-7,scale:1.22,duration:0.4,ease:'back.out(1.5)'});
    const leave=()=>gsap.to(icon,{y:0,scale:1,duration:0.55,ease:'elastic.out(1,0.4)'});
    card.addEventListener('mouseenter',enter);
    card.addEventListener('mouseleave',leave);
    return()=>{card.removeEventListener('mouseenter',enter);card.removeEventListener('mouseleave',leave);};
  },[]);
  return (
    <Link ref={ref} to={`/shop/${cat.slug}`}
      className="category-card flex flex-col items-center gap-2.5 p-3 sm:p-5 rounded-2xl border cursor-pointer"
      style={{ background:'var(--card-bg)', borderColor:'var(--card-border)', transformStyle:'preserve-3d', willChange:'transform', transition:'border-color 0.3s,box-shadow 0.3s' }}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--color-primary)';e.currentTarget.style.boxShadow='0 20px 60px rgba(0,0,0,0.1),0 0 0 2px var(--color-primary)';}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--card-border)';e.currentTarget.style.boxShadow='';}}>
      <div ref={iconRef} className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl"
        style={{ background:'linear-gradient(135deg,var(--color-primary)20,var(--color-accent)10)', willChange:'transform' }}>
        {cat.image
          ? <img src={cat.image} alt={cat.name} className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded-xl" loading="lazy" decoding="async"/>
          : <span>{ICONS[cat.slug]||'🛍️'}</span>}
      </div>
      <span className="text-xs sm:text-sm font-bold text-center leading-tight" style={{ color:'var(--color-dark)' }}>{cat.name}</span>
    </Link>
  );
};

/* ── Brand Logo Tile ───────────────────────────────────────────────────── */
const BrandLogoCard = ({ brand }) => {
  const ref = useRef(null);
  const initials = String(brand.name || 'Brand')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();

  use3DTilt(ref, { rotMax:12, scaleHover:1.04 });

  return (
    <Link ref={ref} to={`/brand/${brand.slug}`} className="group block rounded-2xl border p-4 sm:p-5 transition-all"
      style={{ background:'var(--card-bg)', borderColor:'var(--card-border)', transformStyle:'preserve-3d', willChange:'transform' }}
      onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--color-primary)';e.currentTarget.style.boxShadow='0 16px 44px rgba(0,0,0,0.09)';}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--card-border)';e.currentTarget.style.boxShadow='';}}>
      <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center overflow-hidden mb-3"
        style={{ background:'linear-gradient(135deg,var(--color-primary)10,var(--color-accent)08)' }}>
        {brand.image ? (
          <img src={brand.image} alt={brand.name} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" loading="lazy" decoding="async"/>
        ) : (
          <span className="text-lg sm:text-xl font-black" style={{ color:'var(--color-primary)', fontFamily:'var(--font-display)' }}>{initials}</span>
        )}
      </div>
      <p className="text-sm font-black text-center truncate" style={{ color:'var(--color-dark)', fontFamily:'var(--font-display)' }}>{brand.name}</p>
      <p className="text-[11px] text-gray-400 text-center mt-1">{brand.productCount} product{brand.productCount===1?'':'s'}</p>
    </Link>
  );
};

/* ── Section Heading — from settings ─────────────────────────────────── */
const SectionHeading = ({ title, subtitle, link, linkLabel='View All →' }) => {
  const headRef=useRef(null), subRef=useRef(null), lnkRef=useRef(null);
  useEffect(() => {
    [headRef,subRef,lnkRef].filter(r=>r.current).forEach((r,i) => {
      gsap.fromTo(r.current,
        { opacity:0, y:35, rotateX:15, transformPerspective:700 },
        { opacity:1, y:0, rotateX:0, duration:0.75, ease:'power3.out', delay:i*0.08,
          scrollTrigger:{ trigger:r.current, start:'top 88%', toggleActions:'play none none none' } }
      );
    });
  },[]);
  return (
    <div className="flex items-end justify-between mb-6 sm:mb-8">
      <div>
        <h2 ref={headRef} className="text-2xl sm:text-3xl lg:text-4xl font-black leading-tight"
          style={{ fontFamily:'var(--font-display)', letterSpacing:'-0.028em', color:'var(--color-dark)' }}>{title}</h2>
        {subtitle && <p ref={subRef} className="text-gray-400 text-sm mt-1.5">{subtitle}</p>}
      </div>
      {link && (
        <Link ref={lnkRef} to={link} className="text-sm font-bold flex items-center gap-1 hover:gap-2 transition-all flex-shrink-0 ml-4 group" style={{ color:'var(--color-primary)' }}>
          {linkLabel}
          <svg className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </Link>
      )}
    </div>
  );
};

/* ── Animated Grid ────────────────────────────────────────────────────── */
const AnimatedGrid = ({ products, settings }) => {
  const { config } = useAnimation();
  const gridRef = useRef(null);
  useEffect(() => {
    if (!gridRef.current||!products.length) return;
    if (config.reducedMotion) {
      gsap.set([...gridRef.current.children], { opacity: 1, y: 0, rotateX: 0, rotateY: 0, scale: 1 });
      return;
    }
    const style = config.cardRevealStyle||'3d';
    const froms = {
      '3d':    (i)=>({ opacity:0, y:70, rotateX:20, rotateY:i%2===0?-5:5, transformPerspective:1000 }),
      'slide': ()=>({ opacity:0, y:60 }),
      'fade':  ()=>({ opacity:0, scale:0.88 }),
      'flip':  (i)=>({ opacity:0, rotateY:i%2===0?-60:60, transformPerspective:800 }),
    };
    const fromFn = froms[style] || froms['3d'];
    [...gridRef.current.children].forEach((card,i) => {
      gsap.fromTo(card, fromFn(i),
        { opacity:1, y:0, rotateX:0, rotateY:0, scale:1, duration:0.85, ease:'power3.out',
          delay:(i%4)*(config.staggerDelay||0.09),
          scrollTrigger:{ trigger:card, start:'top 91%', toggleActions:'play none none none' } }
      );
    });
  }, [products, config.cardRevealStyle, config.reducedMotion, config.staggerDelay]);
  return (
    <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
      {products.map((p, index) => <ProductCard key={p._id} product={p} settings={settings} priority={index < 4}/>)}
    </div>
  );
};

/* ── Promo Banner with deep parallax ─────────────────────────────────── */
const PromoBanner = ({ banner, tall=false }) => {
  const { config } = useAnimation();
  const wrapRef=useRef(null), imgRef=useRef(null), txtRef=useRef(null), shineRef=useRef(null);
  /* Entrance 3D */
  useEffect(() => {
    if (!wrapRef.current) return;
    if (config.reducedMotion) return;
    const anim = gsap.fromTo(wrapRef.current,
      { opacity:0, y:80, rotateX:20, rotateY:-5, transformPerspective:900 },
      { opacity:1, y:0, rotateX:0, rotateY:0, duration:1, ease:'power3.out',
        scrollTrigger:{ trigger:wrapRef.current, start:'top 88%', toggleActions:'play none none none' } }
    );
    return()=>{anim.scrollTrigger?.kill();anim.kill();};
  },[config.reducedMotion]);
  /* Deep parallax on image */
  useEffect(() => {
    if (!imgRef.current||!wrapRef.current||!config.bannerParallax) return;
    const pi = config.parallaxIntensity||1;
    const st = ScrollTrigger.create({
      trigger:wrapRef.current, start:'top bottom', end:'bottom top', scrub:1.2,
      onUpdate: s => gsap.set(imgRef.current,{ y: s.progress*90*pi }),
    });
    return()=>st.kill();
  },[config.bannerParallax, config.parallaxIntensity]);
  /* Text counter-parallax */
  useEffect(() => {
    if (!txtRef.current||!wrapRef.current||config.reducedMotion) return;
    const st = ScrollTrigger.create({
      trigger:wrapRef.current, start:'top bottom', end:'bottom top', scrub:0.8,
      onUpdate: s => gsap.set(txtRef.current,{ y: s.progress*-35 }),
    });
    return()=>st.kill();
  },[config.reducedMotion]);
  /* Shine */
  useEffect(() => {
    if (!wrapRef.current||!shineRef.current||!config.bannerShine) return;
    const wrapElement = wrapRef.current;
    const enter=()=>gsap.fromTo(shineRef.current,{x:'-120%'},{x:'230%',duration:0.85,ease:'power2.out'});
    wrapElement.addEventListener('mouseenter',enter);
    return()=>wrapElement.removeEventListener('mouseenter',enter);
  },[config.bannerShine]);

  return (
    <Link ref={wrapRef} to={banner.link||'/shop'}
      className="relative rounded-3xl overflow-hidden block group"
      style={{ minHeight:tall?280:210, transformStyle:'preserve-3d', willChange:'transform' }}>
      <div ref={imgRef} className="absolute will-change-transform" style={{ inset:'-12%', top:'-16%', height:'132%' }}>
        {banner.image
          ? <img src={banner.image} alt={banner.title||''} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" decoding="async"/>
          : <div className="w-full h-full" style={{ background:'var(--theme-gradient)' }}/>}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"/>
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent"/>
      <div ref={shineRef} className="absolute inset-0 pointer-events-none z-10"
        style={{ background:'linear-gradient(105deg,transparent 15%,rgba(255,255,255,0.25) 50%,transparent 85%)', transform:'translateX(-120%)' }}/>
      <div ref={txtRef} className="relative z-10 p-5 sm:p-8 h-full flex flex-col justify-end will-change-transform"
        style={{ minHeight:tall?280:210 }}>
        {banner.title && <h3 className="text-xl sm:text-3xl font-black text-white mb-1.5 leading-tight"
          style={{ fontFamily:'var(--font-display)', textShadow:'0 3px 16px rgba(0,0,0,0.5)' }}>{banner.title}</h3>}
        {banner.subtitle && <p className="text-white/80 text-sm mb-3 line-clamp-2">{banner.subtitle}</p>}
        {banner.buttonText && (
          <span className="self-start text-sm font-bold text-white px-5 py-2.5 rounded-xl border border-white/35 backdrop-blur-md group-hover:-translate-y-1 transition-transform duration-300"
            style={{ background:'rgba(255,255,255,0.12)' }}>{banner.buttonText} →</span>
        )}
      </div>
    </Link>
  );
};

/* ── Newsletter — fully from settings ───────────────────────────────── */
const NewsletterSection = ({ settings }) => {
  const ref = useRef(null);
  use3DTilt(ref, { rotMax:7, scaleHover:1.01 });
  useScrollReveal(ref, {
    from:{ opacity:0, y:60, rotateX:14, transformPerspective:900 },
    to:{ opacity:1, y:0, rotateX:0 }, duration:1,
    start: 'top 90%',
  });

  const title      = settings?.newsletterTitle      || 'Stay Updated';
  const subtitle   = settings?.newsletterSubtitle   || 'Exclusive deals and new arrivals in your inbox.';
  const cta        = settings?.newsletterCta        || 'Subscribe';
  const disclaimer = settings?.newsletterDisclaimer || 'No spam. Unsubscribe any time.';
  const badge      = settings?.newsletterBadgeLabel || 'Newsletter';

  return (
    <section className="py-14 sm:py-20 overflow-hidden" style={{ background:'var(--card-bg)' }}>
      <div ref={ref} className="max-w-xl mx-auto px-4" style={{ transformStyle:'preserve-3d' }}>
        <div className="text-center p-8 sm:p-12 rounded-3xl relative overflow-hidden"
          style={{ background:'linear-gradient(135deg,var(--color-primary)08,var(--color-accent)06)', border:'1.5px solid var(--color-primary)20' }}>
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background:'var(--color-accent)' }}/>
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full blur-3xl opacity-15" style={{ background:'var(--color-primary)' }}/>
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-5 border text-xs font-black uppercase tracking-wider"
              style={{ background:'var(--color-primary)12', borderColor:'var(--color-primary)30', color:'var(--color-primary)' }}>
              📬 {badge}
            </div>
            <h2 className="text-2xl sm:text-4xl font-black mb-2 leading-tight"
              style={{ fontFamily:'var(--font-display)', letterSpacing:'-0.025em', color:'var(--color-dark)' }}>{title}</h2>
            <p className="text-gray-400 text-sm sm:text-base mb-6">{subtitle}</p>
            <div className="flex gap-2 max-w-sm mx-auto">
              <input type="email" id="home-nl" placeholder="your@email.com" className="form-input flex-1 text-sm"/>
              <MagneticButton onClick={() => {
                const e=document.getElementById('home-nl').value;
                if(e){fetch('/api/subscribers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e})})
                  .then(()=>{document.getElementById('home-nl').value='';toast.success('Subscribed! 🎉');}).catch(()=>{});}
              }} className="btn-primary text-sm px-5 flex-shrink-0">{cta}</MagneticButton>
            </div>
            {disclaimer && <p className="text-xs text-gray-400 mt-3">{disclaimer}</p>}
          </div>
        </div>
      </div>
    </section>
  );
};



/* ── Template-aware storefront layout renderer ─────────────────────────────
   Uses the existing sections and API data, but changes the home page structure
   based only on the selected store template. No API/schema/business change. */
const normalizeTemplateKey = (settings = {}) => {
  const key = settings.storeTemplate || settings.template || settings.layoutTemplate || 'classic';
  return String(key || 'classic').replace(/[^a-zA-Z0-9_-]/g, '') || 'classic';
};

const TEMPLATE_HOME_PROFILES = {
  classic:       { order:['hero','categories','brands','featured','deals','promo','bestsellers','seasonal','new_arrivals','newsletter'], shell:'standard' },
  modern:        { order:['hero','featured','categories','brands','promo','new_arrivals','deals','bestsellers','newsletter'], shell:'floating' },
  marketplace:   { order:['hero','categories','brands','deals','featured','bestsellers','promo','new_arrivals','newsletter'], shell:'market' },
  fashion:       { order:['hero','promo','featured','brands','categories','new_arrivals','bestsellers','newsletter'], shell:'editorial' },
  electronics:   { order:['hero','categories','brands','featured','deals','bestsellers','promo','new_arrivals','newsletter'], shell:'tech' },
  mobile:        { order:['hero','featured','deals','brands','categories','bestsellers','new_arrivals','promo','newsletter'], shell:'tech' },
  grocery:       { order:['categories','brands','hero','deals','bestsellers','featured','new_arrivals','promo','newsletter'], shell:'quickshop' },
  beauty:        { order:['hero','featured','promo','brands','categories','new_arrivals','bestsellers','newsletter'], shell:'soft' },
  furniture:     { order:['hero','categories','brands','promo','featured','new_arrivals','deals','newsletter'], shell:'catalog' },
  sports:        { order:['hero','bestsellers','categories','brands','featured','promo','new_arrivals','newsletter'], shell:'dynamic' },
  kids:          { order:['hero','categories','brands','new_arrivals','featured','promo','deals','newsletter'], shell:'playful' },
  organic:       { order:['hero','categories','brands','featured','deals','new_arrivals','promo','newsletter'], shell:'natural' },
  luxury:        { order:['hero','featured','brands','promo','categories','new_arrivals','newsletter'], shell:'luxury' },
  jewelry:       { order:['hero','featured','brands','categories','promo','new_arrivals','newsletter'], shell:'luxury' },
  premiumApple:  { order:['hero','featured','brands','categories','new_arrivals','promo','newsletter'], shell:'apple' },
  pharmacy:      { order:['categories','brands','hero','featured','deals','new_arrivals','newsletter'], shell:'clinical' },
  b2b:           { order:['categories','brands','featured','hero','deals','new_arrivals','newsletter'], shell:'professional' },
  wholesale:     { order:['deals','categories','brands','featured','hero','new_arrivals','newsletter'], shell:'professional' },
  minimal:       { order:['hero','featured','brands','categories','new_arrivals','newsletter'], shell:'minimal' },
  books:         { order:['categories','brands','hero','featured','new_arrivals','promo','newsletter'], shell:'editorial' },
  neon:          { order:['hero','featured','deals','brands','categories','bestsellers','new_arrivals','newsletter'], shell:'neon' },
  automotive:    { order:['hero','categories','brands','featured','deals','promo','new_arrivals','newsletter'], shell:'garage' },
  sriLanka:      { order:['hero','categories','brands','deals','featured','promo','new_arrivals','newsletter'], shell:'local' },
  startup:       { order:['hero','featured','brands','categories','deals','new_arrivals','promo','newsletter'], shell:'startup' },
};

const TemplateHomeRenderer = ({ settings, isOn, sections, orderedIds, hasCustomLayout }) => {
  const template = normalizeTemplateKey(settings);
  const profile = TEMPLATE_HOME_PROFILES[template] || TEMPLATE_HOME_PROFILES.classic;
  const preferredOrder = profile.order || orderedIds;
  const finalOrder = preferredOrder.filter(id => id !== 'hero' && isOn(id));
  const renderSection = (id) => sections[id] || null;

  // A saved Layout Builder configuration is authoritative, including the
  // hero's position. Template profiles remain the default only until the
  // merchant explicitly saves a homepage layout.
  if (hasCustomLayout) {
    return (
      <div className={`storefront-template-home template-home-${template} template-shell-${profile.shell || 'standard'}`} style={{ background:'var(--body-bg)' }}>
        <TrustBar settings={settings}/>
        <div className="template-standard-flow">
          {orderedIds.filter(isOn).map(id => (
            <div key={id} className={`template-section template-section-${id}`}>{renderSection(id)}</div>
          ))}
        </div>
        <div className="h-6"/>
      </div>
    );
  }

  if (profile.shell === 'market') {
    return (
      <div className={`storefront-template-home template-home-${template} template-shell-${profile.shell}`} style={{ background:'var(--body-bg)' }}>
        <div className="template-market-hero">{isOn('hero') && renderSection('hero')}</div>
        <TrustBar settings={settings}/>
        <div className="template-market-stack">
          {finalOrder.map(id => <div key={id} className={`template-section template-section-${id}`}>{renderSection(id)}</div>)}
        </div>
        <div className="h-6"/>
      </div>
    );
  }

  if (profile.shell === 'professional') {
    return (
      <div className={`storefront-template-home template-home-${template} template-shell-${profile.shell}`} style={{ background:'var(--body-bg)' }}>
        <div className="template-professional-grid">
          <aside className="template-professional-sidebar">
            {renderSection('categories')}
            {renderSection('deals')}
          </aside>
          <main className="template-professional-main">
            {isOn('hero') && renderSection('hero')}
            <TrustBar settings={settings}/>
            {finalOrder.filter(id => !['categories','deals'].includes(id)).map(id => <div key={id} className={`template-section template-section-${id}`}>{renderSection(id)}</div>)}
          </main>
        </div>
        <div className="h-6"/>
      </div>
    );
  }

  if (['luxury','editorial','catalog','apple','minimal'].includes(profile.shell)) {
    return (
      <div className={`storefront-template-home template-home-${template} template-shell-${profile.shell}`} style={{ background:'var(--body-bg)' }}>
        {isOn('hero') && <div className="template-hero-frame">{renderSection('hero')}</div>}
        <TrustBar settings={settings}/>
        <div className="template-editorial-flow">
          {finalOrder.map((id, index) => (
            <div key={id} className={`template-section template-section-${id} template-section-index-${index}`}>{renderSection(id)}</div>
          ))}
        </div>
        <div className="h-6"/>
      </div>
    );
  }

  return (
    <div className={`storefront-template-home template-home-${template} template-shell-${profile.shell || 'standard'}`} style={{ background:'var(--body-bg)' }}>
      {isOn('hero') && renderSection('hero')}
      <TrustBar settings={settings}/>
      <div className="template-standard-flow">
        {finalOrder.map(id => <div key={id} className={`template-section template-section-${id}`}>{renderSection(id)}</div>)}
      </div>
      <div className="h-6"/>
    </div>
  );
};

/* ── HOME ─────────────────────────────────────────────────────────────── */
export default function Home() {
  const { settings }  = useTheme();
  const { campaign }  = useSeasonal();
  const { config }    = useAnimation();

  // ── SEO for homepage ────────────────────────────────────────────────────
  useSEO({ type: 'website' });

  const initialHomeData = useMemo(() => readHomeDataCache(), []);

  const [featured,    setFeatured]    = useState(() => initialHomeData?.featured || []);
  const [newArrivals, setNewArrivals] = useState(() => initialHomeData?.newArrivals || []);
  const [onSale,      setOnSale]      = useState(() => initialHomeData?.onSale || []);
  const [categories,  setCategories]  = useState(() => initialHomeData?.categories || []);
  const [brands,      setBrands]      = useState(() => initialHomeData?.brands || []);
  const [heroBanners, setHeroBanners] = useState(() => initialHomeData?.heroBanners || []);
  const [promoBanners,setPromoBanners]= useState(() => initialHomeData?.promoBanners || []);
  // dbReady: true once all homepage API calls resolve (or when cached home data exists)
  // settingsLoaded: true once ThemeContext has fetched real settings from API
  const [dbReady, setDbReady] = useState(() => !!initialHomeData);
  // Loading is true until BOTH db data AND live settings are available
  const loading = !dbReady || !settings;
  const showInitialLoader = loading && !initialHomeData && !hasLoadedHomeOnce();
  const [sectionOrder, setSectionOrder] = useState(null);
  // settingsReady: true once we have settings from cache or API.
  // Prevents newsletter / payment sections from flashing on first render.
  const settingsReady = settings !== null;

  // Sync sectionOrder from ThemeContext settings (no extra API call needed)
  useEffect(() => {
    if (!settings) return;
    // LayoutEditor saves to settings.layout_builder.homepage (object keyed by page id)
    const layoutBuilder = settings.layout_builder;
    const layout = (layoutBuilder && typeof layoutBuilder === 'object')
      ? layoutBuilder.homepage
      : null;
    if (Array.isArray(layout)) {
      // `flash_sale` was the original Layout Builder id while the storefront
      // renderer calls the same section `deals`. Normalize old and new
      // saved layouts so its order/visibility settings are actually applied.
      setSectionOrder(layout.map(section => ({
        ...section,
        id: section.id === 'flash_sale' ? 'deals' : section.id,
      })).sort((a,b)=>a.order-b.order));
    }
  }, [settings]);

  useEffect(() => {
    Promise.all([
      API.get('/products?featured=true&limit=8'),
      API.get('/products?limit=8'),
      API.get('/products?onSale=true&limit=8'),
      API.get('/categories?limit=12'),
      API.get('/products/brands?limit=16'),
      API.get('/banners?position=hero'),
      API.get('/banners?position=promo'),
    ]).then(([feat,newest,sale,cats,brandRes,hero,promo]) => {
      const nextHomeData = {
        featured: feat.data.products || [],
        newArrivals: newest.data.products || [],
        onSale: sale.data.products || [],
        categories: cats.data || [],
        brands: brandRes.data.brands || [],
        heroBanners: hero.data || [],
        promoBanners: promo.data || [],
      };
      setFeatured(nextHomeData.featured);
      setNewArrivals(nextHomeData.newArrivals);
      setOnSale(nextHomeData.onSale);
      setCategories(nextHomeData.categories);
      setBrands(nextHomeData.brands);
      setHeroBanners(nextHomeData.heroBanners);
      setPromoBanners(nextHomeData.promoBanners);
      writeHomeDataCache(nextHomeData);
    }).catch(()=>{}).finally(()=>{
      window.__STOREKIT_HOME_LOADED_ONCE__ = true;
      setDbReady(true);
    });
  },[]);

  // Kill stale ScrollTriggers from previous page so GSAP recalculates from top.
  // NOTE: do NOT call window.scrollTo here — ScrollToTop in App.js already
  // handles the scroll reset. Calling it here races against ScrollToTop and
  // causes the page to appear at the bottom on navigation.
  useEffect(() => {
    ScrollTrigger.getAll().forEach(t => t.kill());
    const raf = requestAnimationFrame(() => { ScrollTrigger.refresh(); });
    return () => {
      cancelAnimationFrame(raf);
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  const S = (key, fallback) => settings?.[key] || fallback;

  // Check if a section is enabled in admin layout (defaults to true if no layout saved)
  const isOn = (id) => {
    if (!sectionOrder) return true;
    const s = sectionOrder.find(x=>x.id===id);
    return s ? s.enabled : true;
  };

  // Build ordered section list
  const DEFAULT_ORDER = ['hero','categories','brands','featured','deals','promo','bestsellers','seasonal','new_arrivals','newsletter','recently'];
  // If admin has a saved layout that doesn't include 'deals', append it after 'featured'
  const orderedIds = (() => {
    if (!sectionOrder) return DEFAULT_ORDER;
    const ids = sectionOrder.filter(s => s.enabled).map(s => s.id);
    if (!ids.includes('deals')) {
      const afterFeatured = ids.indexOf('featured');
      if (afterFeatured >= 0) ids.splice(afterFeatured + 1, 0, 'deals');
      else ids.unshift('deals');
    }
    return ids;
  })();

  const SECTIONS = {
    hero: heroBanners.length>0 && (
      <HeroSlider key="hero" banners={heroBanners} settings={settings} campaign={campaign} anim={config}/>
    ),
    categories: categories.length>0 && (
      <section key="categories" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <SectionHeading title={S('sectionCatTitle','Browse Categories')} subtitle={S('sectionCatSubtitle','Find exactly what you need')}/>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-4">
          {categories.map(cat=><CategoryCard key={cat._id} cat={cat}/>)}
        </div>
      </section>
    ),
    brands: brands.length>0 && (
      <section key="brands" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <SectionHeading title={S('sectionBrandsTitle','Shop by Brand')} subtitle={S('sectionBrandsSubtitle','Browse brands available in this store')} link="/shop"/>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {brands.map(brand=><BrandLogoCard key={brand.slug || brand.name} brand={brand}/>)}
        </div>
      </section>
    ),
    featured: featured.length>0 && (
      <section key="featured" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <SectionHeading title={S('sectionFeaturedTitle','Featured Products')} subtitle={S('sectionFeaturedSubtitle','Hand-picked by our team')} link="/shop?featured=true"/>
        <AnimatedGrid products={featured} settings={settings}/>
      </section>
    ),
    deals: <DealsSection key="deals" settings={settings} />,
    promo: promoBanners.length>0 && (
      <section key="promo" className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {promoBanners.length===1 && <PromoBanner banner={promoBanners[0]} tall/>}
        {promoBanners.length===2 && <div className="grid sm:grid-cols-2 gap-4">{promoBanners.map(b=><PromoBanner key={b._id} banner={b}/>)}</div>}
        {promoBanners.length>=3 && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{promoBanners.slice(0,3).map(b=><PromoBanner key={b._id} banner={b}/>)}</div>}
      </section>
    ),
    bestsellers: onSale.length>0 && (
      <section key="bestsellers" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <SectionHeading title={S('sectionSaleTitle','🔥 Flash Deals')} subtitle={S('sectionSaleSubtitle','Limited time discounts')} link="/shop?onSale=true" linkLabel="All Deals →"/>
        <AnimatedGrid products={onSale} settings={settings}/>
      </section>
    ),
    seasonal: campaign?.couponCode && (
      <section key="seasonal" className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="relative rounded-3xl overflow-hidden" style={{ background:'var(--theme-gradient)' }}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -right-8 -top-8 w-56 h-56 rounded-full blur-3xl opacity-25 bg-white float"/>
            <div className="absolute -left-8 -bottom-8 w-44 h-44 rounded-full blur-3xl opacity-20 bg-white float-slow"/>
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 p-7 sm:p-10">
            <div>
              <p className="text-white/70 text-xs font-black uppercase tracking-widest mb-2">{campaign.name}</p>
              <h3 className="text-2xl sm:text-4xl font-black text-white mb-2 leading-tight" style={{ fontFamily:'var(--font-display)' }}>
                {campaign.featuredBannerTitle||'Special Offer!'}
              </h3>
              {campaign.featuredBannerSubtitle && <p className="text-white/80 text-sm sm:text-base mb-4">{campaign.featuredBannerSubtitle}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-white/80 text-sm">Use code</span>
                <code className="font-mono font-black text-base sm:text-lg bg-white/20 border border-white/30 px-4 py-1.5 rounded-xl text-white tracking-widest">{campaign.couponCode}</code>
                {campaign.discountPercent>0 && <span className="text-white font-bold text-sm">for {campaign.discountPercent}% off!</span>}
              </div>
            </div>
          </div>
        </div>
      </section>
    ),
    newsletter: settingsReady && settings?.enableNewsletter!==false && <NewsletterSection key="newsletter" settings={settings}/>,
    new_arrivals: newArrivals.length>0 && (
      <section key="new_arrivals" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <SectionHeading title={S('sectionNewTitle','✨ New Arrivals')} subtitle={S('sectionNewSubtitle','Just landed in our store')} link="/shop" linkLabel="View All →"/>
        <AnimatedGrid products={newArrivals} settings={settings}/>
      </section>
    ),
    recently: null, // placeholder — reserved for future recently-viewed component
    gift_cards: null,
    testimonials: null,
  };

  // Loading screen: shown every visit until DB data + live settings are both ready.
  // Uses HARDCODED neutral colors — never depends on CSS vars or theme settings
  // so it looks identical and premium on every device, first visit or returning.
  if (showInitialLoader) {
    const storeName    = settings?.storeName    || 'StoreKit';
    const storeTagline = settings?.storeTagline || 'Delivering the finest products';
    const logoUrl      = settings?.logoUrl;

    // Phase 1 (no settings yet): clean white with neutral gray accents
    // Phase 2 (settings loaded):  smoothly transitions to real DB theme colors
    // All color properties use CSS transition so the shift is imperceptible
    const hasTheme = !!settings;
    const BG       = hasTheme ? (settings.darkMode ? (settings.darkBgColor || '#0f172a') : '#ffffff') : '#ffffff';
    const PRIMARY  = hasTheme ? (settings.primaryColor || 'var(--color-primary)') : '#d1d5db';
    const ACCENT   = hasTheme ? (settings.secondaryColor || settings.primaryLightColor || PRIMARY) : '#e5e7eb';
    const TEXT_COL = hasTheme ? (settings.darkMode ? '#f8fafc' : '#111827') : '#111827';
    const SUBTEXT  = hasTheme ? (settings.darkMode ? 'rgba(248,250,252,0.5)' : 'rgba(17,24,39,0.45)') : 'rgba(17,24,39,0.38)';
    const TRACK    = hasTheme ? (settings.darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)') : 'rgba(0,0,0,0.07)';
    const ICON_FG  = hasTheme && settings.darkMode ? '#fff' : '#fff';
    const LOGO_FILTER = hasTheme
      ? (settings.darkMode ? 'brightness(0) invert(1)' : 'none')
      : 'none';

    return (
      <div style={{
        position:'fixed', inset:0, zIndex:9999,
        background: BG,
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        overflow:'hidden',
        transition:'background 0.9s cubic-bezier(.4,0,.2,1)',
      }}>
        <style>{`
          @keyframes szl-fade-up {
            from { opacity:0; transform:translateY(20px); }
            to   { opacity:1; transform:translateY(0); }
          }
          @keyframes szl-shimmer {
            0%   { background-position:-200% center; }
            100% { background-position:200% center; }
          }
          @keyframes szl-spin {
            to { transform:rotate(360deg); }
          }
          @keyframes szl-pulse {
            0%,100% { transform:scale(1);    opacity:0.18; }
            50%      { transform:scale(1.14); opacity:0.32; }
          }
          @keyframes szl-orb1 {
            0%,100% { transform:translate(0,0)       scale(1); }
            40%     { transform:translate(50px,-40px) scale(1.08); }
            70%     { transform:translate(-30px,25px) scale(0.93); }
          }
          @keyframes szl-orb2 {
            0%,100% { transform:translate(0,0)        scale(1); }
            35%     { transform:translate(-45px,30px)  scale(0.9); }
            70%     { transform:translate(35px,-25px)  scale(1.06); }
          }
          @keyframes szl-bar {
            0%   { width:0%; }
            18%  { width:30%; }
            45%  { width:58%; }
            75%  { width:82%; }
            100% { width:97%; }
          }
          /* Smooth color transitions on all themed elements */
          .szl-orb { transition: background 0.9s cubic-bezier(.4,0,.2,1); }
          .szl-icon-box { transition: background 0.9s cubic-bezier(.4,0,.2,1), box-shadow 0.9s ease; }
          .szl-label { transition: color 0.7s ease; }
          .szl-tagline { transition: color 0.7s ease; }
          .szl-ring { transition: border-color 0.9s ease; }
          .szl-arc { transition: stroke 0.9s ease; }
          .szl-bar-fill { transition: background 0.9s ease; }
          .szl-track { transition: background 0.7s ease; }
        `}</style>

        {/* Ambient orbs — transition from gray to real theme color */}
        <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none'}}>
          <div className="szl-orb" style={{
            position:'absolute', top:'-100px', left:'-100px',
            width:'320px', height:'320px', borderRadius:'50%',
            background: PRIMARY, opacity:0.08, filter:'blur(52px)',
            animation:'szl-orb1 24s ease-in-out infinite',
          }}/>
          <div className="szl-orb" style={{
            position:'absolute', bottom:'-80px', right:'-80px',
            width:'280px', height:'280px', borderRadius:'50%',
            background: ACCENT, opacity:0.07, filter:'blur(46px)',
            animation:'szl-orb2 28s ease-in-out infinite',
          }}/>
          {/* Dot grid — light on white, barely visible */}
          <div style={{
            position:'absolute', inset:0,
            backgroundImage:'radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)',
            backgroundSize:'32px 32px',
            transition:'opacity 0.9s ease',
            opacity: hasTheme && settings.darkMode ? 0 : 1,
          }}/>
        </div>

        {/* Main content */}
        <div style={{position:'relative',zIndex:2,textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center'}}>

          {/* Logo / icon */}
          <div style={{animation:'szl-fade-up 0.65s cubic-bezier(.34,1.56,.64,1) 0.05s both', marginBottom:'28px'}}>
            {logoUrl ? (
              <img src={logoUrl} alt={storeName} style={{
                height:'60px', maxWidth:'200px', objectFit:'contain',
                filter: LOGO_FILTER,
                transition:'filter 0.8s ease',
              }}/>
            ) : (
              <div className="szl-icon-box" style={{
                width:'72px', height:'72px', borderRadius:'22px',
                background: `linear-gradient(135deg,${PRIMARY},${ACCENT})`,
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:`0 20px 55px ${PRIMARY}40, 0 0 0 1px rgba(0,0,0,0.06)`,
                position:'relative', overflow:'hidden',
              }}>
                <div style={{
                  position:'absolute', inset:0, borderRadius:'inherit',
                  background:'linear-gradient(135deg,rgba(255,255,255,0.22) 0%,transparent 55%)',
                }}/>
                <svg viewBox="0 0 24 24" fill="none" stroke={ICON_FG} strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{width:'34px',height:'34px',position:'relative',zIndex:1}}>
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
              </div>
            )}
          </div>

          {/* "Welcome to" */}
          <p className="szl-label" style={{
            fontFamily:'system-ui,sans-serif',
            fontSize:'11px', fontWeight:700, letterSpacing:'0.32em', textTransform:'uppercase',
            color: SUBTEXT,
            animation:'szl-fade-up 0.5s ease 0.2s both',
            marginBottom:'10px',
          }}>Welcome to</p>

          {/* Store name — shimmer using real theme colors once available */}
          <h1 style={{
            fontFamily:'system-ui,sans-serif',
            fontSize:'clamp(30px,6vw,52px)', fontWeight:800,
            letterSpacing:'-0.03em', lineHeight:1,
            background: hasTheme
              ? `linear-gradient(90deg,${TEXT_COL} 0%,${ACCENT} 35%,${PRIMARY} 55%,${TEXT_COL} 100%)`
              : `linear-gradient(90deg,#111827 0%,#9ca3af 40%,#6b7280 60%,#111827 100%)`,
            backgroundSize:'200% auto',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
            animation:'szl-shimmer 3.5s linear infinite, szl-fade-up 0.6s ease 0.3s both',
            margin:0,
            transition:'background 0.9s ease',
          }}>{storeName}</h1>

          {/* Tagline */}
          <p className="szl-tagline" style={{
            fontFamily:'system-ui,sans-serif',
            fontSize:'14px', fontWeight:400, color:SUBTEXT,
            marginTop:'12px', marginBottom:'44px',
            animation:'szl-fade-up 0.6s ease 0.42s both',
            maxWidth:'260px', lineHeight:1.55,
          }}>{storeTagline}</p>

          {/* Spinner + pulse ring */}
          <div style={{position:'relative',width:'52px',height:'52px',animation:'szl-fade-up 0.55s ease 0.52s both'}}>
            <div className="szl-ring" style={{
              position:'absolute', inset:'-10px', borderRadius:'50%',
              border:`1.5px solid ${PRIMARY}`,
              animation:'szl-pulse 2.2s ease-in-out infinite',
            }}/>
            <svg style={{width:'52px',height:'52px',animation:'szl-spin 0.95s linear infinite'}}
              viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="22"
                stroke={hasTheme ? (settings.darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)') : 'rgba(0,0,0,0.07)'}
                strokeWidth="4"/>
              <path className="szl-arc" d="M48 26 A22 22 0 0 1 26 48"
                stroke={PRIMARY} strokeWidth="4" strokeLinecap="round"/>
            </svg>
          </div>

          {/* Progress bar */}
          <div className="szl-track" style={{
            marginTop:'38px', width:'180px', height:'3px',
            borderRadius:'99px', background:TRACK, overflow:'hidden',
            animation:'szl-fade-up 0.55s ease 0.62s both',
          }}>
            <div className="szl-bar-fill" style={{
              height:'100%', borderRadius:'99px',
              background:`linear-gradient(90deg,${PRIMARY},${ACCENT})`,
              animation:'szl-bar 4.5s cubic-bezier(.4,0,.2,1) forwards',
            }}/>
          </div>

        </div>
      </div>
    );
  }

  return (
    <TemplateHomeRenderer
      settings={settings}
      isOn={isOn}
      sections={SECTIONS}
      orderedIds={orderedIds}
      hasCustomLayout={Array.isArray(sectionOrder)}
    />
  );
}
