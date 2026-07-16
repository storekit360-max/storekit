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
const SECRET_SETTING_KEYS = new Set(['resendApiKey']);

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

function isLocalDomain(domain) {
  return ['localhost', '127.0.0.1'].includes(normalizeDomain(domain));
}

function tenantSettingsResponse(tenant) {
  const rawSettings = toPlain(tenant.settings);
  const settings = { ...rawSettings };
  // Older tenant records use `phone`, while the current admin form uses
  // `storePhone`. Return both names so every storefront version can display it.
  if (!settings.storePhone && settings.phone) settings.storePhone = settings.phone;
  if (!settings.phone && settings.storePhone) settings.phone = settings.storePhone;
  SECRET_SETTING_KEYS.forEach(key => { delete settings[key]; });
  const theme = normalizeTheme(toPlain(tenant.theme));
  return {
    ...settings,
    ...theme,
    resendApiKeyConfigured: !!rawSettings.resendApiKey,
    storeName: tenant.storeName,
    tenantId: tenant._id,
    plan: tenant.plan?.name,
    features: tenant.plan?.features || {},
    limits: tenant.plan?.limits || {},
  };
}

async function findTenantFromRequest(req) {
  if (req.user?.tenantId) return Tenant.findById(req.user.tenantId).populate('plan');
  if (req.tenant) return req.tenant;
  if (req.tenantId) return Tenant.findById(req.tenantId).populate('plan');

  const candidates = typeof getHeaderDomainCandidates === 'function'
    ? getHeaderDomainCandidates(req)
    : [normalizeDomain(req.headers['x-tenant-domain'] || req.headers.origin || req.headers.referer || req.headers.host)].filter(Boolean);

  if (!candidates.length) return null;
  return Tenant.findOne({
    status: 'active',
    domains: { $elemMatch: { domain: { $in: candidates }, active: true } },
  }).populate('plan');
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

router.get('/starter-logo.svg', async (req, res) => {
  try {
    const tenant = await findTenantFromRequest(req);
    if (!tenant) return res.status(404).send('Store not found');
    const storeName = escapeSvgText(tenant.storeName || 'Store');
    const initials = escapeSvgText(String(tenant.storeName || 'S').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase());
    const primary = /^#[0-9a-f]{6}$/i.test(tenant.theme?.primaryColor || '') ? tenant.theme.primaryColor : '#4f46e5';
    const accent = /^#[0-9a-f]{6}$/i.test(tenant.theme?.accentColor || '') ? tenant.theme.accentColor : '#06b6d4';
    const nameLength = String(tenant.storeName || '').length;
    const fontSize = nameLength > 24 ? 30 : nameLength > 16 ? 38 : 50;
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 180" role="img" aria-label="${storeName}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="720" height="180" rx="30" fill="white"/><rect x="10" y="10" width="160" height="160" rx="48" fill="url(#g)"/><text x="90" y="112" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" font-weight="800" fill="white">${initials}</text><text x="200" y="108" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="800" fill="#0f172a">${storeName}</text></svg>`);
  } catch (err) { res.status(500).send('Could not create store logo'); }
});

async function getLogoUrl(req) {
  if (req.storeUnavailable) return null;
  const tenant = await findTenantFromRequest(req);
  if (tenant) {
    const settings = toPlain(tenant.settings);
    return settings.faviconUrl || settings.logoUrl || null;
  }
  const row = await Settings.findOne({ key: 'faviconUrl', tenantId: null }) || await Settings.findOne({ key: 'logoUrl', tenantId: null });
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

    if (req.storeUnavailable) {
      return res.status(503).json({
        code: 'STORE_UNAVAILABLE',
        message: 'This store is currently unavailable.',
      });
    }

    const tenant = await findTenantFromRequest(req);
    if (tenant) return res.json(tenantSettingsResponse(tenant));

    const domain = getHeaderDomainCandidates(req)[0] || '';
    if (domain && !isLocalDomain(domain)) {
      return res.status(404).json({
        code: 'STORE_NOT_FOUND',
        message: 'Store not found for this domain.',
        domain,
      });
    }

    const cacheKey = 'global';
    const cached = _settingsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < SETTINGS_CACHE_TTL) return res.json(cached.value);

    const settings = await Settings.find({ tenantId: null });
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
        if (SECRET_SETTING_KEYS.has(key)) {
          const secret = String(value || '').trim();
          if (!secret || secret.includes('••••')) continue;
          nextSettings[key] = secret;
          continue;
        }
        if (key === 'storeName') {
          tenant.storeName = value;
        } else if (THEME_KEYS.has(key)) {
          nextTheme[key] = value;
        } else if (key === 'storePhone' || key === 'phone') {
          // Keep the legacy and current contact-number fields synchronized.
          nextSettings.storePhone = value;
          nextSettings.phone = value;
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
