/**
 * routes/meta.js — Meta Conversions API relay endpoint
 *
 * POST /api/meta/capi
 *
 * Receives an event from the browser (already fired via pixel), hashes the
 * PII server-side, and sends it to Meta Graph API as a CAPI event.
 * The same eventId is used in both the browser pixel call and this CAPI call
 * so Meta deduplicates them and counts only ONE conversion.
 *
 * Required env / DB settings:
 *   META_PIXEL_ID           — your pixel ID (stored as seo_fbPixelId in Settings)
 *   META_CAPI_ACCESS_TOKEN  — system user token (stored as meta_capi_token in Settings)
 *
 * Optional:
 *   META_TEST_EVENT_CODE    — e.g. TEST36398 (stored as meta_test_event_code)
 *                             Remove / clear this in production!
 */

const express    = require('express');
const rateLimit  = require('express-rate-limit');
const router     = express.Router();
const { sendCapiEvent } = require('../services/metaCAPI');

// Rate-limit: max 60 CAPI calls per IP per minute
// (one per page action — add to cart, checkout, purchase)
const capiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/meta/capi
 *
 * Body (all optional except eventName):
 *  eventName      string  — 'Purchase' | 'AddToCart' | 'InitiateCheckout' | 'ViewContent'
 *  eventId        string  — dedup key (must match the browser pixel eventID)
 *  eventSourceUrl string  — page URL
 *  email          string  — raw email (will be SHA-256 hashed before sending)
 *  phone          string  — raw phone (will be normalised + hashed)
 *  firstName      string  — raw first name (will be hashed)
 *  lastName       string  — raw last name (will be hashed)
 *  city           string  — raw city (will be hashed)
 *  country        string  — raw country (will be hashed)
 *  fbp            string  — _fbp cookie value
 *  fbc            string  — _fbc cookie value
 *  userAgent      string  — navigator.userAgent from browser
 *  value          number  — monetary value (e.g. order total)
 *  currency       string  — ISO 4217 (e.g. 'LKR')
 *  contentIds     array   — product IDs
 *  contentType    string  — 'product'
 *  numItems       number  — quantity
 *  orderId        string  — for Purchase dedup
 */
router.post('/capi', capiLimiter, async (req, res) => {
  // Always return 200 immediately — never make the browser wait for Meta
  res.json({ received: true });

  const {
    eventName,
    eventId,
    eventSourceUrl,
    // PII — hashed inside metaCAPI.js before sending to Meta
    email, phone, firstName, lastName, city, country,
    // Meta tracking cookies
    fbp, fbc,
    // Browser info
    userAgent,
    // Event payload
    value, currency, contentIds, contentType, numItems, orderId,
  } = req.body;

  if (!eventName) return; // nothing to send

  // ── DEBUG: log browser-supplied eventId arriving at the relay endpoint ──
  console.log(`[META CAPI] ${eventName} — browser event_id received:`, eventId || '(none — will be auto-generated)');

  // Get real client IP (supports Railway / Vercel proxy headers)
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '';

  // Fire and forget — never await so the response is always instant
  sendCapiEvent(eventName, {
    eventId:        eventId        || undefined,
    eventSourceUrl: eventSourceUrl || undefined,
    email:          email          || undefined,
    phone:          phone          || undefined,
    firstName:      firstName      || undefined,
    lastName:       lastName       || undefined,
    city:           city           || undefined,
    country:        country        || undefined,
    clientIp,
    userAgent:      userAgent      || req.headers['user-agent'] || undefined,
    fbp:            fbp            || undefined,
    fbc:            fbc            || undefined,
    value:          typeof value === 'number' ? value : undefined,
    currency:       currency       || 'LKR',
    contentIds:     Array.isArray(contentIds) ? contentIds : undefined,
    contentType:    contentType    || undefined,
    numItems:       typeof numItems === 'number' ? numItems : undefined,
    orderId:        orderId        || undefined,
  }).catch(err => {
    console.error('[META CAPI route] error:', err.message);
  });
});

module.exports = router;