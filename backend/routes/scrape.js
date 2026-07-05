/**
 * ─── StoreKit Product URL Scraper ─────────────────────────────────────────────
 * routes/scrape.js
 *
 * POST /api/scrape/product
 *   Body: { url: "https://example.com/some-product" }
 *   Returns: { name, price, salePrice, description, images[], brand, sku }
 *
 * HOW IT WORKS:
 *  1. Fetch the remote page HTML via axios with full browser-like headers
 *     (rotating User-Agent + all sec-fetch-* / sec-ch-ua headers that real
 *     Chrome sends) to pass Cloudflare and other bot-detection systems.
 *  2. Retries up to 3 times with different UA strings on 403/429/503.
 *  3. Parse with a lightweight regex + DOM-like extraction (no headless browser
 *     needed for most e-commerce sites — meta tags + JSON-LD cover ~90%).
 *  4. For each image URL found, download the binary, upload it to Cloudinary
 *     via the existing /api/upload flow (re-uses adminAuth), and return the
 *     resulting Cloudinary URLs so the admin can pick which images to keep.
 *  5. All fields are returned as suggestions — the admin reviews and edits
 *     before saving the product.
 *
 * SECURITY:
 *  • Only adminAuth users can call this endpoint.
 *  • We block requests to private/internal IP ranges (SSRF protection).
 *  • A hard 15-second timeout is applied to the remote fetch.
 *  • Max 20 images are extracted; each image download has a 15s timeout.
 *
 * FIX (v2) — Production 403 Fix:
 *  Root cause: production server IPs (Railway/Render/Heroku) are datacenter
 *  ranges that Cloudflare, Akamai, and most e-commerce WAFs fingerprint and
 *  block. The original code only sent a basic UA string. Fix adds:
 *    • Full Chrome-like header set (sec-ch-ua, sec-fetch-*, accept-encoding …)
 *    • Rotating pool of realistic User-Agent strings
 *    • Random delay between retries (avoids rate-limit triggers)
 *    • Follows up to 5 redirects while preserving Referer/headers
 *    • Falls back to googlebot UA as last resort (many sites allow it)
 *    • Cleaner error messages ("This site blocks automated requests" vs raw axios)
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const https      = require('https');
const { URL }    = require('url');
const { adminAuth } = require('../middleware/auth');
const { generateProductDescription, generateProductSpecs, generateBrand, generateShortDescription } = require('./ai');

// ─── Cloudinary (optional) ────────────────────────────────────────────────────
// FIX (production): scrape.js must configure Cloudinary itself — it cannot rely
// on upload.js having run first, because each require() is a separate module.
// If the Cloudinary env vars are absent we skip the upload step and return the
// original scraped image URLs instead (admin can still pick/upload them manually).
const USE_CLOUDINARY =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY    &&
  process.env.CLOUDINARY_API_SECRET;

let cloudinary = null;
if (USE_CLOUDINARY) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('[Scraper] Cloudinary configured for image re-hosting');
} else {
  console.warn('[Scraper] Cloudinary env vars not set — scraped images will not be re-hosted');
}

// ─── SSRF Guard ───────────────────────────────────────────────────────────────
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost)/i;

function isSafeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (PRIVATE_IP_RE.test(u.hostname)) return false;
    return true;
  } catch { return false; }
}

// ─── Browser UA Pool ─────────────────────────────────────────────────────────
// Rotate through realistic desktop Chrome UAs — each looks like a different
// real user, reducing the chance of pattern-based blocking.
const UA_POOL = [
  // Chrome 124 on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  // Chrome 123 on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  // Chrome 122 on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // Firefox 125 on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  // Firefox 124 on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) Gecko/20100101 Firefox/124.0',
  // Edge 124 on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  // Safari 17 on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  // Googlebot — many sites whitelist this as a fallback
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
];

/** Return sec-ch-ua header value matching the given UA string */
function getSecChUa(ua) {
  if (ua.includes('Edg/')) {
    return '"Microsoft Edge";v="124", "Chromium";v="124", "Not-A.Brand";v="99"';
  }
  if (ua.includes('Chrome/124')) {
    return '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"';
  }
  if (ua.includes('Chrome/123')) {
    return '"Chromium";v="123", "Google Chrome";v="123", "Not-A.Brand";v="99"';
  }
  if (ua.includes('Chrome/122')) {
    return '"Chromium";v="122", "Google Chrome";v="122", "Not-A.Brand";v="99"';
  }
  // Firefox / Safari / Googlebot — don't send sec-ch-ua (they don't)
  return null;
}

