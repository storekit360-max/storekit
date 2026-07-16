'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const curfoxClient = require('../services/curfoxClient');
const {
  TENANT_DATA_SPECS,
  deleteTenantData,
  expectedDeletionConfirmation,
  validateTenantDeletionConfirmation,
} = require('../services/tenantDeletionService');

test('tenant deletion requires the exact tenant-specific verification phrase', () => {
  const tenant = { _id: 'tenant-a', slug: 'example-store' };
  assert.equal(expectedDeletionConfirmation(tenant.slug), 'DELETE example-store');
  assert.equal(validateTenantDeletionConfirmation(tenant, 'DELETE example-store'), true);
  assert.throws(
    () => validateTenantDeletionConfirmation(tenant, 'DELETE another-store'),
    /Type DELETE example-store/
  );
  assert.throws(() => validateTenantDeletionConfirmation(tenant, 'delete example-store'));
});

test('tenant deletion registry covers every loaded tenant-owned model', () => {
  const registeredModels = new Set(TENANT_DATA_SPECS.map(spec => spec.model.modelName));
  const loadedTenantModels = Object.values(mongoose.models)
    .filter(model => model.schema.path('tenantId') || model.schema.path('tenant'))
    .map(model => model.modelName)
    .filter(name => name !== 'User'); // Users have special Super Admin preservation logic.

  assert.deepEqual([...registeredModels].sort(), [...new Set(loadedTenantModels)].sort());
  assert.equal(new Set(TENANT_DATA_SPECS.map(spec => spec.key)).size, TENANT_DATA_SPECS.length);
  TENANT_DATA_SPECS.forEach(spec => assert.ok(spec.model.schema.path(spec.field), `${spec.key} must use ${spec.field}`));
});

test('tenant data cleanup always uses tenant-scoped filters and preserves Super Admin users', async () => {
  const calls = [];
  const originalSpecDeletes = TENANT_DATA_SPECS.map(spec => spec.model.deleteMany);
  const originalUserDelete = User.deleteMany;
  const originalUserUpdate = User.updateMany;
  const originalClearToken = curfoxClient.clearTenantToken;

  try {
    TENANT_DATA_SPECS.forEach(spec => {
      spec.model.deleteMany = async filter => {
        calls.push({ key: spec.key, filter });
        return { deletedCount: 1 };
      };
    });
    User.deleteMany = async filter => {
      calls.push({ key: 'users', filter });
      return { deletedCount: 2 };
    };
    User.updateMany = async (filter, update) => {
      calls.push({ key: 'superadmins', filter, update });
      return { modifiedCount: 0 };
    };
    curfoxClient.clearTenantToken = tenantId => calls.push({ key: 'curfoxToken', tenantId });

    const result = await deleteTenantData('tenant-a');

    TENANT_DATA_SPECS.forEach(spec => {
      const call = calls.find(item => item.key === spec.key);
      assert.deepEqual(call.filter, { [spec.field]: 'tenant-a' });
    });
    assert.deepEqual(calls.find(item => item.key === 'users').filter, {
      tenantId: 'tenant-a',
      role: { $ne: 'superadmin' },
    });
    assert.deepEqual(calls.find(item => item.key === 'superadmins'), {
      key: 'superadmins',
      filter: { tenantId: 'tenant-a', role: 'superadmin' },
      update: { $set: { tenantId: null } },
    });
    assert.equal(calls.find(item => item.key === 'curfoxToken').tenantId, 'tenant-a');
    assert.equal(result.total, TENANT_DATA_SPECS.length + 2);
  } finally {
    TENANT_DATA_SPECS.forEach((spec, index) => { spec.model.deleteMany = originalSpecDeletes[index]; });
    User.deleteMany = originalUserDelete;
    User.updateMany = originalUserUpdate;
    curfoxClient.clearTenantToken = originalClearToken;
  }
});
