'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCurrency,
  absoluteUrl,
  googleVerificationToken,
  isValidGtin,
  gtinProperty,
  schemaCondition,
  merchantCondition,
  productSeoAudit,
  buildShippingDetails,
  buildReturnPolicy,
} = require('../utils/productSeo');

const goodProduct = {
  _id: 'product-1', name: 'Wireless Headphones', slug: 'wireless-headphones',
  description: 'Comfortable wireless headphones with clear sound and long battery life for everyday listening.',
  price: 12500, stock: 8, category: { name: 'Audio' }, brand: 'Acme',
  thumbnail: 'https://cdn.example.com/headphones.jpg', gtin: '4006381333931',
  images: ['https://cdn.example.com/headphones-side.jpg'], isActive: true,
};

test('Google-ready product passes required SEO audit checks', () => {
  const result = productSeoAudit(goodProduct, { siteUrl: 'https://shop.example.com' });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.errors, []);
});

test('SEO audit rejects missing price, image, description, category and stock', () => {
  const result = productSeoAudit({ name: 'Incomplete', slug: 'incomplete', price: 0, stock: -1, isActive: true }, { siteUrl: 'https://shop.example.com' });
  assert.equal(result.eligible, false);
  assert.ok(result.errors.length >= 5);
});

test('SEO audit blocks Merchant listings with unresolved identifiers or invalid sale data', () => {
  const missingIdentifiers = productSeoAudit({ ...goodProduct, gtin: '', mpn: '', identifierExists: undefined }, { siteUrl: 'https://shop.example.com' });
  assert.equal(missingIdentifiers.eligible, false);
  assert.ok(missingIdentifiers.errors.some(error => error.includes('GTIN or MPN')));

  const invalidSale = productSeoAudit({ ...goodProduct, isOnSale: true, salePrice: goodProduct.price }, { siteUrl: 'https://shop.example.com' });
  assert.equal(invalidSale.eligible, false);
  assert.ok(invalidSale.errors.some(error => error.includes('discounted price')));
});

test('SEO audit excludes SVG placeholders from Google Merchant listings', () => {
  const result = productSeoAudit({ ...goodProduct, thumbnail: '/starter-assets/product-placeholder.svg' }, { siteUrl: 'https://shop.example.com' });
  assert.equal(result.eligible, false);
  assert.ok(result.errors.some(error => error.includes('SVG')));
});

test('GTIN schema property uses the correct identifier length', () => {
  assert.equal(isValidGtin('96385074'), true);
  assert.equal(isValidGtin('4006381333931'), true);
  assert.equal(isValidGtin('4006381333932'), false);
  assert.deepEqual(gtinProperty('96385074'), { gtin8: '96385074' });
  assert.deepEqual(gtinProperty('4006381333931'), { gtin13: '4006381333931' });
  assert.deepEqual(gtinProperty('123'), {});
});

test('Merchant values normalize currency, condition and relative URLs', () => {
  assert.equal(normalizeCurrency('lkr'), 'LKR');
  assert.equal(normalizeCurrency('rupees'), 'LKR');
  assert.equal(absoluteUrl('/images/item.jpg', 'https://shop.example.com'), 'https://shop.example.com/images/item.jpg');
  assert.equal(googleVerificationToken('<meta name="google-site-verification" content="tenant-code-123">'), 'tenant-code-123');
  assert.equal(schemaCondition('refurbished'), 'https://schema.org/RefurbishedCondition');
  assert.equal(merchantCondition('used'), 'used');
});

test('Shipping and return schemas contain Google-required fields', () => {
  const shipping = buildShippingDetails({ merchantCountryCode: 'LK', merchantShippingCost: 500, merchantShippingMinDays: 2, merchantShippingMaxDays: 4 }, 'LKR');
  assert.equal(shipping.shippingDestination.addressCountry, 'LK');
  assert.equal(shipping.deliveryTime.transitTime.minValue, 2);
  assert.equal(shipping.deliveryTime.transitTime.maxValue, 4);
  const returns = buildReturnPolicy({ merchantCountryCode: 'LK', merchantReturnDays: 7 });
  assert.equal(returns.applicableCountry, 'LK');
  assert.equal(returns.merchantReturnDays, 7);
});
