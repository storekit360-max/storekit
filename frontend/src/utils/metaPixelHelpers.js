/**
 * metaPixelHelpers.js
 *
 * Shared utilities for Meta Pixel + Conversions API integration.
 *
 * Responsibilities:
 *  1. generateEventId()       — deterministic UUID for browser↔server deduplication
 *  2. captureFbclid()         — grabs fbclid from URL and persists _fbc cookie
 *  3. getFbCookies()          — reads _fbp / _fbc from document.cookie
 *  4. getFbc()                — best-effort _fbc: cookie → URL param → sessionStorage
 *  5. getAdvancedMatchingData() — collects & hashes PII for the browser pixel
 *  6. sendCapiRequest()       — fires the same event server-side via /api/meta/capi
 *
 * Deduplication flow:
 *  Browser pixel fires event with eventId X
 *  → Frontend immediately calls sendCapiRequest with the same eventId X
 *  → Backend hashes PII and POSTs to Meta Graph API with eventId X
 *  → Meta sees two events with the same eventId and counts only ONE conversion
 *
 * fbc (Click ID) fix — Meta's Parameter Builder requirement:
 *  When a visitor arrives via a Facebook ad, the URL contains ?fbclid=XXXX.
 *  Meta's fbevents.js normally converts this into a _fbc cookie, but since
 *  StoreKit initialises the pixel asynchronously (after settings load), fbclid
 *  can be lost before fbevents.js runs. captureFbclid() is called as early as
 *  possible (inside bootstrapAnalytics) to:
 *   a) Read fbclid from the URL before React strips query params
 *   b) Build a _fbc cookie in Meta's documented format: fb.1.{timestamp}.{fbclid}
 *   c) Write it to document.cookie so fbevents.js (and getFbCookies) can read it
 *   d) Also store in sessionStorage as a fallback across SPA navigations
 */

import API from './api';

// ── 1. Event ID ───────────────────────────────────────────────────────────────
/**
 * Generate a unique event ID that links the browser pixel event to the
 * server-side CAPI event. Must be the same string in both calls.
 * Format: {eventName}-{orderId|randomHex}-{timestamp}
 */
export function generateEventId(eventName, uniquePart) {
  const ts   = Date.now().toString(36);
  const rand = uniquePart
    ? String(uniquePart).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)
    : Math.random().toString(36).slice(2, 10);
  return `${eventName}-${rand}-${ts}`;
}

// ── 2. fbclid capture ─────────────────────────────────────────────────────────
/**
 * captureFbclid()
 *
 * Call this as early as possible (in bootstrapAnalytics, before React Router
 * can strip the query string). It:
 *  1. Reads fbclid from the current URL search params
 *  2. Builds a _fbc cookie in Meta's official format: fb.1.{unixMs}.{fbclid}
 *  3. Writes it to document.cookie with a 90-day expiry (same as Meta's own)
 *  4. Stores it in sessionStorage so it survives SPA navigations on the same tab
 *
 * Safe to call on every page — it only writes when fbclid is present in the URL.
 * If _fbc cookie already exists (user came via ad before), it is NOT overwritten
 * unless a new fbclid is present in the URL.
 *
 * Meta's fbc format reference:
 *   https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters#fbc
 */
export function captureFbclid() {
  try {
    const params  = new URLSearchParams(window.location.search);
    const fbclid  = params.get('fbclid');
    if (!fbclid) return; // not an ad click — nothing to capture

    const fbc = `fb.1.${Date.now()}.${fbclid}`;

    // Write cookie — 90 days, same-site lax, no httpOnly (must be readable by JS)
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `_fbc=${encodeURIComponent(fbc)}; expires=${expires}; path=/; SameSite=Lax`;

    // Backup in sessionStorage in case the cookie is blocked (e.g. Safari ITP)
    try { sessionStorage.setItem('_fbc', fbc); } catch { /* private mode */ }

    console.log('[Meta Pixel] Captured fbclid → _fbc cookie set:', fbc.slice(0, 40) + '…');
  } catch (err) {
    // Never crash the page over a tracking helper
    console.warn('[Meta Pixel] captureFbclid error:', err.message);
  }
}

