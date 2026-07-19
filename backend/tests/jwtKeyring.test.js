'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const keyring = require('../utils/jwtKeyring');

const saved = {};
for (const name of ['JWT_SECRET', 'JWT_SIGNING_KEYS', 'JWT_SIGNING_KEY_ID']) saved[name] = process.env[name];
test.afterEach(() => {
  for (const [name, value] of Object.entries(saved)) value === undefined ? delete process.env[name] : process.env[name] = value;
});

test('signs with active kid and verifies retained rotation keys', () => {
  process.env.JWT_SECRET = 'legacy-secret-that-is-at-least-32-characters';
  process.env.JWT_SIGNING_KEYS = JSON.stringify({ old: 'old-secret-that-is-at-least-32-characters', current: 'current-secret-that-is-at-least-32-characters' });
  process.env.JWT_SIGNING_KEY_ID = 'current';
  const token = keyring.sign({ id: 'operator' }, { expiresIn: '5m' });
  assert.equal(jwt.decode(token, { complete: true }).header.kid, 'current');
  assert.equal(keyring.verify(token).id, 'operator');
  const oldToken = jwt.sign({ id: 'old-session' }, JSON.parse(process.env.JWT_SIGNING_KEYS).old, { keyid: 'old', algorithm: 'HS256' });
  assert.equal(keyring.verify(oldToken).id, 'old-session');
  assert.equal(keyring.status().rotationReady, true);
});

test('keeps legacy no-kid tokens valid during migration', () => {
  process.env.JWT_SECRET = 'legacy-secret-that-is-at-least-32-characters';
  process.env.JWT_SIGNING_KEYS = JSON.stringify({ current: 'current-secret-that-is-at-least-32-characters' });
  process.env.JWT_SIGNING_KEY_ID = 'current';
  const token = jwt.sign({ id: 'legacy' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  assert.equal(keyring.verify(token).id, 'legacy');
});

test('rejects unknown kids and weak keyring configuration', () => {
  process.env.JWT_SECRET = 'legacy-secret-that-is-at-least-32-characters';
  process.env.JWT_SIGNING_KEYS = JSON.stringify({ current: 'current-secret-that-is-at-least-32-characters' });
  process.env.JWT_SIGNING_KEY_ID = 'current';
  const unknown = jwt.sign({ id: 'attacker' }, 'attacker-secret-that-is-at-least-32-characters', { keyid: 'unknown', algorithm: 'HS256' });
  assert.throws(() => keyring.verify(unknown), /Unknown signing key/);
  process.env.JWT_SIGNING_KEYS = JSON.stringify({ weak: 'short' });
  process.env.JWT_SIGNING_KEY_ID = 'weak';
  assert.throws(() => keyring.sign({ id: 'x' }), /at least 32/);
});
