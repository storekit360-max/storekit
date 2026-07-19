'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { TENANT_BACKUP_SPECS, backupKeyring, readArchive } = require('../services/backupService');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('tenant backup registry contains only explicitly owned non-platform data', () => {
  const keys = new Set(TENANT_BACKUP_SPECS.map(spec => spec.key));
  for (const required of ['products', 'orders', 'categories', 'settings', 'users']) assert.equal(keys.has(required), true, `${required} must be recoverable`);
  for (const forbidden of ['authSessions', 'tenantPayments', 'billingRefunds', 'supportTickets', 'tenantNotes']) assert.equal(keys.has(forbidden), false, `${forbidden} must remain platform-owned`);
  assert.equal(TENANT_BACKUP_SPECS.every(spec => ['tenantId', 'tenant'].includes(spec.field)), true);
});

test('tenant backup APIs scope every record operation and protect platform credentials', () => {
  const route = read('routes/backup.js');
  assert.match(route, /filter = \{ scope: 'tenant', tenantId: req\.user\.tenantId \}/);
  assert.match(route, /createBackup\(\{ type: 'manual',[\s\S]*tenantId: req\.user\.tenantId/);
  assert.match(route, /restoreBackup\(req\.params\.id, \{ tenantId: req\.user\.tenantId \}\)/);
  assert.match(route, /Backup\.findOne\(\{ _id: req\.params\.id, scope: 'tenant', tenantId: req\.user\.tenantId \}\)/);
  assert.match(route, /Backup storage credentials are managed by platform security administrators/);
  assert.doesNotMatch(route, /res\.json\(s\)/);
  assert.match(route, /RESTORE TENANT/);
});

test('platform recovery is separately permissioned, stepped-up, confirmed, and session revoking', () => {
  const route = read('routes/superadmin/platformBackups.js');
  const service = read('services/backupService.js');
  assert.match(route, /requirePlatformPermission\('infrastructure\.manage'\), requireRecentStepUp\(\)/);
  assert.match(route, /RESTORE PLATFORM/);
  assert.match(route, /Emergency pre-restore/);
  assert.match(route, /User\.updateMany\(\{\}, \{ \$inc: \{ tokenVersion: 1 \} \}\)/);
  assert.match(route, /AuthSession\.updateMany/);
  assert.match(route, /platform-backup\.(create|restore|delete)/);
  assert.match(service, /PLATFORM_RECOVERY_PROTECTED_COLLECTIONS/);
});

test('new backup format uses versioned authenticated encryption and detects tampering', async () => {
  const previousKey = process.env.BACKUP_ENCRYPTION_KEY;
  const previousId = process.env.BACKUP_ENCRYPTION_KEY_ID;
  process.env.BACKUP_ENCRYPTION_KEY = 'test-only-backup-key-material-that-is-long-enough';
  process.env.BACKUP_ENCRYPTION_KEY_ID = 'test-v1';
  const key = backupKeyring().get('test-v1');
  assert.equal(key.length, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = '##COLLECTION:products:0\n';
  const encrypted = Buffer.concat([cipher.update(zlib.gzipSync(plain)), cipher.final()]);
  const record = { encryption: { algorithm: 'aes-256-gcm', version: 1, keyId: 'test-v1', iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') } };
  const file = path.join(os.tmpdir(), `storekit-backup-encryption-${process.pid}-${Date.now()}`);
  fs.writeFileSync(file, encrypted);
  try {
    assert.equal(await readArchive(file, record), plain);
    const tampered = Buffer.from(encrypted); tampered[0] ^= 1; fs.writeFileSync(file, tampered);
    await assert.rejects(readArchive(file, record));
  } finally {
    fs.unlinkSync(file);
    if (previousKey === undefined) delete process.env.BACKUP_ENCRYPTION_KEY; else process.env.BACKUP_ENCRYPTION_KEY = previousKey;
    if (previousId === undefined) delete process.env.BACKUP_ENCRYPTION_KEY_ID; else process.env.BACKUP_ENCRYPTION_KEY_ID = previousId;
  }
  const source = read('services/backupService.js');
  assert.match(source, /createCipheriv\('aes-256-gcm'/);
  assert.match(source, /mimeType: 'application\/octet-stream'/);
  assert.match(source, /readArchive\(tmpPath, record\)/);
});
