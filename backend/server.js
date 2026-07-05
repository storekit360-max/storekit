/**
 * StoreKit Backend — server.js (Multi-Tenant Edition)
 *
 * CORS is now DB-backed: on startup (and every 5 min) we load all active
 * tenant primary domains from MongoDB and allow them as CORS origins.
 * This replaces the ALLOW_ALL_ORIGINS=true band-aid.
 *
 * All routes, business logic, DB schema, payment flows, and API response
 * shapes are identical to the original.
 */

'use strict';

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
require('dotenv').config();

const app = express();

// Trust Railway/Vercel proxy so rate limiters see real client IPs
app.set('trust proxy', 1);

if (!process.env.MONGODB_URI) {
  console.error('❌  MONGODB_URI not defined');
  process.exit(1);
}
console.log('🔗 MongoDB:', process.env.MONGODB_URI.replace(/\/\/(.*?):(.*)@/, '//***:***@'));

// ─── DB-backed CORS ───────────────────────────────────────────────────────────
// Hardcoded always-allowed origins (dev + platform)
const STATIC_ORIGINS = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https:\/\/.*\.vercel\.app$/,
  /^https:\/\/(www\.)?storekit\.lk$/,
];

// Parse EXTRA_ORIGINS env var (comma-separated literal origin strings)
if (process.env.EXTRA_ORIGINS) {
  process.env.EXTRA_ORIGINS.split(',').forEach(o => {
    const trimmed = o.trim().replace(/\/$/, '');
    if (trimmed) {
      STATIC_ORIGINS.push(new RegExp('^' + trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    }
  });
}

// Dynamic tenant domain cache — populated from DB after connect
let _dynamicOrigins = [];          // array of RegExp
let _lastRefresh    = 0;
const CORS_REFRESH_MS = 5 * 60 * 1000; // refresh every 5 min

async function refreshTenantOrigins() {
  try {
    const Tenant = require('./models/Tenant');
    const tenants = await Tenant.find({ status: 'active' }, 'domains').lean();
    const origins = [];
    for (const t of tenants) {
      for (const d of (t.domains || [])) {
        if (d.active && d.domain) {
          // Allow both http and https for the domain (https forced in prod)
          const escaped = d.domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          origins.push(new RegExp(`^https?://(www\\.)?${escaped}(:\\d+)?$`));
        }
      }
    }
    _dynamicOrigins = origins;
    _lastRefresh    = Date.now();
    console.log(`[CORS] Refreshed: ${origins.length} tenant origin(s)`);
  } catch (err) {
    console.error('[CORS] Refresh error:', err.message);
  }
}

function isOriginAllowed(origin) {
  // No origin = server-to-server call (Vercel rewrite, curl, health check)
  if (!origin) return true;
  if (STATIC_ORIGINS.some(r => r.test(origin))) return true;

  // Lazy refresh
  if (Date.now() - _lastRefresh > CORS_REFRESH_MS) {
    refreshTenantOrigins().catch(() => {});
  }

  return _dynamicOrigins.some(r => r.test(origin));
}

app.use(cors({
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) return cb(null, true);
    console.warn(`[CORS] Blocked: ${origin}`);
    cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
}));

// ─── Security middleware ───────────────────────────────────────────────────────
const { applySecurityMiddleware, loginLimiter, auditLog, errorHandler } = require('./middleware/security');
applySecurityMiddleware(app);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Monitoring ───────────────────────────────────────────────────────────────
const { monitoringMiddleware } = require('./middleware/monitoring');
app.use(monitoringMiddleware);

// ─── Static uploads ───────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`→ ${req.method} ${req.path}`);
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// ─── Auth routes ─────────────────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/tenant',     require('./routes/tenant'));
// NOTE: /api/superadmin/resolve-domain is public (guarded by INTERNAL_SECRET).
//       All other /api/superadmin/* routes require superadmin JWT.
app.use('/api/superadmin', require('./routes/superadmin'));

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
app.use('/api/meta',          require('./routes/meta'));

// ─── SEO aliases (domain-root sitemap.xml / robots.txt) ──────────────────────
// These are requested by Google Search Console directly on the customer's domain.
// The edge middleware on Vercel forwards them to Railway, where the seo route
// resolves the tenant from X-Tenant-Domain and returns per-tenant XML/text.
app.get('/sitemap.xml',         (req, res) => res.redirect(301, '/api/seo/sitemap.xml'));
app.get('/robots.txt',          (req, res) => res.redirect(301, '/api/seo/robots.txt'));
app.get('/sitemap_index.xml',   (req, res) => res.redirect(301, '/api/seo/sitemap.xml'));

// ─── Admin routes ─────────────────────────────────────────────────────────────
app.use('/api/admin', auditLog, require('./routes/admin'));
app.use('/api/admin/reset', require('./routes/reset'));

// ─── Other routes ─────────────────────────────────────────────────────────────
app.use('/api/whatsapp',        require('./routes/whatsapp'));
app.use('/api/social-media',    require('./routes/socialMedia'));
app.use('/api/ai-post-creator', require('./routes/aiPostCreator'));
app.use('/api/automation',      require('./routes/automation'));
app.use('/api/deals',           require('./routes/deals'));
app.use('/api/ai',              require('./routes/ai'));
app.use('/api/monitoring',      require('./routes/monitoring'));
app.use('/api/backup',          require('./routes/backup'));

// ─── SPA + SSR for crawlers ───────────────────────────────────────────────────
const { seoRenderMiddleware } = require('./routes/seo');
const fs = require('fs');

const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath, { index: false, maxAge: '7d', immutable: true }));
}

// Every non-API, non-asset GET falls into the SSR handler, which:
// 1. Resolves the tenant from the request domain
// 2. Injects per-tenant meta tags / JSON-LD into the HTML
// 3. Returns the result to bots; real users get the static SPA shell from Vercel CDN
app.get('*', seoRenderMiddleware);

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── MongoDB events ───────────────────────────────────────────────────────────
mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => console.log('✅ MongoDB reconnected'));
mongoose.connection.on('error',        err => console.error('❌ MongoDB error:', err.message));

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

    // Prime the CORS cache immediately after DB connect
    await refreshTenantOrigins();

    // Refresh every 5 min so new tenants don't require a restart
    setInterval(refreshTenantOrigins, CORS_REFRESH_MS);

    const { startTokenRefreshScheduler } = require('./services/tokenRefreshScheduler');
    startTokenRefreshScheduler();

    const { startBackupScheduler } = require('./services/backupScheduler');
    startBackupScheduler();

    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error('❌ Startup error:', err.message);
    process.exit(1);
  }
}

startServer();
