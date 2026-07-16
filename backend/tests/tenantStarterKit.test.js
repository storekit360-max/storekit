'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFallbackStarterKit,
  inferArchetype,
  normalizeStarterKit,
  sanitizeBrief,
} = require('../services/tenantStarterKit');
const { buildSearchQuery, normalizePexelsPhotos } = require('../services/starterProductImages');
const Tenant = require('../models/Tenant');

test('business brief is sanitized and item examples are bounded', () => {
  const brief = sanitizeBrief({
    storeName: '<b>North Star</b>',
    businessType: ' Fashion boutique ',
    businessDescription: '<script>alert(1)</script> Premium clothing',
    itemExamples: 'Dresses, Shoes, Dresses, Bags',
  });
  assert.equal(brief.storeName, 'North Star');
  assert.equal(brief.businessType, 'Fashion boutique');
  assert.deepEqual(brief.itemExamples, ['Dresses', 'Shoes', 'Bags']);
  assert.doesNotMatch(brief.businessDescription, /[<>]/);
});

test('business-aware fallback creates a useful fashion storefront', () => {
  const brief = sanitizeBrief({ storeName: 'Luna', businessType: 'Fashion boutique', currency: 'LKR' });
  assert.equal(inferArchetype(brief), 'fashion');
  const kit = buildFallbackStarterKit(brief);
  assert.equal(kit.source, 'fallback');
  assert.ok(kit.categories.length >= 4);
  assert.equal(kit.products.length, 12);
  assert.equal(kit.products.filter(row => row.isFeatured).length, 6);
  assert.equal(kit.products.filter(row => row.starterCollection === 'new_arrival').length, 6);
  assert.ok(kit.banners.some(row => row.position === 'hero'));
  assert.ok(kit.banners.some(row => row.position === 'running_top'));
  assert.equal(new Set(kit.banners.map(row => row.position)).size, 9);
  assert.equal(kit.settings.enableNewsletter, false);
  assert.equal(kit.settings.homepageProductLimit, 6);
  assert.equal(kit.settings.layout_builder.homepage.find(row => row.id === 'categories').enabled, false);
  assert.equal(kit.settings.layout_builder.homepage.find(row => row.id === 'brands').enabled, false);
  assert.equal(kit.theme.storeTemplate, 'fashion');
  assert.ok(kit.products.every(row => row.price > 0 && row.stock >= 0));
});

test('AI starter output is normalized, deduplicated and blocks unsafe links', () => {
  const kit = normalizeStarterKit({
    summary: '<b>Great shop</b>',
    theme: { primaryColor: 'red', accentColor: '#ABCDEF', storeTemplate: 'unknown-template' },
    categories: [
      { name: 'Phones', slug: 'phones' },
      { name: 'Phones', slug: 'phones' },
      { name: 'Audio', slug: 'audio' },
    ],
    products: [
      { name: 'Phone Case', categorySlug: 'phones', price: 1000, stock: 5, sku: 'CASE-1' },
      { name: 'Phone Case', categorySlug: 'audio', price: 2000, stock: 5, sku: 'CASE-2' },
      { name: 'Earbuds', categorySlug: 'missing', price: -5, stock: -2, sku: 'CASE-1' },
    ],
    banners: [{ title: 'Buy now', position: 'hero', link: 'https://evil.example' }],
  }, { storeName: 'Tech Hub', businessType: 'Electronics', currency: 'LKR' }, 'ai');

  assert.equal(kit.source, 'ai');
  assert.equal(kit.summary, 'Great shop');
  assert.deepEqual(kit.categories.map(row => row.slug), ['phones', 'audio']);
  assert.deepEqual(kit.products.slice(0, 2).map(row => row.name), ['Phone Case', 'Earbuds']);
  assert.ok(new Set(kit.categories.map(row => row.slug)).has(kit.products[1].categorySlug));
  assert.ok(kit.products[1].price > 0);
  assert.ok(kit.products[1].stock >= 0);
  assert.notEqual(kit.products[0].sku, kit.products[1].sku);
  assert.equal(kit.banners[0].link, '/shop');
  assert.equal(kit.banners.length, 9);
  assert.equal(kit.products.length, 12);
  assert.equal(kit.products.filter(row => row.isFeatured).length, 6);
  assert.match(kit.theme.primaryColor, /^#[0-9a-f]{6}$/);
  assert.equal(kit.theme.accentColor, '#abcdef');
  assert.equal(kit.theme.storeTemplate, 'electronics');
});

test('tenant model preserves generated storefront settings and onboarding context', () => {
  const tenant = new Tenant({
    storeName: 'Starter Store',
    slug: 'starter-store',
    plan: '64b000000000000000000001',
    settings: { storeTagline: 'Made for everyday life', heroBrowseAllLabel: 'See everything', heroStats: '[]' },
    onboarding: { businessType: 'Home goods', itemExamples: ['Storage baskets'], starterKitSource: 'ai' },
  });
  assert.equal(tenant.settings.storeTagline, 'Made for everyday life');
  assert.equal(tenant.settings.heroBrowseAllLabel, 'See everything');
  assert.equal(tenant.onboarding.businessType, 'Home goods');
  assert.deepEqual(tenant.onboarding.itemExamples, ['Storage baskets']);
});

test('Pexels product-photo results allow only official image and attribution hosts', () => {
  const photos = normalizePexelsPhotos({ photos: [
    {
      src: { large: 'https://images.pexels.com/photos/123/example.jpeg?auto=compress' },
      photographer: 'Jane Photo',
      photographer_url: 'https://www.pexels.com/@jane-photo',
      url: 'https://www.pexels.com/photo/example-123/',
    },
    {
      src: { large: 'https://attacker.example/product.jpg' },
      photographer: 'Unsafe',
      photographer_url: 'https://attacker.example/profile',
      url: 'https://attacker.example/source',
    },
  ] });
  assert.equal(photos.length, 1);
  assert.equal(photos[0].attribution.provider, 'Pexels');
  assert.match(photos[0].image, /^https:\/\/images\.pexels\.com\//);
});

test('product image search query uses only bounded business catalogue terms', () => {
  const query = buildSearchQuery(
    { businessType: '<b>Fashion</b>', itemExamples: ['Dresses', 'Shoes'] },
    [{ name: 'Linen Shirt' }, { name: 'Leather Bag' }]
  );
  assert.match(query, /Fashion Dresses Shoes product photography/i);
  assert.doesNotMatch(query, /[<>]/);
  assert.ok(query.length <= 240);
});
