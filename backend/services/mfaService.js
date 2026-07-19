'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwtKeyring = require('../utils/jwtKeyring');
const MfaFactor = require('../models/MfaFactor');
const { decryptPlatformSecret, encryptPlatformSecret } = require('../utils/platformSecretCrypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) output += ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return output;
}

function base32Decode(value) {
  const normalized = String(value || '').toUpperCase().replace(/=|\s|-/g, '');
  let bits = '';
  for (const character of normalized) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error('Invalid TOTP secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totpAt(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / STEP_SECONDS);
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function verifyTotp(secret, code, timestamp = Date.now()) {
  const normalized = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  return [-1, 0, 1].some(offset => {
    const expected = totpAt(secret, timestamp + offset * STEP_SECONDS * 1000);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized));
  });
}

function recoveryCodes() {
  return Array.from({ length: 10 }, () => `${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`);
}

async function createEnrollment(user) {
  const secret = base32Encode(crypto.randomBytes(20));
  const codes = recoveryCodes();
  const hashes = await Promise.all(codes.map(code => bcrypt.hash(code, 10)));
  await MfaFactor.findOneAndUpdate({ userId: user._id }, { $set: { enabled: false, encryptedSecret: encryptPlatformSecret(secret), recoveryCodeHashes: hashes, enrolledAt: null, recoveryCodesRegeneratedAt: new Date() } }, { upsert: true, runValidators: true });
  const issuer = encodeURIComponent('StoreKit');
  const account = encodeURIComponent(user.email);
  return { secret, recoveryCodes: codes, otpauthUrl: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}` };
}

async function getFactor(userId, includeSecrets = false) {
  let query = MfaFactor.findOne({ userId });
  if (includeSecrets) query = query.select('+encryptedSecret +recoveryCodeHashes');
  return query;
}

async function verifyFactor(userId, code, { allowRecovery = true } = {}) {
  const factor = await getFactor(userId, true);
  if (!factor) return { valid: false, reason: 'not_enrolled' };
  const secret = decryptPlatformSecret(factor.encryptedSecret);
  if (verifyTotp(secret, code)) { factor.lastUsedAt = new Date(); await factor.save(); return { valid: true, method: 'totp', factor }; }
  if (allowRecovery) {
    for (let index = 0; index < factor.recoveryCodeHashes.length; index += 1) {
      // Recovery codes are few, single-use, and bcrypt protected at rest.
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(String(code || '').toUpperCase(), factor.recoveryCodeHashes[index])) {
        factor.recoveryCodeHashes.splice(index, 1); factor.lastUsedAt = new Date(); await factor.save();
        return { valid: true, method: 'recovery', factor, remainingRecoveryCodes: factor.recoveryCodeHashes.length };
      }
    }
  }
  return { valid: false, reason: 'invalid_code' };
}

function createChallengeToken(user, authMethod) {
  return jwtKeyring.sign({ id: user._id, purpose: 'mfa-login', method: authMethod, ver: Number(user.tokenVersion || 0) }, { expiresIn: '5m', ...(process.env.JWT_ISSUER ? { issuer: process.env.JWT_ISSUER } : {}), ...(process.env.JWT_AUDIENCE ? { audience: process.env.JWT_AUDIENCE } : {}) });
}

function verifyChallengeToken(token) {
  const options = { ...(process.env.JWT_ISSUER ? { issuer: process.env.JWT_ISSUER } : {}), ...(process.env.JWT_AUDIENCE ? { audience: process.env.JWT_AUDIENCE } : {}) };
  const payload = jwtKeyring.verify(token, options);
  if (payload.purpose !== 'mfa-login') throw new Error('Invalid MFA challenge');
  return payload;
}

module.exports = { base32Decode, base32Encode, createChallengeToken, createEnrollment, getFactor, recoveryCodes, totpAt, verifyChallengeToken, verifyFactor, verifyTotp };
