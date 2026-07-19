'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PlatformNotificationTemplate = require('../models/PlatformNotificationTemplate');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('notification templates use explicit monotonic versions and bounded editable fields', () => {
  assert.equal(PlatformNotificationTemplate.schema.path('version').options.default, 1);
  assert.equal(PlatformNotificationTemplate.schema.path('version').options.min, 1);
  assert.equal(PlatformNotificationTemplate.schema.path('subject').options.maxlength, 240);
  assert.equal(PlatformNotificationTemplate.schema.path('body').options.maxlength, 100000);
});

test('template updates require dynamic permission and optimistic version concurrency', () => {
  const route = read('routes/superadmin/notificationsCenter.js');
  assert.match(route, /templates\/:id', requirePlatformPermission\('notifications\.manage'\)/);
  assert.match(route, /expectedVersion/);
  assert.match(route, /findOneAndUpdate\(\{ _id: req\.params\.id, version: expectedVersion \}/);
  assert.match(route, /\$inc: \{ version: 1 \}/);
  assert.match(route, /status\(409\).*Template changed since it was opened/s);
  assert.match(route, /changedFields/);
  assert.match(route, /resultingVersion/);
});

test('inline editor saves allowlisted fields as a new version and handles conflicts', () => {
  const ui = read('../frontend/src/pages/superadmin/SuperAdminNotificationsCenter.js');
  assert.match(ui, /Save new version/);
  assert.match(ui, /expectedVersion: item\.version/);
  assert.match(ui, /expectedVersion: editingTemplate\.expectedVersion/);
  assert.match(ui, /error\.response\?\.status === 409/);
  assert.match(ui, /setEditingTemplate\(null\)/);
  assert.match(ui, /allowedVariables\.split\(','\)/);
});

test('view, manage, and send capabilities produce distinct notification controls', () => {
  const dashboard = read('../frontend/src/pages/superadmin/SuperAdminDashboard.js');
  const ui = read('../frontend/src/pages/superadmin/SuperAdminNotificationsCenter.js');
  assert.match(dashboard, /canManage=\{platformPermissions\?\.includes\('notifications\.manage'\)\}/);
  assert.match(dashboard, /canSend=\{platformPermissions\?\.includes\('notifications\.send'\)\}/);
  assert.match(ui, /canManage && <button[^>]*onClick=\{\(\) => onEdit\(item\)\}/);
  assert.match(ui, /item\.eventKey === 'deployment_complete' && canSend/);
  assert.match(ui, /item\.status === 'draft' && canSend/);
  assert.match(ui, /canManage && \['dead', 'failed'\]\.includes\(item\.status\)/);
  assert.match(ui, /disabled=\{!canManage\}/);
});

test('notification data remains usable when optional tenant or plan reads are forbidden', () => {
  const ui = read('../frontend/src/pages/superadmin/SuperAdminNotificationsCenter.js');
  assert.match(ui, /Promise\.allSettled\(\[API\.get\('\/superadmin\/tenants'\), API\.get\('\/superadmin\/plans'\)\]\)/);
  assert.match(ui, /tenantResult\.status === 'fulfilled'/);
  assert.match(ui, /planResult\.status === 'fulfilled'/);
});
