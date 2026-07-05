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
const { Category, Settings, Review } = require('../models/index');
const Tenant           = require('../models/Tenant');
const { normalizeDomain } = require('../middleware/tenant');

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

// ── Tenant resolution helpers ─────────────────────────────────────────────────
/**
 * Resolve tenant from request.
 * Priority: X-Tenant-Domain header → x-forwarded-host → host
 * Returns { tenant, tenantId, siteUrl, storeName, tenantSettings }
 */
async function resolveTenantForSEO(req) {
  const rawDomain = normalizeDomain(
    req.headers['x-tenant-domain'] ||
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  );

  // Try DB lookup
  let tenant = null;
  if (rawDomain && rawDomain !== 'localhost' && rawDomain !== '127.0.0.1') {
    tenant = await Tenant.findOne({
      status: 'active',
      domains: { $elemMatch: { domain: rawDomain, active: true } },
    }).populate('plan').lean();
  }

  // Fallback: global settings
  const seoConfig = await Settings.findOne({ key: 'seo_config' }).lean();
  const globalSiteUrl = (seoConfig?.value?.siteUrl || process.env.FRONTEND_URL || 'https://storekit.lk').replace(/\/$/, '');

  if (!tenant) {
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
  const mergedConfig = { ...seoConfig?.value, ...tenantSeoConfig?.value };

  return {
    tenant,
    tenantId: tenant._id,
    siteUrl: tenantSeoConfig?.value?.siteUrl || siteUrl,
    storeName: mergedConfig.storeName || tenant.storeName || 'StoreKit',
    logoUrl: mergedConfig.logoUrl || tenant.settings?.logoUrl || '',
    ogImage: mergedConfig.ogImage || tenant.settings?.logoUrl || '',
    tenantSettings: mergedConfig,
  };
}

/**
 * Build a tenant-scoped MongoDB query filter.
 * Products/Categories/etc. must have a tenantId field to scope queries.
 * If no tenant is resolved (single-tenant mode), query is unscoped.
 */
function tenantFilter(tenantId, extra = {}) {
  if (!tenantId) return extra;
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
    const { siteUrl, tenantId } = await resolveTenantForSEO(req);
    const today = new Date().toISOString().split('T')[0];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${siteUrl}/api/seo/products-sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/api/seo/categories-sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/api/seo/brands-sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${siteUrl}/api/seo/pages-sitemap.xml</loc>
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
    const { siteUrl, tenantId, storeName } = await resolveTenantForSEO(req);
    const cached = getCached(tenantId, 'productsSitemap');
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

    setCached(tenantId, 'productsSitemap', xml);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('Products sitemap error:', err);
    res.status(500).send('<?xml version="1.0"?><error>Failed</error>');
  }
});

