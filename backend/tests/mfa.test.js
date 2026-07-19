'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MfaFactor = require('../models/MfaFactor');
const AuthSession = require('../models/AuthSession');
const { base32Decode, base32Encode, recoveryCodes, totpAt, verifyTotp } = require('../services/mfaService');

test('base32 encoding round trips binary MFA secrets', () => {
  const input = Buffer.from('12345678901234567890');
  assert.deepEqual(base32Decode(base32Encode(input)), input);
});

test('TOTP follows the RFC 6238 SHA1 test vector and permits bounded clock skew', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpAt(secret, 59000), '287082');
  assert.equal(verifyTotp(secret, '287082', 59000), true);
  assert.equal(verifyTotp(secret, '287082', 59000 + 5 * 30000), false);
});

test('MFA recovery codes are unique and appropriately random-shaped', () => {
  const codes = recoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  codes.forEach(code => assert.match(code, /^[A-F0-9]{8}-[A-F0-9]{8}$/));
});

test('MFA secrets and recovery hashes are excluded from normal queries', () => {
  assert.equal(MfaFactor.schema.path('encryptedSecret').options.select, false);
  assert.equal(MfaFactor.schema.path('recoveryCodeHashes').options.select, false);
  assert.ok(AuthSession.schema.path('mfaVerifiedAt'));
  assert.ok(AuthSession.schema.path('lastStepUpAt'));
});

test('MFA challenge is rate limited and sensitive routes require recent step-up', () => {
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(server, /app\.use\('\/api\/auth\/mfa\/challenge', loginLimiter\)/);
  const superadmin = fs.readFileSync(path.join(__dirname, '../routes/superadmin.js'), 'utf8');
  assert.match(superadmin, /delete\('\/tenants\/:id'.*requireRecentStepUp\(\)/);
  const integrations = fs.readFileSync(path.join(__dirname, '../routes/superadmin/integrations.js'), 'utf8');
  assert.match(integrations, /put\('\/:provider'.*requireRecentStepUp\(\)/);
});

test('Super Admin password and Google login issue MFA challenges before sessions', () => {
  const auth = fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
  assert.match(auth, /createChallengeToken\(user, 'password'\)/);
  assert.match(auth, /createChallengeToken\(user, 'google'\)/);
  assert.match(auth, /issueSession\(user, req, payload\.method, \{ mfaVerified: true \}\)/);
});
