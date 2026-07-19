'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const registry = require('../config/integrationRegistry');
const { normalizeGoogleAdsInsight, validateGoogleAdsConfig } = require('../services/acquisitionSyncService');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Google Ads configuration rejects dynamic hosts and malformed account/version values', () => {
  assert.deepEqual(validateGoogleAdsConfig({ clientId: 'client.apps.googleusercontent.com', customerId: '123-456-7890', loginCustomerId: '987-654-3210', apiVersion: 'v22' }), { clientId: 'client.apps.googleusercontent.com', customerId: '1234567890', loginCustomerId: '9876543210', apiVersion: 'v22' });
  assert.throws(() => validateGoogleAdsConfig({ clientId: 'x', customerId: '../123', apiVersion: 'v22' }), /numeric customer ID/);
  assert.throws(() => validateGoogleAdsConfig({ clientId: 'x', customerId: '123456', apiVersion: 'latest' }), /explicit API version/);
  const client = read('services/googleAdsClient.js');
  assert.match(client, /https:\/\/oauth2\.googleapis\.com\/token/);
  assert.match(client, /https:\/\/googleads\.googleapis\.com/);
  assert.match(client, /maxRedirects:\s*0/g);
  assert.match(client, /MAX_RESPONSE_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/);
  assert.doesNotMatch(client, /config\.host|config\.url/);
});

test('Google Ads micros normalize into currency-safe idempotent daily records', () => {
  const record = normalizeGoogleAdsInsight({ segments: { date: '2026-07-17' }, campaign: { id: '556677', name: 'Search summer' }, metrics: { costMicros: '12345678' }, customer: { currencyCode: 'usd' } }, { customerId: '1234567890', actorId: 'operator' });
  assert.equal(record.amount, 12.35);
  assert.equal(record.currency, 'USD');
  assert.equal(record.externalReference, 'google-ads:1234567890:556677:2026-07-17');
  assert.equal(record.createdBy, 'operator');
  assert.equal(normalizeGoogleAdsInsight({ segments: { date: 'bad' }, campaign: { id: '1' }, metrics: { costMicros: '100' }, customer: { currencyCode: 'USD' } }, { customerId: '1', actorId: 'operator' }), null);
  assert.equal(normalizeGoogleAdsInsight({ segments: { date: '2026-07-17' }, campaign: { id: '1' }, metrics: { costMicros: '0' }, customer: { currencyCode: 'USD' } }, { customerId: '1', actorId: 'operator' }), null);
});

test('Google Ads credentials are encrypted and reporting queries are bounded and read-only', () => {
  const provider = registry.byKey.get('google-ads');
  assert.deepEqual(provider.configFields, ['clientId', 'customerId', 'loginCustomerId', 'apiVersion']);
  assert.deepEqual(provider.secretFields, ['clientSecret', 'refreshToken', 'developerToken']);
  const client = read('services/googleAdsClient.js');
  const sync = read('services/acquisitionSyncService.js');
  assert.match(client, /grant_type:\s*'refresh_token'/);
  assert.match(client, /'developer-token':\s*secrets\.developerToken/);
  assert.match(client, /'login-customer-id'/);
  assert.match(sync, /SELECT customer\.currency_code, campaign\.id, campaign\.name, segments\.date, metrics\.cost_micros FROM campaign/);
  assert.match(sync, /metrics\.cost_micros > 0/);
  assert.match(sync, /boundedDays\(days\)/);
  assert.doesNotMatch(sync, /googleAds:mutate|mutateGoogleAds/);
});

test('Google Ads sync is permissioned, stepped-up, audited, scheduled, and visible', () => {
  const routes = read('routes/superadmin/analytics.js');
  const scheduler = read('services/acquisitionSyncScheduler.js');
  const ui = read('../frontend/src/pages/superadmin/SuperAdminAnalytics.js');
  const integration = read('services/platformIntegrationService.js');
  assert.match(routes, /acquisition-sync\/google-ads', requirePlatformPermission\('analytics\.manage'\), requireRecentStepUp\(\)/);
  assert.match(routes, /analytics\.acquisition-sync\.google-ads/);
  assert.match(scheduler, /'acquisition-google-ads-sync', syncGoogleAdsSpend/);
  assert.match(ui, /\["google-ads","Google Ads",googleSyncStatus/);
  assert.match(ui, /\{label\} acquisition synchronization/);
  assert.match(ui, /googleSyncStatus/);
  assert.match(integration, /refreshToken\|refresh_token\|developerToken\|developer_token/);
  assert.match(integration, /ya29\\\./);
});
