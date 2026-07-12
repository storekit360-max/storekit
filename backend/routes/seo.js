/**
 * routes/seo.js — Multi-Tenant SEO backend for StoreKit
 *
 * Every endpoint is tenant-aware: it resolves the requesting domain → tenant,
 * then scopes all DB queries and meta tags to that tenant's data.
 *
 * GET  /api/seo/sitemap.xml               — Sitemap index (per-tenant)
 * GET  /api/seo/products-sitemap.xml      — Product URLs with images (per-tenant)
 * GET  /api/seo/categories-sitemap.xml   — Category + brand pages (per-tenant)
 * GET  /api/seo/brands-sitemap.xml        — Brand pages (per-tenant)
 * GET  /api/seo/pages-sitemap.xml        — Static + business pages (per-tenant)
 * GET  /api/seo/google-shopping-feed.xml — Merchant Center product feed (per-tenant)
 * GET  /api/seo/robots.txt              — Dynamic robots.txt (per-tenant)
 * GET  /api/seo/meta                    — Store-level meta tags (per-tenant)
 * GET  /api/seo/product-meta/:slug      — Per-product meta for SSR (per-tenant)
 * GET  /api/seo/category-meta/:slug     — Per-category meta for SSR (per-tenant)
 * GET  /api/seo/brand-meta/:slug        — Per-brand meta for SSR (per-tenant)
 * POST /api/seo/bust-cache              — Clear sitemap cache
 *
 * SSR middleware exported: seoRenderMiddleware
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const path     = require('path');

const Product          = require('../models/Product');
const { Category, Settings, Review, BusinessPage } = require('../models/index');
const Tenant           = require('../models/Tenant');
const { normalizeDomain, getHeaderDomainCandidates, isTenantAvailable } = require('../middleware/tenant');

// ── XML helpers ───────────────────────────────────────────────────────────────
function xe(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/** Build a <url> entry with zero or more <image:image> children */
function urlEntry(loc, lastmod, changefreq = 'weekly', priority = '0.7', images = []) {
  const imgXml = images
    .filter(Boolean)
    .map(img => {
      const src = typeof img === 'string' ? { loc: img } : img;
      const titleXml   = src.title   ? `\n      <image:title>${xe(src.title)}</image:title>`     : '';
      const captionXml = src.caption ? `\n      <image:caption>${xe(src.caption)}</image:caption>` : '';
      return `\n    <image:image>\n      <image:loc>${xe(src.loc)}</image:loc>${titleXml}${captionXml}\n    </image:image>`;
    })
    .join('');
  return `  <url>
    <loc>${xe(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${imgXml}
  </url>`;
}

// ── In-memory cache (keyed by tenantId + cacheKey) ───────────────────────────
const cache = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function cacheKey(tenantId, key) {
  return `${tenantId || 'default'}:${key}`;
}

function getCached(tenantId, key) {
  const k = cacheKey(tenantId, key);
  const entry = cache[k];
  if (entry && Date.now() - entry.at < CACHE_TTL) return entry.data;
  return null;
}

function setCached(tenantId, key, data) {
  cache[cacheKey(tenantId, key)] = { data, at: Date.now() };
}

function isLocalDomain(domain) {
  return ['localhost', '127.0.0.1'].includes(normalizeDomain(domain));
}

function noIndexResponse(res, status, message = 'Store not found') {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(message);
}

function noIndexXml(res, status, message = 'Unavailable') {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/xml');
  return res.status(status).send(`<?xml version="1.0" encoding="UTF-8"?><error>${xe(message)}</error>`);
}

function buildSeoConfig(tenant, globalConfig = {}, tenantSeoConfig = {}) {
  const settings = tenant?.settings || {};
  return {
    ...globalConfig,
    ...(settings.seo_config || {}),
    ...tenantSeoConfig,
    siteName: settings.storeName || tenant?.storeName || tenantSeoConfig.siteName || globalConfig.siteName,
    siteUrl: settings.siteUrl || tenantSeoConfig.siteUrl || globalConfig.siteUrl,
    defaultDescription: settings.metaDescription || tenantSeoConfig.defaultDescription || globalConfig.defaultDescription,
    defaultOgImage: settings.ogImage || tenantSeoConfig.defaultOgImage || globalConfig.defaultOgImage,
    twitterHandle: settings.twitterHandle || tenantSeoConfig.twitterHandle || globalConfig.twitterHandle,
    orgName: tenant?.storeName || tenantSeoConfig.orgName || globalConfig.orgName,
    logoUrl: settings.logoUrl || tenantSeoConfig.logoUrl || globalConfig.logoUrl,
    phone: settings.phone || settings.storePhone || tenantSeoConfig.phone || globalConfig.phone,
    facebookUrl: settings.facebookUrl || tenantSeoConfig.facebookUrl || globalConfig.facebookUrl,
    instagramUrl: settings.instagramUrl || tenantSeoConfig.instagramUrl || globalConfig.instagramUrl,
    twitterUrl: settings.twitterUrl || tenantSeoConfig.twitterUrl || globalConfig.twitterUrl,
    linkedinUrl: settings.linkedinUrl || tenantSeoConfig.linkedinUrl || globalConfig.linkedinUrl,
    youtubeUrl: settings.youtubeUrl || tenantSeoConfig.youtubeUrl || globalConfig.youtubeUrl,
    ga4Id: settings.googleAnalytics || tenantSeoConfig.ga4Id || globalConfig.ga4Id,
    gtmId: settings.googleTagManager || tenantSeoConfig.gtmId || globalConfig.gtmId,
    metaPixelId: settings.facebookPixel || tenantSeoConfig.metaPixelId || globalConfig.metaPixelId,
    currencyCode: settings.currencyCode || settings.currency || tenantSeoConfig.currencyCode || globalConfig.currencyCode || 'LKR',
  };
}