// ── 3. FB cookies ─────────────────────────────────────────────────────────────
/**
 * Read _fbp and _fbc cookies. Meta uses these for audience matching
 * and attribution — always pass them through to CAPI.
 */
export function getFbCookies() {
  const cookies = {};
  document.cookie.split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k === '_fbp' || k === '_fbc') cookies[k] = decodeURIComponent(v || '');
  });
  return { fbp: cookies._fbp || '', fbc: cookies._fbc || '' };
}

// ── 4. Best-effort fbc getter ─────────────────────────────────────────────────
/**
 * getFbc()
 *
 * Returns the best available _fbc value in priority order:
 *  1. _fbc cookie  (set by fbevents.js or by captureFbclid above)
 *  2. sessionStorage backup (set by captureFbclid, survives SPA navigations)
 *  3. Build on-the-fly from current URL if fbclid is still in query string
 *  4. Empty string (no ad click detected — normal for organic traffic)
 *
 * Use this instead of getFbCookies().fbc when you want maximum fbc coverage.
 */
export function getFbc() {
  // 1. Cookie (most reliable — fbevents.js or our own captureFbclid)
  const { fbc: cookieFbc } = getFbCookies();
  if (cookieFbc) return cookieFbc;

  // 2. sessionStorage backup
  try {
    const stored = sessionStorage.getItem('_fbc');
    if (stored) return stored;
  } catch { /* private mode or SSR */ }

  // 3. Build from current URL (last resort — fbclid still in query string)
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get('fbclid');
    if (fbclid) return `fb.1.${Date.now()}.${fbclid}`;
  } catch { /* non-browser environment */ }

  return '';
}

// ── 5. Advanced Matching data ─────────────────────────────────────────────────
/**
 * Collect PII from the billing object / logged-in user for Advanced Matching.
 * This improves audience match rate from ~40% to ~80%+.
 *
 * The browser pixel accepts raw (unhashed) values — fbevents.js hashes them
 * client-side before sending. The CAPI endpoint receives raw values too and
 * the backend hashes them before sending to Meta Graph API.
 *
 * @param {object} billing — { firstName, lastName, email, phone, city, country }
 * @returns {object}       — matching fields, undefined if empty
 */
export function getAdvancedMatchingData(billing = {}) {
  const data = {};
  if (billing.email)     data.em  = billing.email.toLowerCase().trim();
  if (billing.phone)     data.ph  = billing.phone.replace(/[^0-9]/g, '');
  if (billing.firstName) data.fn  = billing.firstName.toLowerCase().trim();
  if (billing.lastName)  data.ln  = billing.lastName.toLowerCase().trim();
  if (billing.city)      data.ct  = billing.city.toLowerCase().trim();
  if (billing.country)   data.country = billing.country.toLowerCase().trim().slice(0, 2); // 2-letter ISO
  return Object.keys(data).length ? data : undefined;
}

// ── 6. Server-side CAPI relay ─────────────────────────────────────────────────
/**
 * Fire a Conversions API event via the StoreKit backend.
 * Never throws — a CAPI failure must never break the checkout flow.
 *
 * @param {string} eventName      — 'Purchase' | 'AddToCart' | 'InitiateCheckout' | 'ViewContent'
 * @param {object} payload        — event-specific data (value, currency, contentIds, etc.)
 * @param {string} eventId        — same ID used in the browser pixel call
 * @param {object} [billing]      — raw PII for Advanced Matching (hashed server-side)
 */
export async function sendCapiRequest(eventName, payload, eventId, billing = {}) {
  try {
    const { fbp } = getFbCookies();
    // Use getFbc() for maximum fbc coverage (cookie → sessionStorage → URL)
    const fbc = getFbc();

    await API.post('/meta/capi', {
      eventName,
      eventId,
      eventSourceUrl: window.location.href,
      fbp,
      fbc,
      userAgent: navigator.userAgent,
      // PII — hashed on the backend, never logged
      email:     billing.email,
      phone:     billing.phone,
      firstName: billing.firstName,
      lastName:  billing.lastName,
      city:      billing.city,
      country:   billing.country,
      // Event data
      ...payload,
    });
  } catch (err) {
    // Silently swallow — CAPI is supplemental, never mission-critical
    console.warn('[CAPI relay] failed:', err.message);
  }
}