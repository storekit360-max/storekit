'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const AuthEvent = require('../models/AuthEvent');
const { generateToken } = require('../middleware/auth');
const { deviceLabel } = require('../services/authSessionService');

test('JWTs carry token version and optional server session ID', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-jwt-secret';
  const token = generateToken({ _id: '507f1f77bcf86cd799439011', tokenVersion: 4 }, { sessionId: 'session-123', tokenVersion: 4 });
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  assert.equal(decoded.id, '507f1f77bcf86cd799439011');
  assert.equal(decoded.ver, 4);
  assert.equal(decoded.jti, 'session-123');
  if (previous === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previous;
});

test('security schemas support revocation, expiry, auth outcomes and token invalidation', () => {
  assert.ok(User.schema.path('tokenVersion'));
  assert.ok(AuthSession.schema.path('revokedAt'));
  assert.ok(AuthSession.schema.path('expiresAt'));
  assert.ok(AuthEvent.schema.path('outcome'));
  assert.ok(AuthEvent.schema.indexes().some(([fields]) => fields.outcome === 1 && fields.occurredAt === -1));
});

test('device labels disclose only coarse browser and operating system', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari/605.1'), 'Safari on macOS');
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/126.0'), 'Chrome on Windows');
});

test('security center endpoints require dynamic security permissions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/security.js'), 'utf8');
  const routes = source.split('\n').filter(line => /^router\.(get|post|put|delete)\(/.test(line.trim()));
  assert.ok(routes.length >= 6);
  routes.forEach(line => assert.match(line, /requirePlatformPermission\('security\.(view|manage)'\)/));
  assert.match(source, /tokenVersion: 1/);
});

test('password login is tenant-scoped and emits authentication events', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  const login = source.slice(source.indexOf("router.post('/login'"), source.indexOf('// ─── Google OAuth'));
  assert.match(login, /User\.findOne\(\{ tenantId, email: normalizedEmail \}\)/);
  assert.match(login, /issueSession\(user, req, 'password'\)/);
  assert.match(login, /recordAuthEvent/);
});
