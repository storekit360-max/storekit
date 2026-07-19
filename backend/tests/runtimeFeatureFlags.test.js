'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RuntimeFeatureFlag = require('../models/RuntimeFeatureFlag');
const FeatureFlagExposure = require('../models/FeatureFlagExposure');
const { bucket, evaluateOne, selectVariant, validateVariants } = require('../services/runtimeFeatureFlagService');

const flag = { key: 'checkout.new-flow', salt: 'stable-secret-salt', version: 3, variants: [{ key: 'control', weight: 50 }, { key: 'treatment', weight: 50 }] };

test('runtime flag schemas support targeting, scheduling, dependencies, variants, and bounded exposure retention', () => {
  ['killSwitch', 'clientVisible', 'entitlementKey', 'rolloutPercentage', 'tenantAllowIds', 'tenantDenyIds', 'countries', 'roles', 'dependencies', 'startsAt', 'endsAt', 'expiresAt', 'variants', 'version'].forEach(field => assert.ok(RuntimeFeatureFlag.schema.path(field), field));
  assert.equal(RuntimeFeatureFlag.schema.path('salt').options.select, false);
  const ttl = FeatureFlagExposure.schema.indexes().find(([keys, options]) => keys.occurredAt === 1 && options.expireAfterSeconds);
  assert.ok(ttl);
});

test('percentage and A/B allocation are deterministic and version-isolated', () => {
  assert.equal(bucket(flag, 'subject-123'), bucket(flag, 'subject-123'));
  assert.notEqual(bucket(flag, 'subject-123'), bucket({ ...flag, version: 4 }, 'subject-123'));
  assert.deepEqual(selectVariant(flag, 'subject-123'), selectVariant(flag, 'subject-123'));
});

test('variant validation requires unique keys and exactly 100 percent weight', () => {
  assert.equal(validateVariants([{ key: 'a', weight: 20 }, { key: 'b', weight: 80 }]).length, 2);
  assert.throws(() => validateVariants([{ key: 'a', weight: 40 }, { key: 'a', weight: 60 }]), /unique/);
  assert.throws(() => validateVariants([{ key: 'a', weight: 60 }, { key: 'b', weight: 30 }]), /total 100/);
});

test('evaluation composes kill switch, entitlement, tenant, country, role, dependency, and schedule gates', () => {
  const base = { ...flag, enabled: true, killSwitch: false, rolloutPercentage: 100, clientVisible: true, entitlementKey: 'analytics', tenantAllowIds: ['tenant-1'], tenantDenyIds: [], countries: ['LK'], roles: ['admin'], dependencies: [], startsAt: new Date('2026-01-01'), endsAt: new Date('2027-01-01'), expiresAt: null };
  const context = { tenantId: 'tenant-1', userId: 'user-1', country: 'LK', role: 'admin', planFeatures: { analytics: true }, now: new Date('2026-07-18') };
  assert.equal(evaluateOne(base, context, new Map([[base.key, base]]), new Map()).enabled, true);
  assert.equal(evaluateOne({ ...base, killSwitch: true }, context, new Map(), new Map()).reason, 'kill_switch');
  assert.equal(evaluateOne(base, { ...context, planFeatures: {} }, new Map(), new Map()).reason, 'entitlement_missing');
  assert.equal(evaluateOne(base, { ...context, tenantId: 'tenant-2' }, new Map(), new Map()).reason, 'tenant_not_allowed');
  assert.equal(evaluateOne(base, { ...context, country: 'US' }, new Map(), new Map()).reason, 'country_not_targeted');
  assert.equal(evaluateOne(base, { ...context, role: 'customer' }, new Map(), new Map()).reason, 'role_not_targeted');
  assert.equal(evaluateOne(base, { ...context, now: new Date('2028-01-01') }, new Map(), new Map()).reason, 'schedule_ended');
  const dependency = { ...base, key: 'dependency', enabled: false, entitlementKey: '', tenantAllowIds: [], countries: [], roles: [] };
  const dependent = { ...base, dependencies: ['dependency'] };
  assert.equal(evaluateOne(dependent, context, new Map([[dependent.key, dependent], ['dependency', dependency]]), new Map()).reason, 'dependency_disabled');
});

test('runtime flag management APIs enforce dynamic RBAC, audit, and MFA kill switch', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/featureFlags.js'), 'utf8');
  const routes = source.split('\n').filter(line => /^router\.(get|post|put|delete)\(/.test(line.trim()));
  routes.forEach(line => assert.match(line, /requirePlatformPermission\('featureflags\.(view|manage)'\)/));
  const kill = routes.find(line => line.includes("/:id/kill")); assert.match(kill, /requireRecentStepUp\(\)/);
  const restore = routes.find(line => line.includes("/:id/restore")); assert.match(restore, /requireRecentStepUp\(\)/);
  assert.match(source, /req\.audit\.set/);
  assert.match(source, /assertNoDependencyCycle/);
  assert.doesNotMatch(source, /\['name', 'description', 'enabled', 'killSwitch'/);
});

test('public evaluation exposes only client-visible flags and never caches tenant decisions publicly', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/runtimeFeatureFlags.js'), 'utf8');
  assert.match(source, /clientVisibleOnly: true/);
  assert.match(source, /private, no-store/);
  assert.match(source, /Anonymous subject ID is required/);
  assert.match(source, /recordExposure/);
});

test('authenticated Admin evaluation uses database identity, tenant plan entitlements, and private cache semantics', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/adminRuntimeFlags.js'), 'utf8');
  assert.match(source, /router\.use\(auth\)/);
  assert.match(source, /req\.user\.tenantId/);
  assert.match(source, /planFeatures: tenant\.plan\?\.features/);
  assert.match(source, /clientVisibleOnly: true/);
  assert.match(source, /private, no-store/);
});

test('exposure subject identifiers use a keyed hash and tenant middleware composes entitlements with runtime flags', () => {
  const service = fs.readFileSync(path.join(__dirname, '../services/runtimeFeatureFlagService.js'), 'utf8');
  const tenant = fs.readFileSync(path.join(__dirname, '../middleware/tenant.js'), 'utf8');
  assert.match(service, /createHmac\('sha256'/);
  assert.match(service, /FEATURE_EXPOSURE_HASH_KEY/);
  assert.match(tenant, /req\.plan\?\.features/);
  assert.match(tenant, /evaluateFlags/);
  assert.match(tenant, /FEATURE_DISABLED/);
});
