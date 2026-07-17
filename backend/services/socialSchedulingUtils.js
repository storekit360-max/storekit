'use strict';

const crypto = require('crypto');

const PLATFORM_LIMITS = { facebook: 63206, instagram: 2200 };
const VALID_PLATFORMS = ['facebook', 'instagram'];
const VALID_CTAS = ['none', 'shop_now', 'whatsapp'];
const FORBIDDEN_FEATURE_KEY = /(?:^|\b)(?:_?id|mongo|database|admin|internal|sku|slug|tenant|cost\s*price|created|updated|stock)(?:\b|$)/i;
const PLACEHOLDER_PATTERN = /(?:undefined|null|\{\{[^}]+\}\}|\[[A-Z][A-Z _-]+\])/i;

function cleanText(value, max = 240) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isPublicHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' && !['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch { return false; }
}

function normalizeSiteUrl(value) {
  if (!isPublicHttpsUrl(value)) return '';
  return String(value).replace(/\/+$/, '');
}

function selectTenantSiteUrl(tenant) {
  const configured = normalizeSiteUrl(tenant?.settings?.siteUrl);
  if (configured) return configured;
  const domains = (tenant?.domains || []).filter(domain => domain.active && domain.domain);
  const selected = domains.find(domain => domain.type === 'primary')
    || domains.find(domain => domain.type === 'system')
    || domains[0];
  return selected ? normalizeSiteUrl(`https://${selected.domain}`) : '';
}

function normalizeHashtag(value) {
  const compact = cleanText(value, 60).replace(/^#+/, '').replace(/[^\p{L}\p{N}]/gu, '');
  return compact ? `#${compact}` : '';
}

function uniqueStrings(values, max = Infinity) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    const key = cleaned.toLocaleLowerCase('en');
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= max) break;
  }
  return result;
}

