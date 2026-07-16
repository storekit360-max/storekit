'use strict';

function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'LKR';
}

function normalizeCountryCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  if (/SRI\s*LANKA/i.test(raw)) return 'LK';
  return 'LK';
}

function absoluteUrl(value, siteUrl) {
  if (!value) return '';
  try { return new URL(String(value), `${String(siteUrl || '').replace(/\/$/, '')}/`).toString(); }
  catch { return ''; }
}

function googleVerificationToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/content\s*=\s*["']([^"']+)["']/i);
  return String(match?.[1] || raw).replace(/^['"]|['"]$/g, '').trim();
}

function isValidGtin(gtin) {
  const digits = String(gtin || '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  const expected = Number(digits.at(-1));
  let sum = 0;
  for (let index = body.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(body[index]) * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === expected;
}

function gtinProperty(gtin) {
  const digits = String(gtin || '').replace(/\D/g, '');
  return isValidGtin(digits) ? { [`gtin${digits.length}`]: digits } : {};
}

function schemaCondition(condition) {
  return {
    used: 'https://schema.org/UsedCondition',
    refurbished: 'https://schema.org/RefurbishedCondition',
    new: 'https://schema.org/NewCondition',
  }[condition] || 'https://schema.org/NewCondition';
}

function merchantCondition(condition) {
  return ['used', 'refurbished'].includes(condition) ? condition : 'new';
}

function productSeoAudit(product, { siteUrl = '' } = {}) {
  const errors = [];
  const warnings = [];
  const description = stripHtml(product.shortDescription || product.description);
  const image = absoluteUrl(product.thumbnail || product.images?.[0], siteUrl);
  if (!String(product.name || '').trim()) errors.push('Missing product title');
  if (!String(product.slug || '').trim()) errors.push('Missing product URL slug');
  if (!(Number(product.price) > 0)) errors.push('Price must be greater than zero');
  if (!description) errors.push('Missing product description');
  else if (description.length < 50) warnings.push('Description should be at least 50 characters');
  if (!image || !/^https:\/\//i.test(image)) errors.push('Missing crawlable HTTPS product image');
  else if (/\.svg(?:$|[?#])/i.test(image)) errors.push('SVG placeholder images are not supported by Google Merchant listings');
  if (!product.category) errors.push('Missing category');
  if (!Number.isFinite(Number(product.stock)) || Number(product.stock) < 0) errors.push('Invalid stock quantity');
  if (product.isOnSale && (!(Number(product.salePrice) > 0) || Number(product.salePrice) >= Number(product.price))) {
    errors.push('On Sale is enabled without a valid discounted price');
  }
  if (!String(product.brand || '').trim()) warnings.push('Brand is recommended when the product has a manufacturer');
  if (product.mpn && !String(product.brand || '').trim()) errors.push('A brand is required when an MPN is supplied');
  if (!product.gtin && !product.mpn && product.identifierExists !== false) {
    errors.push('Add GTIN or MPN, or explicitly mark that manufacturer identifiers do not exist');
  }
  if (product.gtin && !isValidGtin(product.gtin)) errors.push('GTIN has an invalid length or check digit');
  if (product.identifierExists === false && (product.gtin || product.mpn)) errors.push('Identifier-exists cannot be No when a GTIN or MPN is supplied');
  if ((product.images || []).filter(Boolean).length < 2) warnings.push('Additional product images are recommended');
  const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 5);
  return { eligible: product.isActive !== false && errors.length === 0, score, errors, warnings };
}

function buildShippingDetails(settings = {}, currency = 'LKR') {
  const min = Math.max(0, Math.floor(Number(settings.merchantShippingMinDays ?? 1)));
  const max = Math.max(min, Math.floor(Number(settings.merchantShippingMaxDays ?? 5)));
  const cost = Math.max(0, Number(settings.merchantShippingCost ?? settings.standardDelivery ?? 0));
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: cost, currency: normalizeCurrency(currency) },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: normalizeCountryCode(settings.merchantCountryCode || settings.country) },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: min, maxValue: max, unitCode: 'DAY' },
    },
  };
}

function buildReturnPolicy(settings = {}) {
  const days = Math.floor(Number(settings.merchantReturnDays));
  if (!(days > 0)) return null;
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: normalizeCountryCode(settings.merchantCountryCode || settings.country),
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: days,
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: settings.merchantFreeReturns === true
      ? 'https://schema.org/FreeReturn'
      : 'https://schema.org/ReturnFeesCustomerResponsibility',
  };
}

module.exports = {
  stripHtml,
  normalizeCurrency,
  normalizeCountryCode,
  absoluteUrl,
  googleVerificationToken,
  isValidGtin,
  gtinProperty,
  schemaCondition,
  merchantCondition,
  productSeoAudit,
  buildShippingDetails,
  buildReturnPolicy,
};
