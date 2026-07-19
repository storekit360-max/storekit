'use strict';

const crypto = require('crypto');

function keyring() {
  const keys = new Map();
  if (process.env.PLATFORM_SECRETS_ENCRYPTION_KEYS) {
    let parsed;
    try { parsed = JSON.parse(process.env.PLATFORM_SECRETS_ENCRYPTION_KEYS); } catch { throw new Error('PLATFORM_SECRETS_ENCRYPTION_KEYS must be a valid JSON object'); }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('PLATFORM_SECRETS_ENCRYPTION_KEYS must be a JSON object');
    for (const [id, value] of Object.entries(parsed)) {
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(id) || String(value).length < 32) throw new Error('Every platform encryption key requires a safe ID and at least 32 characters');
      keys.set(id, crypto.createHash('sha256').update(String(value)).digest());
    }
  }
  const legacy = process.env.PLATFORM_SECRETS_ENCRYPTION_KEY || process.env.SOCIAL_MEDIA_SECRET || '';
  if (legacy) {
    if (legacy.length < 32) throw new Error('PLATFORM_SECRETS_ENCRYPTION_KEY must contain at least 32 characters');
    if (!keys.has('legacy')) keys.set('legacy', crypto.createHash('sha256').update(legacy).digest());
  }
  return keys;
}

function activeKey() {
  const keyId = String(process.env.PLATFORM_SECRETS_ENCRYPTION_KEY_ID || 'legacy');
  const key = keyring().get(keyId);
  if (!key) throw new Error(`Active platform encryption key "${keyId}" is not configured`);
  return { keyId, key };
}

function encryptPlatformSecret(value) {
  const iv = crypto.randomBytes(12);
  const { keyId, key } = activeKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return { version: 1, algorithm: 'aes-256-gcm', keyId, ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decryptPlatformSecret(payload) {
  if (!payload?.ciphertext || !payload?.iv || !payload?.tag || payload.algorithm !== 'aes-256-gcm') return '';
  const keyId = payload.keyId || 'legacy';
  const key = keyring().get(keyId);
  if (!key) throw new Error(`Platform encryption key "${keyId}" is unavailable`);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

function platformKeyStatus() {
  try {
    const keys = keyring(); const activeKeyId = String(process.env.PLATFORM_SECRETS_ENCRYPTION_KEY_ID || 'legacy');
    return { configured: keys.has(activeKeyId), activeKeyId, verificationKeyIds: Array.from(keys.keys()).sort(), verificationKeyCount: keys.size, rotationReady: keys.has(activeKeyId) && keys.size >= 2 };
  } catch (error) { return { configured: false, activeKeyId: null, verificationKeyIds: [], verificationKeyCount: 0, rotationReady: false, configurationError: error.message }; }
}

module.exports = { activeKey, decryptPlatformSecret, encryptPlatformSecret, keyring, platformKeyStatus };
