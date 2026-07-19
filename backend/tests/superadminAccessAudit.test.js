'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildFilter, csvCell } = require('../routes/superadmin/audit');

test('audit filters validate dates and object identifiers', () => {
  assert.equal(buildFilter({ from: 'not-a-date' }).error, 'Invalid from date');
  assert.equal(buildFilter({ actorId: 'bad' }).error, 'Invalid actor identifier');
  const result = buildFilter({ status: 'failure', resource: 'tenant', search: 'owner@example.com' });
  assert.equal(result.filter['outcome.status'], 'failure');
  assert.equal(result.filter.resource, 'tenant');
  assert.ok(Array.isArray(result.filter.$or));
});

test('audit CSV cells prevent column and quote injection', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('a,b'), '"a,b"');
});

test('every legacy Super Admin endpoint declares a permission policy', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin.js'), 'utf8');
  const declarations = source.split('\n').filter(line => /^router\.(get|post|put|delete)\(/.test(line.trim()));
  assert.ok(declarations.length >= 20);
  declarations.forEach(line => assert.match(line, /requirePlatformPermission\('[a-z]+\.[a-z]+'\)/, line));
});

test('modular access and audit APIs are mounted after authentication', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin.js'), 'utf8');
  const authPosition = source.indexOf('router.use(auth, superAdminOnly, attachPlatformPermissions)');
  assert.ok(authPosition >= 0);
  assert.ok(source.indexOf("router.use('/audit'", authPosition) > authPosition);
  assert.ok(source.indexOf("router.use('/access'", authPosition) > authPosition);
});
