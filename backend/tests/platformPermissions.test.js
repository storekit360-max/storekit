'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../config/platformPermissions');
const Plan = require('../models/PlatformRole');
const User = require('../models/User');

test('platform permission registry contains unique group.action keys', () => {
  assert.equal(new Set(registry.keys).size, registry.keys.length);
  registry.keys.forEach(key => assert.match(key, /^[a-z]+\.[a-z]+$/));
  ['platform.view', 'tenant.delete', 'billing.refund', 'roles.manage', 'audit.view', 'developer.api']
    .forEach(key => assert.ok(registry.keys.includes(key)));
});

test('platform roles and users store dynamic role assignments', () => {
  assert.ok(Plan.schema.path('permissions'));
  assert.ok(User.schema.path('platformRoleIds'));
});
