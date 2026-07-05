/**
 * metaCAPI.js — Meta Conversions API (server-side pixel events)
 *
 * Sends events directly from the backend to Meta's CAPI endpoint so they
 * are never lost to ad blockers, browser privacy settings, or Safari ITP.
 *
 * Architecture:
 *  - Browser pixel fires the event (browser-side deduplication key: eventId)
 *  - CAPI fires the same event with the same eventId
 *  - Meta uses eventId to deduplicate — one conversion is counted, not two
 *  - Advanced Matching: hashed customer data is sent with every event
 *
 * Required env vars:
 *   META_PIXEL_ID         — your pixel ID (e.g. 1764180684568490)
 *   META_CAPI_ACCESS_TOKEN — system user access token from Meta Events Manager
 *
 * Optional:
 *   META_TEST_EVENT_CODE  — e.g. TEST36398  (only set in dev/staging)
 *
 * Reference: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

const crypto = require('crypto');
const https  = require('https');

// ── Hashing ───────────────────────────────────────────────────────────────────
// Meta requires SHA-256 hashed, lowercased, trimmed PII for Advanced Matching.
function hash(value) {
  if (!value && value !== 0) return undefined;
  return crypto
    .createHash('sha256')
    .update(String(value).toLowerCase().trim())
    .digest('hex');
}

// Normalise a phone number to E.164-ish digits only before hashing.
// Meta docs: remove all non-digit chars except leading +.
function hashPhone(phone) {
  if (!phone) return undefined;
  const digits = String(phone).replace(/[^0-9]/g, '');
  return digits ? hash(digits) : undefined;
}

// ── Get config from DB or env ─────────────────────────────────────────────────
let _cfg = null;
async function getCapiCfg() {
  if (_cfg && Date.now() - _cfg._fetchedAt < 5 * 60 * 1000) return _cfg; // cache 5 min

  // Try DB first (admin can set these in Settings → SEO)
  try {
    const { Settings } = require('../models/index');
    const rows = await Settings.find({
      // 'facebookPixel' = key used by Settings UI PUT /settings
      // 'seo_fbPixelId' = key used by SEO route (legacy / alternate path)
      key: { $in: ['facebookPixel', 'seo_fbPixelId', 'meta_capi_token', 'meta_test_event_code'] },
    }).lean();
    const s = {};
    rows.forEach(r => { s[r.key] = r.value; });

    _cfg = {
      // Prefer facebookPixel (saved by Settings UI), fall back to seo_fbPixelId, then env
      pixelId:       s.facebookPixel         || s.seo_fbPixelId        || process.env.META_PIXEL_ID         || '',
      accessToken:   s.meta_capi_token       || process.env.META_CAPI_ACCESS_TOKEN || '',
      testEventCode: s.meta_test_event_code  || process.env.META_TEST_EVENT_CODE   || '',
      _fetchedAt:    Date.now(),
    };
  } catch {
    _cfg = {
      pixelId:       process.env.META_PIXEL_ID         || '',
      accessToken:   process.env.META_CAPI_ACCESS_TOKEN || '',
      testEventCode: process.env.META_TEST_EVENT_CODE   || '',
      _fetchedAt:    Date.now(),
    };
  }
  return _cfg;
}

// ── HTTP POST (no external deps — pure Node https) ───────────────────────────
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(json),
      },
      timeout: 8000,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('CAPI timeout')); });
    req.write(json);
    req.end();
  });
}

// ── Core send function ────────────────────────────────────────────────────────
/**
 * sendCapiEvent(eventName, payload)
 *
 * @param {string} eventName  — 'Purchase' | 'AddToCart' | 'InitiateCheckout' etc.
 * @param {object} payload
 *   @param {string}  payload.eventId      — UUID used for browser deduplication
 *   @param {string}  payload.eventSourceUrl — page URL where the event occurred
 *   @param {string}  [payload.email]      — raw (will be hashed)
 *   @param {string}  [payload.phone]      — raw (will be hashed)
 *   @param {string}  [payload.firstName]  — raw (will be hashed)
 *   @param {string}  [payload.lastName]   — raw (will be hashed)
 *   @param {string}  [payload.city]       — raw (will be hashed)
 *   @param {string}  [payload.country]    — raw (will be hashed, 2-letter ISO)
 *   @param {string}  [payload.clientIp]   — from req.ip
 *   @param {string}  [payload.userAgent]  — from req.headers['user-agent']
 *   @param {string}  [payload.fbp]        — _fbp cookie value
 *   @param {string}  [payload.fbc]        — _fbc cookie value
 *   @param {number}  [payload.value]      — order total
 *   @param {string}  [payload.currency]   — ISO 4217 (e.g. 'LKR')
 *   @param {Array}   [payload.contentIds] — product IDs
 *   @param {string}  [payload.contentType]— 'product'
 *   @param {number}  [payload.numItems]   — item count
 *   @param {string}  [payload.orderId]    — for Purchase dedup in your DB
 */
