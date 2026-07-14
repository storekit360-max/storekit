import React from 'react';

export const LOADER_STYLES = [
  ['classic-ring', 'Classic Ring'], ['dual-ring', 'Dual Ring'], ['triple-ring', 'Triple Ring'],
  ['bouncing-dots', 'Bouncing Dots'], ['pulse-dots', 'Pulse Dots'], ['equalizer', 'Equalizer'],
  ['wave-bars', 'Wave Bars'], ['orbit', 'Orbit'], ['planets', 'Planets'],
  ['ripple', 'Ripple'], ['radar', 'Radar'], ['cube', 'Rotating Cube'],
  ['flip-square', 'Flip Square'], ['diamond', 'Diamond'], ['hourglass', 'Hourglass'],
  ['infinity', 'Infinity'], ['heartbeat', 'Heartbeat'], ['progress', 'Progress Bar'],
  ['shopping-bag', 'Shopping Bag'], ['shopping-cart', 'Shopping Cart'], ['package-box', 'Package Box'],
  ['logo-pulse', 'Logo Pulse'], ['logo-shimmer', 'Logo Shimmer'], ['neon-ring', 'Neon Ring'],
  ['minimal', 'Minimal'],
].map(([id, name]) => ({ id, name }));

const BagIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 7h12l1 14H5L6 7Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>;
const CartIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 1.9-1.4L21 8H7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>;
const BoxIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7v10l8 4 8-4V7M12 11v10"/></svg>;

function LoaderGraphic({ styleId, logoUrl }) {
  if (['bouncing-dots', 'pulse-dots'].includes(styleId)) return <div className={`skl-dots ${styleId}`}>{[0,1,2].map(i=><i key={i}/>)}</div>;
  if (['equalizer', 'wave-bars'].includes(styleId)) return <div className={`skl-bars ${styleId}`}>{[0,1,2,3,4].map(i=><i key={i}/>)}</div>;
  if (['classic-ring','dual-ring','triple-ring','neon-ring'].includes(styleId)) return <div className={`skl-rings ${styleId}`}><i/><i/><i/></div>;
  if (['orbit','planets'].includes(styleId)) return <div className={`skl-orbit ${styleId}`}><i/><i/><i/></div>;
  if (['ripple','radar'].includes(styleId)) return <div className={`skl-ripple ${styleId}`}><i/><i/><i/></div>;
  if (['cube','flip-square','diamond'].includes(styleId)) return <div className={`skl-shape ${styleId}`}><i/></div>;
  if (styleId === 'hourglass') return <div className="skl-hourglass">⌛</div>;
  if (styleId === 'infinity') return <div className="skl-infinity">∞</div>;
  if (styleId === 'heartbeat') return <div className="skl-heart">♥</div>;
  if (styleId === 'progress') return <div className="skl-progress"><i/></div>;
  if (styleId === 'shopping-bag') return <div className="skl-commerce"><BagIcon/></div>;
  if (styleId === 'shopping-cart') return <div className="skl-commerce cart"><CartIcon/></div>;
  if (styleId === 'package-box') return <div className="skl-commerce box"><BoxIcon/></div>;
  if (['logo-pulse','logo-shimmer'].includes(styleId) && logoUrl) return <div className={`skl-logo ${styleId}`}><img src={logoUrl} alt=""/></div>;
  return <div className="skl-minimal"><i/><i/><i/></div>;
}

export default function StoreLoader({ settings = {}, compact = false, styleId }) {
  const selected = styleId || settings.loaderStyle || 'classic-ring';
  const primary = settings.primaryColor || '#15803d';
  const accent = settings.secondaryColor || settings.accentColor || '#84cc16';
  const dark = settings.darkMode === true;
  const bg = dark ? (settings.darkBgColor || '#0f172a') : '#fff';
  const text = dark ? '#f8fafc' : '#111827';
  const muted = dark ? 'rgba(248,250,252,.58)' : 'rgba(17,24,39,.48)';
  const storeName = settings.storeName || 'StoreKit';
  const [logoFailed, setLogoFailed] = React.useState(false);
  const isLogoLoader = ['logo-pulse', 'logo-shimmer'].includes(selected);
  const showMainLogo = !compact && Boolean(settings.logoUrl) && !logoFailed;

  React.useEffect(() => { setLogoFailed(false); }, [settings.logoUrl]);

  return <div className={`store-loader ${compact ? 'compact' : ''}`} style={{'--lp':primary,'--la':accent,'--lbg':bg,'--lt':text,'--lm':muted}}>
    <style>{loaderCss}</style>
    <div className="skl-glow a"/><div className="skl-glow b"/>
    <div className="skl-content" role="status" aria-live="polite" aria-label={`Loading ${storeName}`}>
      {showMainLogo && (
        <div className={`skl-main-logo ${isLogoLoader ? selected : ''}`}>
          <img src={settings.logoUrl} alt={`${storeName} logo`} onError={() => setLogoFailed(true)}/>
        </div>
      )}
      {(compact || !isLogoLoader || !showMainLogo) && (
        <LoaderGraphic styleId={selected} logoUrl={logoFailed ? '' : settings.logoUrl}/>
      )}
      {!compact && <>
        <span className="skl-welcome">Welcome to</span>
        <h1>{storeName}</h1>
        <p>{settings.loadingText || 'A wonderful shopping experience is almost ready for you'}</p>
        <div className="skl-ready-line"><i/><i/><i/></div>
      </>}
    </div>
  </div>;
}

