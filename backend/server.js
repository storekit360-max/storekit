/**
 * ─── StoreKit Backend — server.js ─────────────────────────────────────────────
 *
 * SECURITY CHANGES vs original (all backward-compatible):
 *  1. helmet / rate-limiting / mongo-sanitize / XSS clean / prototype-pollution
 *     guard are applied before any route; body protections run after parsing.
 *  2. A stricter loginLimiter is applied specifically on /api/auth/login.
 *  3. Audit logging is applied on /api/admin so every mutating admin action
 *     is written to logs/audit.log.
 *  4. A global errorHandler is registered AFTER all routes so unhandled errors
 *     never leak stack traces to clients.
 *  5. The request logger no longer echoes query-string values (which could
 *     contain tokens or PII). It logs method + path only.
 *  6. CORS origin list is now driven by environment variables as before,
 *     but the EXTRA_ORIGINS parsing is hardened against regex-injection.
 *
 * NOTHING ELSE HAS CHANGED — all routes, business logic, DB schema,
 * payment flows, authentication flows, and API response shapes are identical.
 */

'use strict';

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const compression = require('compression');
const path       = require('path');
require('dotenv').config();

const { assertSafeStagingDatabase } = require('./utils/stagingSafety');
assertSafeStagingDatabase(process.env);

// ─── DIAGNOSTIC PATCH — pinpoints bad route handlers accurately ───────────────
// Express's own errors ("Route.get() requires a callback function", "Router.use()
// requires a middleware function") report the line where express-internals calls
// back into your router, which after transpilation/minification-free plain JS
// still sometimes points at a misleading line in module load order. This patch
// wraps router.get/post/put/patch/delete/use so that if any argument isn't a
// function, it throws BEFORE express does — with the real caller's file+line
// (captured via a clean stack trace) and the index of the bad argument.
// Remove this block once the crash is resolved; it's a debugging aid only.
if (process.env.NODE_ENV !== 'production') (function patchRouterForDiagnostics() {
  const Router = express.Router;
  const proto = Router.prototype;
  const methodsToPatch = ['get', 'post', 'put', 'patch', 'delete', 'use', 'all'];
  for (const method of methodsToPatch) {
    const original = proto[method];
    proto[method] = function (...args) {
      args.forEach((arg, i) => {
        // First arg to these methods is often a path string/regex — skip it.
        if (i === 0 && (typeof arg === 'string' || arg instanceof RegExp || Array.isArray(arg))) return;
        if (Array.isArray(arg)) {
          arg.forEach((sub, j) => {
            if (typeof sub !== 'function') {
              const err = new Error(
                `[router.${method}] argument ${i} (array item ${j}) is ${sub === undefined ? 'undefined' : typeof sub}, expected a function.`
              );
              Error.captureStackTrace(err, proto[method]);
              throw err;
            }
          });
          return;
        }
        if (typeof arg !== 'function') {
          const err = new Error(
            `[router.${method}] argument ${i} is ${arg === undefined ? 'undefined' : typeof arg}, expected a function or path.`
          );
          Error.captureStackTrace(err, proto[method]);
          throw err;
        }
      });
      return original.apply(this, args);
    };
  }
})();

const { installTenantScope, tenantContextMiddleware } = require('./middleware/tenantContext');
installTenantScope(mongoose);

const { optionalTenant, blockUnavailableStore } = require('./middleware/tenant');
// Establish authenticated-admin context before the availability guard. This
// lets tenant admins safely use shared admin domains without inheriting that
// domain's storefront tenant.
const tenantScope = [optionalTenant, tenantContextMiddleware, blockUnavailableStore];
// Provider webhooks arrive directly at Railway and have no tenant storefront
// domain. Resolve a tenant when possible but do not reject provider callbacks.
const tenantContextOnly = [optionalTenant, tenantContextMiddleware];

const app = express();

// Trust the Railway/Vercel proxy so express-rate-limit sees the real client IP
// from X-Forwarded-For rather than the proxy's internal address.
app.set('trust proxy', 1);

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI not defined');
  process.exit(1);
}

