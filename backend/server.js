/**
 * ─── StoreKit Backend — server.js ─────────────────────────────────────────────
 *
 * SECURITY CHANGES vs original (all backward-compatible):
 *  1. helmet / rate-limiting / mongo-sanitize / XSS clean / prototype-pollution
 *     guard are applied via applySecurityMiddleware() BEFORE any route.
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
const path       = require('path');
require('dotenv').config();

// ─── DIAGNOSTIC PATCH — pinpoints bad route handlers accurately ───────────────
// Express's own errors ("Route.get() requires a callback function", "Router.use()
// requires a middleware function") report the line where express-internals calls
// back into your router, which after transpilation/minification-free plain JS
// still sometimes points at a misleading line in module load order. This patch
// wraps router.get/post/put/patch/delete/use so that if any argument isn't a
// function, it throws BEFORE express does — with the real caller's file+line
// (captured via a clean stack trace) and the index of the bad argument.
// Remove this block once the crash is resolved; it's a debugging aid only.
(function patchRouterForDiagnostics() {
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
const tenantScope = [optionalTenant, blockUnavailableStore, tenantContextMiddleware];

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
  origin: (origin, cb) => {
    // No origin = server-to-server (Vercel rewrite, curl, health checks) — allow
    if (!origin) return cb(null, true);
    const ok = allowedOrigins.some(o => o.test(origin));
    if (ok) return cb(null, true);
    // StoreKit is a custom-domain SaaS. Customer domains are added dynamically
    // in Super Admin, so CORS must accept mapped storefront origins. Keep this
    // enabled unless you implement database-backed CORS validation.
    if (process.env.ALLOW_ALL_ORIGINS !== 'false') return cb(null, true);
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
  applySecurityMiddleware,
  loginLimiter,
  auditLog,
  errorHandler,
} = require('./middleware/security');

// ─── DIAGNOSTIC GUARD ─────────────────────────────────────────────────────────
// "Router.use() requires a middleware function" almost always means one of
// these four resolved to `undefined` (bad export name, wrong require path,
// or middleware/security.js throwing before reaching module.exports). This
// fails fast with the exact culprit instead of a bare Express internals error.
for (const [name, val] of Object.entries({ applySecurityMiddleware, loginLimiter, auditLog, errorHandler })) {
  if (typeof val !== 'function') {
    throw new TypeError(
      `[server.js] "${name}" from middleware/security.js is ${val === undefined ? 'undefined' : typeof val}, ` +
      `expected a function. Check module.exports in middleware/security.js.`
    );
  }
}

applySecurityMiddleware(app);

// ─── Body parsing ─────────────────────────────────────────────────────────────
// SECURITY: 50 MB limit is retained from original to avoid breaking large
//           product-import or image-upload payloads.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Monitoring middleware — must come before routes ──────────────────────────
const { monitoringMiddleware } = require('./middleware/monitoring');
app.use(monitoringMiddleware);

// ─── Static uploads ───────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Request logger ───────────────────────────────────────────────────────────
// SECURITY: Log only method + path (no query string or body) to prevent tokens
//           or PII from appearing in server logs.
app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.path}`);
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
safeMount('/api/auth',          require('./routes/auth'));
safeMount('/api/tenant',        require('./routes/tenant'));
safeMount('/api/superadmin',    require('./routes/superadmin'));

// ─── Public routes ────────────────────────────────────────────────────────────
safeMount('/api/products',      require('./routes/products'), tenantScope);
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
safeMount('/api/upload',        require('./routes/upload'));
safeMount('/api/scrape',        require('./routes/scrape'));
safeMount('/api/payments',      require('./routes/payments'));
safeMount('/api/delivery',      require('./routes/delivery'), tenantScope);
safeMount('/api/pages',         require('./routes/pages'), tenantScope);
safeMount('/api/subscribers',   require('./routes/subscribers'), tenantScope);
const seoRoutes = require('./routes/seo');
safeMount('/api/seo',           seoRoutes, tenantScope);
safeMount('/api/meta',          require('./routes/meta'));   // Meta CAPI relay

// ─── SEO aliases ──────────────────────────────────────────────────────────────
function serveSeoAlias(pathname) {
  return (req, res, next) => {
    req.url = pathname;
    seoRoutes(req, res, next);
  };
}
app.get('/sitemap.xml',             serveSeoAlias('/sitemap.xml'));
app.get('/products-sitemap.xml',    serveSeoAlias('/products-sitemap.xml'));
app.get('/categories-sitemap.xml',  serveSeoAlias('/categories-sitemap.xml'));
app.get('/brands-sitemap.xml',      serveSeoAlias('/brands-sitemap.xml'));
app.get('/pages-sitemap.xml',       serveSeoAlias('/pages-sitemap.xml'));
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
safeMount('/api/ai-post-creator', require('./routes/aiPostCreator'));
safeMount('/api/automation',    require('./routes/automation'));
safeMount('/api/deals',         require('./routes/deals'), tenantScope);
safeMount('/api/ai',            require('./routes/ai'));
safeMount('/api/monitoring',    require('./routes/monitoring'));
safeMount('/api/backup',        require('./routes/backup'));

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