// ── Tenant resolution helpers ─────────────────────────────────────────────────
/**
 * Resolve tenant from request.
 * Priority: X-Tenant-Domain header → x-forwarded-host → host
 * Returns { tenant, tenantId, siteUrl, storeName, tenantSettings }
 */
async function resolveTenantForSEO(req) {
  const candidates = getHeaderDomainCandidates(req);
  const rawDomain = candidates[0] || '';

  // Try DB lookup
  let tenant = null;
  if (candidates.length && !candidates.some(isLocalDomain)) {
    tenant = await Tenant.findOne({
      domains: { $elemMatch: { domain: { $in: candidates }, active: true } },
    }).populate('plan').lean();
  }

  if (tenant && !isTenantAvailable(tenant)) {
    return {
      tenant,
      tenantId: tenant._id,
      siteUrl: `https://${rawDomain}`,
      storeName: tenant.storeName || 'Store',
      logoUrl: '',
      ogImage: '',
      tenantSettings: null,
      unavailable: true,
    };
  }

  // Fallback: global settings
  const seoConfig = await Settings.findOne({ key: 'seo_config', tenantId: null }).lean();
  const globalSiteUrl = (seoConfig?.value?.siteUrl || process.env.FRONTEND_URL || 'https://storekit.lk').replace(/\/$/, '');

  if (!tenant) {
    if (rawDomain && !isLocalDomain(rawDomain)) {
      return {
        tenant: null,
        tenantId: null,
        siteUrl: `https://${rawDomain}`,
        storeName: 'Store',
        logoUrl: '',
        ogImage: '',
        tenantSettings: null,
        notFound: true,
      };
    }
    // Single-tenant fallback or superadmin context
    return {
      tenant: null,
      tenantId: null,
      siteUrl: globalSiteUrl,
      storeName: seoConfig?.value?.storeName || process.env.SHOP_NAME || 'StoreKit',
      logoUrl: seoConfig?.value?.logoUrl || '',
      ogImage: seoConfig?.value?.ogImage || '',
      tenantSettings: null,
    };
  }

  // Tenant-specific siteUrl = first active domain with https://
  const primaryDomain = tenant.domains.find(d => d.type === 'primary' && d.active)
    || tenant.domains.find(d => d.active);
  const siteUrl = primaryDomain
    ? `https://${primaryDomain.domain}`
    : globalSiteUrl;

  // Tenant SEO settings from their Settings collection (scoped to tenantId)
  const tenantSeoConfig = await Settings.findOne({ key: 'seo_config', tenantId: tenant._id }).lean();
  const mergedConfig = buildSeoConfig(tenant, seoConfig?.value || {}, tenantSeoConfig?.value || {});

  return {
    tenant,
    tenantId: tenant._id,
    // Canonicals and sitemap URLs must always use a verified active tenant
    // domain. An old/manual siteUrl setting must not point Google elsewhere.
    siteUrl: siteUrl.replace(/\/$/, ''),
    storeName: mergedConfig.siteName || tenant.storeName || 'StoreKit',
    logoUrl: mergedConfig.logoUrl || tenant.settings?.logoUrl || '',
    ogImage: mergedConfig.defaultOgImage || tenant.settings?.ogImage || tenant.settings?.logoUrl || '',
    tenantSettings: mergedConfig,
  };
}

/**
 * Build a tenant-scoped MongoDB query filter.
 * Products/Categories/etc. must have a tenantId field to scope queries.
 * If no tenant is resolved, keep queries on legacy/global rows only.
 */
function tenantFilter(tenantId, extra = {}) {
  if (!tenantId) return { tenantId: null, ...extra };
  return { tenantId, ...extra };
}

// ── Backend URL (for sitemap index sub-sitemap locs) ──────────────────────────
function getBackendUrl() {
  const raw = process.env.BACKEND_URL || 'https://storekit-production.up.railway.app';
  return (raw.startsWith('http') ? raw : `https://${raw}`).replace(/\/$/, '');
}

