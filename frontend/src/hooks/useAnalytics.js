/**
 * useAnalytics.js — GA4, GTM, and Meta Pixel bootstrap for StoreKit
 *
 * Architecture:
 *  - index.html loads the fbq() STUB (shim + async fbevents.js) without init.
 *    window.fbq is available from the very first millisecond of page load.
 *  - bootstrapAnalytics() calls fbq('init', pixelId, advancedMatchData) once
 *    the Pixel ID is fetched from admin Settings → SEO panel.
 *  - Advanced Matching: if a logged-in user is available at bootstrap time,
 *    hashed PII is sent with init so Meta can match events immediately.
 *  - applyAdvancedMatching() in useSEO.js can re-init later when checkout
 *    billing data becomes available (for guest users).
 *
 * This eliminates:
 *  - "Duplicate Pixel ID" warning (single init path, guarded by __fbPixelInitIds)
 *  - Lost Purchase events (native fbq queue buffers pre-init events)
 *  - Unmatched events (Advanced Matching data sent with every init)
 *
 * fbc / Click ID fix (Meta Parameter Builder requirement):
 *  captureFbclid() is called at the very start of bootstrapAnalytics, before
 *  fbevents.js has loaded and before React Router removes query params. This
 *  ensures the _fbc cookie is written immediately when a visitor arrives via
 *  a Facebook ad (URL contains ?fbclid=...), giving CAPI the Click ID it needs
 *  to report 30%+ additional conversions and raise the Event Match Quality score.
 */

import { useEffect } from 'react';
import { getAdvancedMatchingData, captureFbclid } from '../utils/metaPixelHelpers';

/**
 * fbqSafe — always use this instead of window.fbq() directly.
 *
 * The fbq stub in index.html guarantees window.fbq exists from first paint.
 * Events fired before fbq('init') queue in Meta's own n.queue and replay
 * automatically after init — no custom queue needed.
 *
 * The fourth argument (options like { eventID }) is passed through for
 * event deduplication with the Conversions API.
 */
export function fbqSafe(type, eventName, params, options) {
  if (window.fbq) {
    if (options) {
      window.fbq(type, eventName, params, options);
    } else {
      window.fbq(type, eventName, params);
    }
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function injectScript(src, id, onload) {
  if (document.getElementById(id)) return;
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  s.id = id;
  if (onload) s.onload = onload;
  document.head.appendChild(s);
}

function injectInlineScript(code, id) {
  if (document.getElementById(id)) return;
  const s = document.createElement('script');
  s.id = id;
  s.textContent = code;
  document.head.appendChild(s);
}

function injectNoscript(html, id) {
  if (document.getElementById(id)) return;
  const ns = document.createElement('noscript');
  ns.id = id;
  ns.innerHTML = html;
  document.body.insertBefore(ns, document.body.firstChild);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
/**
 * @param {object} cfg        — window.__STOREKIT_SEO__ config object
 * @param {object} [userData] — logged-in user { email, phone, firstName, lastName }
 *                              used for Advanced Matching on init
 */
export function bootstrapAnalytics(cfg, userData) {
  if (!cfg) return;

  // ── fbc / Click ID capture — MUST run before fbq('init') ─────────────────
  // Reads fbclid from the URL and writes _fbc cookie in Meta's documented
  // format (fb.1.{timestamp}.{fbclid}). This is the fix for Meta's
  // "Improve your match quality by sending more parameters" warning.
  // Calling it here (synchronously, before fbevents.js loads) guarantees
  // the fbclid is captured even on async pixel init.
  captureFbclid();

  // ── Google Tag Manager ────────────────────────────────────────────────────
  if (cfg.gtmId && !document.getElementById('gtm-script')) {
    injectInlineScript(
      `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${cfg.gtmId}');`,
      'gtm-script'
    );
    injectNoscript(
      `<iframe src="https://www.googletagmanager.com/ns.html?id=${cfg.gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
      'gtm-noscript'
    );
  }

  // ── Google Analytics 4 ────────────────────────────────────────────────────
  if (cfg.ga4Id && !document.getElementById('ga4-script')) {
    injectScript(
      `https://www.googletagmanager.com/gtag/js?id=${cfg.ga4Id}`,
      'ga4-loader',
      () => {
        injectInlineScript(
          `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${cfg.ga4Id}',{send_page_view:false});`,
          'ga4-script'
        );
      }
    );
  }

  // ── Meta Pixel ────────────────────────────────────────────────────────────
  // fbq stub is already loaded in index.html — window.fbq is always available.
  // We only call fbq('init') once per pixel ID (guarded by __fbPixelInitIds).
  // Advanced Matching: if a logged-in user is passed, their hashed PII is
  // included in the init call so Meta can match events from the first PageView.
  if (cfg.metaPixelId && window.fbq) {
    window.__fbPixelInitIds = window.__fbPixelInitIds || {};

    if (!window.__fbPixelInitIds[cfg.metaPixelId]) {
      window.__fbPixelInitIds[cfg.metaPixelId] = true;

      // Build Advanced Matching data from logged-in user if available
      const matchData = userData ? getAdvancedMatchingData(userData) : undefined;

      if (matchData && Object.keys(matchData).length) {
        // Init with hashed PII — improves match rate from ~40% to ~80%+
        window.fbq('init', cfg.metaPixelId, matchData);
        console.log('[Meta Pixel] Initialised with Advanced Matching:', Object.keys(matchData));
      } else {
        window.fbq('init', cfg.metaPixelId);
      }

      window.fbq('track', 'PageView');

      injectNoscript(
        `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${cfg.metaPixelId}&ev=PageView&noscript=1"/>`,
        'fb-pixel-noscript'
      );
    }
    // If called again (settings hot-reload, same pixelId) — do nothing.
    // A second fbq('init') with the same ID causes the Duplicate warning.
  }
}

// ── React component ───────────────────────────────────────────────────────────
/** Mount once at App root — reads user from localStorage for Advanced Matching */
export default function AnalyticsBootstrap() {
  useEffect(() => {
    // Try to get logged-in user for Advanced Matching at init time
    let userData = null;
    try {
      const raw = localStorage.getItem('user');
      if (raw) userData = JSON.parse(raw);
    } catch { }

    const cfg = window.__STOREKIT_SEO__;
    if (cfg) bootstrapAnalytics(cfg, userData);

    // Also listen for delayed injection (settings loaded after mount)
    const handler = () => {
      let u = null;
      try { u = JSON.parse(localStorage.getItem('user')); } catch { }
      bootstrapAnalytics(window.__STOREKIT_SEO__, u);
    };
    window.addEventListener('storekit:seo-ready', handler);
    return () => window.removeEventListener('storekit:seo-ready', handler);
  }, []);
  return null;
}