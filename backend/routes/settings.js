const express = require('express');
const router = express.Router();
const { Settings } = require('../models/index');
const Tenant = require('../models/Tenant');
const { normalizeDomain, getHeaderDomainCandidates } = require('../middleware/tenant');
const { adminAuth } = require('../middleware/auth');
const { clearThemeCache } = require('../utils/mailer');
const https = require('https');
const http = require('http');

const THEME_KEYS = new Set([
  'theme', 'primaryColor', 'primaryDarkColor', 'primaryLightColor',
  'secondaryColor', 'accentColor', 'darkBgColor', 'darkColor',
  'fontStyle', 'fontFamily', 'darkMode', 'customCSS', 'logoSize',
  'storeTemplate', 'template', 'layoutTemplate',
]);

const SETTINGS_CACHE_TTL = 30 * 1000;
const _settingsCache = new Map();

function invalidateSettingsCache(scope = null) {
  if (!scope) return _settingsCache.clear();
  _settingsCache.delete(String(scope));
}

function toPlain(value) {
  if (!value) return {};
  return value.toObject ? value.toObject() : value;
}

function normalizeTheme(theme = {}) {
  const t = { ...theme };
  if (t.accentColor && !t.secondaryColor) t.secondaryColor = t.accentColor;
  if (t.secondaryColor && !t.accentColor) t.accentColor = t.secondaryColor;
  if (t.darkColor && !t.darkBgColor) t.darkBgColor = t.darkColor;
  if (t.darkBgColor && !t.darkColor) t.darkColor = t.darkBgColor;
  if (t.fontFamily && !t.fontStyle) t.fontStyle = t.fontFamily;
  if (t.fontStyle && !t.fontFamily) t.fontFamily = t.fontStyle;
  return t;
}

function tenantSettingsResponse(tenant) {
  const settings = toPlain(tenant.settings);
  const theme = normalizeTheme(toPlain(tenant.theme));
  return {
    ...settings,
    ...theme,
    storeName: tenant.storeName,
    tenantId: tenant._id,
    plan: tenant.plan?.name,
    features: tenant.plan?.features || {},
    limits: tenant.plan?.limits || {},
  };
}

async function findTenantFromRequest(req) {
  if (req.tenant) return req.tenant;
  if (req.tenantId) return Tenant.findById(req.tenantId).populate('plan');
  if (req.user?.tenantId) return Tenant.findById(req.user.tenantId).populate('plan');

  const candidates = typeof getHeaderDomainCandidates === 'function'
    ? getHeaderDomainCandidates(req)
    : [normalizeDomain(req.headers['x-tenant-domain'] || req.headers.origin || req.headers.referer || req.headers.host)].filter(Boolean);

  if (!candidates.length) return null;
  return Tenant.findOne({
    status: 'active',
    domains: { $elemMatch: { domain: { $in: candidates }, active: true } },
  }).populate('plan');
}

async function getLogoUrl(req) {
  const tenant = await findTenantFromRequest(req);
  if (tenant) {
    const settings = toPlain(tenant.settings);
    return settings.faviconUrl || settings.logoUrl || null;
  }
  const row = await Settings.findOne({ key: 'faviconUrl' }) || await Settings.findOne({ key: 'logoUrl' });
  return row?.value || null;
}

function redirectOrProxy(_logoUrl, transformedUrl, res) {
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  return res.redirect(302, transformedUrl);
}

function cloudinaryTransform(logoUrl, transform) {
  return String(logoUrl).includes('/upload/')
    ? String(logoUrl).replace('/upload/', `/upload/${transform}/`)
    : logoUrl;
}

router.get('/favicon.ico', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl(req);
    if (!logoUrl) return res.status(404).send('No favicon configured');
    return redirectOrProxy(logoUrl, cloudinaryTransform(logoUrl, 'w_48,h_48,c_pad,b_white,f_png'), res);
  } catch (err) { return res.status(500).send(err.message); }
});

router.get('/favicon.png', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl(req);
    if (!logoUrl) return res.status(404).send('No favicon configured');
    return redirectOrProxy(logoUrl, cloudinaryTransform(logoUrl, 'w_192,h_192,c_pad,b_white,f_png'), res);
  } catch (err) { res.status(500).send(err.message); }
});

router.get('/favicon-96x96.png', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl(req);
    if (!logoUrl) return res.status(404).send('No favicon configured');
    return redirectOrProxy(logoUrl, cloudinaryTransform(logoUrl, 'w_96,h_96,c_pad,b_white,f_png'), res);
  } catch (err) { res.status(500).send(err.message); }
});

router.get('/favicon-32x32.png', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl(req);
    if (!logoUrl) return res.status(404).send('No favicon configured');
    return redirectOrProxy(logoUrl, cloudinaryTransform(logoUrl, 'w_32,h_32,c_pad,b_white,f_png'), res);
  } catch (err) { res.status(500).send(err.message); }
});

router.get('/apple-touch-icon.png', async (req, res) => {
  try {
    const logoUrl = await getLogoUrl(req);
    if (!logoUrl) return res.status(404).send('No favicon configured');
    return redirectOrProxy(logoUrl, cloudinaryTransform(logoUrl, 'w_180,h_180,c_pad,b_white,f_png'), res);
  } catch (err) { res.status(500).send(err.message); }
});

router.get('/', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const tenant = await findTenantFromRequest(req);
    if (tenant) return res.json(tenantSettingsResponse(tenant));

    const cacheKey = 'global';
    const cached = _settingsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < SETTINGS_CACHE_TTL) return res.json(cached.value);

    const settings = await Settings.find();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    _settingsCache.set(cacheKey, { at: Date.now(), value: obj });
    res.json(obj);
  } catch (err) {
    const cached = _settingsCache.get('global');
    if (cached) return res.json(cached.value);
    res.status(500).json({ message: err.message });
  }
});

router.put('/', adminAuth, async (req, res) => {
  try {
    const entries = Object.entries(req.body || {});
    if (entries.length === 0) return res.json({ success: true });

    const tenant = await findTenantFromRequest(req);
    if (tenant) {
      const nextSettings = { ...toPlain(tenant.settings) };
      const nextTheme = normalizeTheme(toPlain(tenant.theme));

      for (const [key, value] of entries) {
        if (key === 'tenantId' || key === 'plan' || key === 'features' || key === 'limits') continue;
        if (key === 'storeName') {
          tenant.storeName = value;
        } else if (THEME_KEYS.has(key)) {
          nextTheme[key] = value;
        } else {
          nextSettings[key] = value;
        }
      }

      tenant.settings = nextSettings;
      tenant.theme = normalizeTheme(nextTheme);
      await tenant.save();
      clearThemeCache();
      invalidateSettingsCache(String(tenant._id));
      return res.json({ success: true, settings: tenantSettingsResponse(tenant) });
    }

    const ops = entries.map(([key, value]) => ({
      updateOne: {
        filter: { key },
        update: { $set: { key, value, updatedAt: new Date() } },
        upsert: true,
      },
    }));
    await Settings.bulkWrite(ops, { ordered: false });
    clearThemeCache();
    invalidateSettingsCache('global');
    res.json({ success: true });
  } catch (err) {
    console.error('Settings save error:', err);
    res.status(500).json({ message: err.message || 'Failed to save settings' });
  }
});

module.exports = router;
module.exports.invalidateSettingsCache = invalidateSettingsCache;