// SECURITY: Mask credentials in the log so the connection string is never
//           printed to stdout in plaintext (original behaviour preserved).
console.log('🔗 MongoDB:', process.env.MONGODB_URI.replace(/\/\/(.*?):(.*)@/, '//***:***@'));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Since Vercel rewrites /api/* server-side to Railway, the Origin header seen
// by Railway will be the Vercel deployment URL (StoreKit custom domains or *.vercel.app).
// We also keep localhost for local dev. No origin (server-to-server) is allowed.
const allowedOrigins = [
  // Local dev
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  // Any Vercel preview / production deployment
  /^https:\/\/.*\.vercel\.app$/,
  // Production custom domain
  /^https:\/\/(www\.)?storekit\.lk$/,
];

// Cache custom-domain CORS decisions briefly to avoid a MongoDB query on every
// API request while still allowing newly mapped tenant domains to propagate.
const tenantOriginCache = new Map();
const TENANT_ORIGIN_CACHE_TTL = 5 * 60 * 1000;

async function isMappedTenantOrigin(origin) {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') return false;
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const cached = tenantOriginCache.get(domain);
    if (cached && Date.now() - cached.at < TENANT_ORIGIN_CACHE_TTL) return cached.allowed;
    const Tenant = require('./models/Tenant');
    const exists = await Tenant.exists({
      status: 'active',
      domains: { $elemMatch: { domain: { $in: [domain, `www.${domain}`] }, active: true } },
    });
    const allowed = Boolean(exists);
    tenantOriginCache.set(domain, { allowed, at: Date.now() });
    return allowed;
  } catch (_) {
    return false;
  }
}

// Extra origins from env (comma-separated), e.g. EXTRA_ORIGINS=https://staging.storekit.lk
// SECURITY (hardened): Each extra origin is escaped before being turned into a
//   RegExp so that a value like "https://evil.com.*" cannot match unintended
//   origins. The original code had the same escaping; we keep it identical.
if (process.env.EXTRA_ORIGINS) {
  process.env.EXTRA_ORIGINS.split(',').forEach(o => {
    const trimmed = o.trim().replace(/\/$/, '');
    if (trimmed) {
      // SECURITY: Escape the origin string so it cannot contain regex metacharacters.
      allowedOrigins.push(new RegExp('^' + trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    }
  });
}

app.use(cors({
  origin: async (origin, cb) => {
    // No origin = server-to-server (Vercel rewrite, curl, health checks) — allow
    if (!origin) return cb(null, true);
    const ok = allowedOrigins.some(o => o.test(origin));
    if (ok) return cb(null, true);
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_ALL_ORIGINS === 'true') return cb(null, true);
    if (await isMappedTenantOrigin(origin)) return cb(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
}));

// ─── Security middleware (helmet, rate-limit, sanitise, XSS) ─────────────────
// SECURITY: Must be applied BEFORE express.json() so that request bodies are
//           sanitised before any route handler can read them.
// NOTE: We import here (after dotenv.config) so env vars are available.
const {
  applyEarlySecurityMiddleware,
  applyBodySecurityMiddleware,
  loginLimiter,
  auditLog,
  errorHandler,
} = require('./middleware/security');

// ─── DIAGNOSTIC GUARD ─────────────────────────────────────────────────────────
// "Router.use() requires a middleware function" almost always means one of
// these four resolved to `undefined` (bad export name, wrong require path,
// or middleware/security.js throwing before reaching module.exports). This
// fails fast with the exact culprit instead of a bare Express internals error.
for (const [name, val] of Object.entries({ applyEarlySecurityMiddleware, applyBodySecurityMiddleware, loginLimiter, auditLog, errorHandler })) {
  if (typeof val !== 'function') {
    throw new TypeError(
      `[server.js] "${name}" from middleware/security.js is ${val === undefined ? 'undefined' : typeof val}, ` +
      `expected a function. Check module.exports in middleware/security.js.`
    );
  }
}

applyEarlySecurityMiddleware(app);

// Compress JSON, HTML, XML, JavaScript, and CSS responses. Skip tiny responses
// and already-compressed formats to reduce CPU use on small Railway instances.
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
// Keep ordinary API payloads bounded. File uploads use multipart parsing and
// route-specific limits, so they are unaffected by this JSON limit.
const jsonParser = express.json({ limit: '15mb' });
app.use((req, res, next) => {
  // Stripe requires the exact raw bytes for cryptographic signature checks.
  if (req.originalUrl?.split('?')[0] === '/api/payments/stripe/webhook') return next();
  return jsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Body-dependent protections must run after parsers. The Stripe route is left
// untouched because its signature verification requires the original bytes.
app.use((req, res, next) => {
  if (req.originalUrl?.split('?')[0] === '/api/payments/stripe/webhook') return next();
  return applyBodySecurityMiddleware(req, res, next);
});

// Tenant-aware cache semantics. Shared caches must vary by host/domain and must
// never cache authenticated responses. Individual routes can override this.
app.use('/api', (req, res, next) => {
  res.vary('Host');
  res.vary('X-Tenant-Domain');
  res.vary('Origin');
  const publicPath = String(req.originalUrl || '').split('?')[0];
  if (req.method === 'GET' && !req.headers.authorization && [
    '/api/products', '/api/categories', '/api/banners', '/api/pages', '/api/storefront',
    '/api/deals', '/api/seasonal', '/api/delivery',
  ].some(prefix => publicPath.startsWith(prefix))) {
    // Tenant catalogue responses must never enter a shared CDN/proxy cache.
    // The browser keeps a hostname-scoped in-memory cache where appropriate.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  }
  next();
});

// ─── Monitoring middleware — must come before routes ──────────────────────────
const { monitoringMiddleware } = require('./middleware/monitoring');
app.use(monitoringMiddleware);

// ─── Static uploads ───────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Request logger ───────────────────────────────────────────────────────────
// SECURITY: Log only method + path (no query string or body) to prevent tokens
//           or PII from appearing in server logs.
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') console.log(`→ ${req.method} ${req.path}`);
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// ─── DIAGNOSTIC GUARD ─────────────────────────────────────────────────────────
// Wraps app.use for route-module mounts so that if any routes/*.js file's
// module.exports isn't a valid Express router (e.g. it exports {} instead of
// `module.exports = router`, or throws partway through and returns undefined
// via a caught error), we get "which file" instead of an opaque Express
// internals stack trace pointing at the wrong line.
function safeMount(mountPath, routeModule, ...extraMiddleware) {
  if (typeof routeModule !== 'function') {
    throw new TypeError(
      `[server.js] Route module for "${mountPath}" is ${routeModule === undefined ? 'undefined' : typeof routeModule}, ` +
      `expected an Express router (function). That file is missing "module.exports = router" ` +
      `or threw/returned early before reaching it.`
    );
  }
  if (extraMiddleware.length) app.use(mountPath, ...extraMiddleware, routeModule);
  else app.use(mountPath, routeModule);
}

// ─── Auth routes (login gets an extra, stricter limiter) ─────────────────────
// SECURITY: /api/auth/login is capped at 10 req / 15 min per IP to resist
//           credential-stuffing attacks independently of the global limiter.
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/superadmin/google', loginLimiter);
safeMount('/api/auth',          require('./routes/auth'));
safeMount('/api/tenant',        require('./routes/tenant'));
safeMount('/api/superadmin',    require('./routes/superadmin'));

// ─── Public routes ────────────────────────────────────────────────────────────
safeMount('/api/products',      require('./routes/products'), tenantScope);
safeMount('/api/storefront',    require('./routes/storefront'), tenantScope);
safeMount('/api/orders',        require('./routes/orders'), tenantScope);
safeMount('/api/categories',    require('./routes/categories'), tenantScope);
safeMount('/api/coupons',       require('./routes/coupons'), tenantScope);
safeMount('/api/banners',       require('./routes/banners'), tenantScope);
safeMount('/api/reviews',       require('./routes/reviews'), tenantScope);
safeMount('/api/notifications', require('./routes/notifications'), tenantScope);
safeMount('/api/settings',      require('./routes/settings'), tenantScope);
safeMount('/api/returns',       require('./routes/returns'), tenantScope);
safeMount('/api/gift-cards',    require('./routes/giftcards'), tenantScope);
safeMount('/api/seasonal',      require('./routes/seasonal'), tenantScope);
safeMount('/api/upload',        require('./routes/upload'), tenantScope);
safeMount('/api/scrape',        require('./routes/scrape'), tenantScope);
safeMount('/api/payments',      require('./routes/payments'), tenantContextOnly);
safeMount('/api/delivery',      require('./routes/delivery'), tenantScope);
safeMount('/api/curfox',        require('./routes/curfox'), tenantScope);
safeMount('/api/marketing',     require('./routes/marketing'), tenantScope);
safeMount('/api/pages',         require('./routes/pages'), tenantScope);
safeMount('/api/subscribers',   require('./routes/subscribers'), tenantScope);
const seoRoutes = require('./routes/seo');
safeMount('/api/seo',           seoRoutes, tenantScope);
safeMount('/api/meta',          require('./routes/meta'), tenantScope);   // Meta CAPI relay

// ─── SEO aliases ──────────────────────────────────────────────────────────────
function serveSeoAlias(pathname) {
  return (req, res, next) => {
    req.url = pathname;
    seoRoutes(req, res, next);
  };
}
app.get('/sitemap.xml',             serveSeoAlias('/sitemap.xml'));
app.get('/sitemap_index.xml',       serveSeoAlias('/sitemap.xml'));
app.get('/products-sitemap.xml',    serveSeoAlias('/products-sitemap.xml'));
app.get('/categories-sitemap.xml',  serveSeoAlias('/categories-sitemap.xml'));
app.get('/brands-sitemap.xml',      serveSeoAlias('/brands-sitemap.xml'));
app.get('/pages-sitemap.xml',       serveSeoAlias('/pages-sitemap.xml'));
app.get('/google-shopping-feed.xml',serveSeoAlias('/google-shopping-feed.xml'));
app.get('/robots.txt',              serveSeoAlias('/robots.txt'));

// ─── Admin routes (+ audit logging) ──────────────────────────────────────────
// SECURITY: auditLog writes one-line JSON to logs/audit.log for every mutating
//           admin action (POST/PUT/PATCH/DELETE).  This is additive — all
//           responses are identical to before.
safeMount('/api/admin/billing', require('./routes/adminBilling'), tenantScope, auditLog);
safeMount('/api/admin', require('./routes/admin'), tenantScope, auditLog);
safeMount('/api/admin/reset', require('./routes/reset'));
safeMount('/api/billing', require('./routes/billing'), tenantScope);

// ─── Other routes ─────────────────────────────────────────────────────────────
safeMount('/api/whatsapp',      require('./routes/whatsapp'), tenantScope);
safeMount('/api/social-media',  require('./routes/socialMedia'), tenantScope);
safeMount('/api/social-scheduling', require('./routes/socialScheduling'), tenantScope);
safeMount('/api/automation',    require('./routes/automation'), tenantScope);
safeMount('/api/deals',         require('./routes/deals'), tenantScope);
safeMount('/api/ai',            require('./routes/ai'), tenantScope);
safeMount('/api/monitoring',    require('./routes/monitoring'), tenantScope);
safeMount('/api/backup',        require('./routes/backup'), tenantScope);

// ─── Page SSR for crawlers ────────────────────────────────────────────────────
const { seoRenderMiddleware } = seoRoutes;
const fs = require('fs');

const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath, {
    index:     false,
    maxAge:    '7d',
    immutable: true,
  }));
}

app.get('*', seoRenderMiddleware);

// ─── Global error handler ─────────────────────────────────────────────────────
// SECURITY: MUST be registered after all routes.  Catches any error thrown by
//           a route handler or middleware and returns a sanitised response —
//           never a stack trace.
app.use(errorHandler);

// ─── MongoDB connection event logging ─────────────────────────────────────────
mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected — schedulers will skip until reconnected'));
mongoose.connection.on('reconnected',  () => console.log('✅ MongoDB reconnected'));
mongoose.connection.on('error',        (err) => console.error('❌ MongoDB connection error:', err.message));

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS:          45000,
      heartbeatFrequencyMS:     10000,
      maxPoolSize:              10,
      family:                   4,
    });
    console.log('✅ MongoDB Connected');

    const { startTokenRefreshScheduler } = require('./services/tokenRefreshScheduler');
    startTokenRefreshScheduler();

    const { startBackupScheduler } = require('./services/backupScheduler');
    startBackupScheduler();

    const { startSubscriptionScheduler } = require('./services/subscriptionScheduler');
    startSubscriptionScheduler();

    const { startCurfoxScheduler } = require('./services/curfoxScheduler');
    startCurfoxScheduler();

    const { startSocialScheduler } = require('./services/socialScheduler');
    startSocialScheduler();

    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    // SECURITY: Only log the error message, not the full err object, to avoid
    //           accidentally printing connection-string credentials in the trace.
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  }
}

startServer();