// ── GET /api/seo/categories-sitemap.xml — Per-tenant categories ──────────────
router.get('/categories-sitemap.xml', async (req, res) => {
  try {
    const { siteUrl, tenantId } = await resolveTenantForSEO(req);
    const cached = getCached(tenantId, 'categoriesSitemap');
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

    setCached(tenantId, 'categoriesSitemap', xml);
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
    const { siteUrl, tenantId } = await resolveTenantForSEO(req);
    const cached = getCached(tenantId, 'brandsSitemap');
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

    setCached(tenantId, 'brandsSitemap', xml);
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
    const { siteUrl, tenantId } = await resolveTenantForSEO(req);
    const today = new Date().toISOString().split('T')[0];

    const staticPages = [
      { path: '/',       priority: '1.0', changefreq: 'daily' },
      { path: '/shop',   priority: '0.9', changefreq: 'daily' },
    ];

    const entries = staticPages.map(p =>
      urlEntry(`${siteUrl}${p.path}`, today, p.changefreq, p.priority)
    );

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
    const { siteUrl, tenantId, tenant } = await resolveTenantForSEO(req);
    const txt = `# StoreKit — ${tenant?.storeName || 'Store'}
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
    res.json({
      siteUrl:     info.siteUrl,
      storeName:   info.storeName,
      logoUrl:     info.logoUrl,
      ogImage:     info.ogImage,
      metaTitle:   info.tenant?.settings?.metaTitle || info.storeName,
      metaDesc:    info.tenant?.settings?.metaDescription || `Shop online at ${info.storeName}`,
      currency:    info.tenant?.settings?.currency || 'LKR',
      country:     info.tenant?.settings?.country  || 'Sri Lanka',
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
    .replace(/<\/head>/, `${head}\n</head>`);
}

function injectWindowConfig(html, tenantInfo) {
  if (!tenantInfo) return html;
  const config = {
    siteUrl:   tenantInfo.siteUrl,
    storeName: tenantInfo.storeName,
    currency:  tenantInfo.tenant?.settings?.currency || 'LKR',
    tenantId:  tenantInfo.tenantId,
  };
  const script = `<script>window.__STOREKIT__=${JSON.stringify(config)};</script>`;
  return html.replace('</head>', `${script}\n</head>`);
}

// ── Schema helpers ─────────────────────────────────────────────────────────────
function buildProductTitle(product, storeName) {
  const brand = product.brand ? `${product.brand} ` : '';
  const price = product.salePrice || product.price;
  return `${brand}${product.name} — Price in Sri Lanka Rs.${price?.toLocaleString()} | ${storeName}`;
}

async function getReviewSchemas(productId, tenantId) {
  try {
    const reviews = await Review.find(
      tenantFilter(tenantId, { product: productId, status: 'approved' }),
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
  const price = product.salePrice || product.price;
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

  res.setHeader('Access-Control-Allow-Origin', siteUrl);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  const fallbackOgImage = defaultOgImage || logoUrl || '';

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
        const priceText    = product.salePrice ? `Rs.${product.salePrice.toLocaleString()} (was Rs.${product.price.toLocaleString()})` : `Rs.${product.price?.toLocaleString()}`;
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
            '@type': 'Offer', url: productUrl, priceCurrency: tenantInfo.tenant?.settings?.currency || 'LKR',
            price: String(product.salePrice || product.price),
            priceValidUntil: product.saleEndsAt
              ? new Date(product.saleEndsAt).toISOString().split('T')[0]
              : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@type': 'Organization', name: storeName },
            shippingDetails: {
              '@type': 'OfferShippingDetails',
              shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: tenantInfo.tenant?.settings?.currency || 'LKR' },
              deliveryTime: {
                '@type': 'ShippingDeliveryTime',
                handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
                transitTime:  { '@type': 'QuantitativeValue', minValue: 1, maxValue: 5, unitCode: 'DAY' },
              },
              shippingDestination: { '@type': 'DefinedRegion', addressCountry: tenantInfo.tenant?.settings?.country ? 'LK' : 'LK' },
            },
            hasMerchantReturnPolicy: {
              '@type': 'MerchantReturnPolicy',
              applicableCountry: 'LK',
              returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
              merchantReturnDays: 14, returnMethod: 'https://schema.org/ReturnByMail',
              returnFees: 'https://schema.org/FreeReturn',
            },
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

        const faqSchema = buildProductFAQ(product, siteUrl, storeName);
        const out = injectMeta(html, { title: metaTitle, desc: metaDesc, canonical: productUrl, ogImage, ogType: 'product', keywords, schemas: [schema, breadcrumb, orgSchema, faqSchema] });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return res.status(200).send(injectWindowConfig(out, tenantInfo));
      }
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
        const faqSchema      = buildCategoryFAQ(cat.name, siteUrl);
        const itemListSchema = buildItemListSchema(catProducts, catUrl, `${cat.name} — Buy Online`);
        const out = injectMeta(html, { title, desc, canonical: catUrl, ogImage, ogType: 'website', keywords, schemas: [breadcrumb, orgSchema, faqSchema, itemListSchema].filter(Boolean) });
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
      const faqSchema      = buildBrandFAQ(brandName, siteUrl, slug);
      const itemListSchema = buildItemListSchema(brandProducts, brandUrl, `${brandName} Products`);
      const out = injectMeta(html, { title, desc, canonical: brandUrl, ogImage, ogType: 'website', keywords, schemas: [breadcrumb, orgSchema, faqSchema, itemListSchema].filter(Boolean) });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).send(injectWindowConfig(out, tenantInfo));
    } catch (err) { console.error('[SSR brand]', err.message); }
  }

  // ── / (home) ─────────────────────────────────────────────────────────────────
  if (req.path === '/' || req.path === '') {
    try {
      const title   = tenantInfo.tenant?.settings?.metaTitle || `${storeName} — Online Store`;
      const desc    = tenantInfo.tenant?.settings?.metaDescription || `Shop online at ${storeName}. Fast delivery, best prices.`;
      const ogImage = fallbackOgImage;

      const homeSchema = {
        '@context': 'https://schema.org', '@type': 'WebSite',
        name: storeName, url: siteUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/shop?q={search_term_string}` },
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
    title:     tenantInfo.tenant?.settings?.metaTitle || `${storeName} — Online Store`,
    desc:      tenantInfo.tenant?.settings?.metaDescription || `Shop at ${storeName}`,
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
