/**
 * useSEO.js — Dynamic SEO + Meta Pixel Advanced Matching for StoreKit
 *
 * Changes in this version:
 *  - Every pixel event now carries Advanced Matching data (em, ph, fn, ln, ct)
 *    collected from the logged-in user or the checkout billing form.
 *  - Every pixel event now carries an eventId for server-side CAPI deduplication.
 *  - trackPurchase / trackAddToCart / trackInitiateCheckout / trackViewItem
 *    all accept an optional { billing, eventId } options object.
 *  - getAdvancedMatchingData() and generateEventId() are imported from
 *    metaPixelHelpers so the browser pixel and CAPI always use the same values.
 */

import { useEffect } from 'react';
import { fbqSafe } from './useAnalytics';
import { analyticsConsentAllowed } from '../components/CookieConsent';
import { useLocation } from 'react-router-dom';
import {
  generateEventId,
  getAdvancedMatchingData,
  sendCapiRequest,
} from '../utils/metaPixelHelpers';

// ─── DOM meta helpers ─────────────────────────────────────────────────────────
function setMeta(name, content, attr = 'name') {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel, href) {
  if (!href) return;
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function ssrSchemaExists(schemaType) {
  const expectedTypes = schemaType === 'Product'
    ? new Set(['Product', 'ProductGroup'])
    : new Set([schemaType]);
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    if (s.id && s.id.startsWith('ld-')) continue;
    try {
      const data = JSON.parse(s.textContent);
      if (expectedTypes.has(data['@type'])) return true;
      if (Array.isArray(data['@graph'])) {
        if (data['@graph'].some(node => expectedTypes.has(node['@type']))) return true;
      }
    } catch { }
  }
  return false;
}

