'use strict';

const net = require('node:net');
const crypto = require('node:crypto');
const PlatformSecurityRule = require('../models/PlatformSecurityRule');

const CACHE_MS = 10000;
const HTTP_METHODS = new Set(['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const PROTECTED_PATHS = ['/api/health', '/api/superadmin', '/api/payments/stripe/webhook', '/api/payments/payhere/notify'];

function isProtectedPath(pathValue) {
  const path = String(pathValue || '');
  return PROTECTED_PATHS.some(item => path === item || (item === '/api/superadmin' && path.startsWith(`${item}/`)));
}
let cache = { expiresAt: 0, rules: [] };

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

function ipv4Number(ip) {
  if (net.isIP(ip) !== 4) return null;
  return ip.split('.').reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0) >>> 0;
}

function normalizeRule(value) {
  const raw = String(value || '').trim();
  if (!raw.includes('/')) {
    const ip = normalizeIp(raw);
    if (!net.isIP(ip)) throw Object.assign(new Error('Enter a valid IPv4 or IPv6 address'), { statusCode: 400 });
    return ip;
  }
  const [address, prefixText, extra] = raw.split('/');
  const ip = normalizeIp(address);
  const prefix = Number(prefixText);
  if (extra !== undefined || net.isIP(ip) !== 4 || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw Object.assign(new Error('CIDR rules must be valid IPv4 networks with a /0 to /32 prefix'), { statusCode: 400 });
  }
  const numeric = ipv4Number(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (numeric & mask) >>> 0;
  const canonical = [network >>> 24, (network >>> 16) & 255, (network >>> 8) & 255, network & 255].join('.');
  return `${canonical}/${prefix}`;
}

function normalizeCountry(value) {
  const country = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country) || ['XX', 'ZZ'].includes(country)) throw Object.assign(new Error('Country rules require a valid two-letter ISO country code'), { statusCode: 400 });
  return country;
}

function normalizeRouteRule(methodValue, pathValue) {
  const method = String(methodValue || '*').trim().toUpperCase();
  const path = String(pathValue || '').trim();
  if (!HTTP_METHODS.has(method)) throw Object.assign(new Error('Choose a supported HTTP method or any method'), { statusCode: 400 });
  if (!path.startsWith('/api/') || path.length > 500 || /[?#\s\\]/.test(path) || path.includes('..') || path.includes('//')) {
    throw Object.assign(new Error('Route rules require a clean /api/... path without query strings or traversal segments'), { statusCode: 400 });
  }
  if (path.includes('*') && !path.endsWith('/*')) throw Object.assign(new Error('A route wildcard is allowed only as a trailing /* prefix match'), { statusCode: 400 });
  if ((path.match(/\*/g) || []).length > 1) throw Object.assign(new Error('Route rules may contain only one trailing wildcard'), { statusCode: 400 });
  const prefix = path.endsWith('/*') ? path.slice(0, -1) : null;
  if (PROTECTED_PATHS.some(protectedPath => path === protectedPath || (prefix && protectedPath.startsWith(prefix)) || (protectedPath === '/api/superadmin' && path.startsWith('/api/superadmin/')))) {
    throw Object.assign(new Error('This route is protected for health, provider callbacks, or Super Admin recovery and cannot be blocked'), { statusCode: 409 });
  }
  return `${method} ${path}`;
}

function routeMatches(ruleValue, requestMethod, requestPath) {
  const separator = ruleValue.indexOf(' ');
  if (separator < 1) return false;
  const method = ruleValue.slice(0, separator); const pattern = ruleValue.slice(separator + 1);
  if (method !== '*' && method !== String(requestMethod || '').toUpperCase()) return false;
  return pattern.endsWith('/*') ? String(requestPath || '').startsWith(pattern.slice(0, -1)) : String(requestPath || '') === pattern;
}

function geoConfiguration() {
  const header = String(process.env.TRUSTED_GEO_HEADER || '').trim().toLowerCase();
  const secret = String(process.env.TRUSTED_EDGE_PROXY_SECRET || '');
  return { configured: /^[a-z0-9-]{3,80}$/.test(header) && secret.length >= 32, header, secret };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function geoContext(req) {
  const config = geoConfiguration();
  const trusted = config.configured && safeEqual(req.get('x-storekit-edge-secret'), config.secret);
  let country = '';
  if (trusted) { try { country = normalizeCountry(req.get(config.header)); } catch {} }
  return { configured: config.configured, trusted, country, header: config.header };
}

function matches(ruleValue, candidate) {
  const ip = normalizeIp(candidate);
  if (!ruleValue.includes('/')) return ip === ruleValue;
  const [network, prefixText] = ruleValue.split('/');
  const value = ipv4Number(ip);
  if (value === null) return false;
  const prefix = Number(prefixText);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((value & mask) >>> 0) === ((ipv4Number(network) & mask) >>> 0);
}

async function activeRules() {
  if (cache.expiresAt > Date.now()) return cache.rules;
  const now = new Date();
  const rules = await PlatformSecurityRule.find({ active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }).select('_id kind value reason expiresAt').lean();
  cache = { rules, expiresAt: Date.now() + CACHE_MS };
  return rules;
}

function invalidateFirewallCache() { cache = { expiresAt: 0, rules: [] }; }

async function findBlockingRule(ip, country = '', method = '', path = '') {
  const now = Date.now();
  const rule = (await activeRules()).find(item => (!item.expiresAt || new Date(item.expiresAt).getTime() > now) && (item.kind === 'country_block' ? item.value === country : item.kind === 'route_block' ? !isProtectedPath(path) && routeMatches(item.value, method, path) : matches(item.value, ip)));
  if (rule) PlatformSecurityRule.updateOne({ _id: rule._id }, { $inc: { hitCount: 1 }, $set: { lastMatchedAt: new Date(), lastMatchedIp: normalizeIp(ip), lastMatchedPath: String(path || '').slice(0, 500) } }).catch(() => {});
  return rule || null;
}

async function platformFirewall(req, res, next) {
  if (req.path === '/api/health') return next();
  try {
    const rules = await activeRules();
    const hasCountryPolicy = rules.some(item => item.kind === 'country_block' && (!item.expiresAt || new Date(item.expiresAt) > new Date()));
    const machineEndpoint = ['/api/payments/stripe/webhook', '/api/payments/payhere/notify'].includes(String(req.path));
    const geo = geoContext(req);
    if (hasCountryPolicy && !machineEndpoint && !geo.trusted) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(403).json({ code: 'EDGE_ATTESTATION_REQUIRED', message: 'This platform requires access through its trusted regional edge', correlationId: req.correlationId });
    }
    const rule = await findBlockingRule(req.ip || req.socket?.remoteAddress, geo.country, req.method, req.path);
    if (!rule) return next();
    res.setHeader('Cache-Control', 'no-store');
    if (rule.kind === 'route_block') return res.status(403).json({ code: 'APPLICATION_FIREWALL_DENIED', message: 'This operation is temporarily unavailable by platform security policy', correlationId: req.correlationId });
    return res.status(403).json({ code: 'NETWORK_ACCESS_DENIED', message: 'Access from this network is blocked by platform security policy', correlationId: req.correlationId });
  } catch (error) {
    console.error('[FIREWALL_CHECK_FAILED]', { correlationId: req.correlationId, message: error.message });
    return next();
  }
}

module.exports = { HTTP_METHODS, PROTECTED_PATHS, isProtectedPath, normalizeIp, normalizeRule, normalizeCountry, normalizeRouteRule, matches, routeMatches, geoConfiguration, geoContext, findBlockingRule, invalidateFirewallCache, platformFirewall };
