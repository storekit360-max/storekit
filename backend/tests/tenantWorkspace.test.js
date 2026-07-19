'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Tenant = require('../models/Tenant');
const TenantNote = require('../models/TenantNote');
const PlatformSavedView = require('../models/PlatformSavedView');
const { calculateTenantHealth } = require('../services/tenantHealthService');
const { cleanTags, normalizeInlineMetadata, normalizeSavedView } = require('../routes/superadmin/tenantWorkspace');

test('healthy tenant receives a healthy deterministic score', () => {
  const result = calculateTenantHealth({ status: 'active', billing: { subscriptionStatus: 'active' }, domains: [{ active: true, verified: true }] }, { activeAdmins: 1, activeProducts: 2, lastOrderAt: new Date() });
  assert.equal(result.score, 100);
  assert.equal(result.riskScore, 0);
  assert.equal(result.band, 'healthy');
});

test('tenant health exposes actionable risk signals', () => {
  const result = calculateTenantHealth({ status: 'suspended', billing: { subscriptionStatus: 'past_due' }, domains: [], management: { archivedAt: new Date() } }, { activeAdmins: 0, activeProducts: 0 });
  assert.equal(result.score, 0);
  assert.equal(result.riskScore, 100);
  assert.ok(result.signals.some(signal => signal.code === 'billing_past_due'));
  assert.ok(result.signals.some(signal => signal.code === 'tenant_archived'));
});

test('tenant tags are normalized, deduplicated and bounded', () => {
  const tags = cleanTags([' VIP ', 'vip', '', 'At Risk', ...Array.from({ length: 30 }, (_, index) => `tag-${index}`)]);
  assert.equal(tags[0], 'vip');
  assert.equal(tags[1], 'at risk');
  assert.equal(tags.length, 20);
});

test('inline tenant metadata accepts only bounded names, tags, and a concurrency timestamp', () => {
  const updatedAt = '2026-07-18T10:20:30.000Z';
  const result = normalizeInlineMetadata({ storeName: '  Example   Store  ', tags: [' VIP ', 'vip', 'At Risk'], expectedUpdatedAt: updatedAt, status: 'suspended', billing: { subscriptionStatus: 'active' } });
  assert.equal(result.changes.storeName, 'Example Store');
  assert.deepEqual(result.changes['management.tags'], ['vip', 'at risk']);
  assert.equal(result.changes.status, undefined);
  assert.equal(result.changes.billing, undefined);
  assert.equal(result.expectedUpdatedAt.toISOString(), updatedAt);
  assert.throws(() => normalizeInlineMetadata({ storeName: 'x', expectedUpdatedAt: updatedAt }), /2 to 120/);
  assert.throws(() => normalizeInlineMetadata({ storeName: 'Valid' }), /expectedUpdatedAt/);
  assert.throws(() => normalizeInlineMetadata({ status: 'active', expectedUpdatedAt: updatedAt }), /Store name or tags/);
});

test('tenant workspace data is represented by indexed schemas', () => {
  assert.ok(Tenant.schema.path('management.tags'));
  assert.ok(Tenant.schema.path('management.archivedAt'));
  assert.ok(TenantNote.schema.path('tenantId'));
  assert.ok(TenantNote.schema.indexes().some(([fields]) => fields.tenantId === 1 && fields.createdAt === -1));
});

test('saved tenant views accept only bounded allowlisted state', () => {
  const result = normalizeSavedView({ name: '  At Risk Stores  ', isDefault: true, state: { filters: { search: ' overdue ', status: 'suspended', archived: 'all', injected: { $where: 'attack' } }, columns: ['secret'] } });
  assert.equal(result.name, 'At Risk Stores');
  assert.deepEqual(result.state.filters, { search: 'overdue', status: 'suspended', archived: 'all' });
  assert.equal(result.isDefault, true);
  assert.equal(result.state.columns, undefined);
  assert.throws(() => normalizeSavedView({ name: 'x', state: { filters: {} } }), /2 to 80/);
  assert.throws(() => normalizeSavedView({ name: 'Valid', state: { filters: { status: 'deleted' } } }), /status filter/);
});

test('saved views enforce operator ownership, uniqueness, one default, and bounded count', () => {
  assert.ok(PlatformSavedView.schema.path('ownerId'));
  assert.ok(PlatformSavedView.schema.path('state.filters.search'));
  const indexes = PlatformSavedView.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.ownerId === 1 && fields.normalizedName === 1 && options.unique));
  assert.ok(indexes.some(([fields, options]) => fields.isDefault === 1 && options.unique && options.partialFilterExpression?.isDefault === true));
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/tenantWorkspace.js'), 'utf8');
  assert.match(source, /ownerId: req\.user\._id, module: SAVED_VIEW_MODULE/g);
  assert.match(source, /maximum of 20 saved tenant views/);
  assert.match(source, /tenant\.saved-view\.(create|default|delete)/);
});

test('tenant workspace is permission protected and does not estimate storage', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/tenantWorkspace.js'), 'utf8');
  const routes = source.split('\n').filter(line => /^router\.(get|post|put|delete)\(/.test(line.trim()));
  routes.forEach(line => assert.match(line, /requirePlatformPermission\('tenant\.(view|edit|impersonate)'\)/));
  assert.match(source, /status: 'not_metered'/);
  assert.doesNotMatch(source, /storageMb.*image|imageCount.*0\.25/);
  const frontend = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/superadmin/SuperAdminTenantWorkspace.js'), 'utf8');
  assert.match(frontend, /saved-views\/list/);
  assert.match(frontend, /Make default/);
  assert.match(frontend, /Delete selected saved tenant view/);
});

test('inline tenant metadata is atomic, audited, conflict-aware, and accessible', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/tenantWorkspace.js'), 'utf8');
  const frontend = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/superadmin/SuperAdminTenantWorkspace.js'), 'utf8');
  assert.match(source, /router\.put\('\/:id\/metadata', requirePlatformPermission\('tenant\.edit'\)/);
  assert.match(source, /findOne\(\{ _id: req\.params\.id, updatedAt: expectedUpdatedAt \}/);
  assert.match(source, /updateOne\(\{ _id: req\.params\.id, updatedAt: expectedUpdatedAt \}/);
  assert.match(source, /status\(409\)/);
  assert.match(source, /tenant\.metadata\.update/);
  assert.match(source, /changedFields: Object\.keys\(changes\)/);
  assert.match(frontend, /expectedUpdatedAt: row\.updatedAt/);
  assert.match(frontend, /Edit \$\{row\.storeName\} metadata inline/);
  assert.match(frontend, /canEdit && <button/);
  assert.match(frontend, /Save metadata/);
  assert.match(frontend, /error\.response\?\.status === 409/);
  const dashboard = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/superadmin/SuperAdminDashboard.js'), 'utf8');
  assert.match(dashboard, /canEdit=\{platformPermissions\?\.includes\('tenant\.edit'\)\}/);
});
