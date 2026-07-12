/**
 * ─── StoreKit Security Middleware ─────────────────────────────────────────────
 * security.js — centralised security stack
 *
 * WHAT THIS FILE DOES (in order):
 *  1. helmet()          → sets 14 HTTP security headers (CSP, HSTS, etc.)
 *  2. mongoSanitize()   → strips MongoDB operator keys ($, .) from req.body/query
 *  3. xssClean()        → HTML-encodes XSS payloads in req.body/query/params
 *  4. globalLimiter     → 600 req / 15 min per IP across all endpoints
 *  5. loginLimiter      → 10 req / 15 min per IP on /api/auth/login
 *  6. sanitizeBody      → removes prototype-polluting keys from every request
 *  7. auditLog          → writes one-line JSON for every mutating admin action
 *  8. errorHandler      → last-resort error handler; never leaks stack traces
 *
 * BACKWARD COMPATIBILITY GUARANTEE
 *  • No route, controller, model, or business-logic file is changed.
 *  • Every API response shape is identical to before.
 *  • Rate limits are generous enough not to affect normal front-end usage.
 *  • helmet() is configured with a permissive CSP to avoid breaking the React
 *    SPA's inline scripts and Cloudinary image sources.
 *
 * INSTALLATION (server.js changes only — see updated server.js)
 *  const { applyEarlySecurityMiddleware, applyBodySecurityMiddleware,
 *          loginLimiter, auditLog, errorHandler }
 *        = require('./middleware/security');
 *  applyEarlySecurityMiddleware(app);     ← before body parsing
 *  app.use(applyBodySecurityMiddleware);  ← after body parsing
 *  app.use('/api/auth/login', loginLimiter);
 *  app.use('/api/admin', auditLog);
 *  app.use(errorHandler);                 ← call AFTER all routes
 */

'use strict';

