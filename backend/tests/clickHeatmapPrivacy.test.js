'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('behavior events expire and carry consent-versioned coarse interaction data', () => {
  const model = read('models/BehaviorEvent.js');
  const user = read('models/User.js');
  assert.match(model, /consentRevision:\s*\{\s*type:\s*Number,\s*required:\s*true/);
  assert.match(model, /normalizedX:[\s\S]*max:\s*0\.999/);
  assert.match(model, /normalizedY:[\s\S]*max:\s*0\.999/);
  assert.match(model, /expireAfterSeconds:\s*180\s*\*\s*24\s*\*\s*60\s*\*\s*60/);
  assert.match(user, /marketingConsent:[\s\S]*revision:\s*\{\s*type:\s*Number/);
});

test('marketing event ingestion is bounded, consent gated, and withdrawal erases history', () => {
  const route = read('routes/marketing.js');
  assert.match(route, /eventLimiter/);
  assert.match(route, /max:\s*120/);
  assert.match(route, /marketingConsent\.granted/);
  assert.match(route, /\$inc:\s*\{\s*'marketingConsent\.revision':\s*1/);
  assert.match(route, /BehaviorEvent\.deleteMany\(\{[^}]*customer:/);
  assert.match(route, /eventType==='storefront_click'/);
  assert.match(route, /source:eventType==='storefront_click'\?'storefront_heatmap'/);
  assert.match(route, /metadata:eventType==='storefront_click'\?\{\}/);
  assert.match(route, /normalizedX/);
  assert.match(route, /BehaviorEvent\.deleteOne\(\{_id:event\._id\}\)/);
});

test('heatmap API is aggregate-only and applies a three-customer threshold', () => {
  const service = read('services/platformAnalyticsService.js');
  const route = read('routes/superadmin/analytics.js');
  assert.match(service, /\$floor:[\s\S]*\$multiply:[\s\S]*normalizedX/);
  assert.match(service, /customers:\s*\{\s*\$addToSet:\s*'\$customer'/);
  assert.match(service, /\$match:\s*\{\s*customers:\s*\{\s*\$gte:\s*3/);
  assert.match(service, /No DOM text, selector, query string, raw URL or pixel coordinate is stored/);
  assert.doesNotMatch(service, /customer:\s*'\$customer'/);
  assert.match(route, /click-heatmap/);
  assert.match(route, /requirePlatformPermission\('analytics\.view'\)/);
  assert.match(route, /isValidObjectId\(tenantId\)/);
});

test('storefront capture and dashboard enforce the privacy contract', () => {
  const hook = read('../frontend/src/hooks/useStorefrontClickAnalytics.js');
  const layout = read('../frontend/src/pages/customer/CustomerLayout.js');
  const account = read('../frontend/src/pages/customer/Account.js');
  const analytics = read('../frontend/src/pages/superadmin/SuperAdminAnalytics.js');
  assert.match(hook, /user\.role\s*!==\s*'customer'/);
  assert.match(hook, /analyticsConsentAllowed\(\)/);
  assert.match(hook, /MAX_SESSION_EVENTS\s*=\s*60/);
  assert.match(hook, /MIN_INTERVAL_MS\s*=\s*750/);
  assert.match(hook, /closest\?\.\('a,button,\[role="button"\],input\[type="submit"\]'/);
  assert.match(hook, /normalizedX/);
  assert.doesNotMatch(hook, /textContent|innerText|selector:/);
  assert.match(layout, /useStorefrontClickAnalytics\(user\)/);
  assert.match(account, /storekit:marketing-consent/);
  assert.match(account, /prior behavior history deleted/);
  assert.match(analytics, /Privacy-safe click heatmap/);
  assert.match(analytics, /three-customer privacy threshold/);
});
