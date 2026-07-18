'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('super admin Google sign-in never creates or promotes users', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  const route = source.slice(source.indexOf("router.post('/superadmin/google'"), source.indexOf('// All tenant domains'));
  assert.match(route, /role: 'superadmin', tenantId: null/);
  assert.match(route, /email_verified/);
  assert.doesNotMatch(route, /User\.create|role\s*=\s*['"]superadmin/);
});

test('super admin Google authentication is protected by login rate limiting', () => {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(source, /app\.use\('\/api\/auth\/superadmin\/google', loginLimiter\)/);
});
