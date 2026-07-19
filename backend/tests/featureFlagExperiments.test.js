'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { summarizeExperiments, wilsonInterval } = require('../services/featureFlagExperimentService');

const root = path.join(__dirname, '..');

test('Wilson confidence intervals are bounded and narrow as evidence grows', () => {
  assert.deepEqual(wilsonInterval(0, 0), { low: 0, high: 0 });
  const small = wilsonInterval(5, 10);
  const large = wilsonInterval(500, 1000);
  assert.ok(small.low >= 0 && small.high <= 100);
  assert.ok(large.high - large.low < small.high - small.low);
});

test('experiment summaries use configured control, report lift, and refuse premature conclusions', () => {
  const rows = [
    { flagKey: 'checkout.flow', flagVersion: 3, variant: 'control', assignments: 50, conversions: 10 },
    { flagKey: 'checkout.flow', flagVersion: 3, variant: 'treatment', assignments: 50, conversions: 15 },
  ];
  const result = summarizeExperiments(rows, [{ key: 'checkout.flow', name: 'Checkout flow', version: 3, variants: [{ key: 'control' }, { key: 'treatment' }] }], [{ flagKey: 'checkout.flow', flagVersion: 3, tenants: 4 }]);
  assert.equal(result[0].controlVariant, 'control');
  assert.equal(result[0].excludedContaminatedTenants, 4);
  assert.equal(result[0].variants[1].liftVsControl, 50);
  assert.equal(result[0].variants[1].evidence, 'insufficient_sample');
  assert.match(result[0].conclusion, /Insufficient sample/);
});

test('experiment API is permissioned, tenant-isolated, temporal, and excludes contamination', () => {
  const service = fs.readFileSync(path.join(root, 'services/featureFlagExperimentService.js'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'routes/superadmin/featureFlags.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, '../frontend/src/pages/superadmin/SuperAdminFeatureFlags.js'), 'utf8');
  assert.match(route, /analytics\/experiments[^]*requirePlatformPermission\('featureflags\.view'\)/);
  assert.match(service, /tenantId: \{ \$ne: null \}/);
  assert.match(service, /\$eq: \['\$tenantId', '\$\$tenant'\]/);
  assert.match(service, /\$gte: \['\$createdAt', '\$\$exposedAt'\]/);
  assert.match(service, /paymentStatus', 'paid'/);
  assert.match(service, /'assignments\.1': \{ \$exists: false \}/);
  assert.match(service, /Guest and customer identities are never joined/);
  assert.match(ui, /Experiment commerce outcomes/);
  assert.match(ui, /Descriptive, not causal proof/);
  assert.match(ui, /95% CI/);
});