function extractVerifiedFeatures(product) {
  const candidates = [];
  for (const spec of product?.specifications || []) {
    const key = cleanText(spec?.key, 80);
    const value = cleanText(spec?.value, 150);
    if (!key || !value || FORBIDDEN_FEATURE_KEY.test(key) || FORBIDDEN_FEATURE_KEY.test(value)) continue;
    candidates.push(`${key}: ${value}`);
  }

  if (candidates.length < 4) {
    const source = String(product?.shortDescription || product?.description || '')
      .replace(/<\/?(?:li|p|br)[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ');
    source.split(/\n|[•;]|\.(?=\s+[A-Z])/)
      .map(value => cleanText(value, 180))
      .filter(value => value.length >= 12 && !FORBIDDEN_FEATURE_KEY.test(value))
      .forEach(value => candidates.push(value));
  }

  const deduped = [];
  for (const candidate of uniqueStrings(candidates)) {
    const normalized = candidate.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim();
    const duplicate = deduped.some(existing => {
      const other = existing.normalized;
      return other === normalized || other.includes(normalized) || normalized.includes(other);
    });
    if (!duplicate) deduped.push({ value: candidate, normalized });
    if (deduped.length === 7) break;
  }
  return deduped.map(item => item.value);
}

function couponAppliesToProduct(coupon, product, now = new Date()) {
  if (!coupon || coupon.isActive !== true) return false;
  if (coupon.validFrom && new Date(coupon.validFrom) > now) return false;
  if (!coupon.validUntil || new Date(coupon.validUntil) < now) return false;
  if (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) return false;
  if (coupon.isNewUserOnly) return false;
  if (coupon.excludeSaleItems && Number(product.salePrice) > 0 && Number(product.salePrice) < Number(product.price)) return false;
  if ((coupon.excludedProducts || []).some(id => String(id?._id || id) === String(product._id))) return false;

  const productIds = (coupon.applicableProducts || []).map(id => String(id?._id || id));
  if (productIds.length) return productIds.includes(String(product._id));

  const categories = (coupon.applicableCategories || []).map(id => String(id?._id || id));
  const brands = (coupon.applicableBrands || []).map(value => String(value).toLocaleLowerCase('en'));
  const categoryMatch = !categories.length || categories.includes(String(product.category?._id || product.category));
  const brandMatch = !brands.length || brands.includes(String(product.brand || '').toLocaleLowerCase('en'));
  if (!categoryMatch || !brandMatch) return false;
  return Number(product.price) >= Number(coupon.minOrderAmount || 0);
}

function roundCurrency(value, unit = 1) {
  const safeUnit = Number(unit) > 0 ? Number(unit) : 1;
  return Math.round(Number(value) / safeUnit) * safeUnit;
}

function calculatePricing(product, { additionalDiscountPercent = 0, offerPrice = null, voucher = null, currencyUnit = 1 } = {}) {
  const regularPrice = Number(product?.price);
  if (!(regularPrice > 0)) throw new Error('Regular price must be greater than zero');
  const storedSale = Number(product?.salePrice);
  const validSalePrice = storedSale > 0 && storedSale < regularPrice ? storedSale : null;
  const basePrice = validSalePrice || regularPrice;
  let extraPercent = Number(additionalDiscountPercent || 0);
  if (!Number.isFinite(extraPercent) || extraPercent < 0 || extraPercent >= 100) throw new Error('Additional discount must be between 0 and 99');

  let promotionalPrice = basePrice;
  if (offerPrice !== null && offerPrice !== undefined && offerPrice !== '') {
    promotionalPrice = Number(offerPrice);
    if (!(promotionalPrice > 0) || promotionalPrice >= regularPrice) throw new Error('Offer price must be positive and lower than the regular price');
    extraPercent = Math.round((1 - promotionalPrice / basePrice) * 10000) / 100;
  } else if (extraPercent > 0) {
    promotionalPrice = roundCurrency(basePrice * (1 - extraPercent / 100), currencyUnit);
  }
  if (!(promotionalPrice > 0)) throw new Error('Calculated offer price must be greater than zero');

  let voucherDiscount = 0;
  if (voucher) {
    voucherDiscount = voucher.type === 'percentage'
      ? promotionalPrice * Number(voucher.value || 0) / 100
      : Number(voucher.value || 0);
    if (voucher.maxDiscount) voucherDiscount = Math.min(voucherDiscount, Number(voucher.maxDiscount));
    voucherDiscount = Math.min(promotionalPrice, Math.max(0, roundCurrency(voucherDiscount, currencyUnit)));
  }
  const finalPrice = Math.max(0, roundCurrency(promotionalPrice - voucherDiscount, currencyUnit));
  const discountPercent = finalPrice < regularPrice
    ? Math.round((1 - finalPrice / regularPrice) * 100)
    : 0;

  return {
    regularPrice,
    storedSalePrice: validSalePrice,
    sourcePrice: basePrice,
    promotionalPrice,
    voucherDiscount,
    finalPrice,
    discountPercent,
    additionalDiscountPercent: extraPercent,
    hasOffer: finalPrice > 0 && finalPrice < regularPrice,
  };
}

function currency(value, code = 'LKR') {
  return `${code === 'LKR' ? 'Rs.' : code} ${Number(value || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('94') && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

function buildWhatsAppUrl(phone, productName, productUrl) {
  const digits = formatPhone(phone).replace(/^0/, '94');
  if (!digits) return '';
  const message = `Hello, I would like to order ${productName}. ${productUrl}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function deriveHashtags({ tenant, product, categoryName }) {
  return uniqueStrings([
    normalizeHashtag(tenant?.storeName),
    normalizeHashtag(product?.brand),
    normalizeHashtag(categoryName),
    '#ShopOnline',
    '#SriLanka',
  ].filter(Boolean), 5);
}

function buildDescription({ platform, tenant, product, categoryName, pricing, voucher, features, hashtags, productUrl, cta, sinhalaEnabled }) {
  const storeName = cleanText(tenant?.storeName, 80) || 'Our Store';
  const code = String(tenant?.settings?.currencyCode || tenant?.settings?.currency || 'LKR').toUpperCase();
  const whatsappPhone = tenant?.settings?.whatsappNumber || tenant?.settings?.whatsapp || tenant?.settings?.storePhone || tenant?.settings?.phone || '';
  const whatsappUrl = buildWhatsAppUrl(whatsappPhone, product.name, productUrl);
  const lines = [];
  if (pricing.hasOffer) {
    lines.push(voucher ? `🎉🔥 ${pricing.discountPercent}% OFF WITH VOUCHER! 🔥🎉` : `🎉🔥 ${pricing.discountPercent}% OFF! 🔥🎉`);
  } else {
    lines.push(`✨ New at ${storeName}`);
  }
  lines.push('', `⚡ ${cleanText(product.name, 180)}`);
  if (pricing.hasOffer) {
    lines.push(`💥 Now Only: ${currency(pricing.finalPrice, code)}`, `Regular Price: ${currency(pricing.regularPrice, code)}`);
  } else {
    lines.push(`💰 Price: ${currency(pricing.regularPrice, code)}`);
  }

  const intro = cleanText(product.shortDescription || product.description, 220);
  if (intro) lines.push('', intro);
  if (features.length) {
    lines.push('', '✅ Main Features:', ...features.map(feature => `✅ ${feature}`));
  }
  if (voucher) lines.push('', '🎟️ Use Coupon Code:', String(voucher.code || '').toUpperCase());
  if (sinhalaEnabled) lines.push('', '🔥 **අදම Order කරන්න! Premium Quality එකත් හොඳම මිලත් එකම තැනින්.**');

  lines.push('', '🛒 Order Now', `🌐 ${productUrl}`);
  if (cta === 'whatsapp' && whatsappUrl) {
    lines.push('', '📲 WhatsApp Orders', whatsappUrl, `☎️ ${formatPhone(whatsappPhone)}`);
  }
  lines.push('', '🚚 Islandwide Delivery', '🔒 Secure Checkout', '', hashtags.join(' '));

  let description = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const limit = PLATFORM_LIMITS[platform] || 2200;
  if (description.length > limit) {
    const compactFeatures = features.slice(0, 4);
    return buildDescription({ platform, tenant, product: { ...product, shortDescription: '', description: '' }, categoryName, pricing, voucher, features: compactFeatures, hashtags, productUrl, cta, sinhalaEnabled });
  }
  return description;
}

function validateDescription(description, platform) {
  const errors = [];
  if (!cleanText(description, 100000)) errors.push('Description is required');
  if (PLACEHOLDER_PATTERN.test(String(description || ''))) errors.push('Description contains an unresolved placeholder or invalid value');
  if (String(description || '').length > (PLATFORM_LIMITS[platform] || 2200)) errors.push(`${platform} description is too long`);
  if (/\b[0-9a-f]{24}\b/i.test(String(description || ''))) errors.push('Description contains an internal database identifier');
  return errors;
}

function isValidTimeZone(timezone) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); return true; }
  catch { return false; }
}

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, minute: +parts.minute, second: +parts.second };
}

