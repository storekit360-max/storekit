'use strict';

const crypto = require('crypto');

function encryptionKey() {
  const secret = process.env.CURFOX_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) throw new Error('CURFOX_ENCRYPTION_KEY must be configured server-side (minimum 24 characters)');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), version: 1 };
}

function decryptSecret(payload) {
  if (!payload?.ciphertext || !payload?.iv || !payload?.tag) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

function optionalEncryptedSecret(value) {
  return String(value || '') ? { encryptedPassword: encryptSecret(value) } : {};
}

module.exports = { encryptSecret, decryptSecret, optionalEncryptedSecret };
