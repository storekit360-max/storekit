'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

const tenantStorage = new AsyncLocalStorage();

function currentTenantId() {
  const store = tenantStorage.getStore();
  return store?.tenantId || null;
}

function isBypassed() {
  const store = tenantStorage.getStore();
  return !!store?.bypassTenantScope;
}

function runWithTenant(tenantId, fn) {
  return tenantStorage.run({ tenantId: tenantId ? String(tenantId) : null }, fn);
}

function withoutTenantScope(fn) {
  const store = tenantStorage.getStore() || {};
  return tenantStorage.run({ ...store, bypassTenantScope: true }, fn);
}

function tenantContextMiddleware(req, _res, next) {
  runWithTenant(req.tenantId, next);
}

function addTenantToQuery(query) {
  const tenantId = currentTenantId();
  if (!tenantId || isBypassed()) return;

  const schema = query.model?.schema;
  if (!schema?.path('tenantId')) return;

  const oid = new mongoose.Types.ObjectId(tenantId);
  const filter = query.getFilter() || {};
  if (!Object.prototype.hasOwnProperty.call(filter, 'tenantId')) {
    query.where({ tenantId: oid });
  }

  // Upserts do not run document validate/save middleware, so inject tenantId
  // directly into $setOnInsert. This prevents tenantless Settings/Social docs.
  if (query.options?.upsert) {
    const update = query.getUpdate() || {};
    update.$setOnInsert = { ...(update.$setOnInsert || {}), tenantId: oid };
    query.setUpdate(update);
  }
}

function tenantScopePlugin(schema) {
  if (!schema.path('tenantId')) return;

  schema.pre('validate', function tenantValidate(next) {
    const tenantId = currentTenantId();
    if (tenantId && !isBypassed() && !this.tenantId) {
      this.tenantId = tenantId;
    }
    next();
  });

  schema.pre('insertMany', function tenantInsertMany(next, docs) {
    const tenantId = currentTenantId();
    if (tenantId && !isBypassed() && Array.isArray(docs)) {
      docs.forEach(doc => {
        if (!doc.tenantId) doc.tenantId = tenantId;
      });
    }
    next();
  });

  const ops = [
    'count', 'countDocuments', 'deleteMany', 'deleteOne', 'distinct',
    'find', 'findOne', 'findOneAndDelete', 'findOneAndRemove',
    'findOneAndReplace', 'findOneAndUpdate', 'replaceOne',
    'updateMany', 'updateOne',
  ];

  ops.forEach(op => schema.pre(op, function tenantQuery(next) {
    addTenantToQuery(this);
    next();
  }));

  schema.index({ tenantId: 1 });
}

let installed = false;
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
