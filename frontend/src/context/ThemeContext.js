/**
 * ThemeContext.js  — ENHANCED THEME SYSTEM v2
 * 20+ themes, 10+ fonts, dark/light mode, theme builder
 */
import React, {
  createContext, useContext, useState, useEffect, useLayoutEffect, useCallback,
} from 'react';
import API from '../utils/api';

const ThemeContext = createContext();
const LS_KEY = 'storekit_theme_v2';

/* ── 20+ Theme palette ──────────────────────────────────────────────────── */
export const THEMES = {
  // ── Warm / Fire
  default:   { name:'Ember Classic',    category:'warm',  primary:'#15803d', primaryDark:'#0f5f2e', primaryLight:'#22c55e', accent:'#84cc16', dark:'#0f172a', surface:'#1e293b', gradient:'linear-gradient(135deg,#15803d 0%,#22c55e 50%,#84cc16 100%)', heroGradient:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#15803d 100%)', cardBg:'#ffffff', bodyBg:'#fafaf8', darkCardBg:'#1e1e1e', darkBodyBg:'#0f0f0f' },
  coral:     { name:'Coral Sunset',     category:'warm',  primary:'#f97316', primaryDark:'#ea580c', primaryLight:'#fb923c', accent:'#fcd34d', dark:'#1c0a00', surface:'#431407', gradient:'linear-gradient(135deg,#ea580c 0%,#f97316 50%,#fcd34d 100%)', heroGradient:'linear-gradient(135deg,#1c0a00 0%,#431407 50%,#ea580c 100%)', cardBg:'#ffffff', bodyBg:'#fff7ed', darkCardBg:'#1a1000', darkBodyBg:'#0d0800' },
  amber:     { name:'Golden Amber',     category:'warm',  primary:'#b45309', primaryDark:'#92400e', primaryLight:'#f59e0b', accent:'#fbbf24', dark:'#1c0a00', surface:'#451a03', gradient:'linear-gradient(135deg,#b45309 0%,#f59e0b 50%,#fbbf24 100%)', heroGradient:'linear-gradient(135deg,#1c0a00 0%,#451a03 50%,#b45309 100%)', cardBg:'#ffffff', bodyBg:'#fffbeb', darkCardBg:'#1a1200', darkBodyBg:'#0d0900' },
  rose:      { name:'Rose Gold',        category:'warm',  primary:'#be185d', primaryDark:'#9d174d', primaryLight:'#f43f5e', accent:'#fb7185', dark:'#1f0a14', surface:'#3b0a20', gradient:'linear-gradient(135deg,#be185d 0%,#f43f5e 50%,#fb7185 100%)', heroGradient:'linear-gradient(135deg,#1f0a14 0%,#3b0a20 50%,#be185d 100%)', cardBg:'#ffffff', bodyBg:'#fff1f2', darkCardBg:'#1a000a', darkBodyBg:'#0d0005' },
  lava:      { name:'Lava Flow',        category:'warm',  primary:'#dc2626', primaryDark:'#b91c1c', primaryLight:'#ef4444', accent:'#f97316', dark:'#1c0000', surface:'#450a0a', gradient:'linear-gradient(135deg,#b91c1c 0%,#dc2626 50%,#f97316 100%)', heroGradient:'linear-gradient(135deg,#1c0000 0%,#450a0a 50%,#b91c1c 100%)', cardBg:'#ffffff', bodyBg:'#fff5f5', darkCardBg:'#1a0000', darkBodyBg:'#0d0000' },

  // ── Cool / Ocean
  ocean:     { name:'Ocean Depths',     category:'cool',  primary:'#0369a1', primaryDark:'#024f7a', primaryLight:'#0ea5e9', accent:'#06b6d4', dark:'#0c1a2e', surface:'#0f2744', gradient:'linear-gradient(135deg,#0369a1 0%,#0ea5e9 50%,#06b6d4 100%)', heroGradient:'linear-gradient(135deg,#0c1a2e 0%,#0f2744 50%,#0369a1 100%)', cardBg:'#ffffff', bodyBg:'#f0f9ff', darkCardBg:'#001220', darkBodyBg:'#000c18' },
  sky:       { name:'Sky Blue',         category:'cool',  primary:'#0284c7', primaryDark:'#0369a1', primaryLight:'#38bdf8', accent:'#7dd3fc', dark:'#0c2340', surface:'#0f3460', gradient:'linear-gradient(135deg,#0369a1 0%,#0284c7 50%,#38bdf8 100%)', heroGradient:'linear-gradient(135deg,#0c2340 0%,#0f3460 50%,#0369a1 100%)', cardBg:'#ffffff', bodyBg:'#f0f9ff', darkCardBg:'#001830', darkBodyBg:'#000d1a' },
  slate:     { name:'Slate Pro',        category:'cool',  primary:'#334155', primaryDark:'#1e293b', primaryLight:'#475569', accent:'#38bdf8', dark:'#0f172a', surface:'#1e293b', gradient:'linear-gradient(135deg,#1e293b 0%,#334155 50%,#38bdf8 100%)', heroGradient:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#334155 100%)', cardBg:'#ffffff', bodyBg:'#f8fafc', darkCardBg:'#111827', darkBodyBg:'#0a0f1a' },
  arctic:    { name:'Arctic Frost',     category:'cool',  primary:'#0891b2', primaryDark:'#0e7490', primaryLight:'#22d3ee', accent:'#a5f3fc', dark:'#082f49', surface:'#0c4a6e', gradient:'linear-gradient(135deg,#0e7490 0%,#0891b2 50%,#22d3ee 100%)', heroGradient:'linear-gradient(135deg,#082f49 0%,#0c4a6e 50%,#0e7490 100%)', cardBg:'#ffffff', bodyBg:'#ecfeff', darkCardBg:'#001520', darkBodyBg:'#000a12' },

  // ── Nature / Green
  forest:    { name:'Deep Forest',      category:'nature',primary:'#15803d', primaryDark:'#0f5f2e', primaryLight:'#22c55e', accent:'#84cc16', dark:'#052e16', surface:'#0a3d20', gradient:'linear-gradient(135deg,#15803d 0%,#22c55e 50%,#84cc16 100%)', heroGradient:'linear-gradient(135deg,#052e16 0%,#0a3d20 50%,#15803d 100%)', cardBg:'#ffffff', bodyBg:'#f0fdf4', darkCardBg:'#001a0a', darkBodyBg:'#000d05' },
  emerald:   { name:'Emerald City',     category:'nature',primary:'#059669', primaryDark:'#047857', primaryLight:'#34d399', accent:'#6ee7b7', dark:'#022c22', surface:'#064e3b', gradient:'linear-gradient(135deg,#047857 0%,#059669 50%,#34d399 100%)', heroGradient:'linear-gradient(135deg,#022c22 0%,#064e3b 50%,#047857 100%)', cardBg:'#ffffff', bodyBg:'#ecfdf5', darkCardBg:'#00150e', darkBodyBg:'#000d08' },
  sage:      { name:'Sage Garden',      category:'nature',primary:'#4d7c0f', primaryDark:'#3f6212', primaryLight:'#84cc16', accent:'#bef264', dark:'#1a2e05', surface:'#365314', gradient:'linear-gradient(135deg,#3f6212 0%,#4d7c0f 50%,#84cc16 100%)', heroGradient:'linear-gradient(135deg,#1a2e05 0%,#365314 50%,#3f6212 100%)', cardBg:'#ffffff', bodyBg:'#f7fee7', darkCardBg:'#0d1600', darkBodyBg:'#080d00' },

  // ── Purple / Luxury
  royal:     { name:'Royal Purple',     category:'luxury',primary:'#7c3aed', primaryDark:'#5b21b6', primaryLight:'#a78bfa', accent:'#f59e0b', dark:'#1e1b4b', surface:'#2e1065', gradient:'linear-gradient(135deg,#7c3aed 0%,#a78bfa 50%,#f59e0b 100%)', heroGradient:'linear-gradient(135deg,#1e1b4b 0%,#2e1065 50%,#7c3aed 100%)', cardBg:'#ffffff', bodyBg:'#faf5ff', darkCardBg:'#0f0020', darkBodyBg:'#080010' },
  sakura:    { name:'Cherry Blossom',   category:'luxury',primary:'#db2777', primaryDark:'#be185d', primaryLight:'#f472b6', accent:'#a78bfa', dark:'#1a0a14', surface:'#2d1020', gradient:'linear-gradient(135deg,#be185d 0%,#db2777 50%,#a78bfa 100%)', heroGradient:'linear-gradient(135deg,#1a0a14 0%,#2d1020 50%,#db2777 100%)', cardBg:'#ffffff', bodyBg:'#fdf2f8', darkCardBg:'#150010', darkBodyBg:'#0d000a' },
  plum:      { name:'Deep Plum',        category:'luxury',primary:'#6d28d9', primaryDark:'#4c1d95', primaryLight:'#8b5cf6', accent:'#ec4899', dark:'#1e0a3c', surface:'#2d1b69', gradient:'linear-gradient(135deg,#4c1d95 0%,#6d28d9 50%,#ec4899 100%)', heroGradient:'linear-gradient(135deg,#1e0a3c 0%,#2d1b69 50%,#4c1d95 100%)', cardBg:'#ffffff', bodyBg:'#f5f3ff', darkCardBg:'#10002e', darkBodyBg:'#08001a' },

  // ── Dark / Tech
  midnight:  { name:'Midnight Dark',    category:'dark',  primary:'#6366f1', primaryDark:'#4338ca', primaryLight:'#818cf8', accent:'#38bdf8', dark:'#0a0a0f', surface:'#111120', gradient:'linear-gradient(135deg,#4338ca 0%,#6366f1 50%,#38bdf8 100%)', heroGradient:'linear-gradient(135deg,#0a0a0f 0%,#111120 50%,#4338ca 100%)', cardBg:'#1a1a2e', bodyBg:'#0d0d1a', darkCardBg:'#0d0d1a', darkBodyBg:'#050508' },
  neon:      { name:'Neon Cyber',       category:'dark',  primary:'#a855f7', primaryDark:'#7c3aed', primaryLight:'#c084fc', accent:'#22d3ee', dark:'#050010', surface:'#0d001a', gradient:'linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#22d3ee 100%)', heroGradient:'linear-gradient(135deg,#050010 0%,#0d001a 50%,#7c3aed 100%)', cardBg:'#0d001a', bodyBg:'#080010', darkCardBg:'#0a0015', darkBodyBg:'#05000d' },
  matrix:    { name:'Matrix Green',     category:'dark',  primary:'#16a34a', primaryDark:'#15803d', primaryLight:'#4ade80', accent:'#a3e635', dark:'#000d00', surface:'#001a00', gradient:'linear-gradient(135deg,#15803d 0%,#16a34a 50%,#4ade80 100%)', heroGradient:'linear-gradient(135deg,#000d00 0%,#001a00 50%,#15803d 100%)', cardBg:'#001200', bodyBg:'#000a00', darkCardBg:'#001000', darkBodyBg:'#000800' },
  obsidian:  { name:'Obsidian',         category:'dark',  primary:'#475569', primaryDark:'#1e293b', primaryLight:'#64748b', accent:'#f59e0b', dark:'#020617', surface:'#0f172a', gradient:'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#475569 100%)', heroGradient:'linear-gradient(135deg,#020617 0%,#0f172a 50%,#1e293b 100%)', cardBg:'#1e293b', bodyBg:'#0f172a', darkCardBg:'#111827', darkBodyBg:'#030712' },

  // ── Minimal / Clean
  snow:      { name:'Snow White',       category:'minimal',primary:'#18181b', primaryDark:'#09090b', primaryLight:'#3f3f46', accent:'#f59e0b', dark:'#09090b', surface:'#18181b', gradient:'linear-gradient(135deg,#18181b 0%,#3f3f46 50%,#71717a 100%)', heroGradient:'linear-gradient(135deg,#09090b 0%,#18181b 50%,#27272a 100%)', cardBg:'#ffffff', bodyBg:'#fafafa', darkCardBg:'#1c1c1e', darkBodyBg:'#000000' },
  lavender:  { name:'Lavender Mist',    category:'minimal',primary:'#7c3aed', primaryDark:'#6d28d9', primaryLight:'#8b5cf6', accent:'#c084fc', dark:'#1e1b4b', surface:'#312e81', gradient:'linear-gradient(135deg,#6d28d9 0%,#7c3aed 50%,#c084fc 100%)', heroGradient:'linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#6d28d9 100%)', cardBg:'#ffffff', bodyBg:'#f5f3ff', darkCardBg:'#0f0020', darkBodyBg:'#080010' },
  monochrome:{ name:'Monochrome',       category:'minimal',primary:'#374151', primaryDark:'#111827', primaryLight:'#6b7280', accent:'#9ca3af', dark:'#030712', surface:'#111827', gradient:'linear-gradient(135deg,#111827 0%,#374151 50%,#6b7280 100%)', heroGradient:'linear-gradient(135deg,#030712 0%,#111827 50%,#1f2937 100%)', cardBg:'#ffffff', bodyBg:'#f9fafb', darkCardBg:'#1f2937', darkBodyBg:'#111827' },
};

export const THEME_CATEGORIES = {
  warm:    { label: '🔥 Warm', themes: ['default','coral','amber','rose','lava'] },
  cool:    { label: '🌊 Cool', themes: ['ocean','sky','slate','arctic'] },
  nature:  { label: '🌿 Nature', themes: ['forest','emerald','sage'] },
  luxury:  { label: '👑 Luxury', themes: ['royal','sakura','plum'] },
  dark:    { label: '🌙 Dark', themes: ['midnight','neon','matrix','obsidian'] },
  minimal: { label: '✨ Minimal', themes: ['snow','lavender','monochrome'] },
};

/* ── Font catalogue (10 fonts) ──────────────────────────────────────────── */
export const FONTS = {
  default:  { name:'Playfair + DM Sans',       display:"'Playfair Display',serif",      body:"'DM Sans',sans-serif",          url:'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=DM+Sans:wght@300;400;500;600;700&display=swap' },
  modern:   { name:'Poppins + Inter',           display:"'Poppins',sans-serif",          body:"'Inter',sans-serif",             url:'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Inter:wght@300;400;500;600&display=swap' },
  elegant:  { name:'Cormorant + Raleway',       display:"'Cormorant Garamond',serif",    body:"'Raleway',sans-serif",           url:'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Raleway:wght@300;400;500;600;700&display=swap' },
  bold:     { name:'Syne + Work Sans',          display:"'Syne',sans-serif",             body:"'Work Sans',sans-serif",         url:'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Work+Sans:wght@300;400;500;600&display=swap' },
  luxury:   { name:'Bodoni Moda + Jost',        display:"'Bodoni Moda',serif",           body:"'Jost',sans-serif",              url:'https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400;600;700&family=Jost:wght@300;400;500;600&display=swap' },
  tech:     { name:'Space Grotesk + IBM Plex',  display:"'Space Grotesk',sans-serif",    body:"'IBM Plex Sans',sans-serif",     url:'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap' },
  minimal:  { name:'Outfit + Nunito',           display:"'Outfit',sans-serif",           body:"'Nunito',sans-serif",            url:'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Nunito:wght@300;400;500;600&display=swap' },
  classic:  { name:'Libre Baskerville + Source',display:"'Libre Baskerville',serif",     body:"'Source Sans 3',sans-serif",     url:'https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@300;400;500;600&display=swap' },
  geometric:{ name:'Futura + Lato',             display:"'Josefin Sans',sans-serif",     body:"'Lato',sans-serif",              url:'https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&family=Lato:wght@300;400;700&display=swap' },
  humanist: { name:'Nunito Sans + Mulish',      display:"'Nunito Sans',sans-serif",      body:"'Mulish',sans-serif",            url:'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;600;700;800&family=Mulish:wght@300;400;500;600&display=swap' },
};

/* ── localStorage helpers ─────────────────────────────────────────────── */
const readCache = () => {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
};
export const writeCache = (data) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
};

/* ── Core applyTheme ─────────────────────────────────────────────────── */
export const applyTheme = (settings) => {
  const root = document.documentElement;
  const key  = settings?.theme || 'default';
  const t    = THEMES[key] || THEMES.default;
  const isDark = settings?.darkMode === true;

  const primary      = settings?.primaryColor      || t.primary;
  const primaryDark  = settings?.primaryDarkColor  || t.primaryDark;
  const primaryLight = settings?.primaryLightColor || t.primaryLight;
  const accent       = settings?.secondaryColor    || settings?.accentColor || t.accent;
  const dark         = settings?.darkBgColor       || settings?.darkColor   || t.dark;
  const surface      = settings?.surfaceColor      || t.surface || dark;

  // Never keep the selected preset gradient when admin changed brand colours.
  // Build gradients from the active admin colours so every storefront adapts
  // immediately instead of falling back to default green/orange theme values.
  const themeGradient = `linear-gradient(135deg, ${primaryDark} 0%, ${primary} 50%, ${accent} 100%)`;
  const heroGradient  = `linear-gradient(135deg, ${dark} 0%, ${surface} 50%, ${primaryDark} 100%)`;

  const cardBg  = settings?.cardBgColor || (isDark ? (t.darkCardBg || '#1a1a2e') : t.cardBg);
  const bodyBg  = settings?.bodyBgColor || (isDark ? (t.darkBodyBg || '#0d0d1a') : t.bodyBg);
  const textPrimary   = isDark ? '#f1f5f9' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';
  const borderColor   = isDark ? '#1e293b' : '#e5e7eb';

  root.style.setProperty('--color-primary',        primary);
  root.style.setProperty('--color-primary-dark',   primaryDark);
  root.style.setProperty('--color-primary-light',  primaryLight);
  root.style.setProperty('--color-accent',         accent);
  root.style.setProperty('--color-dark',           dark);
  root.style.setProperty('--color-surface',        surface);
  root.style.setProperty('--theme-gradient',       themeGradient);
  root.style.setProperty('--hero-gradient',        heroGradient);
  root.style.setProperty('--card-bg',              cardBg);
  root.style.setProperty('--body-bg',              bodyBg);
  root.style.setProperty('--glow-primary',         primary + '66');
  root.style.setProperty('--glow-accent',          accent  + '4d');
  root.style.setProperty('--text-primary',         textPrimary);
  root.style.setProperty('--text-secondary',       textSecondary);
  root.style.setProperty('--border-color',         borderColor);

  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) metaTheme.setAttribute('content', primary);

  document.body.style.setProperty('background', bodyBg, 'important');
  if (isDark) {
    document.documentElement.classList.add('dark-mode');
    document.body.style.setProperty('color', textPrimary, 'important');
  } else {
    document.documentElement.classList.remove('dark-mode');
    document.body.style.removeProperty('color');
  }

  const fKey = settings?.fontStyle || settings?.fontFamily || 'default';
  const f    = FONTS[fKey] || FONTS.default;
  root.style.setProperty('--font-display', f.display);
  root.style.setProperty('--font-body',    f.body);

  let link = document.getElementById('theme-font');
  if (!link) { link = document.createElement('link'); link.id = 'theme-font'; link.rel = 'stylesheet'; document.head.appendChild(link); }
  if (link.getAttribute('href') !== f.url) link.href = f.url;

  let style = document.getElementById('theme-custom-css');
  if (!style) { style = document.createElement('style'); style.id = 'theme-custom-css'; document.head.appendChild(style); }
  style.textContent = settings?.customCSS || '';

  // Apply favicon from settings
  if (settings?.faviconUrl) {
    ['icon', 'shortcut icon', 'apple-touch-icon'].forEach(rel => {
      let fav = document.querySelector(`link[rel="${rel}"]`);
      if (!fav) { fav = document.createElement('link'); fav.rel = rel; document.head.appendChild(fav); }
      fav.href = settings.faviconUrl;
    });
  }

  // Apply store name as page title prefix
  if (settings?.storeName) {
    const current = document.title;
    // Only update if it's still the default title or another store name (not a page-specific title)
    if (current === 'StoreKit' || current === settings.storeName) {
      document.title = settings.storeName;
    }
  }
};

