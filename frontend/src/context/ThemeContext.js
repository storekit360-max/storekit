/**
 * ThemeContext.js  — ENHANCED THEME SYSTEM v2
 * 20+ themes, 10+ fonts, dark/light mode, theme builder
 */
import React, {
  createContext, useContext, useState, useEffect, useLayoutEffect, useCallback,
} from 'react';
import API from '../utils/api';

const ThemeContext = createContext();
const LS_BASE_KEY = 'storekit_theme_v2';
const getTenantThemeCacheKey = () => {
  try {
    const host = window.location.hostname || 'default';
    return `${LS_BASE_KEY}:${host}`;
  } catch {
    return `${LS_BASE_KEY}:default`;
  }
};

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


/* ── Storefront UI template catalogue (20+ complete visual systems) ────────
   These are CSS-driven templates. They do not change APIs, DB schema, routes,
   cart/auth logic, or component contracts. Admin can save `storeTemplate` via
   existing /api/settings key-value settings, then ThemeContext applies it as
   <html data-store-template="...">.
*/
export const STORE_TEMPLATES = {
  classic:       { name: 'Classic Commerce', category: 'general', description: 'Balanced storefront for any catalogue.' },
  modern:        { name: 'Modern Cards', category: 'general', description: 'Clean cards, soft shadows, modern spacing.' },
  minimal:       { name: 'Minimal Studio', category: 'minimal', description: 'White-space focused premium layout.' },
  luxury:        { name: 'Luxury Boutique', category: 'premium', description: 'Elegant premium boutique treatment.' },
  fashion:       { name: 'Fashion Editorial', category: 'retail', description: 'Editorial-style product presentation.' },
  electronics:   { name: 'Electronics Pro', category: 'retail', description: 'Tech-focused compact product grid.' },
  mobile:        { name: 'Mobile Gadget', category: 'retail', description: 'Fast, dense, device-focused layout.' },
  grocery:       { name: 'Grocery Fresh', category: 'retail', description: 'Friendly fresh-market interface.' },
  beauty:        { name: 'Beauty Glow', category: 'retail', description: 'Soft rounded beauty store design.' },
  furniture:     { name: 'Furniture Living', category: 'retail', description: 'Large cards for lifestyle catalogues.' },
  jewelry:       { name: 'Jewelry Luxe', category: 'premium', description: 'High-end product focus with refined spacing.' },
  sports:        { name: 'Sports Active', category: 'retail', description: 'Bold, energetic sports-store visual system.' },
  automotive:    { name: 'Automotive Dark', category: 'retail', description: 'Strong dark performance look.' },
  kids:          { name: 'Kids Playful', category: 'retail', description: 'Bright, friendly rounded UI.' },
  books:         { name: 'Bookstore Calm', category: 'minimal', description: 'Readable calm catalogue style.' },
  pharmacy:      { name: 'Pharmacy Clean', category: 'professional', description: 'Trust-focused clean medical retail.' },
  b2b:           { name: 'B2B Wholesale', category: 'professional', description: 'Dense practical catalogue layout.' },
  marketplace:   { name: 'Marketplace Grid', category: 'general', description: 'High-density multi-category storefront.' },
  neon:          { name: 'Neon Cyber', category: 'dark', description: 'Dark cyber-style storefront.' },
  organic:       { name: 'Organic Nature', category: 'retail', description: 'Natural soft eco-store style.' },
  premiumApple:  { name: 'Premium Apple', category: 'premium', description: 'Apple-inspired spacing and glass effects.' },
  sriLanka:      { name: 'Sri Lanka Retail', category: 'local', description: 'Local ecommerce style for Sri Lankan stores.' },
  wholesale:     { name: 'Wholesale Deals', category: 'b2b', description: 'Offer-first layout with compact cards.' },
  startup:       { name: 'Startup Store', category: 'modern', description: 'SaaS-like modern retail style.' },
  nordic:        { name: 'Nordic Atelier', category: 'minimal', description: 'Scandinavian whitespace, calm grids and restrained details.' },
  brutalist:     { name: 'Brutalist Market', category: 'modern', description: 'Hard borders, oversized type and deliberately raw commerce UI.' },
  retro:         { name: 'Retro Pop Shop', category: 'retail', description: 'Playful vintage colors, offset shadows and poster-like cards.' },
  glass:         { name: 'Glass Commerce', category: 'modern', description: 'Layered glass panels, atmospheric gradients and floating content.' },
  editorialMono:{ name: 'Mono Editorial', category: 'minimal', description: 'Black-and-white magazine layout with asymmetric product stories.' },
  tropical:      { name: 'Tropical Market', category: 'retail', description: 'Bright island-market energy, organic shapes and lively spacing.' },
  zen:           { name: 'Zen Gallery', category: 'premium', description: 'Quiet gallery composition with expansive product presentation.' },
  industrial:    { name: 'Industrial Supply', category: 'professional', description: 'Utilitarian catalogue, technical labels and dense purchasing UI.' },
  noir:          { name: 'Noir Department', category: 'dark', description: 'Cinematic black retail with spotlight products and restrained controls.' },
  coastal:       { name: 'Coastal Living', category: 'retail', description: 'Airy seaside catalogue with soft blue surfaces and relaxed cards.' },
  artisan:       { name: 'Artisan Workshop', category: 'retail', description: 'Handmade craft storefront with tactile borders and maker details.' },
  comic:         { name: 'Comic Pop', category: 'retail', description: 'Graphic speech-bubble controls, ink outlines and energetic panels.' },
  space:         { name: 'Space Station', category: 'dark', description: 'Futuristic control-deck shopping with orbital shapes and luminous UI.' },
  academy:       { name: 'Academy Shop', category: 'professional', description: 'Scholarly institutional layout with formal navigation and cards.' },
  cafe:          { name: 'Cafe Counter', category: 'retail', description: 'Warm menu-board shopping with compact item cards and order controls.' },
  pet:           { name: 'Pet Parade', category: 'retail', description: 'Friendly pet-store bubbles, playful badges and approachable filters.' },
  wedding:       { name: 'Wedding Registry', category: 'premium', description: 'Romantic registry presentation with elegant frames and soft controls.' },
  fitness:       { name: 'Fitness Lab', category: 'retail', description: 'High-energy training catalogue with strong CTAs and performance panels.' },
  medical:       { name: 'Medical Supply', category: 'professional', description: 'Accessible clinical purchasing with strong status and filter clarity.' },
  gaming:        { name: 'Gaming Arena', category: 'dark', description: 'Angular esports interface with neon actions and dense product stats.' },
  music:         { name: 'Record Store', category: 'retail', description: 'Album-inspired square cards, record-rack grids and bold labels.' },
  photography:   { name: 'Photo Gallery', category: 'premium', description: 'Image-led darkroom layout with cinematic product framing.' },
  travel:        { name: 'Travel Goods', category: 'retail', description: 'Destination-inspired cards, ticket controls and map-like surfaces.' },
  ecoMarket:     { name: 'Zero Waste Market', category: 'retail', description: 'Recycled-paper visual system with low-impact natural styling.' },
  auction:       { name: 'Auction House', category: 'premium', description: 'Lot-based catalogue with serif labels and authoritative bidding style.' },
  department:    { name: 'Department Store', category: 'general', description: 'Large multi-category retail navigation with structured promotions.' },
  warehouse:     { name: 'Warehouse Club', category: 'b2b', description: 'Bulk-first shelf grid with high-density prices and utilitarian actions.' },
  creator:       { name: 'Creator Shop', category: 'modern', description: 'Social-first merchandise store with content cards and vibrant actions.' },
  pastel:        { name: 'Pastel Boutique', category: 'retail', description: 'Soft color-block boutique with rounded controls and stacked cards.' },
  masonry:       { name: 'Masonry Market', category: 'modern', description: 'Varied editorial tiles and staggered catalogue rhythm.' },
  capsule:       { name: 'Capsule Collection', category: 'minimal', description: 'Ultra-focused limited collection with oversized product stages.' },
  nightMarket:   { name: 'Night Market', category: 'local', description: 'Festival-like dark market with glowing stalls and compact browsing.' },
};

