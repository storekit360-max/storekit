'use strict';

function normalizeProductValue(value) {
  return String(value == null ? '' : value).trim().toLocaleLowerCase('en');
}

function duplicateKeyError(err) {
  return Boolean(err && (err.code === 11000 || err.code === 11001));
}

function duplicateKeyLabel(err) {
  const key = Object.keys(err?.keyPattern || err?.keyValue || {})[0] || '';
  return key.toLowerCase().includes('sku') ? 'SKU' : 'name';
}

function duplicateWithinTenant(left, right) {
  if (String(left?.tenantId || '') !== String(right?.tenantId || '')) return false;
  const sameName = normalizeProductValue(left?.name) && normalizeProductValue(left?.name) === normalizeProductValue(right?.name);
  const sameSku = normalizeProductValue(left?.sku) && normalizeProductValue(left?.sku) === normalizeProductValue(right?.sku);
  return Boolean(sameName || sameSku);
}

module.exports = { normalizeProductValue, duplicateKeyError, duplicateKeyLabel, duplicateWithinTenant };