async function sendCapiEvent(eventName, payload = {}) {
  const cfg = await getCapiCfg();

  // ── DEBUG: log the event_id arriving in the payload ──────────────────────
  console.log(`[META CAPI] ${eventName} — API payload event_id:`, payload.eventId || '(none — will auto-generate UUID)');

  if (!cfg.pixelId || !cfg.accessToken) {
    // Log clearly in ALL environments so you can see it in Railway logs
    console.warn(`[META CAPI] SKIPPED "${eventName}" — missing config. pixelId="${cfg.pixelId ? '✓' : '✗ MISSING'}" accessToken="${cfg.accessToken ? '✓' : '✗ MISSING'}". Set META_PIXEL_ID + META_CAPI_ACCESS_TOKEN in Railway env vars, OR enter them in Admin → SEO → Conversions API.`);
    return;
  }

  // ── Build user_data with Advanced Matching ────────────────────────────────
  const userData = {};
  if (payload.email)     userData.em  = hash(payload.email);
  if (payload.phone)     userData.ph  = hashPhone(payload.phone);
  if (payload.firstName) userData.fn  = hash(payload.firstName);
  if (payload.lastName)  userData.ln  = hash(payload.lastName);
  if (payload.city)      userData.ct  = hash(payload.city);
  if (payload.country)   userData.country = hash(payload.country);
  if (payload.clientIp)  userData.client_ip_address = payload.clientIp;
  if (payload.userAgent) userData.client_user_agent  = payload.userAgent;
  if (payload.fbp)       userData.fbp = payload.fbp;
  if (payload.fbc)       userData.fbc = payload.fbc;

  // ── Build custom_data ─────────────────────────────────────────────────────
  const customData = {};
  if (typeof payload.value    === 'number') customData.value     = payload.value;
  if (payload.currency)    customData.currency     = String(payload.currency).toUpperCase();
  // Only include content arrays when they contain real product IDs.
  // An empty content_ids array causes Meta to reject the event silently.
  const validContentIds = Array.isArray(payload.contentIds)
    ? payload.contentIds.map(String).filter(id => id && id.length > 5)
    : [];
  if (validContentIds.length) {
    customData.content_ids = validContentIds;
    customData.contents    = validContentIds.map(id => ({
      id,
      quantity: payload.numItems
        ? Math.max(1, Math.round(payload.numItems / validContentIds.length))
        : 1,
    }));
  }
  if (payload.contentType) customData.content_type = payload.contentType;
  if (typeof payload.numItems === 'number') customData.num_items = payload.numItems;
  if (payload.orderId)     customData.order_id     = String(payload.orderId);

  // ── Build event object ────────────────────────────────────────────────────
  const event = {
    event_name:        eventName,
    event_time:        Math.floor(Date.now() / 1000),
    event_id:          payload.eventId || require('crypto').randomUUID(),
    action_source:     'website',
    event_source_url:  (payload.eventSourceUrl && !payload.eventSourceUrl.includes('localhost'))
                       ? payload.eventSourceUrl
                       : `https://${process.env.PRODUCTION_DOMAIN || 'storekit.local'}`,
    user_data:         userData,
    ...(Object.keys(customData).length ? { custom_data: customData } : {}),
  };

  // ── DEBUG: log the final event_id being sent to Meta Graph API ───────────
  console.log(`[META CAPI] ${eventName} — final CAPI event_id sent to Meta:`, event.event_id);

  const body = { data: [event] };
  if (cfg.testEventCode) body.test_event_code = cfg.testEventCode;

  // ── Send ──────────────────────────────────────────────────────────────────
  const apiVersion = 'v22.0'; // keep this at the latest stable version
  const url = `https://graph.facebook.com/${apiVersion}/${cfg.pixelId}/events?access_token=${cfg.accessToken}`;

  try {
    const result = await postJson(url, body);
    if (result.status !== 200) {
      console.error(`[META CAPI] ${eventName} error ${result.status}:`, JSON.stringify(result.body));
    } else {
      const eventsReceived = result.body?.events_received ?? '?';
      console.log(`[META CAPI] ${eventName} sent — events_received: ${eventsReceived}`);
    }
  } catch (err) {
    // Never crash the order flow over a pixel failure
    console.error(`[META CAPI] ${eventName} failed:`, err.message);
  }
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

/**
 * Send a Purchase event via CAPI after an order is created.
 * @param {object} order   — Mongoose Order document (plain or lean)
 * @param {object} options — { clientIp, userAgent, fbp, fbc, eventId, siteUrl }
 */
async function sendPurchaseEvent(order, options = {}) {
  const billing  = order.billing || {};
  const items    = order.items   || [];
  const currency = 'LKR'; // StoreKit sells in LKR

  // contentIds: prefer caller-supplied (already computed from in-scope orderItems)
  // over re-reading from order.items which may have unpopulated ObjectIds.
  const contentIds = options.contentIds && options.contentIds.length
    ? options.contentIds
    : items.map(i => String(i.product?._id || i.product || '')).filter(Boolean);

  const numItems = options.numItems != null
    ? options.numItems
    : items.reduce((s, i) => s + (i.quantity || 1), 0);

  // Always use the production domain for event_source_url — never localhost.
  const domain = process.env.PRODUCTION_DOMAIN || 'storekit.local';
  const eventSourceUrl = options.siteUrl && !options.siteUrl.includes('localhost')
    ? options.siteUrl
    : `https://${domain}/order-success/${order._id}`;

  await sendCapiEvent('Purchase', {
    eventId:        options.eventId || `purchase-${order._id}`,
    eventSourceUrl,
    email:          billing.email,
    phone:          billing.phone,
    firstName:      billing.firstName,
    lastName:       billing.lastName,
    city:           billing.city,
    country:        billing.country || 'LK',
    clientIp:       options.clientIp,
    userAgent:      options.userAgent,
    fbp:            options.fbp,
    fbc:            options.fbc,
    value:          typeof order.total === 'number' ? order.total : 0,
    currency,
    contentIds,
    contentType:    'product',
    numItems,
    orderId:        String(order._id),
  });
}

/**
 * Send an InitiateCheckout event via CAPI.
 */
async function sendInitiateCheckoutEvent(data, options = {}) {
  await sendCapiEvent('InitiateCheckout', {
    eventId:         options.eventId,
    eventSourceUrl:  options.siteUrl || `${process.env.FRONTEND_URL || 'https://storekit.local'}/checkout`,
    email:           data.email,
    phone:           data.phone,
    firstName:       data.firstName,
    lastName:        data.lastName,
    clientIp:        options.clientIp,
    userAgent:       options.userAgent,
    fbp:             options.fbp,
    fbc:             options.fbc,
    value:           data.value,
    currency:        'LKR',
    contentIds:      data.contentIds,
    contentType:     'product',
    numItems:        data.numItems,
  });
}

module.exports = {
  sendCapiEvent,
  sendPurchaseEvent,
  sendInitiateCheckoutEvent,
};