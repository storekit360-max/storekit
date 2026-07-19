'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CryptographicKeyAttestation = require('../models/CryptographicKeyAttestation');
const platformCrypto = require('../utils/platformSecretCrypto');

const envNames = ['PLATFORM_SECRETS_ENCRYPTION_KEY', 'PLATFORM_SECRETS_ENCRYPTION_KEYS', 'PLATFORM_SECRETS_ENCRYPTION_KEY_ID', 'SOCIAL_MEDIA_SECRET'];
const saved = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
test.afterEach(() => { for (const [name, value] of Object.entries(saved)) value === undefined ? delete process.env[name] : process.env[name] = value; });

test('platform encrypted secrets support versioned retained-key rotation', () => {
  delete process.env.PLATFORM_SECRETS_ENCRYPTION_KEY; delete process.env.SOCIAL_MEDIA_SECRET;
  process.env.PLATFORM_SECRETS_ENCRYPTION_KEYS = JSON.stringify({ old: 'old-platform-encryption-material-at-least-32-characters', current: 'current-platform-encryption-material-at-least-32-characters' });
  process.env.PLATFORM_SECRETS_ENCRYPTION_KEY_ID = 'old';
  const oldPayload = platformCrypto.encryptPlatformSecret('rotatable-secret');
  assert.equal(oldPayload.keyId, 'old');
  process.env.PLATFORM_SECRETS_ENCRYPTION_KEY_ID = 'current';
  assert.equal(platformCrypto.decryptPlatformSecret(oldPayload), 'rotatable-secret');
  assert.equal(platformCrypto.encryptPlatformSecret('new-secret').keyId, 'current');
  assert.equal(platformCrypto.platformKeyStatus().rotationReady, true);
});

test('legacy payloads remain readable only while the legacy key is retained', () => {
  delete process.env.PLATFORM_SECRETS_ENCRYPTION_KEYS; delete process.env.PLATFORM_SECRETS_ENCRYPTION_KEY_ID;
  process.env.PLATFORM_SECRETS_ENCRYPTION_KEY = 'legacy-platform-secret-material-at-least-32-characters';
  const payload = platformCrypto.encryptPlatformSecret('legacy-secret'); delete payload.keyId;
  assert.equal(platformCrypto.decryptPlatformSecret(payload), 'legacy-secret');
  delete process.env.PLATFORM_SECRETS_ENCRYPTION_KEY;
  assert.throws(() => platformCrypto.decryptPlatformSecret(payload), /legacy.*unavailable/i);
});

test('key lifecycle attestations are append-only metadata with no secret field', () => {
  assert.deepEqual(CryptographicKeyAttestation.schema.path('purpose').enumValues, ['jwt_signing', 'backup_encryption', 'platform_secret_encryption']);
  assert.deepEqual(CryptographicKeyAttestation.schema.path('action').enumValues, ['deployed', 'verified', 'retired']);
  assert.equal(CryptographicKeyAttestation.schema.path('secret'), undefined);
  assert.equal(CryptographicKeyAttestation.schema.path('attestedAt').options.immutable, true);
  assert.ok(CryptographicKeyAttestation.schema.indexes().some(([fields]) => fields.purpose === 1 && fields.keyId === 1));
});

test('security key workflows require RBAC, MFA, confirmation, audit, and zero-reference retirement', () => {
  const route = fs.readFileSync(path.join(__dirname, '../routes/superadmin/security.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '../services/cryptographicKeyService.js'), 'utf8');
  const ui = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/superadmin/SuperAdminSecurity.js'), 'utf8');
  assert.match(route, /key-lifecycle\/attest', requirePlatformPermission\('security\.manage'\), requireRecentStepUp/);
  assert.match(route, /key-lifecycle\/platform-secrets\/migrate', requirePlatformPermission\('security\.manage'\), requireRecentStepUp/);
  assert.match(route, /RETIRE \$\{purpose\.toUpperCase\(\)\} \$\{keyId\}/);
  assert.match(route, /MIGRATE PLATFORM SECRETS/);
  assert.match(route, /security\.key\.\$\{action\}/);
  assert.match(service, /still protects.*records/);
  assert.match(service, /active key cannot be retired/);
  assert.match(service, /decryptPlatformSecret.*encryptPlatformSecret/s);
  assert.doesNotMatch(service, /console\.(log|info).*plaintext/);
  assert.match(ui, /Cryptographic key custody/);
  assert.match(ui, /Key material remains exclusively in deployment secrets/);
});