export const TEMPLATE_CATEGORIES = {
  general:      { label: 'General', templates: ['classic','modern','marketplace','department'] },
  retail:       { label: 'Retail', templates: ['fashion','electronics','mobile','grocery','beauty','furniture','sports','kids','organic','retro','tropical','coastal','artisan','comic','cafe','pet','fitness','music','travel','ecoMarket','pastel'] },
  premium:      { label: 'Premium', templates: ['luxury','jewelry','premiumApple','zen','wedding','photography','auction'] },
  professional: { label: 'Professional', templates: ['pharmacy','b2b','wholesale','industrial','academy','medical'] },
  minimal:      { label: 'Minimal', templates: ['minimal','books','nordic','editorialMono','capsule'] },
  dark:         { label: 'Dark', templates: ['neon','automotive','noir','space','gaming'] },
  local:        { label: 'Local', templates: ['sriLanka','startup','nightMarket'] },
  modern:       { label: 'Experimental', templates: ['brutalist','glass','creator','masonry'] },
  b2b:          { label: 'Bulk Commerce', templates: ['warehouse'] },
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
  try {
    const boot = typeof window !== 'undefined' ? window.__STOREKIT_BOOTSTRAP_SETTINGS__ : null;
    if (boot && typeof boot === 'object') return boot;
    const r = localStorage.getItem(getTenantThemeCacheKey());
    return r ? JSON.parse(r) : null;
  }
  catch { return null; }
};
export const writeCache = (data) => {
  try { localStorage.setItem(getTenantThemeCacheKey(), JSON.stringify(data)); } catch {}
};
export const clearThemeLocalCache = () => {
  try { localStorage.removeItem(getTenantThemeCacheKey()); } catch {}
};


