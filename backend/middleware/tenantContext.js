'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

const tenantStorage = new AsyncLocalStorage();
let installed = false;

function currentTenantId() {
  const store = tenantStorage.getStore();
  return store && store.tenantId ? String(store.tenantId) : null;
}

function isBypassed() {
  const store = tenantStorage.getStore();
  return !!(store && store.bypassTenantScope);
}

function runWithTenant(tenantId, fn) {
  return tenantStorage.run({ tenantId: tenantId ? String(tenantId) : null, bypassTenantScope: false }, fn);
}

function withoutTenantScope(fn) {
  const store = tenantStorage.getStore() || {};
  return tenantStorage.run({ ...store, bypassTenantScope: true }, fn);
}

function tenantContextMiddleware(req, _res, next) {
  runWithTenant(req.tenantId || req.tenant?._id || null, next);
}

function modelHasTenant(query) {
  return !!query.model?.schema?.path('tenantId');
}

function addTenantToQuery(query) {
  if (isBypassed() || !modelHasTenant(query)) return;
  const tenantId = currentTenantId();
  if (!tenantId) return;

  const oid = new mongoose.Types.ObjectId(tenantId);
  const filter = query.getFilter() || {};

  if (!Object.prototype.hasOwnProperty.call(filter, 'tenantId')) {
    query.where({ tenantId: oid });
  }

  if (query.options && query.options.upsert) {
    const update = query.getUpdate() || {};
    update.$setOnInsert = { ...(update.$setOnInsert || {}), tenantId: oid };
    query.setUpdate(update);
  }
}

function tenantScopePlugin(schema) {
  if (!schema.path('tenantId')) return;

  schema.pre('validate', function tenantValidate(next) {
    const tenantId = currentTenantId();
    if (tenantId && !isBypassed() && !this.tenantId) this.tenantId = tenantId;
    next();
  });

  schema.pre('insertMany', function tenantInsertMany(next, docs) {
    const tenantId = currentTenantId();
    if (tenantId && !isBypassed() && Array.isArray(docs)) {
      docs.forEach(doc => { if (!doc.tenantId) doc.tenantId = tenantId; });
    }
    next();
  });

  [
    'count', 'countDocuments', 'deleteMany', 'deleteOne', 'distinct',
    'find', 'findOne', 'findOneAndDelete', 'findOneAndRemove',
    'findOneAndReplace', 'findOneAndUpdate', 'replaceOne',
    'updateMany', 'updateOne',
  ].forEach(op => {
    schema.pre(op, function tenantQuery(next) {
      addTenantToQuery(this);
      next();
    });
  });

  schema.index({ tenantId: 1 });
}

function installTenantScope(mongooseInstance) {
  if (installed) return;
  installed = true;
  mongooseInstance.plugin(tenantScopePlugin);
}

module.exports = {
  currentTenantId,
  installTenantScope,
  runWithTenant,
  tenantContextMiddleware,
  withoutTenantScope,
};
