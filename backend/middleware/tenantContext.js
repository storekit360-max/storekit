'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

const tenantStorage = new AsyncLocalStorage();

function currentTenantId() {
  const store = tenantStorage.getStore();
  return store?.tenantId || null;
}

function withoutTenantScope(fn) {
  const store = tenantStorage.getStore() || {};
  return tenantStorage.run({ ...store, bypassTenantScope: true }, fn);
}

function tenantContextMiddleware(req, _res, next) {
  tenantStorage.run({ tenantId: req.tenantId ? String(req.tenantId) : null }, next);
}

function tenantScopePlugin(schema) {
  if (!schema.path('tenantId')) return;

  schema.pre('validate', function tenantValidate(next) {
    const tenantId = currentTenantId();
    if (tenantId && !this.tenantId) this.tenantId = tenantId;
    next();
  });

  schema.pre('insertMany', function tenantInsertMany(next, docs) {
    const tenantId = currentTenantId();
    if (tenantId && Array.isArray(docs)) {
      docs.forEach(doc => { if (!doc.tenantId) doc.tenantId = tenantId; });
    }
    next();
  });

  function scopeQuery(next) {
    const store = tenantStorage.getStore();
    const tenantId = store?.tenantId;
    if (!tenantId || store?.bypassTenantScope) return next();

    const filter = this.getFilter() || {};
    if (!Object.prototype.hasOwnProperty.call(filter, 'tenantId')) {
      this.where({ tenantId: new mongoose.Types.ObjectId(tenantId) });
    }

    if (this.options?.upsert) {
      const update = this.getUpdate() || {};
      update.$setOnInsert = { ...(update.$setOnInsert || {}), tenantId: new mongoose.Types.ObjectId(tenantId) };
      this.setUpdate(update);
    }
    next();
  }

  [
    'count','countDocuments','deleteMany','deleteOne','distinct','find','findOne',
    'findOneAndDelete','findOneAndRemove','findOneAndReplace','findOneAndUpdate',
    'replaceOne','updateMany','updateOne'
  ].forEach(op => schema.pre(op, scopeQuery));

  schema.index({ tenantId: 1 });
}

let installed = false;
function installTenantScope(mongooseInstance) {
  if (installed) return;
  installed = true;
  mongooseInstance.plugin(tenantScopePlugin);
}

module.exports = { currentTenantId, withoutTenantScope, tenantContextMiddleware, installTenantScope };
