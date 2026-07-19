'use strict';

const jwt = require('jsonwebtoken');

function parseKeyring() {
  let configured = {};
  if (process.env.JWT_SIGNING_KEYS) {
    try {
      const parsed = JSON.parse(process.env.JWT_SIGNING_KEYS);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('must be a JSON object');
      configured = Object.fromEntries(Object.entries(parsed).map(([id, secret]) => [String(id).trim(), String(secret)]));
    } catch (error) {
      throw new Error(`JWT_SIGNING_KEYS is invalid: ${error.message}`);
    }
  }
  for (const [id, secret] of Object.entries(configured)) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) throw new Error(`JWT signing key id "${id}" is invalid`);
    if (secret.length < 32) throw new Error(`JWT signing key "${id}" must contain at least 32 characters`);
  }
  const activeKeyId = String(process.env.JWT_SIGNING_KEY_ID || '').trim();
  if (activeKeyId && !configured[activeKeyId]) throw new Error('JWT_SIGNING_KEY_ID does not exist in JWT_SIGNING_KEYS');
  const legacySecret = process.env.JWT_SECRET;
  if (!activeKeyId && !legacySecret) throw new Error('JWT_SECRET or an active JWT signing key is required');
  return { keys: configured, activeKeyId, legacySecret };
}

function sign(payload, options = {}) {
  const { keys, activeKeyId, legacySecret } = parseKeyring();
  if (activeKeyId) return jwt.sign(payload, keys[activeKeyId], { ...options, keyid: activeKeyId, algorithm: 'HS256' });
  return jwt.sign(payload, legacySecret, { ...options, algorithm: 'HS256' });
}

function verify(token, options = {}) {
  const { keys, legacySecret } = parseKeyring();
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header) throw new Error('Invalid token');
  const keyId = decoded.header.kid;
  const secret = keyId ? keys[keyId] : legacySecret;
  if (!secret) throw new Error(keyId ? 'Unknown signing key' : 'Legacy signing key is unavailable');
  return jwt.verify(token, secret, { ...options, algorithms: ['HS256'] });
}

function status() {
  try {
    const { keys, activeKeyId, legacySecret } = parseKeyring();
    return {
      configured: Boolean(activeKeyId),
      activeKeyId: activeKeyId || 'legacy',
      verificationKeyIds: Object.keys(keys).sort(),
      verificationKeyCount: Object.keys(keys).length + (legacySecret ? 1 : 0),
      legacyVerificationEnabled: Boolean(legacySecret),
      rotationReady: Boolean(activeKeyId && Object.keys(keys).length >= 2),
    };
  } catch (error) {
    return { configured: false, activeKeyId: null, verificationKeyIds: [], verificationKeyCount: 0, legacyVerificationEnabled: false, rotationReady: false, configurationError: error.message };
  }
}

module.exports = { parseKeyring, sign, status, verify };
