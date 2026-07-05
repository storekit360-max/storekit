const express = require('express');
const router = express.Router();
const { Settings } = require('../models/index');
const Tenant = require('../models/Tenant');
const { normalizeDomain } = require('../middleware/tenant');
const { adminAuth } = require('../middleware/auth');
const { clearThemeCache } = require('../utils/mailer');
const https = require('https');
const http = require('http');

// ── Helper: proxy an image URL to the response ────────────────────────────────
function proxyImage(imageUrl, res, fallbackContentType = 'image/png') {
  try {
    const parsed = new URL(imageUrl);
    const lib = parsed.protocol === 'https:' ? https : http;
    lib.get(imageUrl, (imgRes) => {
      const ct = imgRes.headers['content-type'] || fallbackContentType;
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      imgRes.pipe(res);
    }).on('error', () => res.status(502).send('Could not fetch image'));
  } catch {
    res.status(400).send('Invalid image URL');
  }
}

// ── Favicon proxy — served from storekit.local/api/settings/favicon.ico ──────────
// vercel.json rewrites /favicon.ico → /api/settings/favicon.ico
// so Google always gets the current logo as a proper ICO/PNG
// Build a proper multi-size ICO by fetching PNGs and combining manually
async function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const chunks = [];
    lib.get(url, (r) => {
      r.on('data', c => chunks.push(c));
      r.on('end', () => resolve(Buffer.concat(chunks)));
      r.on('error', reject);
    }).on('error', reject);
  });
}

router.get('/favicon.ico', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl();
    if (!logoUrl) return res.status(404).send('No favicon configured');
    // Redirect to a 48x48 PNG — browsers and Google accept PNG favicons.
    // Avoids Railway→Cloudinary proxy which was returning 403 errors.
    const pngUrl = logoUrl.replace('/upload/', '/upload/w_48,h_48,c_pad,b_white,f_png/');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    return res.redirect(302, pngUrl);
  } catch (err) { return res.status(500).send(err.message); }
});

// Helper to get logo URL from DB
async function getLogoUrl() {
  const row = await Settings.findOne({ key: 'faviconUrl' }) || await Settings.findOne({ key: 'logoUrl' });
  return row?.value || null;
}

// ── Helper: redirect directly to Cloudinary (avoids Railway proxying overhead)
// When ?redirect=1 is passed, we send a 302 to the Cloudinary URL directly.
// Vercel uses this so Google/browsers fetch the image straight from Cloudinary
// instead of going through Railway, which was causing 403 errors.
function redirectOrProxy(logoUrl, transformedUrl, res, contentType) {
  // Always redirect — faster, more reliable, no Railway network dependency
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  return res.redirect(302, transformedUrl);
}

// /favicon.png → 192x192 (Google search result icon)
router.get('/favicon.png', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl();
    if (!logoUrl) return res.status(404).send('No favicon configured');
    const url = logoUrl.replace('/upload/', '/upload/w_192,h_192,c_pad,b_white,f_png/');
    redirectOrProxy(logoUrl, url, res, 'image/png');
  } catch (err) { res.status(500).send(err.message); }
});

// /favicon-96x96.png → exactly 96x96
router.get('/favicon-96x96.png', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl();
    if (!logoUrl) return res.status(404).send('No favicon configured');
    const url = logoUrl.replace('/upload/', '/upload/w_96,h_96,c_pad,b_white,f_png/');
    redirectOrProxy(logoUrl, url, res, 'image/png');
  } catch (err) { res.status(500).send(err.message); }
});

// /favicon-32x32.png → exactly 32x32
router.get('/favicon-32x32.png', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl();
    if (!logoUrl) return res.status(404).send('No favicon configured');
    const url = logoUrl.replace('/upload/', '/upload/w_32,h_32,c_pad,b_white,f_png/');
    redirectOrProxy(logoUrl, url, res, 'image/png');
  } catch (err) { res.status(500).send(err.message); }
});

// /apple-touch-icon.png → 180x180
router.get('/apple-touch-icon.png', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl();
    if (!logoUrl) return res.status(404).send('No favicon configured');
    const url = logoUrl.replace('/upload/', '/upload/w_180,h_180,c_pad,b_white,f_png/');
    redirectOrProxy(logoUrl, url, res, 'image/png');
  } catch (err) { res.status(500).send(err.message); }
});

// ── In-memory settings cache (30s TTL) ───────────────────────────────────────
// Prevents a DB hit on every frontend poll of GET /api/settings,
// and returns the last-known value gracefully during brief Atlas blips.
let _settingsCache = null;
let _settingsCacheAt = 0;
const SETTINGS_CACHE_TTL = 30 * 1000; // 30 seconds

function invalidateSettingsCache() {
  _settingsCache = null;
  _settingsCacheAt = 0;
}

// Get all settings as a flat key→value object (public — needed for store name etc.)
router.get('/', async (req, res) => {
  try {
    const domain = normalizeDomain(req.headers['x-tenant-domain'] || req.headers.host);
    const tenant = await Tenant.findOne({ status: 'active', domains: { $elemMatch: { domain, active: true } } }).populate('plan');
    if (tenant) {
      return res.json({
        storeName: tenant.storeName,
        tenantId: tenant._id,
        plan: tenant.plan?.name,
        features: tenant.plan?.features || {},
        limits: tenant.plan?.limits || {},
        ...(tenant.settings?.toObject ? tenant.settings.toObject() : tenant.settings || {}),
        ...(tenant.theme?.toObject ? tenant.theme.toObject() : tenant.theme || {}),
      });
    }

    const now = Date.now();
    if (_settingsCache && now - _settingsCacheAt < SETTINGS_CACHE_TTL) {
      return res.json(_settingsCache);
    }
    const settings = await Settings.find();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    _settingsCache = obj;
    _settingsCacheAt = now;
    res.json(obj);
  } catch (err) {
    // If DB is temporarily down but we have a cached value, serve it
    if (_settingsCache) {
      console.warn('[Settings] DB error, serving cached settings:', err.message);
      return res.json(_settingsCache);
    }
    res.status(500).json({ message: err.message });
  }
});

// Save settings (admin) — pass an object of key:value pairs.
// Uses bulkWrite so all keys are saved in ONE round-trip to MongoDB instead of
// one sequential await per key. This prevents axios timeout errors on large
// settings objects and eliminates the false "Failed to save settings" toast.
router.put('/', adminAuth, async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    if (entries.length === 0) return res.json({ success: true });

    const ops = entries.map(([key, value]) => ({
      updateOne: {
        filter: { key },
        update: { $set: { key, value, updatedAt: new Date() } },
        upsert: true,
      },
    }));

    await Settings.bulkWrite(ops, { ordered: false });
    clearThemeCache();       // invalidate email theme cache so next mail uses new colours
    invalidateSettingsCache(); // invalidate GET /api/settings in-memory cache
    res.json({ success: true });
  } catch (err) {
    console.error('Settings save error:', err);
    res.status(500).json({ message: err.message || 'Failed to save settings' });
  }
});

module.exports = router;
module.exports.invalidateSettingsCache = invalidateSettingsCache;