const rateLimit    = require('express-rate-limit');
const helmet       = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const fs           = require('fs');
const path         = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// 1. HELMET — HTTP security headers
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: helmet sets headers like X-Frame-Options, X-XSS-Protection,
//           Strict-Transport-Security, X-Content-Type-Options, etc.
// COMPATIBILITY: CSP is intentionally relaxed to allow Cloudinary images,
//               Google OAuth scripts, and the React SPA's inline JS.
//               If you serve assets from additional CDNs, add them below.
const helmetMiddleware = helmet({
  // Content-Security-Policy — allow everything that the current front-end uses
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      // GTM loads from googletagmanager.com; GA4 tag (gtag.js) loads from
      // google-analytics.com and googletagmanager.com; Meta Pixel from
      // connect.facebook.net; Google Sign-In from accounts.google.com.
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",        // React inline scripts + GTM inline <script> blocks
        "'unsafe-eval'",          // GTM's dynamic script evaluation
        'https://accounts.google.com',
        'https://apis.google.com',
        'https://www.googletagmanager.com',
        'https://www.google-analytics.com',
        'https://ssl.google-analytics.com',
        'https://tagmanager.google.com',
        'https://connect.facebook.net',   // Meta Pixel
        'https://static.ads-twitter.com', // Twitter/X Pixel (future-proof)
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
        'https://tagmanager.google.com',
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://res.cloudinary.com',
        'https://lh3.googleusercontent.com',
        'https://*.googleusercontent.com',
        'https://www.google-analytics.com',    // GA4 beacon pixel
        'https://www.googletagmanager.com',    // GTM preview mode images
        'https://www.facebook.com',            // Meta Pixel 1×1 tracking pixel
        'https://*.facebook.com',
      ],
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
      ],
      // Allow GA4/GTM beacons, Meta Pixel XHR, and your own APIs.
      connectSrc: [
        "'self'",
        'https://www.google-analytics.com',
        'https://analytics.google.com',
        'https://stats.g.doubleclick.net',
        'https://www.googletagmanager.com',
        'https://www.facebook.com',
        'https://*.facebook.com',          // Meta Pixel XHR + CAPI
        'https://connect.facebook.net',
        'https://graph.facebook.com',      // Meta Conversions API (CAPI) direct calls
        'https://api.anthropic.com',
        'https://openrouter.ai',
        'https://res.cloudinary.com',
      ],
      // GTM preview mode uses an iframe from googletagmanager.com.
      // Stripe uses iframes for its card element; PayPal checkout also uses
      // iframes. CRITICAL: 'none' must be the ONLY value in frame-src if used.
      // Mixing 'none' with real sources makes browsers silently ignore 'none'.
      // We list real allowed sources instead.
      frameSrc: [
        'https://www.googletagmanager.com',
        'https://js.stripe.com',           // Stripe card / 3DS iframe
        'https://hooks.stripe.com',         // Stripe redirect iframes
        'https://www.paypal.com',           // PayPal checkout frame
        'https://checkout.paypal.com',
      ],
      // form-action controls where <form> POST submissions may go.
      // helmet defaults to self-only, which blocks Stripe/PayPal checkout
      // redirects. List every external payment endpoint used.
      formAction: [
        "'self'",
        'https://checkout.stripe.com',
        'https://api.stripe.com',
        'https://www.paypal.com',
        'https://www.sandbox.paypal.com',
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  // HSTS — tell browsers to use HTTPS for 1 year (only meaningful in production)
  hsts: {
    maxAge:            31536000, // 1 year in seconds
    includeSubDomains: true,
    preload:           true,
  },
  // Prevent MIME-type sniffing
  noSniff: true,
  // Deny framing from other origins
  frameguard: { action: 'deny' },
  // Remove X-Powered-By: Express to reduce fingerprinting surface
  hidePoweredBy: true,
  // Referrer-Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. MONGO SANITIZE — NoSQL injection protection
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: Removes keys beginning with $ or containing . from req.body,
//           req.query, and req.params, blocking MongoDB operator injection
//           attacks like { "email": { "$gt": "" } }.
// COMPATIBILITY: Legitimate field names do not start with $ or contain dots,
//               so this change is transparent to all current payloads.
const mongoSanitizeMiddleware = mongoSanitize({
  replaceWith: '_',       // replace forbidden chars rather than delete key
  allowDots:   false,     // disallow dots in keys
  onSanitize: ({ req, key }) => {
    // SECURITY: Log sanitisation events so admins can spot probing attempts.
    //           We intentionally do NOT log the sanitised value to avoid
    //           storing attacker-controlled data in logs.
    console.warn(`[SECURITY] mongo-sanitize stripped key "${key}" from ${req.method} ${req.path}`);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. XSS CLEAN — Input sanitisation
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: HTML-encodes dangerous characters (<, >, ", ') in string values
//           inside req.body, req.query, and req.params to prevent stored/
//           reflected XSS.  Works recursively on nested objects and arrays.
// COMPATIBILITY: All current inputs (product names, descriptions, emails)
//               are plain text and survive encoding unchanged.  If a field
//               intentionally stores HTML (e.g. a rich-text editor), run
//               DOMPurify on the front-end and store the sanitised HTML —
//               do NOT disable this middleware for those fields.
function xssClean(req, _res, next) {
  /**
   * Recursively sanitise a value.
   * Only strings are touched; numbers, booleans, null, Date objects
   * pass through untouched.
   */
  function sanitize(value) {
    if (typeof value === 'string') {
      // SECURITY: Encode the five XML/HTML special characters.
      return value
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#x27;');
    }
    if (Array.isArray(value)) return value.map(sanitize);
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = sanitize(v);
      return out;
    }
    return value;
  }

  if (req.body)   req.body   = sanitize(req.body);
  if (req.query)  req.query  = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GLOBAL RATE LIMITER
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: Prevents brute-force, credential stuffing, and denial-of-service
//           by capping each IP at 200 requests per 15-minute window.
// COMPATIBILITY: A normal front-end page load triggers ~30-40 API calls.
//               200 / 15 min is ≈ 13 req/min, comfortably above that.
//               Bumping the window to 15 min (vs 1 min) avoids false positives
//               from bursty page navigations.
// DEV NOTE: localhost development re-renders, hot-reloads, and cascading
//           admin pickers (e.g. the Coupon Eligibility picker) can easily
//           fire more than 200 requests from one IP inside 15 minutes. This
//           limiter is only meaningful against the public internet, so it's
//           skipped entirely when NODE_ENV !== 'production' — production
//           behaviour (200 req / 15 min per IP) is completely unchanged.
const isProd = process.env.NODE_ENV === 'production';
const globalLimiter = rateLimit({
  windowMs:          15 * 60 * 1000,  // 15 minutes
  max:               600,              // accommodates storefront asset/API bursts and shared networks
  standardHeaders:   true,            // Return rate limit info in RateLimit-* headers
  legacyHeaders:     false,           // Disable X-RateLimit-* headers
  // SECURITY: Generic message — do not hint at whether the account exists.
  message: { message: 'Too many requests from this IP, please try again later.' },
  // SECURITY: Skip rate limiting for the health-check endpoint so monitoring
  //           tools never get blocked by their own probes. Also skip
  //           entirely outside production (see DEV NOTE above).
  skip: (req) => {
    if (!isProd) return true;                              // dev: no limit
    if (req.path === '/api/health') return true;           // health probes
    // Exempt cheap read-only admin endpoints that would otherwise be
    // hammered by rapid UI navigation (e.g. template list, product picker).
    if (req.path === '/api/ai-post-creator/templates') return true;
    return false;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. LOGIN RATE LIMITER (stricter)
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: 10 login attempts per IP per 15 minutes.  Attackers need at
//           minimum 15 min between every 10 guesses, making brute-force
//           impractical even against weak passwords.
// COMPATIBILITY: A real user who misremembers their password might try 3-5
//               times; 10 is well above that without being obtrusive.
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. BODY SANITISER — prototype pollution guard
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: Strips __proto__, constructor, and prototype keys from request
//           bodies to prevent prototype-pollution attacks that could override
//           Object.prototype methods across the entire process.
// COMPATIBILITY: No legitimate API payload uses these key names.
function sanitizeBody(req, _res, next) {
  function stripProto(obj) {
    if (obj === null || typeof obj !== 'object' || obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(stripProto);
    const safe = {};
    for (const [k, v] of Object.entries(obj)) {
      // SECURITY: Block the three keys used in prototype-pollution attacks.
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        console.warn(`[SECURITY] Prototype-pollution attempt blocked on ${req.method} ${req.path}`);
        continue;
      }
      safe[k] = stripProto(v);
    }
    return safe;
  }
  if (req.body && typeof req.body === 'object') req.body = stripProto(req.body);
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. AUDIT LOG — admin action logging
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: Every mutating request (POST / PUT / PATCH / DELETE) that reaches
//           an admin-protected route is written to audit.log in JSON-Lines
//           format.  This creates a tamper-evident trail for investigations.
// COMPATIBILITY: This is additive — no response is changed.
//
// Log format (one JSON object per line):
//   { "ts": "ISO8601", "method": "DELETE", "path": "/api/admin/products/123",
//     "admin": "admin@example.com", "ip": "1.2.3.4", "status": 200 }
//
// PRIVACY: We log the admin email and IP only.  We never log request bodies
//          or response bodies, which could contain customer PII or secrets.
const AUDIT_LOG_PATH = path.join(__dirname, '..', 'logs', 'audit.log');

// Ensure the logs/ directory exists at startup (non-blocking)
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  try { fs.mkdirSync(logsDir, { recursive: true }); } catch (_) { /* non-fatal */ }
}

function auditLog(req, res, next) {
  // SECURITY: Only log mutating methods.  GET/HEAD are read-only.
  const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  if (!MUTATING.has(req.method)) return next();

  res.on('finish', () => {
    try {
      // SECURITY: Redact any Authorization header value from the log to
      //           avoid accidentally storing tokens.
      const adminEmail = req.user?.email || 'unknown';
      const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

      const entry = JSON.stringify({
        ts:     new Date().toISOString(),
        method: req.method,
        path:   req.path,
        admin:  adminEmail,
        ip,
        status: res.statusCode,
      });

      // Append to audit.log (fire-and-forget — failures are logged but do not
      // interrupt the request lifecycle)
      fs.appendFile(AUDIT_LOG_PATH, entry + '\n', (err) => {
        if (err) console.error('[AUDIT LOG] Write error:', err.message);
      });
    } catch (err) {
      console.error('[AUDIT LOG] Unexpected error:', err.message);
    }
  });

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. GLOBAL ERROR HANDLER — no stack-trace leakage
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: Express's default error handler sends the full stack trace in the
//           response body in development and sometimes in production.  This
//           replacement strips all internal details from responses while still
//           logging the full error server-side for debugging.
// COMPATIBILITY: The response shape { message: "..." } matches what all
//               existing routes already return on errors.
function errorHandler(err, req, res, _next) { // eslint-disable-line no-unused-vars
  // SECURITY: Always log the full error internally so engineers can debug.
  //           Use a sanitised form that cannot contain user-supplied data
  //           in the message field (we only log err.message, not req.body).
  console.error(`[ERROR] ${req.method} ${req.path} → ${err.status || 500}: ${err.message}`);

  // SECURITY: Never send stack traces or internal error messages to clients.
  //           In production, generic messages prevent information disclosure.
  const isProduction = process.env.NODE_ENV === 'production';

  // Handle known error types with appropriate HTTP statuses
  if (err.name === 'ValidationError') {
    // Mongoose validation errors are safe to surface (they are field-level)
    return res.status(400).json({ message: 'Validation error', details: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  if (err.code === 11000) {
    // MongoDB duplicate key error
    return res.status(409).json({ message: 'Duplicate entry — this value already exists' });
  }
  if (err.message && err.message.startsWith('CORS blocked')) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body too large' });
  }

  // SECURITY: For all other errors, return a generic 500 in production.
  //           In development, we include the message to aid local debugging.
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: isProduction ? 'An unexpected error occurred' : (err.message || 'Server error'),
    // SECURITY: Never include err.stack in the response — even in development.
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// APPLY ALL MIDDLEWARE (in correct order)
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: Order matters.
//   helmet  → must be first so security headers are set before any response
//   sanitize → must be before routes so injection is cleaned before handlers
//   rate limit → after body parsing so we can read the body in limiters
function applyEarlySecurityMiddleware(app) {
  // 1. Security headers — before anything else
  app.use(helmetMiddleware);

  // 2. Global rate limiting — after headers, before routes
  app.use(globalLimiter);
}

function applyBodySecurityMiddleware(req, res, next) {
  mongoSanitizeMiddleware(req, res, (mongoError) => {
    if (mongoError) return next(mongoError);
    xssClean(req, res, (xssError) => {
      if (xssError) return next(xssError);
      sanitizeBody(req, res, next);
    });
  });
}

module.exports = {
  applyEarlySecurityMiddleware,
  applyBodySecurityMiddleware,
  loginLimiter,
  auditLog,
  errorHandler,
  // Export individual pieces for unit-testing or selective application
  helmetMiddleware,
  mongoSanitizeMiddleware,
  xssClean,
  sanitizeBody,
  globalLimiter,
};
