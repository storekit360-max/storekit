'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('tenant impersonation is permission gated, MFA stepped-up, short-lived, and audited', () => {
  const route = read('routes/superadmin/tenantWorkspace.js');
  const sessions = read('services/authSessionService.js');
  assert.match(route, /requirePlatformPermission\('tenant\.impersonate'\), requireRecentStepUp\(\)/);
  assert.match(route, /reason\.length < 10/);
  assert.match(route, /status: 'active'/);
  assert.match(route, /tenant\.impersonation\.start/);
  assert.match(sessions, /expiresIn: '15m'/);
  assert.match(sessions, /authMethod: 'impersonation'/);
  assert.match(sessions, /impersonatedBy: actor\._id/);
});

test('admin UI preserves the platform session per-tab and renders an exit warning', () => {
  const workspace = read('../frontend/src/pages/superadmin/SuperAdminTenantWorkspace.js');
  const layout = read('../frontend/src/pages/admin/AdminLayout.js');
  assert.match(workspace, /sessionStorage\.setItem\('storekit:platform-token'/);
  assert.match(workspace, /Impersonate \{details\.tenant\.storeName\} for 15 minutes/);
  assert.match(layout, /role="alert"/);
  assert.match(layout, /Exit impersonation/);
  assert.match(layout, /sessionStorage\.removeItem\('storekit:impersonation'\)/);
});