const loaderCss = `
@keyframes skl-spin{to{transform:rotate(360deg)}} @keyframes skl-rev{to{transform:rotate(-360deg)}}
@keyframes skl-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-15px)}}
@keyframes skl-pulse{0%,100%{transform:scale(.65);opacity:.35}50%{transform:scale(1);opacity:1}}
@keyframes skl-bar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
@keyframes skl-ripple{0%{transform:scale(.15);opacity:1}100%{transform:scale(1.25);opacity:0}}
@keyframes skl-flip{0%{transform:perspective(100px) rotateX(0) rotateY(0)}50%{transform:perspective(100px) rotateX(-180deg) rotateY(0)}100%{transform:perspective(100px) rotateX(-180deg) rotateY(-180deg)}}
@keyframes skl-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes skl-slide{0%{transform:translateX(-110%)}100%{transform:translateX(310%)}}
@keyframes skl-heart{0%,100%{transform:scale(.8)}20%{transform:scale(1.15)}35%{transform:scale(.85)}50%{transform:scale(1.08)}}
.store-loader{position:fixed;inset:0;z-index:9999;background:var(--lbg);display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--lt);transition:background .4s}
.store-loader.compact{position:relative;inset:auto;z-index:1;width:100%;height:150px;border-radius:14px}.skl-content{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center}
.skl-content{padding:28px;max-width:560px}.skl-welcome{margin-top:28px;font:800 11px/1 system-ui;letter-spacing:.32em;text-transform:uppercase;color:var(--lp);animation:skl-float 2.8s ease-in-out infinite}.skl-content h1{font:900 clamp(34px,7vw,64px)/1.05 var(--font-display,system-ui);margin:12px 0 10px;color:var(--lt);letter-spacing:-.035em;text-wrap:balance}.skl-content p{font:500 clamp(13px,2vw,15px)/1.6 var(--font-body,system-ui);margin:0;color:var(--lm);letter-spacing:.02em;max-width:390px}.skl-ready-line{display:flex;gap:7px;margin-top:25px}.skl-ready-line i{width:7px;height:7px;border-radius:50%;background:var(--lp);animation:skl-pulse 1.1s ease-in-out infinite}.skl-ready-line i:nth-child(2){background:var(--la);animation-delay:.16s}.skl-ready-line i:nth-child(3){animation-delay:.32s}
.skl-glow{position:absolute;width:280px;height:280px;border-radius:50%;filter:blur(70px);opacity:.09;background:var(--lp)}.skl-glow.a{left:-90px;top:-90px}.skl-glow.b{right:-80px;bottom:-80px;background:var(--la)}
.store-loader.compact .skl-glow,.store-loader.compact h1,.store-loader.compact p,.store-loader.compact .skl-welcome,.store-loader.compact .skl-ready-line{display:none}
.skl-main-logo{width:min(220px,58vw);height:86px;display:flex;align-items:center;justify-content:center;margin-bottom:24px;position:relative}.skl-main-logo img{display:block;max-width:100%;max-height:100%;object-fit:contain}.skl-main-logo.logo-pulse{animation:skl-pulse 1.5s infinite}.skl-main-logo.logo-shimmer{overflow:hidden}.skl-main-logo.logo-shimmer:after{content:'';position:absolute;inset:-35%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent);animation:skl-slide 1.5s infinite;pointer-events:none}
.skl-rings{width:62px;height:62px;position:relative}.skl-rings i{position:absolute;inset:0;border:4px solid transparent;border-top-color:var(--lp);border-radius:50%;animation:skl-spin .9s linear infinite}.skl-rings.dual-ring i:nth-child(2){inset:9px;border-top-color:var(--la);animation:skl-rev .65s linear infinite}.skl-rings.triple-ring i:nth-child(2){inset:9px;border-right-color:var(--la);animation:skl-rev .8s linear infinite}.skl-rings.triple-ring i:nth-child(3){inset:18px;border-bottom-color:var(--lp);animation:skl-spin .55s linear infinite}.skl-rings.neon-ring{filter:drop-shadow(0 0 8px var(--lp)) drop-shadow(0 0 13px var(--la))}
.skl-dots{display:flex;gap:9px;height:45px;align-items:center}.skl-dots i{width:13px;height:13px;border-radius:50%;background:var(--lp);animation:skl-bounce .8s ease-in-out infinite}.skl-dots i:nth-child(2){background:var(--la);animation-delay:.12s}.skl-dots i:nth-child(3){animation-delay:.24s}.skl-dots.pulse-dots i{animation-name:skl-pulse}
.skl-bars{height:55px;display:flex;align-items:center;gap:5px}.skl-bars i{width:7px;height:50px;border-radius:8px;background:linear-gradient(var(--lp),var(--la));animation:skl-bar .8s ease-in-out infinite}.skl-bars i:nth-child(2){animation-delay:.1s}.skl-bars i:nth-child(3){animation-delay:.2s}.skl-bars i:nth-child(4){animation-delay:.3s}.skl-bars i:nth-child(5){animation-delay:.4s}.skl-bars.wave-bars i:nth-child(even){animation-direction:reverse}
.skl-orbit{width:68px;height:68px;border:1px solid color-mix(in srgb,var(--lp) 25%,transparent);border-radius:50%;position:relative;animation:skl-spin 1.2s linear infinite}.skl-orbit i{position:absolute;width:13px;height:13px;border-radius:50%;background:var(--lp);top:-6px;left:28px}.skl-orbit i:nth-child(2){background:var(--la);top:50px;left:1px}.skl-orbit i:nth-child(3){top:48px;left:55px}.skl-orbit.planets{animation-duration:2.4s;box-shadow:inset 0 0 18px color-mix(in srgb,var(--la) 25%,transparent)}
.skl-ripple{width:72px;height:72px;position:relative}.skl-ripple i{position:absolute;inset:0;border:3px solid var(--lp);border-radius:50%;animation:skl-ripple 1.5s ease-out infinite}.skl-ripple i:nth-child(2){border-color:var(--la);animation-delay:.5s}.skl-ripple i:nth-child(3){animation-delay:1s}.skl-ripple.radar{border-radius:50%;background:conic-gradient(from 0deg,transparent 65%,color-mix(in srgb,var(--lp) 65%,transparent));animation:skl-spin 1.2s linear infinite}
.skl-shape{width:54px;height:54px}.skl-shape i{display:block;width:100%;height:100%;border-radius:9px;background:linear-gradient(135deg,var(--lp),var(--la));animation:skl-flip 1.7s infinite ease-in-out}.skl-shape.cube i{box-shadow:12px 12px 0 color-mix(in srgb,var(--lp) 25%,transparent)}.skl-shape.diamond i{border-radius:6px;transform:rotate(45deg);animation:skl-spin 1.2s linear infinite}
.skl-hourglass,.skl-infinity,.skl-heart{font-size:54px;color:var(--lp);animation:skl-flip 1.7s infinite}.skl-infinity{font:bold 68px/1 system-ui;animation:skl-pulse 1.3s infinite}.skl-heart{animation:skl-heart 1.15s infinite;color:var(--la)}
.skl-progress{width:150px;height:7px;border-radius:99px;background:color-mix(in srgb,var(--lp) 12%,transparent);overflow:hidden}.skl-progress i{display:block;width:45%;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--lp),var(--la));animation:skl-slide 1.2s ease-in-out infinite}
.skl-commerce{width:62px;height:62px;color:var(--lp);animation:skl-float 1.1s ease-in-out infinite}.skl-commerce svg{width:100%;height:100%}.skl-commerce.cart{animation:skl-bounce 1s infinite}.skl-commerce.box{color:var(--la);animation:skl-flip 2s infinite}
.skl-logo{width:130px;height:70px;display:flex;align-items:center;justify-content:center;position:relative}.skl-logo img{max-width:100%;max-height:100%;object-fit:contain}.skl-logo.logo-pulse{animation:skl-pulse 1.5s infinite}.skl-logo.logo-shimmer{overflow:hidden}.skl-logo.logo-shimmer:after{content:'';position:absolute;inset:-30%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);animation:skl-slide 1.5s infinite}
.skl-minimal{display:flex;gap:6px}.skl-minimal i{width:8px;height:8px;border-radius:50%;background:var(--lp);animation:skl-pulse 1s infinite}.skl-minimal i:nth-child(2){animation-delay:.15s;background:var(--la)}.skl-minimal i:nth-child(3){animation-delay:.3s}
@media(prefers-reduced-motion:reduce){.store-loader *{animation-duration:2.5s!important}}
`;
