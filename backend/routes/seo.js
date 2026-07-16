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
const { adminAuth } = require('../middleware/auth');
const {
  stripHtml,
  normalizeCurrency,
  absoluteUrl,
  googleVerificationToken,
  gtinProperty,
  schemaCondition,
  merchantCondition,
  productSeoAudit,
  buildShippingDetails,
  buildReturnPolicy,
} = require('../utils/productSeo');

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

function publicSlug(value = '') {
  return String(value).trim().toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ── Backend URL (for sitemap index sub-sitemap locs) ──────────────────────────
function getBackendUrl() {
  const raw = process.env.BACKEND_URL || 'https://storekit1-production.up.railway.app';
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
    const today = new Date().toISOString().split('T')[0];
    const products = await Product.find(
      tenantFilter(tenantId, { isActive: true }),
      'slug updatedAt thumbnail images name brand description shortDescription price salePrice isOnSale stock category'
    ).lean();

    const entries = products.filter(product => productSeoAudit(product, { siteUrl }).eligible).map(p => {
      const allImages    = [p.thumbnail, ...(p.images || [])].map(image => absoluteUrl(image, siteUrl)).filter(Boolean);
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

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.send(xml);
  } catch (err) {
    console.error('Products sitemap error:', err);
    res.status(500).send('<?xml version="1.0"?><error>Failed</error>');
  }
});

// ── GET /api/seo/google-shopping-feed.xml — Merchant Center RSS feed ────────
router.get('/google-shopping-feed.xml', async (req, res) => {
  try {
    const { siteUrl, tenantId, storeName, tenant, tenantSettings, unavailable, notFound } = await resolveTenantForSEO(req);
    if (unavailable) return noIndexXml(res, 503, 'Store unavailable');
    if (notFound) return noIndexXml(res, 404, 'Store not found');

    const currency = normalizeCurrency(tenantSettings?.currencyCode || 'LKR');
    const storeSettings = tenant?.settings || {};
    const products = await Product.find(
      tenantFilter(tenantId, { isActive: true, price: { $gt: 0 } }),
      'name slug description shortDescription thumbnail images price salePrice isOnSale stock sku gtin mpn identifierExists condition googleProductCategory brand category updatedAt'
    ).populate('category', 'name slug').sort({ updatedAt: -1 }).lean();

    const items = products.filter(product => productSeoAudit(product, { siteUrl }).merchantEligible).map(product => {
      const hasSale = product.isOnSale && Number(product.salePrice) > 0 && Number(product.salePrice) < Number(product.price);
      const activePrice = hasSale ? product.salePrice : product.price;
      const description = stripHtml(product.shortDescription || product.description || product.name).slice(0, 5000);
      const images = [...new Set([product.thumbnail, ...(product.images || [])]
        .map(image => absoluteUrl(image, siteUrl)).filter(Boolean))];
      const image = images[0] || '';
      const additionalImages = images.slice(1, 11).map(url => `<g:additional_image_link>${xe(url)}</g:additional_image_link>`).join('\n    ');
      const country = String(storeSettings.merchantCountryCode || storeSettings.countryCode || 'LK').trim().toUpperCase();
      const shippingCost = Math.max(0, Number(storeSettings.merchantShippingCost ?? storeSettings.standardDelivery ?? 0));
      return `  <item>
    <g:id>${xe(product._id)}</g:id>
    <title>${xe(String(product.name).slice(0, 150))}</title>
    <description>${xe(description)}</description>
    <link>${xe(`${siteUrl}/product/${product.slug}`)}</link>
    ${image ? `<g:image_link>${xe(image)}</g:image_link>` : ''}
    ${additionalImages}
    <g:availability>${product.stock > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>
    <g:price>${Number(product.price).toFixed(2)} ${currency}</g:price>
    ${hasSale ? `<g:sale_price>${Number(activePrice).toFixed(2)} ${currency}</g:sale_price>` : ''}
    <g:condition>${merchantCondition(product.condition)}</g:condition>
    ${product.brand ? `<g:brand>${xe(product.brand)}</g:brand>` : ''}
    ${Object.keys(gtinProperty(product.gtin)).length ? `<g:gtin>${xe(String(product.gtin).replace(/\D/g, ''))}</g:gtin>` : ''}
    ${product.mpn ? `<g:mpn>${xe(product.mpn)}</g:mpn>` : ''}
    ${product.identifierExists === false ? '<g:identifier_exists>no</g:identifier_exists>' : ''}
    ${product.googleProductCategory ? `<g:google_product_category>${xe(product.googleProductCategory)}</g:google_product_category>` : ''}
    ${product.category?.name ? `<g:product_type>${xe(product.category.name)}</g:product_type>` : ''}
    <g:shipping>
      <g:country>${xe(country)}</g:country>
      <g:service>Standard</g:service>
      <g:price>${shippingCost.toFixed(2)} ${currency}</g:price>
    </g:shipping>
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
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
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
    const today = new Date().toISOString().split('T')[0];
    const populatedCategoryIds = await Product.distinct('category', tenantFilter(tenantId, { isActive: true }));
    const categories = await Category.find(
      tenantFilter(tenantId, { isActive: true, _id: { $in: populatedCategoryIds } }),
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

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
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
    const today = new Date().toISOString().split('T')[0];
    const brandNames = await Product.distinct('brand', tenantFilter(tenantId, { isActive: true, brand: { $ne: '' } }));

    const entries = brandNames.filter(Boolean).map(b => urlEntry(
      `${siteUrl}/brand/${publicSlug(b)}`,
      today, 'weekly', '0.7'
    ));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
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
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
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
    const customRobots = String(tenant?.settings?.robotsTxt || '').trim();
    let txt = customRobots || `# ${tenant?.storeName || 'Store'} crawler rules
User-agent: Googlebot
Allow: /

User-agent: Googlebot-Image
Allow: /

# Google Merchant Center product/checkout verification crawler
User-agent: StoreBot-Google
Allow: /

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
    if (customRobots && !/user-agent:\s*storebot-google/i.test(txt)) {
      txt = `User-agent: StoreBot-Google\nAllow: /\n\n${txt}`;
    }
    if (customRobots && !/user-agent:\s*googlebot-image/i.test(txt)) {
      txt = `User-agent: Googlebot-Image\nAllow: /\n\n${txt}`;
    }
    if (!/^\s*Sitemap:/im.test(txt)) txt += `\n\nSitemap: ${siteUrl}/sitemap.xml`;

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

// Real tenant-scoped product eligibility audit used by Admin > SEO.
router.get('/admin/product-audit', adminAuth, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const primaryDomain = tenant.domains?.find(domain => domain.type === 'primary' && domain.active)
      || tenant.domains?.find(domain => domain.active);
    const siteUrl = primaryDomain ? `https://${primaryDomain.domain}` : '';
    const products = await Product.find({ tenantId }).populate('category', 'name slug').sort({ updatedAt: -1 }).lean();
    const rows = products.map(product => ({
      id: product._id,
      name: product.name,
      slug: product.slug,
      active: product.isActive !== false,
      ...productSeoAudit(product, { siteUrl }),
    }));
    const activeRows = rows.filter(row => row.active);
    const eligible = activeRows.filter(row => row.eligible).length;
    const merchantEligible = activeRows.filter(row => row.merchantEligible).length;
    const errorCount = activeRows.reduce((sum, row) => sum + row.errors.length, 0);
    const merchantErrorCount = activeRows.reduce((sum, row) => sum + row.merchantErrors.length, 0);
    const warningCount = activeRows.reduce((sum, row) => sum + row.warnings.length, 0);
    const settings = tenant.settings || {};
    const robotsBlocksAll = /Disallow:\s*\/\s*(?:#.*)?$/im.test(String(settings.robotsTxt || ''));
    const storeChecks = [
      { key: 'domain', ok: !!siteUrl, message: siteUrl ? 'Active canonical domain configured' : 'Add an active tenant domain' },
      { key: 'description', ok: !!stripHtml(settings.metaDescription), message: stripHtml(settings.metaDescription) ? 'Store meta description configured' : 'Add a store meta description' },
      { key: 'logo', ok: !!absoluteUrl(settings.logoUrl, siteUrl), message: settings.logoUrl ? 'Store logo configured' : 'Add a store logo' },
      { key: 'searchConsole', ok: !!settings.googleSearchConsole, message: settings.googleSearchConsole ? 'Search Console verification configured' : 'Configure Search Console verification' },
      { key: 'returns', ok: Number(settings.merchantReturnDays) > 0, message: Number(settings.merchantReturnDays) > 0 ? 'Merchant return window configured' : 'Configure the merchant return window' },
      { key: 'robots', ok: !robotsBlocksAll, message: robotsBlocksAll ? 'robots.txt currently blocks the entire storefront' : 'robots.txt allows storefront crawling' },
    ];
    return res.json({
      siteUrl,
      summary: { total: products.length, active: activeRows.length, eligible, merchantEligible, errorCount, merchantErrorCount, warningCount, score: activeRows.length ? Math.round(activeRows.reduce((sum, row) => sum + row.score, 0) / activeRows.length) : 0 },
      storeChecks,
      products: rows.filter(row => row.active && (!row.eligible || row.warnings.length)).slice(0, 200),
      urls: siteUrl ? { sitemap: `${siteUrl}/sitemap.xml`, productSitemap: `${siteUrl}/products-sitemap.xml`, merchantFeed: `${siteUrl}/google-shopping-feed.xml`, robots: `${siteUrl}/robots.txt` } : {},
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// ── POST /api/seo/bust-cache — Clear cache for this tenant ───────────────────
router.post('/bust-cache', adminAuth, async (req, res) => {
  try {
    const { tenantId } = await resolveTenantForSEO(req);
    res.json({ message: 'SEO feeds and sitemaps are generated live', tenantId });
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
  _htmlTemplate = fs.existsSync(buildPath)
    ? fs.readFileSync(buildPath, 'utf8')
    : '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Store</title></head><body><div id="root"></div></body></html>';
  return _htmlTemplate;
}

function injectVisibleContent(html, content) {
  const safeContent = content || '';
  return html.replace(/<body([^>]*)>/i, `<body$1><main id="seo-visible-content">${safeContent}</main>`);
}

function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ── Meta injection ─────────────────────────────────────────────────────────────
function injectMeta(html, { title, desc, canonical, ogImage, ogType = 'website', keywords, schemas = [], verification = '' }) {
  const schemaBlocks = schemas.filter(Boolean).map(s =>
    `<script type="application/ld+json">${jsonForHtml(s)}</script>`
  ).join('\n');

  const head = `
  <title>${xe(title)}</title>
  <meta name="description" content="${xe(desc)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  ${verification ? `<meta name="google-site-verification" content="${xe(verification)}">` : ''}
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
  const script = `<script>window.__STOREKIT__=${jsonForHtml(config)};window.__STOREKIT_SEO__=${jsonForHtml(seoConfig)};</script>`;
  return html.replace('</head>', `${script}\n</head>`);
}

// ── Schema helpers ─────────────────────────────────────────────────────────────
function buildProductTitle(product, storeName) {
  const brand = product.brand ? `${product.brand} ` : '';
  const price = hasValidSale(product) ? product.salePrice : product.price;
  return `${brand}${product.name} — Price in Sri Lanka Rs.${price?.toLocaleString()} | ${storeName}`;
}

function hasValidSale(product) {
  return product?.isOnSale === true
    && Number(product.salePrice) > 0
    && Number(product.salePrice) < Number(product.price);
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
  const price = hasValidSale(product) ? product.salePrice : product.price;
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
  let origin = '';
  try { origin = new URL(listUrl).origin; } catch { origin = ''; }
  return {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: listName, url: listUrl,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 20).map((p, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: `${origin}/product/${p.slug}`,
      name: p.name,
      image: absoluteUrl(p.thumbnail || p.images?.[0], origin) || undefined,
    })),
  };
}

// ── seoRenderMiddleware — per-tenant SSR for bots ────────────────────────────
const seoRenderMiddleware = async (req, res) => {
  if (req.path.startsWith('/api/') || req.path.match(/\.(js|css|png|jpg|ico|svg|json|xml|txt|woff2?)$/))
    return res.status(404).send('Not found');

  const html = await getHtmlTemplate();
  if (!html) return res.status(500).send('SEO renderer unavailable.');

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
  const injectTenantMeta = (markup, options) => injectMeta(markup, {
    ...options,
    verification: googleVerificationToken(tenantSettings.googleSearchConsole),
  });
  const returnPolicy = buildReturnPolicy(tenantSettings);
  if (returnPolicy) returnPolicy['@id'] = `${siteUrl}/returns#policy`;

  const orgSchema = {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: storeName, url: siteUrl,
    ...(logoUrl ? { logo: { '@type': 'ImageObject', url: logoUrl, width: 512, height: 512 } } : {}),
    ...(returnPolicy ? { hasMerchantReturnPolicy: returnPolicy } : {}),
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
        const eligibility = productSeoAudit(product, { siteUrl });
        if (!eligibility.eligible) {
          return noIndexResponse(res, 200, `<!doctype html><html><head><meta name="robots" content="noindex,follow"><title>${xe(product.name)}</title></head><body><h1>${xe(product.name)}</h1><p>This product page is awaiting complete product information.</p></body></html>`);
        }
        const metaTitle    = buildProductTitle(product, storeName);
        const plainDesc    = String(product.shortDescription || product.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const hasSale      = hasValidSale(product);
        const activePrice  = hasSale ? product.salePrice : product.price;
        const priceText    = hasSale ? `Rs.${product.salePrice.toLocaleString()} (was Rs.${product.price.toLocaleString()})` : `Rs.${product.price?.toLocaleString()}`;
        const _raw         = (plainDesc.split('.')[0] || plainDesc).trim();
        const baseDesc     = _raw.length <= 85 ? _raw : _raw.slice(0, _raw.lastIndexOf(' ', 85));
        const metaDesc     = `${baseDesc || product.name}. ${priceText}. Check live stock and order from ${storeName}.`.slice(0, 165);
        const allImages    = [product.thumbnail, ...(product.images || [])].map(image => absoluteUrl(image, siteUrl)).filter(Boolean);
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
          ...gtinProperty(product.gtin),
          ...(product.mpn ? { mpn: product.mpn } : {}),
          ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
          offers: {
            '@type': 'Offer', url: productUrl,
            priceCurrency: normalizeCurrency(seoSettings.currencyCode || tenantSettings.currency),
            price: Number(activePrice),
            ...(hasSale && product.saleEndsAt && !Number.isNaN(new Date(product.saleEndsAt).getTime()) ? {
              priceValidUntil: new Date(product.saleEndsAt).toISOString().split('T')[0],
            } : {}),
            availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: schemaCondition(product.condition),
            seller: { '@type': 'Organization', name: storeName },
            shippingDetails: buildShippingDetails(tenantSettings, seoSettings.currencyCode || tenantSettings.currency),
            ...(returnPolicy ? { hasMerchantReturnPolicy: { '@id': `${siteUrl}/returns#policy` } } : {}),
          },
          ...(product.ratings?.count > 0 ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(product.ratings.average.toFixed(1)),
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

        const metadataHtml = injectTenantMeta(html, { title: metaTitle, desc: metaDesc, canonical: productUrl, ogImage, ogType: 'product', keywords, schemas: [schema, breadcrumb, orgSchema] });
        const out = injectVisibleContent(metadataHtml, `<article>
          <nav><a href="${xe(siteUrl)}">Home</a> · <a href="${xe(`${siteUrl}/shop`)}">Shop</a></nav>
          <h1>${xe(product.name)}</h1>
          ${ogImage ? `<img src="${xe(ogImage)}" alt="${xe(product.name)}" width="800" height="800">` : ''}
          <p>${xe(schemaDesc)}</p>
          <p><strong>${xe(normalizeCurrency(seoSettings.currencyCode || tenantSettings.currency))} ${Number(activePrice).toFixed(2)}</strong></p>
          <p>${product.stock > 0 ? `In stock (${Number(product.stock)} available)` : 'Out of stock'}</p>
        </article>`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return res.status(200).send(injectWindowConfig(out, tenantInfo));
      }
      return noIndexResponse(res, 404, '<!doctype html><meta name="robots" content="noindex"><title>Product not found</title><h1>Product not found</h1>');
    } catch (err) { console.error('[SSR product]', err.message); return noIndexResponse(res, 503, 'Product SEO temporarily unavailable'); }
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
        const desc     = plainCatDesc.slice(0, 155) || `Browse ${cat.name} at ${storeName}. See current prices, product details, and live stock status.`;
        const keywords = `${cat.name}, buy ${cat.name} online sri lanka, ${storeName}`;

        const [featuredProduct, catProducts] = await Promise.all([
          Product.findOne(tenantFilter(tenantId, { category: cat._id, isActive: true, thumbnail: { $exists: true, $ne: '' } })).lean(),
          Product.find(tenantFilter(tenantId, { category: cat._id, isActive: true }), 'name slug thumbnail images brand price salePrice stock ratings').limit(20).lean(),
        ]);
        if (!catProducts.length) return noIndexResponse(res, 404, '<!doctype html><meta name="robots" content="noindex"><title>Category has no products</title><h1>Category has no products</h1>');
        const ogImage = featuredProduct?.thumbnail || fallbackOgImage;

        const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Shop', item: `${siteUrl}/shop` },
          { '@type': 'ListItem', position: 3, name: cat.name, item: catUrl },
        ]};
        const itemListSchema = buildItemListSchema(catProducts, catUrl, `${cat.name} — Buy Online`);
        const metadataHtml = injectTenantMeta(html, { title, desc, canonical: catUrl, ogImage, ogType: 'website', keywords, schemas: [breadcrumb, orgSchema, itemListSchema].filter(Boolean) });
        const out = injectVisibleContent(metadataHtml, `<section><h1>${xe(cat.name)}</h1><p>${xe(desc)}</p><ul>${catProducts.map(product => `<li><a href="${xe(`${siteUrl}/product/${product.slug}`)}">${xe(product.name)}</a></li>`).join('')}</ul></section>`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return res.status(200).send(injectWindowConfig(out, tenantInfo));
      }
      return noIndexResponse(res, 404, '<!doctype html><meta name="robots" content="noindex"><title>Category not found</title><h1>Category not found</h1>');
    } catch (err) { console.error('[SSR category]', err.message); return noIndexResponse(res, 503, 'Category SEO temporarily unavailable'); }
  }

  // ── /brand/:slug ─────────────────────────────────────────────────────────────
  const brandMatch = req.path.match(/^\/brand\/([^/]+)$/);
  if (brandMatch) {
    try {
      const slug      = brandMatch[1];
      const brandNames = await Product.distinct('brand', tenantFilter(tenantId, { isActive: true, brand: { $nin: [null, ''] } }));
      const brandName = brandNames.find(name => publicSlug(name) === slug);
      if (!brandName) return noIndexResponse(res, 404, '<!doctype html><meta name="robots" content="noindex"><title>Brand not found</title><h1>Brand not found</h1>');
      const brandUrl  = `${siteUrl}/brand/${slug}`;
      const title     = `${brandName} Products — Buy Online in Sri Lanka | ${storeName}`;
      const desc      = `Browse ${brandName} products at ${storeName}. See current prices, product details, and live stock status.`;
      const keywords  = `${brandName}, buy ${brandName} online sri lanka, ${storeName}`;

      const [featuredProduct, brandProducts] = await Promise.all([
        Product.findOne(tenantFilter(tenantId, { brand: brandName, isActive: true, thumbnail: { $exists: true, $ne: '' } })).lean(),
        Product.find(tenantFilter(tenantId, { brand: brandName, isActive: true }), 'name slug thumbnail brand price salePrice stock').limit(20).lean(),
      ]);
      if (!brandProducts.length) return noIndexResponse(res, 404, '<!doctype html><meta name="robots" content="noindex"><title>Brand not found</title><h1>Brand not found</h1>');
      const ogImage = featuredProduct?.thumbnail || fallbackOgImage;

      const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Shop', item: `${siteUrl}/shop` },
        { '@type': 'ListItem', position: 3, name: `${brandName} Products`, item: brandUrl },
      ]};
      const itemListSchema = buildItemListSchema(brandProducts, brandUrl, `${brandName} Products`);
      const metadataHtml = injectTenantMeta(html, { title, desc, canonical: brandUrl, ogImage, ogType: 'website', keywords, schemas: [breadcrumb, orgSchema, itemListSchema].filter(Boolean) });
      const out = injectVisibleContent(metadataHtml, `<section><h1>${xe(`${brandName} Products`)}</h1><p>${xe(desc)}</p><ul>${brandProducts.map(product => `<li><a href="${xe(`${siteUrl}/product/${product.slug}`)}">${xe(product.name)}</a></li>`).join('')}</ul></section>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).send(injectWindowConfig(out, tenantInfo));
    } catch (err) { console.error('[SSR brand]', err.message); return noIndexResponse(res, 503, 'Brand SEO temporarily unavailable'); }
  }

  // ── /page/:slug ──────────────────────────────────────────────────────────────
  const businessPageMatch = req.path.match(/^\/page\/([^/]+)$/);
  if (businessPageMatch) {
    try {
      const page = await BusinessPage.findOne(tenantFilter(tenantId, { slug: businessPageMatch[1], isActive: true })).lean();
      if (!page) return noIndexResponse(res, 404, '<!doctype html><meta name="robots" content="noindex"><title>Page not found</title><h1>Page not found</h1>');
      const pageUrl = `${siteUrl}/page/${page.slug}`;
      const plainContent = stripHtml(page.content || '');
      const title = page.metaTitle || `${page.title} | ${storeName}`;
      const desc = stripHtml(page.metaDescription || plainContent).slice(0, 160) || `${page.title} at ${storeName}`;
      const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: page.title, item: pageUrl },
      ] };
      const metadataHtml = injectTenantMeta(html, { title, desc, canonical: pageUrl, ogImage: fallbackOgImage, ogType: 'website', keywords: `${page.title}, ${storeName}`, schemas: [breadcrumb, orgSchema] });
      const out = injectVisibleContent(metadataHtml, `<article><nav><a href="${xe(siteUrl)}">Home</a></nav><h1>${xe(page.title)}</h1><p>${xe(plainContent)}</p></article>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).send(injectWindowConfig(out, tenantInfo));
    } catch (err) { console.error('[SSR business page]', err.message); return noIndexResponse(res, 503, 'Page SEO temporarily unavailable'); }
  }

  // ── / (home) ─────────────────────────────────────────────────────────────────
  if (req.path === '/' || req.path === '') {
    try {
      const title   = tenantSettings.metaTitle || seoSettings.siteName || `${storeName} — Online Store`;
      const desc    = tenantSettings.metaDescription || seoSettings.defaultDescription || `Browse current products, prices, details, and live stock status at ${storeName}.`;
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

      const metadataHtml = injectTenantMeta(html, { title, desc, canonical: siteUrl, ogImage, ogType: 'website', keywords: storeName, schemas: [homeSchema, orgSchema] });
      const out = injectVisibleContent(metadataHtml, `<section><h1>${xe(storeName)}</h1><p>${xe(desc)}</p><a href="${xe(`${siteUrl}/shop`)}">Shop all products</a></section>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).send(injectWindowConfig(out, tenantInfo));
    } catch (err) { console.error('[SSR home]', err.message); return noIndexResponse(res, 503, 'Store SEO temporarily unavailable'); }
  }

  // ── /shop ────────────────────────────────────────────────────────────────────
  const legacyShopCategory = req.path.match(/^\/shop\/([^/]+)$/);
  if (legacyShopCategory) {
    const category = await Category.findOne(tenantFilter(tenantId, { slug: legacyShopCategory[1], isActive: true }), 'slug').lean();
    if (category) return res.redirect(301, `${siteUrl}/category/${category.slug}`);
    return noIndexResponse(res, 404, '<!doctype html><meta name="robots" content="noindex"><title>Category not found</title><h1>Category not found</h1>');
  }

  if (req.path === '/shop' || req.path.startsWith('/shop/')) {
    try {
      const title   = `Shop All Products | ${storeName}`;
      const desc    = `Browse all current products at ${storeName}, including prices, details, and live stock status.`;
      const products = await Product.find(tenantFilter(tenantId, { isActive: true }), 'name slug thumbnail images').sort({ updatedAt: -1 }).limit(100).lean();
      const itemListSchema = buildItemListSchema(products, `${siteUrl}/shop`, `Products at ${storeName}`);
      const metadataHtml = injectTenantMeta(html, { title, desc, canonical: `${siteUrl}/shop`, ogImage: fallbackOgImage, ogType: 'website', keywords: storeName, schemas: [orgSchema, itemListSchema].filter(Boolean) });
      const out = injectVisibleContent(metadataHtml, `<section><h1>Shop All Products</h1><p>${xe(desc)}</p><ul>${products.map(product => `<li><a href="${xe(`${siteUrl}/product/${product.slug}`)}">${xe(product.name)}</a></li>`).join('')}</ul></section>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).send(injectWindowConfig(out, tenantInfo));
    } catch (err) { console.error('[SSR shop]', err.message); return noIndexResponse(res, 503, 'Shop SEO temporarily unavailable'); }
  }

  // ── Default fallback — serve the SPA shell ────────────────────────────────────
  const out = injectTenantMeta(html, {
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
