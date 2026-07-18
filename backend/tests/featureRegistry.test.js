'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Plan = require('../models/Plan');
const { keys } = require('../config/featureRegistry');

test('feature registry and enforceable Plan feature schema stay synchronized', () => {
  const schemaKeys = Object.keys(Plan.schema.path('features').schema.paths).filter(key => key !== '_id').sort();
  assert.deepEqual([...keys].sort(), schemaKeys);
  assert.equal(new Set(keys).size, keys.length, 'feature registry keys must be unique');
});