// ── GET /api/seo/sitemap.xml  — Sitemap index (per-tenant) ────────────────────
router.get('/sitemap.xml', async (req, res) => {
  try {
    const { siteUrl, tenantId, unavailable, notFound } = await resolveTenantForSEO(req);
    if (unavailable) return noIndexXml(res, 503, 'Store unavailable');
    if (notFound) return noIndexXml(res, 404, 'Store not found');
    const today = new Date().toISOString().split('T')[0];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${siteUrl}/products-sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/categories-sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/brands-sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/pages-sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap index error:', err);
    res.status(500).send('<?xml version="1.0"?><error>Sitemap generation failed</error>');
  }
});

// ── GET /api/seo/products-sitemap.xml — Per-tenant products ──────────────────
router.get('/products-sitemap.xml', async (req, res) => {
  try {
    const { siteUrl, tenantId, storeName, unavailable, notFound } = await resolveTenantForSEO(req);
    if (unavailable) return noIndexXml(res, 503, 'Store unavailable');
    if (notFound) return noIndexXml(res, 404, 'Store not found');
    const cacheScope = `${tenantId || 'default'}:${siteUrl}`;
    const cached = getCached(cacheScope, 'productsSitemap');
    if (cached) {
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(cached);
    }

    const today = new Date().toISOString().split('T')[0];
    const products = await Product.find(
      tenantFilter(tenantId, { isActive: true }),
      'slug updatedAt thumbnail images name brand'
    ).lean();

    const entries = products.map(p => {
      const allImages    = [p.thumbnail, ...(p.images || [])].filter(Boolean);
      const uniqueImages = [...new Set(allImages)].slice(0, 10);
      const imageObjs    = uniqueImages.map((img, i) => ({
        loc: img,
        title: p.brand ? `${p.brand} ${p.name}` : p.name,
        caption: i === 0
          ? `${p.name} — buy online at ${storeName}`
          : `${p.name} — additional view ${i + 1}`,
      }));
      return urlEntry(
        `${siteUrl}/product/${p.slug}`,
        p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : today,
        'weekly', '0.9', imageObjs
      );
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>`;

    setCached(cacheScope, 'productsSitemap', xml);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Products sitemap error:', err);
    res.status(500).send('<?xml version="1.0"?><error>Failed</error>');
  }
});

// ── GET /api/seo/google-shopping-feed.xml — Merchant Center RSS feed ────────
router.get('/google-shopping-feed.xml', async (req, res) => {
  try {
    const { siteUrl, tenantId, storeName, tenantSettings, unavailable, notFound } = await resolveTenantForSEO(req);
    if (unavailable) return noIndexXml(res, 503, 'Store unavailable');
    if (notFound) return noIndexXml(res, 404, 'Store not found');

    const rawCurrency = String(tenantSettings?.currencyCode || 'LKR').toUpperCase();
    const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : 'LKR';
    const products = await Product.find(
      tenantFilter(tenantId, { isActive: true, price: { $gt: 0 } }),
      'name slug description shortDescription thumbnail images price salePrice isOnSale stock sku brand updatedAt'
    ).sort({ updatedAt: -1 }).lean();

    const items = products.filter(product => product.thumbnail || product.images?.[0]).map(product => {
      const activePrice = product.isOnSale && product.salePrice > 0 ? product.salePrice : product.price;
      const description = String(product.shortDescription || product.description || product.name)
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
      const image = product.thumbnail || product.images?.[0] || '';
      return `  <item>
    <g:id>${xe(product.sku || product._id)}</g:id>
    <title>${xe(product.name)}</title>
    <description>${xe(description)}</description>
    <link>${xe(`${siteUrl}/product/${product.slug}`)}</link>
    ${image ? `<g:image_link>${xe(image)}</g:image_link>` : ''}
    <g:availability>${product.stock > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>
    <g:price>${Number(activePrice).toFixed(2)} ${currency}</g:price>
    <g:condition>new</g:condition>
    ${product.brand ? `<g:brand>${xe(product.brand)}</g:brand>` : ''}
    ${product.brand && product.sku ? `<g:mpn>${xe(product.sku)}</g:mpn>` : '<g:identifier_exists>no</g:identifier_exists>'}
  </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${xe(storeName)} Products</title>
  <link>${xe(siteUrl)}</link>
  <description>${xe(`Active products available from ${storeName}`)}</description>
${items}
</channel>
</rss>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(xml);
  } catch (err) {
    console.error('Google shopping feed error:', err.message);
    return res.status(500).send('<?xml version="1.0"?><error>Feed generation failed</error>');
  }
});

// ── GET /api/seo/categories-sitemap.xml — Per-tenant categories ──────────────
router.get('/categories-sitemap.xml', async (req, res) => {
  try {
    const { siteUrl, tenantId, unavailable, notFound } = await resolveTenantForSEO(req);
    if (unavailable) return noIndexXml(res, 503, 'Store unavailable');
    if (notFound) return noIndexXml(res, 404, 'Store not found');
    const cacheScope = `${tenantId || 'default'}:${siteUrl}`;
    const cached = getCached(cacheScope, 'categoriesSitemap');
    if (cached) {
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(cached);
    }

    const today = new Date().toISOString().split('T')[0];
    const categories = await Category.find(
      tenantFilter(tenantId, { isActive: true }),
      'slug name updatedAt'
    ).lean();

    const entries = categories.map(c => urlEntry(
      `${siteUrl}/category/${c.slug}`,
      c.updatedAt ? new Date(c.updatedAt).toISOString().split('T')[0] : today,
      'weekly', '0.8'
    ));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

    setCached(cacheScope, 'categoriesSitemap', xml);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Categories sitemap error:', err);
    res.status(500).send('<?xml version="1.0"?><error>Failed</error>');
  }
});

// ── GET /api/seo/brands-sitemap.xml — Per-tenant brands ──────────────────────
router.get('/brands-sitemap.xml', async (req, res) => {
  try {
    const { siteUrl, tenantId, unavailable, notFound } = await resolveTenantForSEO(req);
    if (unavailable) return noIndexXml(res, 503, 'Store unavailable');
    if (notFound) return noIndexXml(res, 404, 'Store not found');
    const cacheScope = `${tenantId || 'default'}:${siteUrl}`;
    const cached = getCached(cacheScope, 'brandsSitemap');
    if (cached) {
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(cached);
    }

    const today = new Date().toISOString().split('T')[0];
    const brandNames = await Product.distinct('brand', tenantFilter(tenantId, { isActive: true, brand: { $ne: '' } }));

    const entries = brandNames.filter(Boolean).map(b => urlEntry(
      `${siteUrl}/brand/${b.toLowerCase().replace(/\s+/g, '-')}`,
      today, 'weekly', '0.7'
    ));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

    setCached(cacheScope, 'brandsSitemap', xml);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Brands sitemap error:', err);
    res.status(500).send('<?xml version="1.0"?><error>Failed</error>');
  }
});

// ── GET /api/seo/pages-sitemap.xml — Per-tenant static pages ─────────────────
router.get('/pages-sitemap.xml', async (req, res) => {
  try {
    const { siteUrl, tenantId, unavailable, notFound } = await resolveTenantForSEO(req);
    if (unavailable) return noIndexXml(res, 503, 'Store unavailable');
    if (notFound) return noIndexXml(res, 404, 'Store not found');
    const today = new Date().toISOString().split('T')[0];

    const staticPages = [
      { path: '/',       priority: '1.0', changefreq: 'daily' },
      { path: '/shop',   priority: '0.9', changefreq: 'daily' },
    ];

    const entries = staticPages.map(p =>
      urlEntry(`${siteUrl}${p.path}`, today, p.changefreq, p.priority)
    );

    const businessPages = await BusinessPage.find(
      tenantFilter(tenantId, { isActive: true }),
      'slug updatedAt'
    ).lean();
    businessPages.forEach(page => {
      entries.push(urlEntry(
        `${siteUrl}/page/${page.slug}`,
        page.updatedAt ? new Date(page.updatedAt).toISOString().split('T')[0] : today,
        'monthly', '0.5'
      ));
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Pages sitemap error:', err);
    res.status(500).send('<?xml version="1.0"?><error>Failed</error>');
  }
});

// ── GET /api/seo/robots.txt — Per-tenant robots ───────────────────────────────
router.get('/robots.txt', async (req, res) => {
  try {
    const { siteUrl, tenant, unavailable, notFound } = await resolveTenantForSEO(req);
    if (unavailable || notFound) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(unavailable ? 503 : 404).send('User-agent: *\nDisallow: /\n');
    }
    const customRobots = tenant?.settings?.robotsTxt;
    const txt = customRobots || `# StoreKit — ${tenant?.storeName || 'Store'}
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /superadmin/
Disallow: /api/
Disallow: /checkout
Disallow: /cart
Disallow: /account
Disallow: /my-orders
Disallow: /returns

Sitemap: ${siteUrl}/sitemap.xml`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(txt);
  } catch (err) {
    console.error('Robots.txt error:', err);
    res.status(500).send('User-agent: *\nAllow: /');
  }
});

// ── GET /api/seo/meta — Per-tenant store meta ─────────────────────────────────
router.get('/meta', async (req, res) => {
  try {
    const info = await resolveTenantForSEO(req);
    if (info.unavailable) return res.status(503).json({ code: 'STORE_UNAVAILABLE', message: 'This store is currently unavailable.' });
    if (info.notFound) return res.status(404).json({ code: 'STORE_NOT_FOUND', message: 'Store not found for this domain.' });
    const settings = info.tenant?.settings || {};
    const seo = info.tenantSettings || {};
    res.json({
      siteUrl:     info.siteUrl,
      storeName:   info.storeName,
      logoUrl:     info.logoUrl,
      ogImage:     info.ogImage,
      metaTitle:   settings.metaTitle || seo.siteName || info.storeName,
      metaDesc:    settings.metaDescription || seo.defaultDescription || `Shop online at ${info.storeName}`,
      currency:    settings.currency || seo.currencyCode || 'LKR',
      country:     settings.country  || 'Sri Lanka',
    });
  } catch (err) {
    console.error('SEO meta error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// ── POST /api/seo/bust-cache — Clear cache for this tenant ───────────────────
router.post('/bust-cache', async (req, res) => {
  try {
    const { tenantId } = await resolveTenantForSEO(req);
    const prefix = `${tenantId || 'default'}:`;
    let cleared = 0;
    for (const k of Object.keys(cache)) {
      if (k.startsWith(prefix)) { delete cache[k]; cleared++; }
    }
    res.json({ message: `Cleared ${cleared} cache entries`, tenantId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SSR render middleware — per-tenant HTML injection for bots
// ════════════════════════════════════════════════════════════════════════════

// ── HTML template loader ──────────────────────────────────────────────────────
let _htmlTemplate = null;
async function getHtmlTemplate() {
  if (_htmlTemplate) return _htmlTemplate;
  const buildPath = path.join(__dirname, '..', '..', 'frontend', 'build', 'index.html');
  if (!fs.existsSync(buildPath)) return null;
  _htmlTemplate = fs.readFileSync(buildPath, 'utf8');
  return _htmlTemplate;
}

// ── Meta injection ─────────────────────────────────────────────────────────────
function injectMeta(html, { title, desc, canonical, ogImage, ogType = 'website', keywords, schemas = [] }) {
  const schemaBlocks = schemas.filter(Boolean).map(s =>
    `<script type="application/ld+json">${JSON.stringify(s)}</script>`
  ).join('\n');

  const head = `
  <title>${xe(title)}</title>
  <meta name="description" content="${xe(desc)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="keywords" content="${xe(keywords || '')}">
  <link rel="canonical" href="${xe(canonical)}">
  <meta property="og:title" content="${xe(title)}">
  <meta property="og:description" content="${xe(desc)}">
  <meta property="og:url" content="${xe(canonical)}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:image" content="${xe(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${xe(title)}">
  <meta name="twitter:description" content="${xe(desc)}">
  <meta name="twitter:image" content="${xe(ogImage)}">
  ${schemaBlocks}`;

  // Remove placeholder meta tags then inject ours before </head>
  return html
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/g, '')
    .replace(/<meta name="robots"[^>]*>/g, '')
    .replace(/<link rel="canonical"[^>]*>/g, '')
    .replace(/<meta property="og:[^"]+"[^>]*>/g, '')
    .replace(/<meta name="twitter:[^"]+"[^>]*>/g, '')
    .replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<\/head>/, `${head}\n</head>`);
}

function injectWindowConfig(html, tenantInfo) {
  if (!tenantInfo) return html;
  const seo = tenantInfo.tenantSettings || {};
  const config = {
    siteUrl:   tenantInfo.siteUrl,
    storeName: tenantInfo.storeName,
    currency:  tenantInfo.tenant?.settings?.currency || 'LKR',
    tenantId:  tenantInfo.tenantId,
  };
  const seoConfig = {
    siteName: tenantInfo.storeName,
    siteUrl: tenantInfo.siteUrl,
    defaultDescription: seo.defaultDescription || tenantInfo.tenant?.settings?.metaDescription || '',
    defaultOgImage: seo.defaultOgImage || tenantInfo.tenant?.settings?.ogImage || tenantInfo.logoUrl || '',
    twitterHandle: seo.twitterHandle || '',
    orgName: seo.orgName || tenantInfo.storeName,
    logoUrl: seo.logoUrl || tenantInfo.logoUrl || '',
    phone: seo.phone || tenantInfo.tenant?.settings?.phone || '',
    facebookUrl: seo.facebookUrl || '',
    instagramUrl: seo.instagramUrl || '',
    twitterUrl: seo.twitterUrl || '',
    linkedinUrl: seo.linkedinUrl || '',
    youtubeUrl: seo.youtubeUrl || '',
    ga4Id: seo.ga4Id || '',
    gtmId: seo.gtmId || '',
    metaPixelId: seo.metaPixelId || '',
    currencyCode: seo.currencyCode || tenantInfo.tenant?.settings?.currency || 'LKR',
  };
  const script = `<script>window.__STOREKIT__=${JSON.stringify(config)};window.__STOREKIT_SEO__=${JSON.stringify(seoConfig)};</script>`;
  return html.replace('</head>', `${script}\n</head>`);
}

// ── Schema helpers ─────────────────────────────────────────────────────────────
function buildProductTitle(product, storeName) {
  const brand = product.brand ? `${product.brand} ` : '';
  const price = product.isOnSale && product.salePrice ? product.salePrice : product.price;
  return `${brand}${product.name} — Price in Sri Lanka Rs.${price?.toLocaleString()} | ${storeName}`;
}

async function getReviewSchemas(productId, tenantId) {
  try {
    const reviews = await Review.find(
      tenantFilter(tenantId, { product: productId, isApproved: true }),
      'rating comment user createdAt'
    ).populate('user', 'firstName lastName').limit(10).lean();

    return reviews.map(r => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: '5', worstRating: '1' },
      author: { '@type': 'Person', name: r.user ? `${r.user.firstName} ${r.user.lastName}` : 'Customer' },
      datePublished: new Date(r.createdAt).toISOString().split('T')[0],
      reviewBody: r.comment || '',
    }));
  } catch { return []; }
}

function buildProductFAQ(product, siteUrl, storeName) {
  const price = product.isOnSale && product.salePrice ? product.salePrice : product.price;
  const qs = [
    { q: `What is the price of ${product.name} in Sri Lanka?`, a: `${product.name} is available at Rs.${price?.toLocaleString()} at ${storeName}.` },
    { q: `Is ${product.name} available in Sri Lanka?`, a: `Yes, ${product.name} is available for purchase at ${storeName} with fast delivery across Sri Lanka.` },
    { q: `What is the warranty for ${product.name}?`, a: product.brand ? `${product.brand} products come with the manufacturer's standard warranty. Contact ${storeName} for details.` : `Please contact ${storeName} for warranty information.` },
    { q: `How long does delivery take for ${product.name}?`, a: `Standard delivery takes 1–5 business days across Sri Lanka. Express options may be available at checkout.` },
  ];
  return {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: qs.map(({ q, a }) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

function buildCategoryFAQ(catName, siteUrl) {
  const qs = [
    { q: `Where can I buy ${catName} online in Sri Lanka?`, a: `You can buy ${catName} online in Sri Lanka right here, with fast delivery island-wide.` },
    { q: `What brands of ${catName} are available?`, a: `We carry a wide selection of ${catName} from leading brands. Browse our collection for the latest models and best prices.` },
    { q: `How do I get the best price on ${catName} in Sri Lanka?`, a: `Check our ${catName} section regularly for deals, sale prices, and bundle offers. Sign up for our newsletter for exclusive discounts.` },
  ];
  return {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: qs.map(({ q, a }) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

function buildBrandFAQ(brandName, siteUrl, slug) {
  const qs = [
    { q: `Where can I buy ${brandName} products in Sri Lanka?`, a: `Genuine ${brandName} products are available here with manufacturer warranty and fast delivery across Sri Lanka.` },
    { q: `Are ${brandName} products genuine/original in Sri Lanka?`, a: `Yes, all ${brandName} products listed here are 100% genuine with valid manufacturer warranty.` },
  ];
  return {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: qs.map(({ q, a }) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

function buildItemListSchema(products, listUrl, listName) {
  if (!products?.length) return null;
  return {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: listName, url: listUrl,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 20).map((p, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: `${listUrl.replace(/\/(category|brand)\/[^/]+$/, '')}/product/${p.slug}`,
      name: p.name,
      image: p.thumbnail || undefined,
    })),
  };
}

// ── seoRenderMiddleware — per-tenant SSR for bots ────────────────────────────
const seoRenderMiddleware = async (req, res) => {
  if (req.path.startsWith('/api/') || req.path.match(/\.(js|css|png|jpg|ico|svg|json|xml|txt|woff2?)$/))
    return res.status(404).send('Not found');

  const html = await getHtmlTemplate();
  if (!html) return res.status(500).send('Frontend build not found.');

  // Resolve tenant from the request domain
  const tenantInfo = await resolveTenantForSEO(req);
  const { siteUrl, storeName, tenantId, logoUrl, ogImage: defaultOgImage } = tenantInfo;

  if (tenantInfo.notFound) {
    return noIndexResponse(res, 404, '<!doctype html><title>Store not found</title><h1>Store not found</h1>');
  }

  if (tenantInfo.unavailable) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Store currently unavailable</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a;font-family:Inter,Arial,sans-serif}
    main{max-width:420px;padding:32px;text-align:center}
    h1{font-size:28px;margin:0 0 10px}
    p{margin:0;color:#64748b;line-height:1.6}
  </style>
</head>
<body><main><h1>Store currently unavailable</h1><p>This store is currently unavailable. Please check again later.</p></main></body>
</html>`);
  }

  res.setHeader('Access-Control-Allow-Origin', siteUrl);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  const seoSettings = tenantInfo.tenantSettings || {};
  const tenantSettings = tenantInfo.tenant?.settings || {};
  const fallbackOgImage = defaultOgImage || tenantSettings.ogImage || logoUrl || '';

  const orgSchema = {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: storeName, url: siteUrl,
    ...(logoUrl ? { logo: { '@type': 'ImageObject', url: logoUrl, width: 512, height: 512 } } : {}),
  };

  // ── /product/:slug ──────────────────────────────────────────────────────────
  const productMatch = req.path.match(/^\/product\/([^/]+)$/);
  if (productMatch) {
    try {
      const product = await Product.findOne(
        tenantFilter(tenantId, { slug: productMatch[1], isActive: true })
      ).populate('category', 'name slug').lean();

      if (product) {
        const productUrl   = `${siteUrl}/product/${product.slug}`;
        const metaTitle    = buildProductTitle(product, storeName);
        const plainDesc    = String(product.shortDescription || product.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const activePrice  = product.isOnSale && product.salePrice ? product.salePrice : product.price;
        const priceText    = product.isOnSale && product.salePrice ? `Rs.${product.salePrice.toLocaleString()} (was Rs.${product.price.toLocaleString()})` : `Rs.${product.price?.toLocaleString()}`;
        const _raw         = (plainDesc.split('.')[0] || plainDesc).trim();
        const baseDesc     = _raw.length <= 85 ? _raw : _raw.slice(0, _raw.lastIndexOf(' ', 85));
        const metaDesc     = `${baseDesc || product.name}. ${priceText}. Fast delivery. Shop at ${storeName}.`.slice(0, 165);
        const allImages    = [product.thumbnail, ...(product.images || [])].filter(Boolean);
        const uniqueImages = [...new Set(allImages)];
        const ogImage      = uniqueImages[0] || fallbackOgImage;
        const keywords     = [product.name, product.brand, product.category?.name, ...(product.tags || []), 'sri lanka'].filter(Boolean).join(', ');
        const schemaDesc   = plainDesc.slice(0, 500) || (product.brand ? `${product.brand} ${product.name}` : product.name);

        const reviewSchemas = await getReviewSchemas(product._id, tenantId);

        const schema = {
          '@context': 'https://schema.org', '@type': 'Product',
          name: product.name, description: schemaDesc,
          image: uniqueImages.slice(0, 10),
          sku: product.sku || product._id.toString(),
          ...(product.sku ? { mpn: product.sku } : {}),
          ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
          offers: {
            '@type': 'Offer', url: productUrl,
            priceCurrency: /^[A-Z]{3}$/.test(String(seoSettings.currencyCode || tenantSettings.currency || '').toUpperCase())
              ? String(seoSettings.currencyCode || tenantSettings.currency).toUpperCase() : 'LKR',
            price: Number(activePrice),
            ...(product.isOnSale && product.saleEndsAt ? {
              priceValidUntil: new Date(product.saleEndsAt).toISOString().split('T')[0],
            } : {}),
            availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@type': 'Organization', name: storeName },
          },
          ...(product.ratings?.count > 0 ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: product.ratings.average.toFixed(1),
              reviewCount: product.ratings.count,
              bestRating: '5', worstRating: '1',
            },
          } : {}),
          ...(reviewSchemas.length ? { review: reviewSchemas } : {}),
        };

        const breadcrumb = {
          '@context': 'https://schema.org', '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
            { '@type': 'ListItem', position: 2, name: 'Shop', item: `${siteUrl}/shop` },
            ...(product.category ? [{ '@type': 'ListItem', position: 3, name: product.category.name, item: `${siteUrl}/category/${product.category.slug}` }] : []),
            { '@type': 'ListItem', position: product.category ? 4 : 3, name: product.name, item: productUrl },
          ],
        };

        const out = injectMeta(html, { title: metaTitle, desc: metaDesc, canonical: productUrl, ogImage, ogType: 'product', keywords, schemas: [schema, breadcrumb, orgSchema] });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return res.status(200).send(injectWindowConfig(out, tenantInfo));
      }
      return noIndexResponse(res, 404, '<!doctype html><meta name="robots" content="noindex"><title>Product not found</title><h1>Product not found</h1>');
    } catch (err) { console.error('[SSR product]', err.message); }
  }

  // ── /category/:slug ─────────────────────────────────────────────────────────
  const categoryMatch = req.path.match(/^\/category\/([^/]+)$/);
  if (categoryMatch) {
    try {
      const slug = categoryMatch[1];
      const cat  = await Category.findOne(tenantFilter(tenantId, { slug, isActive: true })).lean();
      if (cat) {
        const catUrl   = `${siteUrl}/category/${slug}`;
        const title    = `${cat.name} — Buy Online in Sri Lanka | ${storeName}`;
        const plainCatDesc = cat.description ? String(cat.description).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
        const desc     = plainCatDesc.slice(0, 155) || `Shop ${cat.name} online. Best prices and fast delivery at ${storeName}.`;
        const keywords = `${cat.name}, buy ${cat.name} online sri lanka, ${storeName}`;

        const [featuredProduct, catProducts] = await Promise.all([
          Product.findOne(tenantFilter(tenantId, { category: cat._id, isActive: true, thumbnail: { $exists: true, $ne: '' } })).lean(),
          Product.find(tenantFilter(tenantId, { category: cat._id, isActive: true }), 'name slug thumbnail images brand price salePrice stock ratings').limit(20).lean(),
        ]);
        const ogImage = featuredProduct?.thumbnail || fallbackOgImage;

        const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Shop', item: `${siteUrl}/shop` },
          { '@type': 'ListItem', position: 3, name: cat.name, item: catUrl },
        ]};
        const itemListSchema = buildItemListSchema(catProducts, catUrl, `${cat.name} — Buy Online`);
        const out = injectMeta(html, { title, desc, canonical: catUrl, ogImage, ogType: 'website', keywords, schemas: [breadcrumb, orgSchema, itemListSchema].filter(Boolean) });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return res.status(200).send(injectWindowConfig(out, tenantInfo));
      }
    } catch (err) { console.error('[SSR category]', err.message); }
  }

  // ── /brand/:slug ─────────────────────────────────────────────────────────────
  const brandMatch = req.path.match(/^\/brand\/([^/]+)$/);
  if (brandMatch) {
    try {
      const slug      = brandMatch[1];
      const brandName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const brandUrl  = `${siteUrl}/brand/${slug}`;
      const title     = `${brandName} Products — Buy Online in Sri Lanka | ${storeName}`;
      const desc      = `Shop genuine ${brandName} products online. Best prices, fast delivery, manufacturer warranty at ${storeName}.`;
      const keywords  = `${brandName}, buy ${brandName} online sri lanka, ${storeName}`;

      const [featuredProduct, brandProducts] = await Promise.all([
        Product.findOne(tenantFilter(tenantId, { brand: new RegExp(`^${brandName}$`, 'i'), isActive: true, thumbnail: { $exists: true, $ne: '' } })).lean(),
        Product.find(tenantFilter(tenantId, { brand: new RegExp(`^${brandName}$`, 'i'), isActive: true }), 'name slug thumbnail brand price salePrice stock').limit(20).lean(),
      ]);
      const ogImage = featuredProduct?.thumbnail || fallbackOgImage;

      const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Shop', item: `${siteUrl}/shop` },
        { '@type': 'ListItem', position: 3, name: `${brandName} Products`, item: brandUrl },
      ]};
      const itemListSchema = buildItemListSchema(brandProducts, brandUrl, `${brandName} Products`);
      const out = injectMeta(html, { title, desc, canonical: brandUrl, ogImage, ogType: 'website', keywords, schemas: [breadcrumb, orgSchema, itemListSchema].filter(Boolean) });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).send(injectWindowConfig(out, tenantInfo));
    } catch (err) { console.error('[SSR brand]', err.message); }
  }

  // ── / (home) ─────────────────────────────────────────────────────────────────
  if (req.path === '/' || req.path === '') {
    try {
      const title   = tenantSettings.metaTitle || seoSettings.siteName || `${storeName} — Online Store`;
      const desc    = tenantSettings.metaDescription || seoSettings.defaultDescription || `Shop online at ${storeName}. Fast delivery, best prices.`;
      const ogImage = tenantSettings.ogImage || seoSettings.defaultOgImage || fallbackOgImage;

      const homeSchema = {
        '@context': 'https://schema.org', '@type': 'WebSite',
        name: storeName, url: siteUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/shop?search={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      };

      const out = injectMeta(html, { title, desc, canonical: siteUrl, ogImage, ogType: 'website', keywords: storeName, schemas: [homeSchema, orgSchema] });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).send(injectWindowConfig(out, tenantInfo));
    } catch (err) { console.error('[SSR home]', err.message); }
  }

  // ── /shop ────────────────────────────────────────────────────────────────────
  if (req.path === '/shop' || req.path.startsWith('/shop/')) {
    try {
      const title   = `Shop All Products | ${storeName}`;
      const desc    = `Browse all products at ${storeName}. Fast delivery, competitive prices.`;
      const out = injectMeta(html, { title, desc, canonical: `${siteUrl}/shop`, ogImage: fallbackOgImage, ogType: 'website', keywords: storeName, schemas: [orgSchema] });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).send(injectWindowConfig(out, tenantInfo));
    } catch (err) { console.error('[SSR shop]', err.message); }
  }

  // ── Default fallback — serve the SPA shell ────────────────────────────────────
  const out = injectMeta(html, {
    title:     tenantSettings.metaTitle || seoSettings.siteName || `${storeName} — Online Store`,
    desc:      tenantSettings.metaDescription || seoSettings.defaultDescription || `Shop at ${storeName}`,
    canonical: `${siteUrl}${req.path}`,
    ogImage:   fallbackOgImage,
    ogType:    'website',
    keywords:  storeName,
    schemas:   [orgSchema],
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  return res.status(200).send(injectWindowConfig(out, tenantInfo));
};

module.exports = router;
module.exports.seoRenderMiddleware = seoRenderMiddleware;
