'use strict';

const Backup = require('../models/Backup');
const MfaFactor = require('../models/MfaFactor');
const PlatformIntegration = require('../models/PlatformIntegration');
const CryptographicKeyAttestation = require('../models/CryptographicKeyAttestation');
const jwtKeyring = require('../utils/jwtKeyring');
const platformCrypto = require('../utils/platformSecretCrypto');
const { backupKeyringStatus } = require('./backupService');

const PURPOSES = new Set(['jwt_signing', 'backup_encryption', 'platform_secret_encryption']);

async function referenceCounts() {
  const [backupRows, mfaRows, integrationRows] = await Promise.all([
    Backup.aggregate([{ $match: { 'encryption.keyId': { $type: 'string', $ne: '' } } }, { $group: { _id: '$encryption.keyId', count: { $sum: 1 } } }]),
    MfaFactor.aggregate([{ $group: { _id: { $ifNull: ['$encryptedSecret.keyId', 'legacy'] }, count: { $sum: 1 } } }]),
    PlatformIntegration.aggregate([{ $project: { values: { $objectToArray: { $ifNull: ['$encryptedSecrets', {}] } } } }, { $unwind: '$values' }, { $group: { _id: { $ifNull: ['$values.v.keyId', 'legacy'] }, count: { $sum: 1 } } }]),
  ]);
  const toMap = rows => Object.fromEntries(rows.map(row => [String(row._id), Number(row.count)]));
  const integration = toMap(integrationRows); const mfa = toMap(mfaRows);
  const platform = { ...integration };
  for (const [key, count] of Object.entries(mfa)) platform[key] = (platform[key] || 0) + count;
  return { backup_encryption: toMap(backupRows), platform_secret_encryption: platform, jwt_signing: {} };
}

function runtimeStatuses() {
  return { jwt_signing: jwtKeyring.status(), backup_encryption: backupKeyringStatus(), platform_secret_encryption: platformCrypto.platformKeyStatus() };
}

async function inventory() {
  const [references, attestations] = await Promise.all([referenceCounts(), CryptographicKeyAttestation.find().populate('attestedBy', 'email firstName lastName').sort({ attestedAt: -1 }).limit(300).lean()]);
  const runtime = runtimeStatuses();
  return Object.entries(runtime).map(([purpose, status]) => {
    const ids = new Set([...(status.verificationKeyIds || []), ...Object.keys(references[purpose] || {}), ...attestations.filter(item => item.purpose === purpose).map(item => item.keyId)]);
    return { purpose, status, keys: Array.from(ids).sort().map(keyId => ({ keyId, active: keyId === status.activeKeyId, runtimePresent: (status.verificationKeyIds || []).includes(keyId), references: references[purpose]?.[keyId] || 0, latestAttestation: attestations.find(item => item.purpose === purpose && item.keyId === keyId) || null })) };
  });
}

async function attest({ purpose, keyId, action, notes, deploymentId, actorId }) {
  if (!PURPOSES.has(purpose)) throw Object.assign(new Error('Unsupported cryptographic key purpose'), { statusCode: 400 });
  const normalizedId = String(keyId || '').trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(normalizedId)) throw Object.assign(new Error('Key ID is invalid'), { statusCode: 400 });
  if (!['deployed', 'verified', 'retired'].includes(action)) throw Object.assign(new Error('Unsupported key lifecycle action'), { statusCode: 400 });
  const safeNotes = String(notes || '').trim();
  if (safeNotes.length < 10) throw Object.assign(new Error('Attestation notes must contain at least 10 characters'), { statusCode: 400 });
  const statuses = runtimeStatuses(); const status = statuses[purpose]; const present = status.verificationKeyIds?.includes(normalizedId);
  if (action !== 'retired' && !present) throw Object.assign(new Error('Only a key present in the running deployment can be attested as deployed or verified'), { statusCode: 409 });
  if (action === 'retired') {
    if (status.activeKeyId === normalizedId) throw Object.assign(new Error('The active key cannot be retired'), { statusCode: 409 });
    if (present) throw Object.assign(new Error('Remove the key from the running deployment before attesting retirement'), { statusCode: 409 });
    const references = await referenceCounts();
    if (references[purpose]?.[normalizedId]) throw Object.assign(new Error(`Key ${normalizedId} still protects ${references[purpose][normalizedId]} records`), { statusCode: 409 });
  }
  return CryptographicKeyAttestation.create({ purpose, keyId: normalizedId, action, environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown', deploymentId: String(deploymentId || process.env.RAILWAY_DEPLOYMENT_ID || '').slice(0, 180), notes: safeNotes.slice(0, 1000), attestedBy: actorId });
}

function payloadUses(payload, keyId) { return payload?.ciphertext && (payload.keyId || 'legacy') === keyId; }

async function migratePlatformSecrets(fromKeyId) {
  const sourceId = String(fromKeyId || '').trim(); const status = platformCrypto.platformKeyStatus();
  if (!status.verificationKeyIds.includes(sourceId)) throw Object.assign(new Error('Source key is not available in the running keyring'), { statusCode: 409 });
  if (sourceId === status.activeKeyId) throw Object.assign(new Error('Source key is already active'), { statusCode: 409 });
  let migratedMfa = 0; let migratedIntegrationSecrets = 0;
  const factors = await MfaFactor.find().select('+encryptedSecret');
  for (const factor of factors) if (payloadUses(factor.encryptedSecret, sourceId)) {
    const plaintext = platformCrypto.decryptPlatformSecret(factor.encryptedSecret);
    // eslint-disable-next-line no-await-in-loop
    await MfaFactor.updateOne({ _id: factor._id }, { $set: { encryptedSecret: platformCrypto.encryptPlatformSecret(plaintext) } }); migratedMfa++;
  }
  const integrations = await PlatformIntegration.find().select('+encryptedSecrets');
  for (const integration of integrations) {
    const encrypted = { ...(integration.encryptedSecrets || {}) }; let changed = 0;
    for (const [field, payload] of Object.entries(encrypted)) if (payloadUses(payload, sourceId)) { encrypted[field] = platformCrypto.encryptPlatformSecret(platformCrypto.decryptPlatformSecret(payload)); changed++; }
    if (changed) { /* eslint-disable-next-line no-await-in-loop */ await PlatformIntegration.updateOne({ _id: integration._id }, { $set: { encryptedSecrets: encrypted } }); migratedIntegrationSecrets += changed; }
  }
  const remaining = (await referenceCounts()).platform_secret_encryption[sourceId] || 0;
  return { fromKeyId: sourceId, toKeyId: status.activeKeyId, migratedMfa, migratedIntegrationSecrets, remaining };
}

module.exports = { PURPOSES, attest, inventory, migratePlatformSecrets, payloadUses, referenceCounts, runtimeStatuses };