/* ── IIFE: runs before React ─────────────────────────────────────────── */
// Only apply cache if index.html bootstrap hasn't already fetched the real
// theme from the API (window.__szApiFetched is set by index.html on success).
try { if (!window.__szApiFetched) { applyTheme(readCache()); } } catch {}

/* ── ThemeProvider ───────────────────────────────────────────────────── */
export const ThemeProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => readCache());
  const [themeKey, setThemeKey] = useState(() => readCache()?.theme || 'default');
  const [darkMode, setDarkModeState] = useState(() => readCache()?.darkMode || false);

  useLayoutEffect(() => {
    // Skip if index.html already fetched the real theme from API —
    // applying cache here would overwrite it with stale/default data.
    if (!window.__szApiFetched) { applyTheme(readCache()); }
  }, []);

  const lastSaveRef = React.useRef(0);

  const loadAndApply = useCallback(async () => {
    // Don't overwrite a theme that was just saved (5s grace period)
    if (Date.now() - lastSaveRef.current < 5000) return;
    try {
      const { data } = await API.get('/settings');
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      if (!('storeName' in data || 'theme' in data)) return;
      setSettings(data);
      setThemeKey(data.theme || 'default');
      setDarkModeState(data.darkMode || false);
      applyTheme(data);
      writeCache(data);
      // Mark that React has applied the real theme from the API
      window.__szApiFetched = true;
      // Build __STOREKIT_SEO__ from either a nested seo_config object (legacy)
      // or the flat key/value pairs that the admin Settings page saves directly to DB.
      const seo = (data.seo_config && typeof data.seo_config === 'object') ? data.seo_config : {};
      window.__STOREKIT_SEO__ = {
        siteName:           data.storeName          || seo.siteName,
        siteUrl:            seo.siteUrl,
        defaultDescription: seo.defaultDescription,
        defaultOgImage:     seo.defaultOgImage,
        twitterHandle:      seo.twitterHandle,
        orgName:            seo.orgName             || data.storeName,
        logoUrl:            data.logoUrl            || seo.logoUrl,
        phone:              data.phone              || seo.phone,
        facebookUrl:        data.facebookUrl        || seo.facebookUrl,
        instagramUrl:       data.instagramUrl       || seo.instagramUrl,
        twitterUrl:         data.twitterUrl         || seo.twitterUrl,
        linkedinUrl:        data.linkedinUrl        || seo.linkedinUrl,
        youtubeUrl:         data.youtubeUrl         || seo.youtubeUrl,
        ga4Id:              data.googleAnalytics    || seo.ga4Id,
        gtmId:              data.gtmId              || seo.gtmId,
        // facebookPixel is the flat DB key saved by admin Settings → Analytics tab
        metaPixelId:        data.facebookPixel      || seo.metaPixelId,
        currencyCode:       data.currencyCode       || seo.currencyCode || 'LKR',
      };
      window.dispatchEvent(new CustomEvent('storekit:seo-ready'));
    } catch (err) {
      // Silently ignore ECONNREFUSED / network errors (backend not yet started)
      // The interval will retry automatically
      if (err?.code !== 'ERR_NETWORK' && err?.response) {
        console.warn('[ThemeContext] settings fetch error:', err.message);
      }
    }
  }, []);

  useEffect(() => {
    loadAndApply();
    // Retry quickly at first (backend may be starting), then slow down
    const retry = () => {
      loadAndApply();
    };
    // Fast retries for first 30s (every 3s), then every 10s
    const fast = setInterval(retry, 3000);
    const slow = setTimeout(() => {
      clearInterval(fast);
      setInterval(loadAndApply, 10000);
    }, 30000);
    return () => { clearInterval(fast); clearTimeout(slow); };
  }, [loadAndApply]);

  const setDarkMode = useCallback((val) => {
    setSettings(prev => {
      const updated = { ...(prev || {}), darkMode: val };
      applyTheme(updated);
      writeCache(updated);
      API.put('/settings', updated).catch(() => {});
      return updated;
    });
    setDarkModeState(val);
  }, []);

  const saveTheme = useCallback(async (updates) => {
    lastSaveRef.current = Date.now();
    setSettings(prev => {
      const updated = { ...(prev || {}), ...updates };
      setThemeKey(updated.theme || 'default');
      setDarkModeState(updated.darkMode || false);
      applyTheme(updated);
      writeCache(updated);
      return updated;
    });
    try {
      await API.put('/settings', updates);
    } catch (err) {
      console.warn('[ThemeContext] saveTheme error:', err.message);
    }
  }, []);

  const refreshTheme = useCallback(() => {
    lastSaveRef.current = 0; // bypass grace period for explicit refresh
    loadAndApply();
  }, [loadAndApply]);

  return (
    <ThemeContext.Provider value={{ settings, themeKey, darkMode, setDarkMode, saveTheme, THEMES, THEME_CATEGORIES, FONTS, refreshTheme, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);