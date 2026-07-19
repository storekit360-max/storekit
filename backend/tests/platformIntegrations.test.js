'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../config/integrationRegistry');
const PlatformIntegration = require('../models/PlatformIntegration');
const { decryptPlatformSecret, encryptPlatformSecret } = require('../utils/platformSecretCrypto');
const { cleanConfig, providerErrorMessage, publicIntegration } = require('../services/platformIntegrationService');

test('platform integration secrets use authenticated encryption', () => {
  const previous = process.env.PLATFORM_SECRETS_ENCRYPTION_KEY;
  process.env.PLATFORM_SECRETS_ENCRYPTION_KEY = 'test-platform-key-with-at-least-32-characters';
  const payload = encryptPlatformSecret('sensitive-value');
  assert.equal(payload.algorithm, 'aes-256-gcm');
  assert.notEqual(payload.ciphertext, 'sensitive-value');
  assert.equal(decryptPlatformSecret(payload), 'sensitive-value');
  const tampered = { ...payload, ciphertext: `${payload.ciphertext.slice(0, -2)}AA` };
  assert.throws(() => decryptPlatformSecret(tampered));
  if (previous === undefined) delete process.env.PLATFORM_SECRETS_ENCRYPTION_KEY;
  else process.env.PLATFORM_SECRETS_ENCRYPTION_KEY = previous;
});

test('integration public shape redacts encrypted payloads and secret values', () => {
  const provider = registry.byKey.get('resend');
  const output = publicIntegration(provider, { enabled: true, config: { fromAddress: 'support@example.com' }, configuredSecretFields: ['apiKey'], encryptedSecrets: { apiKey: { ciphertext: 'unsafe' } } });
  assert.equal(output.secretFields[0].configured, true);
  assert.equal(output.secretFields[0].source, 'database');
  assert.equal(JSON.stringify(output).includes('unsafe'), false);
  assert.equal(Object.hasOwn(output, 'encryptedSecrets'), false);
});

test('integration config accepts only registered non-secret fields', () => {
  const provider = registry.byKey.get('smtp');
  const result = cleanConfig(provider, { host: 'smtp.example.com', port: 587, password: 'unsafe', unexpected: 'unsafe' });
  assert.equal(result.host, 'smtp.example.com');
  assert.equal(Object.hasOwn(result, 'password'), false);
  assert.equal(Object.hasOwn(result, 'unexpected'), false);
});

test('integration model hides encrypted secrets and APIs are permission protected', () => {
  assert.equal(PlatformIntegration.schema.path('encryptedSecrets').options.select, false);
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/integrations.js'), 'utf8');
  const routes = source.split('\n').filter(line => /^router\.(get|post|put|delete)\(/.test(line.trim()));
  routes.forEach(line => assert.match(line, /requirePlatformPermission\('infrastructure\.(view|manage)'\)/));
  assert.match(source, /testProvider/);
});

test('mail delivery resolves database-backed SMTP and Resend integrations', () => {
  const source = fs.readFileSync(path.join(__dirname, '../utils/mailer.js'), 'utf8');
  assert.match(source, /resolvedIntegration\('smtp'\)/);
  assert.match(source, /resolvedIntegration\('resend'\)/);
});

test('Anthropic uses encrypted API keys and a bounded credential-only remote test', () => {
  const provider = registry.byKey.get('anthropic');
  assert.equal(provider.category, 'ai');
  assert.deepEqual(provider.secretFields, ['apiKey']);
  assert.equal(provider.env.apiKey, 'ANTHROPIC_API_KEY');
  const source = fs.readFileSync(path.join(__dirname, '../services/platformIntegrationService.js'), 'utf8');
  assert.match(source, /api\.anthropic\.com\/v1\/models/);
  assert.match(source, /'x-api-key': secrets\.apiKey/);
  assert.match(source, /'anthropic-version': '2023-06-01'/);
  assert.match(source, /limit: 1/);
  assert.doesNotMatch(source, /api\.anthropic\.com\/v1\/messages/);
});

test('provider test failures redact Anthropic and common credential shapes', () => {
  const message = providerErrorMessage({ response: { data: { error: { message: 'bad sk-ant-api03-secret x-api-key=plain ?api_key=query-secret Bearer bearer-secret' } } } });
  assert.equal(message.includes('sk-ant-api03-secret'), false);
  assert.equal(message.includes('plain'), false);
  assert.equal(message.includes('query-secret'), false);
  assert.equal(message.includes('bearer-secret'), false);
  assert.match(message, /\[REDACTED\]/);
});
