'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requestContext, REQUEST_ID_PATTERN } = require('../middleware/requestContext');
const { safeAuditValue } = require('../middleware/platformAudit');

test('request context accepts safe request IDs and emits the correlation header', () => {
  const req = { headers: { 'x-request-id': 'request-12345678' } };
  const headers = {};
  requestContext(req, { setHeader: (key, value) => { headers[key] = value; } }, () => {});
  assert.equal(req.correlationId, 'request-12345678');
  assert.equal(headers['X-Request-ID'], 'request-12345678');
  assert.equal(typeof req.requestStartedAt, 'bigint');
  assert.equal(REQUEST_ID_PATTERN.test(req.correlationId), true);
});

test('request context replaces malformed identifiers', () => {
  const req = { headers: { 'x-request-id': 'bad id\nvalue' } };
  requestContext(req, { setHeader: () => {} }, () => {});
  assert.notEqual(req.correlationId, 'bad id\nvalue');
  assert.equal(REQUEST_ID_PATTERN.test(req.correlationId), true);
});

test('audit change values redact credentials recursively', () => {
  const value = safeAuditValue({ email: 'owner@example.com', password: 'unsafe', nested: { apiKey: 'unsafe', enabled: true } });
  assert.equal(value.email, 'owner@example.com');
  assert.equal(value.password, '[REDACTED]');
  assert.equal(value.nested.apiKey, '[REDACTED]');
  assert.equal(value.nested.enabled, true);
});