function setJsonLd(id, data, { bypassSsrCheck = false } = {}) {
  if (!bypassSsrCheck && data['@type'] && ssrSchemaExists(data['@type'])) {
    removeJsonLd(id);
    return;
  }
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function removeJsonLd(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ─── Config helpers ───────────────────────────────────────────────────────────
export function getSeoConfig() {
  return window.__STOREKIT_SEO__ || {};
}

/**
 * Returns a Meta Pixel-safe ISO 4217 currency code.
 * Meta validates 'currency' on Purchase/AddToCart — invalid codes silently
 * drop the event. This normalises whatever is stored in admin settings.
 */
export function getPixelCurrency() {
  const raw = getSeoConfig().currencyCode;
  if (raw && /^[A-Z]{3}$/.test(raw.trim().toUpperCase())) {
    return raw.trim().toUpperCase();
  }
  return 'LKR';
}

function effectiveProductPrice(product = {}) {
  return product.isOnSale === true
    && Number(product.salePrice) > 0
    && Number(product.salePrice) < Number(product.price)
    ? Number(product.salePrice)
    : Number(product.price);
}

// ─── Advanced Matching for pixel fbq('init') ──────────────────────────────────
/**
 * Re-initialise the pixel with Advanced Matching data for a known user.
 * Call this once after login or when billing data becomes available.
 * Safe to call multiple times — guarded by window.__fbAdvancedMatchApplied.
 *
 * @param {object} billing — { email, phone, firstName, lastName, city, country }
 */
export function applyAdvancedMatching(billing = {}) {
  const cfg = getSeoConfig();
  if (!cfg.metaPixelId && !window.__fbPixelInitIds) return;
  const pixelId = cfg.metaPixelId || Object.keys(window.__fbPixelInitIds || {})[0];
  if (!pixelId || !window.fbq || !analyticsConsentAllowed()) return;

  // Only re-init if we haven't already applied matching in this session
  const matchKey = `__fbAM_${pixelId}`;
  if (window[matchKey]) return;
  window[matchKey] = true;

  const matchData = getAdvancedMatchingData(billing);
  if (matchData && Object.keys(matchData).length) {
    // Re-initialise with matching data — Meta merges with existing init
    window.fbq('init', pixelId, matchData);
    console.log('[Meta Pixel] Advanced Matching applied:', Object.keys(matchData));
  }
}

// ─── GA4 helpers ──────────────────────────────────────────────────────────────
export function trackPageView(url, title) {
  const { ga4Id } = getSeoConfig();
  if (ga4Id && window.gtag) {
    window.gtag('config', ga4Id, { page_path: url, page_title: title });
  }
}

export function trackEvent(eventName, params = {}) {
  if (window.gtag) window.gtag('event', eventName, params);
  fbqSafe('track', eventName, params);
}

// ─── Purchase ─────────────────────────────────────────────────────────────────
/**
 * @param {object} order   — API response from POST /orders
 * @param {Array}  items   — line items with { product, name, price, quantity }
 * @param {object} [opts]  — { billing, eventId }
 *   billing: raw PII from the checkout form (for Advanced Matching)
 *   eventId: pre-generated dedup key (if not supplied, one is generated)
 */
export function trackPurchase(order, items, opts = {}) {
  const value = typeof order.total === 'number' ? order.total
    : typeof order.grandTotal === 'number' ? order.grandTotal
    : null;

  if (value === null) {
    console.warn('[StoreKit] trackPurchase: order.total missing, skipping', order);
    return;
  }

  const currency      = getPixelCurrency();
  const transactionId = String(order._id || order.orderNumber || '');
  // Handle all item shapes: populated order items, raw ObjectId, cart items, explicit productId
  // Resolve product ID from all possible item shapes the order/cart may use.
  // Cart items:  i._id = product _id (spread from product object)
  // Order items: i.product._id (populated) or i.product (ObjectId string)
  // Fallback items created in Checkout.js: i.product._id
  const contentIds    = items.map(i =>
    String(i.product?._id || i.product || i.productId || i._id || '')
  ).filter(id => id && id !== 'undefined' && id !== 'null' && id.length > 5);
  const numItems      = items.reduce((s, i) => s + (typeof i.quantity === 'number' ? i.quantity : 1), 0);
  const eventId       = opts.eventId || generateEventId('Purchase', order._id || order.orderNumber);
  const billing       = opts.billing || {};

  // ── Apply Advanced Matching if we have billing data ──────────────────────
  if (billing.email || billing.phone) {
    applyAdvancedMatching(billing);
  }

  // ── GA4 ──────────────────────────────────────────────────────────────────
  if (window.gtag) {
    window.gtag('event', 'purchase', {
      transaction_id: transactionId,
      value,
      currency,
      items: items.map(i => ({
        item_id:   String(i.product?._id || i.productId || ''),
        item_name: i.name || '',
        price:     typeof i.price === 'number' ? i.price : 0,
        quantity:  typeof i.quantity === 'number' ? i.quantity : 1,
      })),
    });
  }

  // ── Meta Pixel (browser) ─────────────────────────────────────────────────
  // eventId links this browser event to the backend CAPI event for dedup.
  // IMPORTANT: Do NOT call sendCapiRequest here for Purchase — the backend
  // routes/orders.js already calls sendPurchaseEvent() with the same eventId
  // (sent as metaEventId in the order POST body). Calling CAPI from both
  // frontend AND backend produces TWO server-side events, which shows as
  // two "Processed" rows in Meta Events Manager instead of one deduplicated pair.
  // Correct dedup chain: browser pixel (eventID: X) ↔ backend CAPI (event_id: X) = 1 conversion.
  fbqSafe('track', 'Purchase', {
    value,
    currency,
    content_ids:  contentIds,
    content_type: 'product',
    num_items:    numItems,
  }, { eventID: eventId });
}

// ─── Add To Cart ──────────────────────────────────────────────────────────────
/**
 * @param {object} product — { _id, name, price, salePrice, ... }
 * @param {number} quantity
 * @param {object} [opts]  — { billing, eventId }
 */
export function trackAddToCart(product, quantity = 1, opts = {}) {
  const price    = effectiveProductPrice(product) || 0;
  const value    = price * (typeof quantity === 'number' ? quantity : 1);
  const currency = getPixelCurrency();
  const id       = String(product._id || '');
  const eventId  = opts.eventId || generateEventId('AddToCart', product._id);
  const billing  = opts.billing || {};

  if (window.gtag) {
    window.gtag('event', 'add_to_cart', {
      currency,
      value,
      items: [{ item_id: id, item_name: product.name || '', price, quantity }],
    });
  }

  fbqSafe('track', 'AddToCart', {
    content_ids:  [id],
    content_name: product.name || '',
    content_type: 'product',
    value,
    currency,
  }, { eventID: eventId });

  sendCapiRequest('AddToCart', {
    value,
    currency,
    contentIds:  [id],
    contentType: 'product',
    numItems:    quantity,
  }, eventId, billing);
}

// ─── View Content ─────────────────────────────────────────────────────────────
/**
 * @param {object} product — product object
 * @param {object} [opts]  — { billing, eventId }
 */
export function trackViewItem(product, opts = {}) {
  const price    = effectiveProductPrice(product) || 0;
  const currency = getPixelCurrency();
  const id       = String(product._id || '');
  const eventId  = opts.eventId || generateEventId('ViewContent', product._id);

  if (window.gtag) {
    window.gtag('event', 'view_item', {
      currency,
      value: price,
      items: [{ item_id: id, item_name: product.name || '', price }],
    });
  }

  fbqSafe('track', 'ViewContent', {
    content_ids:  [id],
    content_name: product.name || '',
    content_type: 'product',
    value:        price,
    currency,
  }, { eventID: eventId });

  sendCapiRequest('ViewContent', {
    value:       price,
    currency,
    contentIds:  [id],
    contentType: 'product',
    numItems:    1,
  }, eventId, {});
}

// ─── Initiate Checkout ────────────────────────────────────────────────────────
/**
 * @param {Array}  items   — cart items
 * @param {number} value   — cart total
 * @param {object} [opts]  — { billing, eventId }
 */
export function trackInitiateCheckout(items = [], value = 0, opts = {}) {
  const currency   = getPixelCurrency();
  const safeValue  = typeof value === 'number' ? value : 0;
  const contentIds = items.map(i => String(i._id || i.productId || i.product?._id || i.product || '')).filter(id => id && id !== 'undefined' && id !== 'null');
  const numItems   = items.reduce((s, i) => s + (typeof i.quantity === 'number' ? i.quantity : 1), 0);
  const eventId    = opts.eventId || generateEventId('InitiateCheckout', safeValue);
  const billing    = opts.billing || {};

  if (billing.email || billing.phone) {
    applyAdvancedMatching(billing);
  }

  if (window.gtag) {
    window.gtag('event', 'begin_checkout', {
      currency,
      value: safeValue,
      items: items.map(i => ({
        item_id:   String(i._id || i.productId || ''),
        item_name: i.name || '',
        price:     Number(i.salePrice || i.price) || 0,
        quantity:  typeof i.quantity === 'number' ? i.quantity : 1,
      })),
    });
  }

  fbqSafe('track', 'InitiateCheckout', {
    content_ids: contentIds,
    num_items:   numItems,
    value:       safeValue,
    currency,
  }, { eventID: eventId });

  sendCapiRequest('InitiateCheckout', {
    value:       safeValue,
    currency,
    contentIds,
    contentType: 'product',
    numItems,
  }, eventId, billing);
}

// ─── Main SEO hook ────────────────────────────────────────────────────────────
export default function useSEO({
  title,
  description,
  image,
  url,
  type = 'website',
  product,
  reviews,
  breadcrumbs,
  noindex = false,
  noindexFollow = false,
  keywords,
} = {}) {
  const location = useLocation();
  const cfg = getSeoConfig();

  const siteName      = cfg.siteName       || 'Online Store';
  const siteUrl       = cfg.siteUrl        || window.location.origin;
  const twitterHandle = cfg.twitterHandle  || '';
  const defaultImage  = cfg.defaultOgImage || `${siteUrl}/og-default.png`;
  const defaultDesc   = cfg.defaultDescription || 'Browse current products, prices, details, and live stock status.';

  let finalTitle;
  if (title && type === 'product') {
    const withPriceSuffix = `${title} Price in Sri Lanka | ${siteName}`;
    const withShort       = `${title} | ${siteName}`;
    finalTitle = withPriceSuffix.length <= 65
      ? withPriceSuffix
      : withShort.length <= 65
        ? withShort
        : title.slice(0, 50) + ` | ${siteName}`;
  } else {
    finalTitle = title ? `${title} | ${siteName}` : siteName;
  }

  let finalDesc;
  if (description) {
    finalDesc = description;
  } else if (type === 'product' && product) {
    const price     = effectiveProductPrice(product);
    const origPrice = price !== Number(product.price) ? Number(product.price) : null;
    const priceStr  = price ? `Rs.${price.toLocaleString()}` : '';
    const wasStr    = origPrice && origPrice !== price ? ` (was Rs.${origPrice.toLocaleString()})` : '';
    const brand     = product.brand ? `${product.brand} ` : '';
    const plain     = String(product.shortDescription || product.description || '')
                        .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const snippet   = plain.slice(0, 80) || `${brand}${product.name}`;
    finalDesc = priceStr
      ? `${snippet}. ${priceStr}${wasStr}. Check live stock and order from ${siteName}.`.slice(0, 165)
      : `${snippet}. View ${brand}${product.name}, live stock, and ordering details at ${siteName}.`.slice(0, 165);
  } else {
    finalDesc = defaultDesc;
  }

  function buildOgImage(rawUrl) {
    if (!rawUrl || !rawUrl.includes('res.cloudinary.com')) return rawUrl;
    return rawUrl.replace(/\/upload\/(v\d+\/)?/, '/upload/w_1200,h_630,c_fill,g_auto,f_jpg,q_auto/$1');
  }
  const finalImage = buildOgImage(image || defaultImage);

  function buildCanonical(explicitUrl) {
    if (explicitUrl) return explicitUrl;
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    [...params.keys()].forEach((key) => {
      if (/^(utm_|fbclid|gclid|msclkid|ref|igshid)/i.test(key)) params.delete(key);
    });
    const query = params.toString();
    return `${siteUrl}${path}${query ? `?${query}` : ''}`;
  }
  const finalUrl = buildCanonical(url);

  useEffect(() => {
    document.title = finalTitle;

    setMeta('description', finalDesc);
    const robotsValue = noindex
      ? 'noindex,nofollow'
      : noindexFollow
        ? 'noindex,follow'
        : 'index,follow,max-image-preview:large';
    setMeta('robots', robotsValue);

    let kwString = keywords;
    if (!kwString && product) {
      const nameLc  = product.name.toLowerCase();
      const brand   = product.brand || '';
      const catName = product.category?.name || '';
      const base    = [product.name, brand, product.sku, catName, ...(product.tags || [])].filter(Boolean);
      const intent  = [
        `${nameLc} price in sri lanka`,
        `buy ${brand} ${product.name}`.trim() + ' online sri lanka',
        `${nameLc} price`,
        `colombo delivery ${nameLc}`,
        brand ? `${brand.toLowerCase()} products sri lanka` : null,
        'sri lanka',
      ].filter(Boolean);
      kwString = [...base, ...intent].join(', ');
    }
    if (kwString) setMeta('keywords', kwString);
    setLink('canonical', finalUrl);

    setMeta('og:type',         type,       'property');
    setMeta('og:title',        finalTitle, 'property');
    setMeta('og:description',  finalDesc,  'property');
    setMeta('og:image',        finalImage, 'property');
    setMeta('og:image:width',  '1200',     'property');
    setMeta('og:image:height', '630',      'property');
    setMeta('og:image:alt',    finalTitle, 'property');
    setMeta('og:url',          finalUrl,   'property');
    setMeta('og:site_name',    siteName,   'property');
    setMeta('og:locale',       'en_LK',    'property');

    setMeta('twitter:card',        finalImage ? 'summary_large_image' : 'summary');
    setMeta('twitter:title',       finalTitle);
    setMeta('twitter:description', finalDesc);
    setMeta('twitter:image',       finalImage);
    setMeta('twitter:image:alt',   finalTitle);
    if (twitterHandle) setMeta('twitter:site', twitterHandle);

    setJsonLd('ld-website', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteName,
      url: siteUrl,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/shop?search={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    });

    {
      const sameAs = [
        cfg.facebookUrl, cfg.instagramUrl, cfg.twitterUrl,
        cfg.linkedinUrl, cfg.youtubeUrl, cfg.tiktokUrl, cfg.whatsappUrl,
      ].filter(Boolean);

      setJsonLd('ld-org', {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: cfg.orgName || siteName,
        url: siteUrl,
        logo: cfg.logoUrl
          ? { '@type': 'ImageObject', url: cfg.logoUrl, width: 600, height: 60 }
          : { '@type': 'ImageObject', url: `${siteUrl}/og-default.png` },
        contactPoint: cfg.phone ? [{
          '@type': 'ContactPoint',
          telephone: cfg.phone,
          contactType: 'customer service',
        }] : undefined,
        sameAs: sameAs.length ? sameAs : undefined,
      });
    }

    if (product) {
      const hasSale = product.isOnSale === true
        && Number(product.salePrice) > 0
        && Number(product.salePrice) < Number(product.price);
      const price = hasSale ? product.salePrice : product.price;
      const availability = product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
      const imageArr = [...new Set([product.thumbnail, ...(product.images || [])].filter(Boolean))];
      const rawCurrency = String(cfg.currencyCode || 'LKR').trim().toUpperCase();
      const priceCurrency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : 'LKR';

      const productSchema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: String(product.shortDescription || product.description || '')
                       .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || product.name,
        image: imageArr.length > 0 ? imageArr : undefined,
        sku: product.sku || product._id,
        ...([8,12,13,14].includes(String(product.gtin||'').replace(/\D/g,'').length)
          ? { [`gtin${String(product.gtin).replace(/\D/g,'').length}`]: String(product.gtin).replace(/\D/g,'') }
          : {}),
        mpn: product.mpn || undefined,
        brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
        offers: {
          '@type': 'Offer',
          url: finalUrl,
          priceCurrency,
          price: Number(price),
          availability,
          itemCondition: product.condition === 'used'
            ? 'https://schema.org/UsedCondition'
            : product.condition === 'refurbished'
              ? 'https://schema.org/RefurbishedCondition'
              : 'https://schema.org/NewCondition',
          ...(hasSale && product.saleEndsAt && !Number.isNaN(new Date(product.saleEndsAt).getTime()) ? {
            priceValidUntil: new Date(product.saleEndsAt).toISOString().split('T')[0],
          } : {}),
          seller: { '@type': 'Organization', name: siteName },
        },
      };

      if (product.ratings?.count >= 1) {
        productSchema.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: Number(product.ratings.average).toFixed(1),
          reviewCount: product.ratings.count,
          bestRating: '5',
          worstRating: '1',
        };
      }

      if (reviews?.length > 0) {
        productSchema.review = reviews.slice(0, 10).map(r => {
          const schema = {
            '@type': 'Review',
            reviewRating: {
              '@type': 'Rating',
              ratingValue: String(r.rating),
              bestRating: '5',
              worstRating: '1',
            },
            author: {
              '@type': 'Person',
              name: r.user
                ? `${r.user.firstName || ''}${r.user.lastName ? ' ' + r.user.lastName : ''}`.trim() || 'Customer'
                : 'Customer',
            },
            datePublished: r.createdAt
              ? new Date(r.createdAt).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
          };
          if (r.title)   schema.name = r.title;
          if (r.comment) schema.reviewBody = r.comment;
          if (r.isVerifiedPurchase) schema.reviewAspect = 'Verified Purchase';
          return schema;
        });
      }

      setJsonLd('ld-product', productSchema);
    } else {
      removeJsonLd('ld-product');
    }

    if (breadcrumbs?.length) {
      setJsonLd('ld-breadcrumb', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
          ...breadcrumbs.map((b, i) => ({
            '@type': 'ListItem',
            position: i + 2,
            name: b.name,
            item: b.url.startsWith('http') ? b.url : `${siteUrl}${b.url}`,
          })),
        ],
      });
    } else {
      removeJsonLd('ld-breadcrumb');
    }

    trackPageView(location.pathname + location.search, finalTitle);
    fbqSafe('track', 'PageView');
    if (window.dataLayer) {
      window.dataLayer.push({ event: 'pageview', page: { url: finalUrl, title: finalTitle } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalTitle, finalDesc, finalImage, finalUrl, type, noindex, noindexFollow, keywords, location.pathname, reviews]);
}