const templateMetrics = {
  classic:      { radius:'20px', shadow:'0 18px 45px rgba(15,23,42,0.10)', gap:'1.25rem' },
  modern:       { radius:'24px', shadow:'0 22px 60px rgba(15,23,42,0.12)', gap:'1.5rem' },
  minimal:      { radius:'12px', shadow:'0 1px 0 rgba(15,23,42,0.08)', gap:'2rem' },
  luxury:       { radius:'28px', shadow:'0 30px 90px rgba(15,23,42,0.18)', gap:'2rem' },
  fashion:      { radius:'6px',  shadow:'0 20px 55px rgba(15,23,42,0.12)', gap:'1.75rem' },
  electronics:  { radius:'18px', shadow:'0 18px 50px rgba(2,6,23,0.16)', gap:'1rem' },
  mobile:       { radius:'18px', shadow:'0 14px 40px rgba(15,23,42,0.12)', gap:'0.9rem' },
  grocery:      { radius:'22px', shadow:'0 14px 35px rgba(22,101,52,0.10)', gap:'1rem' },
  beauty:       { radius:'32px', shadow:'0 24px 70px rgba(219,39,119,0.12)', gap:'1.5rem' },
  furniture:    { radius:'10px', shadow:'0 26px 75px rgba(67,20,7,0.12)', gap:'2rem' },
  jewelry:      { radius:'999px', shadow:'0 28px 85px rgba(15,23,42,0.20)', gap:'2rem' },
  sports:       { radius:'14px', shadow:'0 18px 55px rgba(15,23,42,0.16)', gap:'1rem' },
  automotive:   { radius:'8px',  shadow:'0 28px 75px rgba(0,0,0,0.28)', gap:'1rem' },
  kids:         { radius:'30px', shadow:'0 18px 45px rgba(15,23,42,0.10)', gap:'1.25rem' },
  books:        { radius:'8px',  shadow:'0 12px 35px rgba(15,23,42,0.08)', gap:'1.6rem' },
  pharmacy:     { radius:'16px', shadow:'0 14px 40px rgba(15,118,110,0.10)', gap:'1.2rem' },
  b2b:          { radius:'10px', shadow:'0 10px 30px rgba(15,23,42,0.10)', gap:'0.75rem' },
  marketplace:  { radius:'16px', shadow:'0 12px 36px rgba(15,23,42,0.10)', gap:'0.75rem' },
  neon:         { radius:'18px', shadow:'0 0 35px var(--glow-primary)', gap:'1rem' },
  organic:      { radius:'26px', shadow:'0 18px 50px rgba(77,124,15,0.12)', gap:'1.4rem' },
  premiumApple: { radius:'30px', shadow:'0 30px 80px rgba(15,23,42,0.12)', gap:'2.25rem' },
  sriLanka:     { radius:'18px', shadow:'0 18px 45px rgba(15,23,42,0.12)', gap:'1rem' },
  wholesale:    { radius:'8px',  shadow:'0 10px 25px rgba(15,23,42,0.10)', gap:'0.65rem' },
  startup:      { radius:'22px', shadow:'0 24px 70px rgba(15,23,42,0.12)', gap:'1.5rem' },
  nordic:       { radius:'2px',  shadow:'none', gap:'3rem' },
  brutalist:    { radius:'0px',  shadow:'7px 7px 0 #111827', gap:'1rem' },
  retro:        { radius:'18px', shadow:'6px 7px 0 rgba(67,20,7,.85)', gap:'1.4rem' },
  glass:        { radius:'28px', shadow:'0 28px 80px rgba(30,41,59,.18)', gap:'1.75rem' },
  editorialMono:{ radius:'0px',  shadow:'none', gap:'3.5rem' },
  tropical:     { radius:'36px', shadow:'0 20px 50px rgba(6,95,70,.16)', gap:'1.3rem' },
  zen:          { radius:'0px',  shadow:'0 1px 0 rgba(15,23,42,.12)', gap:'4rem' },
  industrial:   { radius:'3px',  shadow:'0 5px 0 rgba(15,23,42,.25)', gap:'.7rem' },
  noir:         { radius:'0px', shadow:'0 32px 90px rgba(0,0,0,.55)', gap:'2rem' },
  coastal:      { radius:'28px 8px', shadow:'0 18px 45px rgba(14,116,144,.12)', gap:'1.8rem' },
  artisan:      { radius:'8px', shadow:'4px 6px 0 rgba(69,45,21,.22)', gap:'1.5rem' },
  comic:        { radius:'22px', shadow:'6px 6px 0 #111827', gap:'1rem' },
  space:        { radius:'50% 14px 14px', shadow:'0 0 35px rgba(34,211,238,.3)', gap:'1.2rem' },
  academy:      { radius:'2px', shadow:'0 3px 0 #1e3a5f', gap:'1.4rem' },
  cafe:         { radius:'16px 16px 4px 4px', shadow:'0 12px 30px rgba(120,53,15,.16)', gap:'1rem' },
  pet:          { radius:'28px 28px 28px 8px', shadow:'0 16px 36px rgba(124,58,237,.12)', gap:'1.2rem' },
  wedding:      { radius:'50% 50% 12px 12px', shadow:'0 25px 65px rgba(190,24,93,.10)', gap:'3rem' },
  fitness:      { radius:'0 24px 0 24px', shadow:'7px 7px 0 rgba(220,38,38,.2)', gap:'.9rem' },
  medical:      { radius:'10px', shadow:'0 6px 20px rgba(2,132,199,.08)', gap:'1rem' },
  gaming:       { radius:'4px 18px', shadow:'0 0 28px rgba(168,85,247,.35)', gap:'.8rem' },
  music:        { radius:'50% 50% 12px 12px', shadow:'0 16px 40px rgba(24,24,27,.2)', gap:'1.4rem' },
  photography:  { radius:'0px', shadow:'0 30px 90px rgba(0,0,0,.5)', gap:'3rem' },
  travel:       { radius:'18px', shadow:'0 15px 40px rgba(3,105,161,.13)', gap:'1.4rem' },
  ecoMarket:    { radius:'6px 26px', shadow:'3px 5px 0 rgba(63,98,18,.18)', gap:'1.3rem' },
  auction:      { radius:'1px', shadow:'0 8px 0 rgba(120,53,15,.18)', gap:'2rem' },
  department:   { radius:'10px', shadow:'0 8px 22px rgba(15,23,42,.09)', gap:'.8rem' },
  warehouse:    { radius:'0px', shadow:'2px 3px 0 #475569', gap:'.45rem' },
  creator:      { radius:'24px', shadow:'0 22px 55px rgba(236,72,153,.15)', gap:'1.2rem' },
  pastel:       { radius:'32px', shadow:'0 18px 45px rgba(147,51,234,.09)', gap:'1.5rem' },
  masonry:      { radius:'12px', shadow:'0 20px 45px rgba(15,23,42,.13)', gap:'1rem' },
  capsule:      { radius:'0px', shadow:'none', gap:'6rem' },
  nightMarket:  { radius:'16px 4px', shadow:'0 0 25px rgba(250,204,21,.22)', gap:'.8rem' },
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
  const contrastText = (color, light = '#f8fafc', darkText = '#0f172a') => {
    const match = String(color || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) return isDark ? light : darkText;
    let hex = match[1];
    if (hex.length === 3) hex = hex.split('').map(char => char + char).join('');
    const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    return luminance < 0.36 ? light : darkText;
  };
  const textPrimary   = contrastText(bodyBg);
  const textSecondary = textPrimary === '#f8fafc' ? '#cbd5e1' : '#64748b';
  const textOnCard    = contrastText(cardBg);
  const textMutedOnCard = textOnCard === '#f8fafc' ? '#cbd5e1' : '#64748b';
  const borderColor   = contrastText(cardBg) === '#f8fafc' ? '#334155' : '#e5e7eb';
  // Some presets (Midnight, Neon, Matrix, Obsidian, etc.) are dark by design
  // even when the admin never flipped the separate "Dark Mode" switch. Detect
  // that from the actual computed background luminance so skeleton loaders,
  // sticky bars and gray-scale utility overrides that only listen for
  // `.dark-mode` still get applied instead of silently staying in their
  // light-background styling on a black page.
  const visualDark = isDark || textPrimary === '#f8fafc';

  root.style.setProperty('--color-primary',        primary);
  root.style.setProperty('--color-primary-dark',   primaryDark);
  root.style.setProperty('--color-primary-light',  primaryLight);
  root.style.setProperty('--color-accent',         accent);
  // `--color-dark` is historically used as foreground text throughout the
  // storefront. Keep it contrast-safe and expose the actual dark brand shade
  // separately for backgrounds and gradients.
  root.style.setProperty('--color-dark',           textPrimary);
  root.style.setProperty('--theme-dark',           dark);
  root.style.setProperty('--color-surface',        surface);
  root.style.setProperty('--theme-gradient',       themeGradient);
  root.style.setProperty('--hero-gradient',        heroGradient);
  root.style.setProperty('--card-bg',              cardBg);
  root.style.setProperty('--body-bg',              bodyBg);
  root.style.setProperty('--glow-primary',         primary + '66');
  root.style.setProperty('--glow-accent',          accent  + '4d');
  root.style.setProperty('--text-primary',         textPrimary);
  root.style.setProperty('--text-secondary',       textSecondary);
  root.style.setProperty('--text-on-card',         textOnCard);
  root.style.setProperty('--text-muted-on-card',   textMutedOnCard);
  root.style.setProperty('--border-color',         borderColor);

  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) metaTheme.setAttribute('content', primary);

  const isAdminView = /^\/(admin|superadmin)(\/|$)/.test(window.location.pathname);
  root.toggleAttribute('data-customer-dark', isDark);
  root.toggleAttribute('data-visual-dark', visualDark);
  root.classList.remove('dark-mode');
  if (!isAdminView) {
    document.body.style.setProperty('background', bodyBg, 'important');
    document.body.style.setProperty('color', textPrimary, 'important');
  } else {
    document.body.style.removeProperty('background');
    document.body.style.removeProperty('color');
  }

  const templateKey = settings?.storeTemplate || settings?.template || settings?.layoutTemplate || 'classic';
  const safeTemplate = STORE_TEMPLATES[templateKey] ? templateKey : 'classic';
  root.setAttribute('data-store-template', safeTemplate);
  root.style.setProperty('--template-card-radius', templateMetrics[safeTemplate]?.radius || '20px');
  root.style.setProperty('--template-card-shadow', templateMetrics[safeTemplate]?.shadow || '0 18px 45px rgba(15,23,42,0.10)');
  root.style.setProperty('--template-section-gap', templateMetrics[safeTemplate]?.gap || '1.25rem');

  const fKey = settings?.fontStyle || settings?.fontFamily || 'default';
  const f    = FONTS[fKey] || FONTS.default;
  root.style.setProperty('--font-display', f.display);
  root.style.setProperty('--font-body',    f.body);

  let link = document.getElementById('theme-font');
  if (!link) { link = document.createElement('link'); link.id = 'theme-font'; link.rel = 'stylesheet'; document.head.appendChild(link); }
  if (link.getAttribute('href') !== f.url) link.href = f.url;

  let style = document.getElementById('theme-custom-css');
  if (!style) { style = document.createElement('style'); style.id = 'theme-custom-css'; document.head.appendChild(style); }
  // The server stores scoped, appearance-only CSS. Never run tenant CSS in the
  // admin application, including a stale browser cache from an older release.
  style.textContent = isAdminView ? '' : (settings?.customCSS || '');

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

  return { visualDark };
};