/** Build a full browser-like header set for a given UA and target URL */
function buildHeaders(ua, targetUrl) {
  const isChromium = ua.includes('Chrome/') || ua.includes('Edg/');
  const origin     = new URL(targetUrl).origin;

  const headers = {
    'User-Agent':      ua,
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
    'Connection':      'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer':         origin + '/',
  };

  if (isChromium) {
    const secChUa = getSecChUa(ua);
    if (secChUa) {
      headers['sec-ch-ua']          = secChUa;
      headers['sec-ch-ua-mobile']   = '?0';
      headers['sec-ch-ua-platform'] = '"Windows"';
    }
    headers['Sec-Fetch-Dest']   = 'document';
    headers['Sec-Fetch-Mode']   = 'navigate';
    headers['Sec-Fetch-Site']   = 'none';
    headers['Sec-Fetch-User']   = '?1';
  }

  return headers;
}

/** Small random delay helper — makes retries look less bot-like */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Fetch HTML with retry logic across different UAs */
async function fetchHtml(pageUrl, timeoutMs = 15000) {
  const retryableStatuses = new Set([403, 429, 503, 520, 521, 522, 523, 524]);

  for (let attempt = 0; attempt < UA_POOL.length; attempt++) {
    const ua      = UA_POOL[attempt];
    const headers = buildHeaders(ua, pageUrl);

    try {
      const response = await axios.get(pageUrl, {
        timeout: timeoutMs,
        headers,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        maxRedirects: 5,
        maxContentLength: 5 * 1024 * 1024, // 5MB cap
        // Decompress automatically (axios handles gzip/br when accept-encoding is set)
        decompress: true,
        // Follow redirects and update referer header automatically
        beforeRedirect: (options, { headers: respHeaders }) => {
          if (respHeaders.location) {
            options.headers['Referer'] = pageUrl;
          }
        },
      });

      // Success — return HTML string
      return typeof response.data === 'string'
        ? response.data
        : response.data.toString();

    } catch (err) {
      const status = err.response?.status;
      const isRetryable = retryableStatuses.has(status)
        || err.code === 'ECONNRESET'
        || err.code === 'ETIMEDOUT';

      console.warn(
        `[Scraper] Attempt ${attempt + 1}/${UA_POOL.length} failed` +
        (status ? ` (HTTP ${status})` : ` (${err.code || err.message})`) +
        ` — UA: ${ua.substring(0, 40)}...`
      );

      // Last attempt — throw the error so the route handler can surface it
      if (attempt === UA_POOL.length - 1) {
        // Attach a clean message based on the final status code
        if (status === 403) {
          const e = new Error('This site blocks automated requests (HTTP 403). Try copying product details manually.');
          e.code = 'BLOCKED_403';
          throw e;
        }
        if (status === 429) {
          const e = new Error('Rate limited by the target site (HTTP 429). Wait a minute and try again.');
          e.code = 'RATE_LIMITED';
          throw e;
        }
        throw err;
      }

      // Only retry on retryable statuses / connection errors
      if (!isRetryable) throw err;

      // Exponential-ish back-off: 800ms, 1.5s, 2.5s, 4s …
      const delayMs = Math.min(800 * Math.pow(1.8, attempt), 6000);
      await sleep(delayMs + Math.random() * 400);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip HTML tags and decode common entities */
function stripHtml(str = '') {
  return str
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Extract content of a meta tag by name or property */
function metaContent(html, nameOrProp) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re) ||
    html.match(new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${nameOrProp}["']`,
      'i'
    ));
  return m ? stripHtml(m[1]) : null;
}

/** Extract first JSON-LD block of @type Product */
function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of blocks) {
    try {
      const data  = JSON.parse(raw.trim());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Product') return item;
        if (item['@graph']) {
          const prod = item['@graph'].find(n => n['@type'] === 'Product');
          if (prod) return prod;
        }
      }
    } catch { /* ignore bad JSON */ }
  }
  return null;
}

