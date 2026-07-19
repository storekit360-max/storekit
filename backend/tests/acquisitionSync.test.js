'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const PlatformIntegration = require('../models/PlatformIntegration');
const registry = require('../config/integrationRegistry');
const { MAX_PAGES, PAGE_LIMIT, boundedDays, normalizeGoogleAdsInsight, normalizeInsight, validateGoogleAdsConfig, validateMetaAdsConfig } = require('../services/acquisitionSyncService');

const root = path.join(__dirname, '..');

test('Meta Ads configuration and synchronization windows are strictly bounded', () => {
  assert.deepEqual(validateMetaAdsConfig({ adAccountId: 'act_123456789', graphVersion: 'v25.0' }), { accountId: '123456789', graphVersion: 'v25.0' });
  assert.throws(() => validateMetaAdsConfig({ adAccountId: '../me', graphVersion: 'v25.0' }), /numeric/);
  assert.throws(() => validateMetaAdsConfig({ adAccountId: '123456', graphVersion: 'latest' }), /explicit Graph API version/);
  assert.equal(boundedDays(0), 7);
  assert.equal(boundedDays(200), 90);
  assert.equal(MAX_PAGES, 20);
  assert.equal(PAGE_LIMIT, 500);
});

test('Meta Ads rows normalize into currency-safe idempotent acquisition records', () => {
  const record = normalizeInsight({ date_start: '2026-07-17', spend: '12.345', campaign_id: '998877', campaign_name: 'Summer sale' }, { accountId: '123456', currency: 'USD', actorId: 'operator' });
  assert.equal(record.amount, 12.35);
  assert.equal(record.currency, 'USD');
  assert.equal(record.externalReference, 'meta-ads:123456:998877:2026-07-17');
  assert.equal(record.createdBy, 'operator');
  assert.equal(normalizeInsight({ date_start: '2026-07-17', spend: '0', campaign_id: '1' }, { accountId: '1', currency: 'USD', actorId: 'operator' }), null);
  assert.equal(normalizeInsight({ date_start: 'bad', spend: '2', campaign_id: '1' }, { accountId: '1', currency: 'USD', actorId: 'operator' }), null);
});

test('Meta Ads integration uses encrypted credentials and a fixed-host bounded API contract', () => {
  const provider = registry.byKey.get('meta-ads');
  assert.deepEqual(provider.secretFields, ['accessToken']);
  assert.deepEqual(provider.configFields, ['adAccountId', 'graphVersion']);
  const integration = fs.readFileSync(path.join(root, 'services/platformIntegrationService.js'), 'utf8');
  const sync = fs.readFileSync(path.join(root, 'services/acquisitionSyncService.js'), 'utf8');
  assert.match(integration, /graph\.facebook\.com\/\$\{version\}\/act_\$\{accountId\}/);
  assert.match(sync, /const baseUrl = `https:\/\/graph\.facebook\.com\/\$\{graphVersion\}\/act_\$\{accountId\}`/);
  assert.match(sync, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(sync, /maxRedirects: 0/g);
  assert.match(sync, /MAX_PAGES = 20/);
  assert.match(sync, /PAGE_LIMIT = 500/);
  assert.doesNotMatch(sync, /axios\.get\([^)]*paging\?\.next/);
});

test('spend reconciliation, scheduler claims, RBAC, MFA, audit, and UI are integrated', () => {
  const sync = fs.readFileSync(path.join(root, 'services/acquisitionSyncService.js'), 'utf8');
  const scheduler = fs.readFileSync(path.join(root, 'services/acquisitionSyncScheduler.js'), 'utf8');
  const routes = fs.readFileSync(path.join(root, 'routes/superadmin/analytics.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, '../frontend/src/pages/superadmin/SuperAdminAnalytics.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, '../frontend/src/pages/superadmin/SuperAdminDashboard.js'), 'utf8');
  assert.match(sync, /filter: \{ externalReference: record\.externalReference \}/);
  assert.match(sync, /new Map\(normalized\.map\(record => \[record\.externalReference, record\]\)\)/);
  assert.match(sync, /\$setOnInsert: \{ externalReference: record\.externalReference, createdBy: record\.createdBy \}/);
  assert.match(scheduler, /findOneAndUpdate/);
  assert.match(scheduler, /'lastSync\.nextEligibleAt': \{ \$lte: now \}/);
  assert.match(scheduler, /'acquisition-meta-ads-sync', syncMetaAdsSpend/);
  assert.match(scheduler, /'lastSync\.status': 'running'/);
  assert.match(scheduler, /Scheduled synchronization failed; review the tracked job error/);
  assert.match(server, /startAcquisitionSyncScheduler\(\)/);
  assert.match(routes, /acquisition-sync\/meta-ads', requirePlatformPermission\('analytics\.manage'\), requireRecentStepUp\(\)/);
  assert.match(routes, /analytics\.acquisition-sync\.meta-ads/);
  assert.match(ui, /\["meta-ads","Meta Ads",syncStatus/);
  assert.match(ui, /\{label\} acquisition synchronization/);
  assert.match(ui, /canManage&&<button/);
  assert.match(dashboard, /canManage=\{platformPermissions\?\.includes\('analytics\.manage'\)\}/);
});

test('integration sync state is persisted and indexed without exposing the access token', () => {
  assert.ok(PlatformIntegration.schema.path('lastSync.status'));
  assert.ok(PlatformIntegration.schema.path('lastSync.nextEligibleAt'));
  assert.ok(PlatformIntegration.schema.indexes().some(([fields]) => fields.provider === 1 && fields['lastSync.nextEligibleAt'] === 1));
  const sync = fs.readFileSync(path.join(root, 'services/acquisitionSyncService.js'), 'utf8');
  const statusBody = sync.slice(sync.indexOf('async function acquisitionSyncStatus'), sync.indexOf('module.exports'));
  assert.doesNotMatch(statusBody, /secrets\.accessToken/);
  assert.match(statusBody, /slice\(-4\)/);
});