/* ── IIFE: runs before React ─────────────────────────────────────────── */
// Apply bootstrap/API settings before React paints. Do not use cross-tenant/global defaults.
try {
  const boot = window.__STOREKIT_BOOTSTRAP_SETTINGS__ || readCache();
  if (boot) applyTheme(boot);
} catch {}

/* ── ThemeProvider ───────────────────────────────────────────────────── */
export const ThemeProvider = ({ children }) => {
  const initialSettings = () => window.__STOREKIT_BOOTSTRAP_SETTINGS__ || readCache();
  const hasBootstrapSettings = Boolean(initialSettings());
  const [settings, setSettings] = useState(initialSettings);
  const [themeKey, setThemeKey] = useState(() => initialSettings()?.theme || 'default');
  const [darkMode, setDarkModeState] = useState(() => initialSettings()?.darkMode || false);
  // Whether the *rendered* background is actually dark, independent of the
  // darkMode toggle (some presets are dark by default). Used so contrast
  // fixes gated behind `.dark-mode` (skeleton loaders, sticky bars, etc.)
  // still apply on those presets.
  const [visualDark, setVisualDark] = useState(() => {
    const boot = initialSettings();
    return Boolean(boot?.darkMode) || /midnight|neon|matrix|obsidian/.test(boot?.theme || '');
  });
  // The pre-React bootstrap has already validated and loaded tenant settings.
  // Treat that as the initial successful check so CustomerLayout does not show
  // a second transitional loading component before Home's main loader.
  const [storeStatus, setStoreStatus] = useState({ checked: hasBootstrapSettings, unavailable: false, message: '' });

  useLayoutEffect(() => {
    const boot = window.__STOREKIT_BOOTSTRAP_SETTINGS__ || readCache();
    if (boot) {
      const result = applyTheme(boot);
      if (result) setVisualDark(result.visualDark);
    }
    document.documentElement.classList.add('storekit-theme-ready');
  }, []);

  const lastSaveRef = React.useRef(0);
  const bootstrapRequestRef = React.useRef(
    typeof window !== 'undefined' ? window.__STOREKIT_SETTINGS_REQUEST__ || null : null
  );

  const loadAndApply = useCallback(async () => {
    // Don't overwrite a theme that was just saved (5s grace period)
    if (Date.now() - lastSaveRef.current < 5000) return;
    try {
      let data;
      if (bootstrapRequestRef.current) {
        data = await bootstrapRequestRef.current;
        bootstrapRequestRef.current = null;
      } else {
        ({ data } = await API.get('/settings', { skipCache: true }));
      }
      setStoreStatus({ checked: true, unavailable: false, message: '' });
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      if (!('storeName' in data || 'theme' in data)) return;
      setSettings(data);
      setThemeKey(data.theme || 'default');
      setDarkModeState(data.darkMode || false);
      const result = applyTheme(data);
      if (result) setVisualDark(result.visualDark);
      writeCache(data);
      window.__STOREKIT_BOOTSTRAP_SETTINGS__ = data;
      window.__szApiFetched = true;
      document.documentElement.classList.add('storekit-theme-ready');
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
      if (err?.response?.data?.code === 'STORE_UNAVAILABLE' || err?.response?.status === 503) {
        clearThemeLocalCache();
        setSettings(null);
        setStoreStatus({
          checked: true,
          unavailable: true,
          message: err.response?.data?.message || 'This store is currently unavailable.',
        });
        document.title = 'Store currently unavailable';
        document.documentElement.classList.add('storekit-theme-ready');
        return;
      }
      if (err?.response?.data?.code === 'STORE_NOT_FOUND' || err?.response?.status === 404) {
        clearThemeLocalCache();
        setSettings(null);
        setStoreStatus({
          checked: true,
          unavailable: true,
          message: err.response?.data?.message || 'Store not found for this domain.',
        });
        document.title = 'Store currently unavailable';
        document.documentElement.classList.add('storekit-theme-ready');
        return;
      }
      setStoreStatus(prev => ({ ...prev, checked: true }));
      // Silently ignore ECONNREFUSED / network errors (backend not yet started)
      // The interval will retry automatically
      if (err?.code !== 'ERR_NETWORK' && err?.response) {
        console.warn('[ThemeContext] settings fetch error:', err.message);
      }
    }
  }, []);

  useEffect(() => {
    loadAndApply();

    // Low-usage mode: do not poll /api/settings every few seconds.
    // Refresh only when the tab becomes active again and at a slow safety interval.
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadAndApply();
    };
    document.addEventListener('visibilitychange', onVisible);

    const slow = setInterval(() => {
      if (document.visibilityState === 'visible') loadAndApply();
    }, 5 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(slow);
    };
  }, [loadAndApply]);

  // Keep another customer tab in sync immediately when Theme Builder saves on
  // the same tenant domain. The admin UI itself remains visually independent.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== getTenantThemeCacheKey() || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue);
        if (!next || typeof next !== 'object') return;
        setSettings(next);
        setThemeKey(next.theme || 'default');
        setDarkModeState(next.darkMode === true);
        const result = applyTheme(next);
        if (result) setVisualDark(result.visualDark);
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setDarkMode = useCallback((val) => {
    setSettings(prev => {
      const updated = { ...(prev || {}), darkMode: val };
      const result = applyTheme(updated);
      if (result) setVisualDark(result.visualDark);
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
      const result = applyTheme(updated);
      if (result) setVisualDark(result.visualDark);
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
    return loadAndApply();
  }, [loadAndApply]);

  return (
    <ThemeContext.Provider value={{ settings, themeKey, darkMode, visualDark, storeStatus, setDarkMode, saveTheme, THEMES, THEME_CATEGORIES, FONTS, STORE_TEMPLATES, TEMPLATE_CATEGORIES, refreshTheme, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