/** Try to parse a price string like "Rs. 4,500" or "$29.99" → number */
function parsePrice(str = '') {
  const cleaned = str.replace(/[^\d.,]/g, '').replace(',', '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Resolve a (possibly relative) image URL against the page origin */
function resolveUrl(base, src) {
  try { return new URL(src, base).href; } catch { return null; }
}

/**
 * Strict product-image URL filter.
 *
 * Rejects:
 *  • Non-image file formats (svg, gif, ico, webp used for UI, fonts)
 *  • Common noise patterns: sprites, icons, logos, banners, avatars,
 *    payment/social logos, category tiles, brand badges, review stars,
 *    placeholders, tracking pixels, lazy-load blanks
 *  • Thumbnail variants that sites append to URLs:
 *      _50x50, _100x100, _thumb, _small, _xs, _mini, /thumb/, /50/
 *      Shopify: _50x, _100x, _160x, _240x, _360x (keep _480x and above)
 *    These are recognisable copies of the original at reduced resolution.
 *  • Data URIs (base64 inline images are never real product photos)
 *  • Query-string-only image proxies with suspicious keys (w=50, s=50, etc.)
 */
function looksLikeProductImage(url) {
  if (!url) return false;
  if (url.startsWith('data:')) return false;

  const lower = url.toLowerCase();

  // ── Format rejects ──────────────────────────────────────────────────────────
  if (/\.(svg|gif|ico|webfont|woff2?|ttf|eot)(\?|$)/.test(lower)) return false;

  // ── Noise path/filename patterns ────────────────────────────────────────────
  const NOISE = [
    'sprite', 'icon', 'logo', 'banner', 'avatar', 'profile',
    'placeholder', 'blank', 'pixel', 'tracking', 'beacon',
    'payment', 'visa', 'mastercard', 'paypal', 'stripe',
    'facebook', 'twitter', 'instagram', 'whatsapp', 'youtube',
    'star-', 'rating', 'badge', 'ribbon', 'tag-',
    'category-tile', 'brand-logo', 'brand_logo',
    'footer', 'header', 'nav-', 'menu-', 'sidebar',
    'no-image', 'noimage', 'default-', 'generic-',
    'lazy-placeholder', 'lazyload', 'lp-placeholder',
  ];
  if (NOISE.some(n => lower.includes(n))) return false;

  // ── Thumbnail-size variants in URL path ─────────────────────────────────────
  // Shopify: _50x.jpg  _100x.jpg  _160x.jpg  _240x.jpg  _360x.jpg
  //          (keep _480x, _600x, _1024x, _2048x — those are full size)
  if (/_(?:[1-9]\d|[1-3]\d{2})x(?:_crop_\w+)?\.(?:jpe?g|png|webp)/.test(lower)) {
    // Only reject if the dimension is below 400
    const m = lower.match(/_(\d+)x/);
    if (m && parseInt(m[1], 10) < 400) return false;
  }

  // WooCommerce / generic: -150x150  -300x200  -100x100  etc.
  if (/-\d{2,3}x\d{2,3}\.(?:jpe?g|png|webp)/.test(lower)) return false;

  // Path segments like /50/ /100/ /thumb/ /small/ /xs/ /mini/ /tiny/
  if (/\/(?:thumb|small|xs|mini|tiny|50|100|75|80)\//.test(lower)) return false;

  // Query params: w=50&h=50, s=100, size=50
  try {
    const qs = new URL(url).search;
    if (qs) {
      const params = new URLSearchParams(qs);
      const w = parseInt(params.get('w') || params.get('width') || '9999', 10);
      const h = parseInt(params.get('h') || params.get('height') || '9999', 10);
      const s = parseInt(params.get('s') || params.get('size') || '9999', 10);
      if (Math.min(w, h, s) < 300) return false;
    }
  } catch { /* malformed URL — let it pass */ }

  return true;
}

/**
 * Score an image URL — higher = more likely to be the main product image.
 * Used to sort candidates before capping at MAX_IMAGES.
 */
function scoreImage(url) {
  const lower = url.toLowerCase();
  let score = 0;

  // Cloudinary / CDN transforms that hint at large size
  if (/w_[4-9]\d{2,}|w_[1-9]\d{3,}/.test(lower)) score += 3;    // w_400+
  if (/\/large\/|\/full\/|\/original\/|\/zoom\//.test(lower)) score += 3;
  if (/_(?:large|full|main|zoom|hero|primary)/.test(lower)) score += 2;

  // Shopify large variants
  if (/_(?:480|600|800|1024|2048)x/.test(lower)) score += 3;

  // Likely a primary gallery image
  if (/product.image|gallery.image|main.image|featured.image/i.test(lower)) score += 2;

  // URL contains dimension hints suggesting a big image
  if (/[_-](?:800|1000|1200|1500|2000)[_x-]/.test(lower)) score += 2;

  return score;
}

/** Deduplicate while preserving order */
function unique(arr) {
  return [...new Set(arr)];
}

// ─── Image signature detection (content-type-independent) ───────────────────
// Some CDNs (observed on Azure CDN / Blob Storage, e.g. singerwebcdn) serve
// real image files with `content-type: application/octet-stream` because the
// blob's content-type metadata was never set correctly at upload time on the
// source site. Trusting the HTTP content-type header alone caused real,
// valid images to be wrongly rejected. Instead, sniff the actual file bytes
// (same approach already used in routes/upload.js for direct uploads) and
// only fall back to the URL's file extension if byte-sniffing is inconclusive.
const IMAGE_MAGIC_BYTES = [
  { type: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF] },
  { type: 'image/png',  magic: [0x89, 0x50, 0x4E, 0x47] },
  { type: 'image/gif',  magic: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { type: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF (need WEBP marker too)
];

/**
 * Determine the real image MIME type from the actual file bytes.
 * Returns null if the buffer doesn't look like a known image format.
 */
function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  for (const sig of IMAGE_MAGIC_BYTES) {
    const matches = sig.magic.every((byte, i) => buffer[i] === byte);
    if (!matches) continue;
    if (sig.type === 'image/webp') {
      // RIFF....WEBP — confirm the WEBP marker at bytes 8-12
      if (buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
      continue;
    }
    return sig.type;
  }
  return null;
}

/** Fallback: guess content-type from the URL's file extension */
function guessImageTypeFromUrl(url) {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  return map[ext] || null;
}

// ─── Cloudinary upload from URL ───────────────────────────────────────────────
// FIX (production): Guard against cloudinary being null (env vars not set).
// When Cloudinary is unavailable the function returns null so the route falls
// back to returning the original scraped URL unchanged.
async function uploadImageFromUrl(imageUrl, sourcePageUrl) {
  if (!cloudinary) {
    // No Cloudinary — return the original URL so the admin can still see it
    return imageUrl;
  }

  // IMPORTANT: Referer must be the page the image was found on (or at
  // minimum that site's homepage), NOT the image URL itself. Many sites'
  // hotlink protection checks that Referer is same-origin with their own
  // domain; sending the image URL as its own Referer satisfies nothing
  // and gets the request 403'd exactly like a bare/no-Referer request.
  let referer;
  try {
    referer = sourcePageUrl
      ? new URL(sourcePageUrl).origin + '/'
      : new URL(imageUrl).origin + '/';
  } catch {
    referer = imageUrl;
  }

  const retryableStatuses = new Set([403, 429, 503, 520, 521, 522, 523, 524]);
  let lastErrDetail = null;

  // FIX: retry the image download across the UA pool (same strategy as
  // fetchHtml). Previously this used only UA_POOL[0] and gave up on the
  // first failure, silently falling back to the original source-site URL —
  // which is why scraped products ended up storing the competitor's image
  // URL instead of a Cloudinary URL. Many sites that 403 the default UA on
  // the *image* host will serve it fine for another UA (Googlebot is often
  // whitelisted), so retrying here makes the Cloudinary re-host actually work.
  for (let attempt = 0; attempt < UA_POOL.length; attempt++) {
    const ua = UA_POOL[attempt];
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent':      ua,
          'Referer':         referer,
          'Accept':          'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Fetch-Dest':  'image',
          'Sec-Fetch-Mode':  'no-cors',
          'Sec-Fetch-Site':  'cross-site',
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        maxRedirects: 5,
        maxContentLength: 15 * 1024 * 1024, // 15MB cap
        decompress: true,
      });

      console.log(`[Scraper] Download OK: ${imageUrl} → status ${response.status}, content-type ${response.headers['content-type']}, ${response.data?.length || 0} bytes (attempt ${attempt + 1})`);

      const buffer = Buffer.from(response.data);

      // Don't trust the HTTP content-type header alone — some CDNs (observed
      // on Azure CDN) serve real images as application/octet-stream because
      // the blob metadata was never set correctly at the source. Sniff the
      // actual bytes first; only reject if BOTH the bytes and the URL
      // extension fail to indicate a real image format.
      const sniffedType = detectImageType(buffer);
      const headerType  = response.headers['content-type'];
      const extType      = guessImageTypeFromUrl(imageUrl);
      const contentType  = sniffedType || (headerType && headerType.startsWith('image/') ? headerType : null) || extType;

      if (!contentType) {
        console.warn(`[Scraper] Rejected — could not confirm this is an image (header: ${headerType}, byte-sniff: ${sniffedType}, url ext guess: ${extType}):`, imageUrl);
        return null;
      }

      if (headerType !== contentType) {
        console.log(`[Scraper] Note: server sent content-type "${headerType}" but file is really ${contentType} (detected via ${sniffedType ? 'byte signature' : 'URL extension'}) — proceeding anyway:`, imageUrl);
      }

      const b64     = buffer.toString('base64');
      const dataUri = `data:${contentType};base64,${b64}`;

      const result = await cloudinary.uploader.upload(dataUri, {
        folder:        'storekit/scraped',
        resource_type: 'image',
      });

      console.log(`[Scraper] Cloudinary upload OK: ${imageUrl} → ${result.secure_url}`);
      return result.secure_url;

    } catch (err) {
      const status = err.response?.status;
      lastErrDetail = {
        url: imageUrl,
        referer,
        errorCode: err.code,             // e.g. ECONNREFUSED, ETIMEDOUT
        httpStatus: status,              // e.g. 403, 404 from axios
        httpStatusText: err.response?.statusText,
        message: err.message,
        uaAttempt: attempt + 1,
      };

      const isRetryable = retryableStatuses.has(status)
        || err.code === 'ECONNRESET'
        || err.code === 'ETIMEDOUT';

      console.warn(
        `[Scraper] Image download attempt ${attempt + 1}/${UA_POOL.length} failed` +
        (status ? ` (HTTP ${status})` : ` (${err.code || err.message})`) +
        ` — ${imageUrl}`
      );

      if (attempt === UA_POOL.length - 1 || !isRetryable) {
        console.error('[Scraper] Image upload FAILED — full detail:', JSON.stringify(lastErrDetail, null, 2));
        return null;
      }

      // Small back-off before trying the next UA
      const delayMs = Math.min(500 * Math.pow(1.6, attempt), 4000);
      await sleep(delayMs + Math.random() * 300);
    }
  }

  console.error('[Scraper] Image upload FAILED — full detail:', JSON.stringify(lastErrDetail, null, 2));
  return null;
}

// ─── Main scrape logic ────────────────────────────────────────────────────────
async function scrapeProduct(pageUrl) {
  // 1. Fetch HTML with anti-bot retry logic
  const html = await fetchHtml(pageUrl);

  const result = {
    name:             null,
    price:            null,
    salePrice:        null,
    description:      null,
    shortDescription: null,
    brand:            null,
    sku:              null,
    imageUrls:        [],
  };

  // 2. JSON-LD (most reliable)
  const ld = extractJsonLd(html);
  if (ld) {
    result.name        = result.name  || stripHtml(ld.name  || '');
    result.brand       = result.brand || (ld.brand?.name || ld.brand || '');
    result.description = result.description || stripHtml(ld.description || '');
    result.sku         = result.sku   || ld.sku || ld.mpn || '';

    const offer = ld.offers
      ? (Array.isArray(ld.offers) ? ld.offers[0] : ld.offers)
      : null;
    if (offer?.price) {
      const p = parsePrice(String(offer.price));
      if (p) result.price = p;
    }

    const ldImages = ld.image
      ? (Array.isArray(ld.image) ? ld.image : [ld.image])
      : [];
    ldImages.forEach(img => {
      const src      = typeof img === 'string' ? img : img.url;
      const resolved = resolveUrl(pageUrl, src);
      if (resolved && looksLikeProductImage(resolved)) result.imageUrls.push(resolved);
    });
  }

  // 3. Open Graph / Twitter meta tags
  result.name        = result.name        || metaContent(html, 'og:title')       || metaContent(html, 'twitter:title');
  result.description = result.description || metaContent(html, 'og:description') || metaContent(html, 'twitter:description') || metaContent(html, 'description');

  const ogImage = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
  if (ogImage) {
    const resolved = resolveUrl(pageUrl, ogImage);
    if (resolved) result.imageUrls.push(resolved);
  }

  // 4. <title> tag fallback
  if (!result.name) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) result.name = stripHtml(titleMatch[1]).split('|')[0].split(' - ')[0].trim();
  }

  // 5. Scrape <img> tags (src / data-src / data-lazy-src / data-original)
  const imgRe = /<img[^>]+>/gi;
  let imgMatch;
  // eslint-disable-next-line no-cond-assign
  while ((imgMatch = imgRe.exec(html)) !== null) {
    const tag     = imgMatch[0];
    const srcAttr = tag.match(/data-(?:lazy-)?src=["']([^"']+)["']/i)
                 || tag.match(/data-original=["']([^"']+)["']/i)
                 || tag.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcAttr) continue;
    const resolved = resolveUrl(pageUrl, srcAttr[1]);
    if (resolved && looksLikeProductImage(resolved)) result.imageUrls.push(resolved);
    if (result.imageUrls.length >= 40) break;
  }

  // 6. Price extraction fallbacks
  if (!result.price) {
    // Shopify
    const shopifyMatch = html.match(/"price":\s*(\d+)/);
    if (shopifyMatch) result.price = parseInt(shopifyMatch[1], 10) / 100;

    // WooCommerce / generic
    if (!result.price) {
      const priceRe    = /class=["'][^"']*(?:price|amount)[^"']*["'][^>]*>\s*(?:<[^>]+>)*\s*(?:[A-Z$£€₹Rs.]*\.?\s*)?([\d,]+(?:\.\d{1,2})?)/i;
      const priceMatch = html.match(priceRe);
      if (priceMatch) result.price = parsePrice(priceMatch[1]);
    }
  }

  // 7. Deduplicate and cap images
  result.imageUrls = unique(result.imageUrls).filter(looksLikeProductImage).slice(0, 20);

  return result;
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * POST /api/scrape/product
 * Body: { url: string, uploadImages?: boolean }
 */
router.post('/product', adminAuth, async (req, res) => {
  const { url: rawUrl, uploadImages = true } = req.body;

  if (!rawUrl)          return res.status(400).json({ message: 'url is required' });
  if (!isSafeUrl(rawUrl)) return res.status(400).json({ message: 'Invalid or unsafe URL' });

  try {
    const scraped = await scrapeProduct(rawUrl);

    let finalImages = scraped.imageUrls;

    if (uploadImages && scraped.imageUrls.length > 0) {
      if (USE_CLOUDINARY) {
        // Re-host images on Cloudinary so they are served from a stable CDN URL
        // and bypass hotlink protection on the source site. Pass rawUrl as the
        // source page so the correct Referer is sent (fixes 403s from sites
        // with hotlink/referer protection, e.g. ugreen.lk).
        const uploadResults = await Promise.all(
          scraped.imageUrls.slice(0, 20).map(u => uploadImageFromUrl(u, rawUrl))
        );
        // FIX: only keep successfully re-hosted Cloudinary URLs. We no longer
        // fall back to the original source-site URL on failure — a raw
        // external URL stored as the product image breaks hotlink protection
        // assumptions, background removal, and means the DB ends up storing
        // the competitor's site URL instead of our own Cloudinary URL (the
        // original bug). Failed images are simply dropped.
        const failedCount = uploadResults.filter(r => !r).length;
        if (failedCount > 0) {
          console.warn(`[Scraper] ${failedCount}/${scraped.imageUrls.length} image(s) could not be re-hosted on Cloudinary and were dropped (not saved as source-site URLs).`);
        }
        finalImages = uploadResults.filter(Boolean);
      }
      // If Cloudinary is not configured, finalImages stays as scraped.imageUrls
    }

    // Generate AI-formatted description in the background.
    // Non-fatal: if AI is unavailable we fall back to the scraped description.
    let aiDescription = scraped.description || '';
    try {
      aiDescription = await generateProductDescription({
        name:             scraped.name        || '',
        brand:            scraped.brand       || '',
        sku:              scraped.sku         || '',
        price:            scraped.price       || '',
        salePrice:        scraped.salePrice   || '',
        shortDescription: scraped.shortDescription || '',
      });
    } catch (aiErr) {
      console.warn('[Scraper] AI description generation skipped:', aiErr.message);
    }

    // Generate AI short description if scraper didn't find one. Non-fatal.
    let aiShortDescription = scraped.shortDescription || '';
    if (!aiShortDescription) {
      try {
        aiShortDescription = await generateShortDescription({
          name:      scraped.name    || '',
          brand:     scraped.brand   || '',
          price:     scraped.price   || '',
          salePrice: scraped.salePrice || '',
        });
      } catch (aiErr) {
        console.warn('[Scraper] AI short description generation skipped:', aiErr.message);
      }
    }

    // Generate AI specifications table. Non-fatal — returns [] if AI unavailable.
    let aiSpecs = [];
    try {
      aiSpecs = await generateProductSpecs({
        name:        scraped.name        || '',
        brand:       scraped.brand       || '',
        sku:         scraped.sku         || '',
        price:       scraped.price       || '',
        salePrice:   scraped.salePrice   || '',
        description: aiDescription,
      });
    } catch (aiErr) {
      console.warn('[Scraper] AI specs generation skipped:', aiErr.message);
    }

    return res.json({
      name:             scraped.name             || '',
      price:            scraped.price            || '',
      salePrice:        scraped.salePrice        || '',
      description:      aiDescription,
      shortDescription: aiShortDescription,
      brand:            scraped.brand            || '',
      sku:              scraped.sku              || '',
      images:           finalImages,
      specifications:   aiSpecs,
    });

  } catch (err) {
    console.error('[Scraper] Error:', err.message);

    // User-friendly messages for known failure modes
    if (err.code === 'BLOCKED_403') {
      return res.status(422).json({ message: err.message });
    }
    if (err.code === 'RATE_LIMITED') {
      return res.status(429).json({ message: err.message });
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(422).json({ message: 'Could not reach that URL. Check the address and try again.' });
    }
    if (err.response?.status >= 400) {
      return res.status(422).json({
        message: `Could not fetch page: the site returned HTTP ${err.response.status}. It may block automated access.`,
      });
    }

    return res.status(500).json({ message: 'Scraping failed: ' + err.message });
  }
});

// ─── Bulk URL Import ───────────────────────────────────────────────────────────
/**
 * POST /api/scrape/bulk
 * Body: { urls: string[], categoryId: string, uploadImages?: boolean }
 *
 * Processes URLs one-by-one (sequential, not parallel — avoids hammering sites
 * and Railway memory limits).  Streams progress via Server-Sent Events so the
 * admin can watch live.
 *
 * Each successfully scraped product is saved to MongoDB as a DRAFT
 * (isActive: false) so the admin can review/edit before publishing.
 *
 * Response: SSE stream
 *   data: { type:'progress', index, total, url, status:'scraping'|'saving'|'done'|'error', message?, product? }
 *   data: { type:'complete', saved, failed, errors }
 */
router.post('/bulk', adminAuth, async (req, res) => {
  const { urls: rawUrls = [], categoryId, uploadImages = true, ratePerMinute = 10 } = req.body;
  // Clamp rate to 1–60 per minute; convert to milliseconds between requests
  const clampedRate  = Math.min(60, Math.max(1, Number(ratePerMinute) || 10));
  const intervalMs   = Math.floor(60000 / clampedRate);

  if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
    return res.status(400).json({ message: 'urls array is required' });
  }
  if (!categoryId) {
    return res.status(400).json({ message: 'categoryId is required' });
  }

  const urls   = rawUrls.map(u => u.trim()).filter(Boolean);
  const total  = urls.length;
  const MAX    = 200;

  if (total > MAX) {
    return res.status(400).json({ message: `Maximum ${MAX} URLs per batch` });
  }

  // ── Set up SSE ────────────────────────────────────────────────────────────
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (obj) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (_) {}
  };

  // ── Lazy-load Product model (avoid circular dep at module load time) ───────
  let Product;
  try { Product = require('../models/Product'); } catch (e) {
    send({ type: 'complete', saved: 0, failed: total, errors: ['Server config error: ' + e.message] });
    return res.end();
  }

  const results = { saved: 0, failed: 0, errors: [] };

  // ── Process each URL sequentially ─────────────────────────────────────────
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    // Skip obviously bad URLs
    if (!isSafeUrl(url)) {
      send({ type: 'progress', index: i, total, url, status: 'error', message: 'Invalid or unsafe URL' });
      results.failed++;
      results.errors.push(`[${i + 1}] ${url} — Invalid URL`);
      continue;
    }

    // 1. Scrape
    send({ type: 'progress', index: i, total, url, status: 'scraping', message: 'Fetching page…' });

    let scraped;
    try {
      scraped = await scrapeProduct(url);
    } catch (err) {
      const msg = err.message || 'Scrape failed';
      send({ type: 'progress', index: i, total, url, status: 'error', message: msg });
      results.failed++;
      results.errors.push(`[${i + 1}] ${url} — ${msg}`);
      // Small gap before next URL to avoid hammering
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    // 2. Upload images to Cloudinary (optional)
    send({ type: 'progress', index: i, total, url, status: 'saving', message: 'Uploading images…' });

    let finalImages = scraped.imageUrls;
    if (uploadImages && scraped.imageUrls.length > 0 && USE_CLOUDINARY) {
      try {
        const uploaded = await Promise.all(
          scraped.imageUrls.slice(0, 10).map(u => uploadImageFromUrl(u, url))
        );
        // FIX: only keep successfully re-hosted Cloudinary URLs — do not fall
        // back to the original source-site URL on failure. This was the root
        // cause of bulk-scraped products being saved with the competitor's
        // site URL as the image instead of a Cloudinary URL.
        const failedCount = uploaded.filter(r => !r).length;
        if (failedCount > 0) {
          console.warn(`[Scraper] ${failedCount}/${scraped.imageUrls.length} image(s) could not be re-hosted on Cloudinary and were dropped (not saved as source-site URLs):`, url);
        }
        finalImages = uploaded.filter(Boolean);
      } catch (_) {
        // Image upload failure is non-fatal — continue with no images rather
        // than storing the unreliable source-site URLs.
        finalImages = [];
      }
    } else if (uploadImages && !USE_CLOUDINARY) {
      // Cloudinary isn't configured at all — nothing to re-host with, so
      // don't silently store source-site URLs either.
      finalImages = [];
    }

    // 3. Save to DB as draft (isActive: false)
    // Retries up to 5 times on duplicate key errors (E11000) for both
    // `sku` and `slug` fields, appending -1, -2 ... -5 suffixes until unique.
    let product;
    try {
      // Generate AI-formatted description before saving.
      // Non-fatal: falls back to scraped description if AI unavailable.
      let aiDescription = scraped.description || '';
      try {
        aiDescription = await generateProductDescription({
          name:             scraped.name        || '',
          brand:            scraped.brand       || '',
          sku:              scraped.sku         || '',
          price:            scraped.price       || '',
          salePrice:        scraped.salePrice   || '',
          shortDescription: scraped.shortDescription || '',
        });
      } catch (aiErr) {
        console.warn('[Bulk Scraper] AI description skipped:', aiErr.message);
      }

      // Generate AI short description if scraper didn't find one. Non-fatal.
      let aiShortDescription = scraped.shortDescription || '';
      if (!aiShortDescription) {
        try {
          aiShortDescription = await generateShortDescription({
            name:      scraped.name      || '',
            brand:     scraped.brand     || '',
            price:     scraped.price     || '',
            salePrice: scraped.salePrice || '',
          });
        } catch (aiErr) {
          console.warn('[Bulk Scraper] AI short description skipped:', aiErr.message);
        }
      }

      // Generate AI specifications table before saving.
      // Non-fatal: saves with empty specs array if AI unavailable.
      let aiSpecs = [];
      try {
        aiSpecs = await generateProductSpecs({
          name:        scraped.name        || '',
          brand:       scraped.brand       || '',
          sku:         scraped.sku         || '',
          price:       scraped.price       || '',
          salePrice:   scraped.salePrice   || '',
          description: aiDescription,
        });
      } catch (aiErr) {
        console.warn('[Bulk Scraper] AI specs skipped:', aiErr.message);
      }

      // Auto-generate brand via AI if scraper couldn't extract it
      let resolvedBrand = scraped.brand || '';
      if (!resolvedBrand) {
        try {
          resolvedBrand = await generateBrand(scraped.name || '');
        } catch (_) { /* non-fatal */ }
      }

      const name = scraped.name || `Imported Product ${Date.now()}`;

      // Build base slug (max 70 chars, url-safe)
      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70);
      const baseSku  = scraped.sku || '';

      // Resolve a unique slug
      const candidateSlug = await Product.findOne({ slug: baseSlug }).lean().select('_id')
        ? `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`
        : baseSlug;

      let slug = candidateSlug;
      let sku  = baseSku;

      // Attempt save, retrying on duplicate key errors (sku or slug collision)
      const MAX_RETRIES = 5;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          product = await Product.create({
            name,
            slug,
            description:      aiDescription              || name,
            shortDescription: aiShortDescription         || '',
            price:            scraped.price            || 0,
            salePrice:        scraped.salePrice        || undefined,
            brand:            resolvedBrand,
            sku,
            category:         categoryId,
            thumbnail:        finalImages[0]           || '',
            images:           finalImages.slice(1),
            specifications:   aiSpecs,
            stock:            5,
            lowStockThreshold: 2,
            isActive:         false,
          });
          break; // success
        } catch (dupErr) {
          if (dupErr.code !== 11000 || attempt === MAX_RETRIES) throw dupErr;
          const keyPattern = dupErr.keyPattern || {};
          if (keyPattern.sku || (dupErr.message || '').includes('sku')) {
            sku = baseSku ? `${baseSku}-${attempt}` : '';
          }
          if (keyPattern.slug || (dupErr.message || '').includes('slug')) {
            slug = `${baseSlug}-${attempt}`;
          }
        }
      }

      const skuChanged = sku !== baseSku && baseSku;
      send({
        type:    'progress',
        index:   i,
        total,
        url,
        status:  'done',
        message: `Saved as draft: "${product.name}"` + (skuChanged ? ` (SKU: ${sku})` : ''),
        product: { _id: product._id, name: product.name, thumbnail: product.thumbnail },
      });

      results.saved++;
    } catch (err) {
      const msg = 'DB save failed: ' + err.message;
      send({ type: 'progress', index: i, total, url, status: 'error', message: msg });
      results.failed++;
      results.errors.push(`[${i + 1}] ${url} — ${msg}`);
    }

    // Rate-controlled delay between requests based on admin-configured rate
    if (i < urls.length - 1) {
      // Add ±10% jitter so requests don't look perfectly metronomic
      const jitter = Math.floor(intervalMs * 0.1 * (Math.random() * 2 - 1));
      await new Promise(r => setTimeout(r, Math.max(500, intervalMs + jitter)));
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  send({ type: 'complete', saved: results.saved, failed: results.failed, errors: results.errors });
  res.end();
});

module.exports = router;