function zonedDateTimeToUtc(dateString, timeString, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString) || !/^\d{2}:\d{2}$/.test(timeString)) throw new Error('Invalid schedule date or time');
  if (!isValidTimeZone(timezone)) throw new Error('Invalid timezone');
  const [year, month, day] = dateString.split('-').map(Number);
  const [hour, minute] = timeString.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(target);
  for (let pass = 0; pass < 3; pass += 1) {
    const actual = zonedParts(guess, timezone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess = new Date(guess.getTime() + target - represented);
  }
  return guess;
}

function addCalendarDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function calendarWeekday(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function distributeScheduleTimestamps(productCount, config, now = new Date()) {
  const count = Number(productCount);
  if (!Number.isInteger(count) || count < 1) return [];
  const timezone = config.timezone || 'Asia/Colombo';
  const allowedDays = new Set((config.postingDays?.length ? config.postingDays : [0,1,2,3,4,5,6]).map(Number));
  const limit = Math.max(1, Math.min(500, Number(config.postsPerDay || 5)));
  const gapMs = Math.max(1, Number(config.postGapMinutes || 5)) * 60000;
  let date = config.startDate;
  const result = [];
  let safety = 0;
  while (result.length < count && safety < 3700) {
    safety += 1;
    if (allowedDays.has(calendarWeekday(date))) {
      const start = zonedDateTimeToUtc(date, config.dailyStartTime, timezone);
      for (let slot = 0; slot < limit && result.length < count; slot += 1) {
        const scheduled = new Date(start.getTime() + slot * gapMs);
        if (scheduled > now) result.push(scheduled);
      }
    }
    date = addCalendarDays(date, 1);
  }
  if (result.length !== count) throw new Error('Unable to distribute all posts in the selected future schedule window');
  return result;
}

function orderProducts(products, order) {
  const list = [...products];
  if (order === 'newest') return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (order === 'price_asc') return list.sort((a, b) => Number(a.price) - Number(b.price));
  if (order === 'price_desc') return list.sort((a, b) => Number(b.price) - Number(a.price));
  if (order === 'random') {
    return list.map(value => ({ value, key: crypto.randomBytes(8).readBigUInt64BE() }))
      .sort((a, b) => a.key < b.key ? -1 : 1).map(item => item.value);
  }
  return list;
}

function productSnapshot(product) {
  return {
    name: product.name,
    slug: product.slug,
    price: Number(product.price),
    salePrice: Number(product.salePrice) || null,
    stock: Number(product.stock),
    isActive: product.isActive !== false,
    updatedAt: product.updatedAt,
  };
}

function snapshotChanged(snapshot, product) {
  const current = productSnapshot(product);
  return ['name', 'slug', 'price', 'salePrice', 'stock', 'isActive'].some(key => String(snapshot?.[key] ?? '') !== String(current[key] ?? ''));
}

function buildPublishingKey(tenantId, scheduleId, sourceId, platform, cycle = 0) {
  return crypto.createHash('sha256')
    .update(`${tenantId}:${scheduleId}:${sourceId}:${platform}:cycle:${Number(cycle) || 0}`)
    .digest('hex');
}

function scheduleTransition(status, action) {
  if (action === 'pause' && ['scheduled','running'].includes(status)) return 'paused';
  if (action === 'resume' && status === 'paused') return 'scheduled';
  if (action === 'stop' && !['completed','stopped'].includes(status)) return 'stopped';
  throw new Error(`Cannot ${action} a ${status} schedule`);
}

function staleClaimResolution(attempts, hasSuccessLog) {
  if (hasSuccessLog) return 'published';
  return Number(attempts) > 0 ? 'needs_review' : 'pending';
}

module.exports = {
  VALID_PLATFORMS, VALID_CTAS, PLATFORM_LIMITS, cleanText, isPublicHttpsUrl, normalizeSiteUrl,
  selectTenantSiteUrl, normalizeHashtag, uniqueStrings, extractVerifiedFeatures, couponAppliesToProduct,
  calculatePricing, buildWhatsAppUrl, deriveHashtags, buildDescription, validateDescription,
  isValidTimeZone, zonedDateTimeToUtc, distributeScheduleTimestamps, orderProducts,
  productSnapshot, snapshotChanged, buildPublishingKey, scheduleTransition, staleClaimResolution,
};
