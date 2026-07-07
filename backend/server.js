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

// ─── Auth routes (login gets an extra, stricter limiter) ─────────────────────
// SECURITY: /api/auth/login is capped at 10 req / 15 min per IP to resist
//           credential-stuffing attacks independently of the global limiter.
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/tenant',        require('./routes/tenant'));
app.use('/api/superadmin',    require('./routes/superadmin'));

// ─── Public routes ────────────────────────────────────────────────────────────
app.use('/api/products',      require('./routes/products'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/categories',    require('./routes/categories'));
app.use('/api/coupons',       require('./routes/coupons'));
app.use('/api/banners',       require('./routes/banners'));
app.use('/api/reviews',       require('./routes/reviews'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/returns',       require('./routes/returns'));
app.use('/api/gift-cards',    require('./routes/giftcards'));
app.use('/api/seasonal',      require('./routes/seasonal'));
app.use('/api/upload',        require('./routes/upload'));
app.use('/api/scrape',        require('./routes/scrape'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/delivery',      require('./routes/delivery'));
app.use('/api/pages',         require('./routes/pages'));
app.use('/api/subscribers',   require('./routes/subscribers'));
app.use('/api/seo',           require('./routes/seo'));
app.use('/api/meta',          require('./routes/meta'));   // Meta CAPI relay

// ─── SEO aliases ──────────────────────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => res.redirect(301, '/api/seo/sitemap.xml'));
app.get('/robots.txt',  (req, res) => res.redirect(301, '/api/seo/robots.txt'));

// ─── Admin routes (+ audit logging) ──────────────────────────────────────────
// SECURITY: auditLog writes one-line JSON to logs/audit.log for every mutating
//           admin action (POST/PUT/PATCH/DELETE).  This is additive — all
//           responses are identical to before.
app.use('/api/admin', auditLog, require('./routes/admin'));
app.use('/api/admin/reset', require('./routes/reset'));
app.use('/api/admin/billing', require('./routes/adminBilling'));

// ─── Other routes ─────────────────────────────────────────────────────────────
app.use('/api/whatsapp',      require('./routes/whatsapp'));
app.use('/api/social-media',  require('./routes/socialMedia'));
app.use('/api/ai-post-creator', require('./routes/aiPostCreator'));
app.use('/api/automation',    require('./routes/automation'));
app.use('/api/deals',         require('./routes/deals'));
app.use('/api/ai',            require('./routes/ai'));
app.use('/api/monitoring',    require('./routes/monitoring'));
app.use('/api/backup',        require('./routes/backup'));

// ─── Page SSR for crawlers ────────────────────────────────────────────────────
const { seoRenderMiddleware } = require('./routes/seo');
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