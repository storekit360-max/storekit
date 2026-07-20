'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  requiredTenantId,
  tenantFilterForRequest,
  disableSharedTenantCaching,
} = require('../utils/tenantGuard');
const {
  chooseRequestTenantId,
  installTenantScope,
  runWithTenant,
  withoutTenantScope,
} = require('../middleware/tenantContext');

test('public tenant filters always include the resolved tenant', () => {
  const tenantA = tenantFilterForRequest({ tenantId: 'tenant-a' }, { isActive: true });
  const tenantB = tenantFilterForRequest({ tenantId: 'tenant-b' }, { isActive: true });
  assert.deepEqual(tenantA, { isActive: true, tenantId: 'tenant-a' });
  assert.deepEqual(tenantB, { isActive: true, tenantId: 'tenant-b' });
  assert.notEqual(tenantA.tenantId, tenantB.tenantId);
});

test('caller cannot override the resolved tenant in a category filter', () => {
  const filter = tenantFilterForRequest(
    { tenantId: 'active-tenant' },
    { tenantId: 'attacker-tenant', isActive: true }
  );
  assert.equal(filter.tenantId, 'active-tenant');
});

test('public tenant reads fail closed when the domain is unresolved', () => {
  assert.throws(
    () => requiredTenantId({}),
    error => error.code === 'STORE_NOT_FOUND' && error.statusCode === 404
  );
});

test('tenant catalogue responses disable shared proxy and CDN caching', () => {
  const headers = new Map();
  const varied = [];
  const response = {
    vary(value) { varied.push(value); },
    setHeader(key, value) { headers.set(key, value); },
  };
  disableSharedTenantCaching(response);
  assert.match(headers.get('Cache-Control'), /private/);
  assert.match(headers.get('Cache-Control'), /no-store/);
  assert.equal(headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(headers.get('Vercel-CDN-Cache-Control'), 'no-store');
  assert.ok(varied.includes('X-Tenant-Domain'));
});

test('authenticated admin tenant overrides the shared storefront domain tenant', () => {
  assert.equal(
    String(chooseRequestTenantId('shopzen-tenant', { role: 'admin', tenantId: 'customer-store-tenant' })),
    'customer-store-tenant'
  );
  assert.equal(
    chooseRequestTenantId('shopzen-tenant', { role: 'customer', tenantId: 'other-tenant' }),
    'shopzen-tenant'
  );
});

test('platform records can explicitly bypass tenant injection', async () => {
  const isolatedMongoose = new mongoose.Mongoose();
  installTenantScope(isolatedMongoose);
  const ScopedRecord = isolatedMongoose.model('TenantScopeBypassRecord', new isolatedMongoose.Schema({
    tenantId: { type: isolatedMongoose.Schema.Types.ObjectId, default: null },
  }));
  const tenantId = new mongoose.Types.ObjectId();

  await runWithTenant(tenantId, async () => {
    const tenantRecord = new ScopedRecord({ tenantId: null });
    await tenantRecord.validate();
    assert.equal(String(tenantRecord.tenantId), String(tenantId));

    const platformRecord = await withoutTenantScope(async () => {
      const record = new ScopedRecord({ tenantId: null });
      await record.validate();
      return record;
    });
    assert.equal(platformRecord.tenantId, null);
  });
});
