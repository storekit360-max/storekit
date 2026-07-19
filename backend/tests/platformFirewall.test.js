'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const firewall = require('../services/platformFirewallService');
const PlatformSecurityRule = require('../models/PlatformSecurityRule');

test('network rules canonicalize addresses and match exact and CIDR sources', () => {
  assert.equal(firewall.normalizeRule('203.0.113.47/24'), '203.0.113.0/24');
  assert.equal(firewall.normalizeRule('::ffff:192.0.2.4'), '192.0.2.4');
  assert.equal(firewall.matches('203.0.113.0/24', '203.0.113.99'), true);
  assert.equal(firewall.matches('203.0.113.0/24', '203.0.114.1'), false);
  assert.equal(firewall.matches('2001:db8::1', '2001:db8::1'), true);
  assert.throws(() => firewall.normalizeRule('203.0.113.1/33'), /CIDR/);
  assert.throws(() => firewall.normalizeRule('not-an-ip'), /valid IPv4 or IPv6/);
  assert.equal(firewall.normalizeCountry('lk'), 'LK');
  assert.throws(() => firewall.normalizeCountry('XX'), /valid two-letter ISO/);
});

test('application firewall rules are method-aware, prefix-bounded, and preserve recovery routes', () => {
  assert.equal(firewall.normalizeRouteRule('post', '/api/orders'), 'POST /api/orders');
  assert.equal(firewall.normalizeRouteRule('*', '/api/orders/*'), '* /api/orders/*');
  assert.equal(firewall.routeMatches('POST /api/orders', 'POST', '/api/orders'), true);
  assert.equal(firewall.routeMatches('POST /api/orders', 'GET', '/api/orders'), false);
  assert.equal(firewall.routeMatches('* /api/orders/*', 'DELETE', '/api/orders/123'), true);
  assert.equal(firewall.routeMatches('* /api/orders/*', 'GET', '/api/order-status'), false);
  assert.throws(() => firewall.normalizeRouteRule('*', '/api/*'), /protected/);
  assert.throws(() => firewall.normalizeRouteRule('POST', '/api/payments/stripe/webhook'), /protected/);
  assert.throws(() => firewall.normalizeRouteRule('DELETE', '/api/superadmin/access'), /protected/);
  assert.throws(() => firewall.normalizeRouteRule('TRACE', '/api/orders'), /supported HTTP method/);
  assert.throws(() => firewall.normalizeRouteRule('GET', '/api/orders/**'), /trailing/);
  assert.equal(firewall.isProtectedPath('/api/superadmin/security/network-rules'), true);
  assert.equal(firewall.isProtectedPath('/api/payments/stripe/webhook'), true);
  assert.equal(firewall.isProtectedPath('/api/orders'), false);
  assert.ok(PlatformSecurityRule.schema.path('kind').enumValues.includes('route_block'));
  assert.ok(PlatformSecurityRule.schema.path('lastMatchedPath'));
});

test('geo context trusts country metadata only with configured edge attestation', () => {
  const previousHeader = process.env.TRUSTED_GEO_HEADER; const previousSecret = process.env.TRUSTED_EDGE_PROXY_SECRET;
  process.env.TRUSTED_GEO_HEADER = 'x-vercel-ip-country'; process.env.TRUSTED_EDGE_PROXY_SECRET = 'test-edge-secret-that-is-at-least-thirty-two-characters';
  const headers = { 'x-vercel-ip-country': 'lk', 'x-storekit-edge-secret': process.env.TRUSTED_EDGE_PROXY_SECRET };
  try {
    assert.deepEqual(firewall.geoContext({ get: key => headers[String(key).toLowerCase()] }), { configured: true, trusted: true, country: 'LK', header: 'x-vercel-ip-country' });
    headers['x-storekit-edge-secret'] = 'spoofed';
    assert.equal(firewall.geoContext({ get: key => headers[String(key).toLowerCase()] }).trusted, false);
  } finally {
    if (previousHeader === undefined) delete process.env.TRUSTED_GEO_HEADER; else process.env.TRUSTED_GEO_HEADER = previousHeader;
    if (previousSecret === undefined) delete process.env.TRUSTED_EDGE_PROXY_SECRET; else process.env.TRUSTED_EDGE_PROXY_SECRET = previousSecret;
  }
});

test('firewall is globally enforced and management requires RBAC plus MFA step-up', () => {
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '../routes/superadmin/security.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '../services/platformFirewallService.js'), 'utf8');
  assert.match(server, /app\.use\(require\('\.\/services\/platformFirewallService'\)\.platformFirewall\)/);
  assert.match(routes, /network-rules', requirePlatformPermission\('security\.manage'\), requireRecentStepUp\(\)/);
  assert.match(routes, /would lock you out/);
  assert.match(routes, /security\.network-rule\.(create|disable)/);
  assert.match(service, /req\.path === '\/api\/health'/);
  assert.match(service, /NETWORK_ACCESS_DENIED/);
  assert.match(service, /EDGE_ATTESTATION_REQUIRED/);
  assert.match(service, /APPLICATION_FIREWALL_DENIED/);
  assert.match(service, /normalizeRouteRule/);
  assert.match(service, /timingSafeEqual/);
  assert.match(routes, /Geo blocking requires a configured and attested edge request/);
  assert.match(routes, /\['country_block', 'route_block'\]/);
});
