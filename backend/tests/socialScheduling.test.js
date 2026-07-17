'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculatePricing, couponAppliesToProduct, extractVerifiedFeatures, buildDescription,
  validateDescription, distributeScheduleTimestamps, zonedDateTimeToUtc,
  buildPublishingKey, scheduleTransition, staleClaimResolution,
} = require('../services/socialSchedulingUtils');
const { retryDelayMs, classifyFailure } = require('../services/socialScheduler');

const product = {
  _id: '507f1f77bcf86cd799439011', name: 'UGREEN Fast Charger', slug: 'ugreen-fast-charger',
  description: 'Reliable charging for compatible devices. Compact design for daily use.',
  shortDescription: 'Reliable charging for compatible devices.', price: 10000, salePrice: 8000,
  brand: 'UGREEN', category: { _id: '507f191e810c19729de860ea', name: 'Chargers' }, stock: 10,
  specifications: [
    { key: 'Colour', value: 'Black' }, { key: 'Warranty', value: '12 months' },
    { key: 'SKU', value: 'SECRET-1' }, { key: 'Mongo ID', value: '507f1f77bcf86cd799439011' },
    { key: 'Connector', value: 'USB-C' }, { key: 'Ports', value: '2' },
  ],
};

test('sale detection and additional discount use database price source values', () => {
  const value = calculatePricing(product, { additionalDiscountPercent: 10 });
  assert.equal(value.regularPrice, 10000);
  assert.equal(value.storedSalePrice, 8000);
  assert.equal(value.finalPrice, 7200);
  assert.equal(value.discountPercent, 28);
  assert.equal(value.hasOffer, true);
});

test('offer price calculates the percentage and invalid offers are rejected', () => {
  const value = calculatePricing(product, { offerPrice: 7000 });
  assert.equal(value.finalPrice, 7000);
  assert.equal(value.additionalDiscountPercent, 12.5);
  assert.throws(() => calculatePricing(product, { offerPrice: 10000 }), /lower than/);
});

test('active applicable voucher is reflected and expired voucher is rejected', () => {
  const voucher = {
    isActive: true, validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 100000),
    type: 'percentage', value: 10, applicableProducts: [product._id], excludedProducts: [],
  };
  assert.equal(couponAppliesToProduct(voucher, product), true);
  const pricing = calculatePricing(product, { voucher });
  assert.equal(pricing.finalPrice, 7200);
  assert.equal(couponAppliesToProduct({ ...voucher, validUntil: new Date(Date.now() - 1) }, product), false);
});

test('feature extraction uses verified fields and excludes internal IDs and SKU', () => {
  const features = extractVerifiedFeatures(product);
  assert.ok(features.includes('Warranty: 12 months'));
  assert.ok(features.includes('Connector: USB-C'));
  assert.equal(features.some(value => /sku|mongo|507f1f77/i.test(value)), false);
});

test('daily schedule distribution respects limit, gaps and selected days', () => {
  const times = distributeScheduleTimestamps(7, {
    timezone: 'Asia/Colombo', startDate: '2030-01-07', dailyStartTime: '18:30',
    postGapMinutes: 5, postsPerDay: 5, postingDays: [1,2,3,4,5],
  }, new Date('2030-01-01T00:00:00Z'));
  assert.equal(times.length, 7);
  assert.equal(times[1] - times[0], 5 * 60000);
  assert.equal(times[4] - times[3], 5 * 60000);
  assert.ok(times[5] - times[4] > 20 * 60 * 60 * 1000);
});

test('timezone conversion handles daylight-saving offsets', () => {
  const winter = zonedDateTimeToUtc('2030-01-15', '18:30', 'America/New_York');
  const summer = zonedDateTimeToUtc('2030-07-15', '18:30', 'America/New_York');
  assert.equal(winter.toISOString().slice(11,16), '23:30');
  assert.equal(summer.toISOString().slice(11,16), '22:30');
});

test('English and Sinhala deterministic descriptions contain real URLs and no IDs', () => {
  const tenant = { storeName: 'Demo Shop', settings: { currencyCode: 'LKR', whatsappNumber: '0771234567' } };
  const pricing = calculatePricing(product);
  const args = { platform:'facebook', tenant, product, categoryName:'Chargers', pricing, voucher:null,
    features:extractVerifiedFeatures(product), hashtags:['#DemoShop','#UGREEN'],
    productUrl:'https://demo.example/product/ugreen-fast-charger', cta:'whatsapp' };
  const english = buildDescription({ ...args, sinhalaEnabled:false });
  const mixed = buildDescription({ ...args, sinhalaEnabled:true });
  assert.match(english, /https:\/\/demo\.example\/product\/ugreen-fast-charger/);
  assert.match(mixed, /අදම Order කරන්න/);
  assert.equal(validateDescription(english, 'facebook').length, 0);
  assert.equal(/507f1f77bcf86cd799439011/.test(english), false);
});

test('Instagram description limit and unresolved placeholders are rejected', () => {
  assert.ok(validateDescription('x'.repeat(2201), 'instagram').length);
  assert.ok(validateDescription('Buy {{productName}} now', 'facebook').length);
});

test('retry policy is exponential and permission errors are permanent', () => {
  assert.equal(retryDelayMs(1), 60000);
  assert.equal(retryDelayMs(3), 240000);
  assert.equal(classifyFailure({ errorCode:'190', errorMessage:'expired token' }).permanent, true);
  assert.equal(classifyFailure({ errorCode:'API_ERROR', errorMessage:'network timeout' }).permanent, false);
});

test('publishing idempotency keys are stable and isolated by tenant, platform and cycle', () => {
  const key = buildPublishingKey('tenant-a', 'schedule-1', 'draft-1', 'facebook', 0);
  assert.equal(key, buildPublishingKey('tenant-a', 'schedule-1', 'draft-1', 'facebook', 0));
  assert.notEqual(key, buildPublishingKey('tenant-b', 'schedule-1', 'draft-1', 'facebook', 0));
  assert.notEqual(key, buildPublishingKey('tenant-a', 'schedule-1', 'draft-1', 'instagram', 0));
  assert.notEqual(key, buildPublishingKey('tenant-a', 'schedule-1', 'draft-1', 'facebook', 1));
});

test('pause, resume and stop transitions reject invalid state changes', () => {
  assert.equal(scheduleTransition('running', 'pause'), 'paused');
  assert.equal(scheduleTransition('paused', 'resume'), 'scheduled');
  assert.equal(scheduleTransition('scheduled', 'stop'), 'stopped');
  assert.throws(() => scheduleTransition('completed', 'resume'));
});

test('restart recovery never blindly retries an unknown provider outcome', () => {
  assert.equal(staleClaimResolution(0, false), 'pending');
  assert.equal(staleClaimResolution(1, false), 'needs_review');
  assert.equal(staleClaimResolution(1, true), 'published');
});

test('queue schemas enforce tenant-scoped idempotency and atomic due-job lookup indexes', () => {
  const ScheduledSocialPost = require('../models/ScheduledSocialPost');
  const indexes = ScheduledSocialPost.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.tenantId === 1 && keys.idempotencyKey === 1 && options.unique));
  assert.ok(indexes.some(([keys]) => keys.tenantId === 1 && keys.status === 1 && keys.scheduledFor === 1));
});
