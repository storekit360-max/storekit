'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../config/platformSettingsRegistry');
const PlatformSetting = require('../models/PlatformSetting');
const { defaults, publicSettings, validateValue } = require('../services/platformSettingsService');
const { isMaintenanceExempt } = require('../middleware/platformPolicy');

test('platform setting keys are unique, typed, and have valid defaults', () => {
  assert.equal(new Set(registry.definitions.map(item => item.key)).size, registry.definitions.length);
  for (const definition of registry.definitions) assert.doesNotThrow(() => validateValue(definition, definition.defaultValue));
  assert.equal(defaults()['platform.name'], 'StoreKit');
});

test('platform setting validation rejects unsafe or malformed values', () => {
  assert.throws(() => validateValue(registry.byKey.get('platform.logoUrl'), 'javascript:alert(1)'), /HTTPS/);
  assert.throws(() => validateValue(registry.byKey.get('platform.primaryColor'), 'red'), /hex color/);
  assert.throws(() => validateValue(registry.byKey.get('localization.currency'), 'rupees'), /invalid format/);
  assert.throws(() => validateValue(registry.byKey.get('registration.enabled'), 'true'), /true or false/);
  assert.throws(() => validateValue(registry.byKey.get('security.passwordMinLength'), 7), /at least 8/);
  assert.throws(() => validateValue(registry.byKey.get('uploads.imageMaxMb'), 51), /at most 50/);
  assert.throws(() => validateValue(registry.byKey.get('security.cookiePolicy'), 'implicit'), /unsupported value/);
});

test('public platform settings never expose an unregistered value', () => {
  const values = { ...defaults(), 'private.secret': 'unsafe' };
  const output = publicSettings(values);
  assert.equal(Object.hasOwn(output, 'private.secret'), false);
  assert.equal(output['maintenance.enabled'], false);
});

test('maintenance exemptions preserve health and Super Admin recovery only', () => {
  assert.equal(isMaintenanceExempt('/api/health'), true);
  assert.equal(isMaintenanceExempt('/api/superadmin/security'), true);
  assert.equal(isMaintenanceExempt('/api/auth/superadmin/google'), true);
  assert.equal(isMaintenanceExempt('/api/products'), false);
  assert.equal(isMaintenanceExempt('/api/auth/login'), false);
});

test('platform settings schema and endpoints are auditable and permission protected', () => {
  assert.ok(PlatformSetting.schema.path('updatedBy'));
  const route = fs.readFileSync(path.join(__dirname, '../routes/superadmin/platformSettings.js'), 'utf8');
  assert.match(route, /requirePlatformPermission\('settings\.view'\)/);
  assert.match(route, /requirePlatformPermission\('settings\.manage'\)/);
  assert.match(route, /requireRecentStepUp\(\)/);
  assert.match(route, /security\.mfaPolicy.*platform_required/);
  assert.match(route, /revokeAllUserSessions/);
  assert.match(route, /platform\.settings\.update/);
  const auth = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  assert.match(auth, /REGISTRATION_CLOSED/);
});

test('security and upload policies are enforced by runtime paths', () => {
  const auth = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  const sessions = fs.readFileSync(path.join(__dirname, '../services/authSessionService.js'), 'utf8');
  const uploads = fs.readFileSync(path.join(__dirname, '../routes/upload.js'), 'utf8');
  assert.match(auth, /security\.passwordMinLength/);
  assert.match(auth, /security\.passwordRequireSpecial/);
  assert.match(auth, /security\.mfaPolicy/);
  assert.match(sessions, /security\.sessionTimeoutMinutes/);
  assert.match(sessions, /expiresIn/);
  assert.match(uploads, /uploads\.imageMaxMb/);
  assert.match(uploads, /uploads\.bulkArchiveMaxMb/);
  assert.match(uploads, /discardUploadedFile/);
});

test('tracking resources and events remain gated until explicit consent', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../frontend/public/index.html'), 'utf8');
  const analytics = fs.readFileSync(path.join(__dirname, '../../frontend/src/hooks/useAnalytics.js'), 'utf8');
  const seo = fs.readFileSync(path.join(__dirname, '../../frontend/src/hooks/useSEO.js'), 'utf8');
  const consent = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/CookieConsent.js'), 'utf8');
  assert.doesNotMatch(html, /src=['"]https:\/\/connect\.facebook\.net/);
  assert.doesNotMatch(html, /dns-prefetch[^>]+(?:facebook|googletagmanager)/);
  assert.match(analytics, /analyticsConsentAllowed\(\).*window\.fbq/);
  assert.match(analytics, /fb-pixel-loader/);
  assert.match(seo, /analyticsConsentAllowed\(\)/);
  assert.match(consent, /window\.__STOREKIT_COOKIE_POLICY__/);
  assert.match(consent, /window\.fbq\.queue\.length=0/);
});
