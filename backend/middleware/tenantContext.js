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

function tenantObjectId() {
  const tenantId = currentTenantId();
  if (!tenantId || isBypassed()) return null;
  try { return new mongoose.Types.ObjectId(tenantId); } catch (_) { return null; }
}

function hasTenantPredicate(filter = {}) {
  if (Object.prototype.hasOwnProperty.call(filter, 'tenantId')) return true;
  for (const key of ['$and', '$or', '$nor']) {
    if (Array.isArray(filter[key]) && filter[key].some(hasTenantPredicate)) return true;
  }
  return false;
}

function addTenantToQuery(query) {
  const oid = tenantObjectId();
  if (!oid) return;

  const schema = query.model?.schema;
  if (!schema?.path('tenantId')) return;

  const filter = query.getFilter() || {};
  if (!hasTenantPredicate(filter)) {
    query.where({ tenantId: oid });
  }

  if (query.options?.upsert) {
    const update = query.getUpdate() || {};
    update.$setOnInsert = { ...(update.$setOnInsert || {}), tenantId: oid };
    query.setUpdate(update);
  }
}

function tenantScopePlugin(schema) {
  if (!schema.path('tenantId')) return;

  schema.pre('validate', function tenantValidate(next) {
    const oid = tenantObjectId();
    if (oid && !this.tenantId) this.tenantId = oid;
    next();
  });

  schema.pre('insertMany', function tenantInsertMany(next, docs) {
    const oid = tenantObjectId();
    if (oid && Array.isArray(docs)) {
      docs.forEach(doc => { if (!doc.tenantId) doc.tenantId = oid; });
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

  schema.pre('aggregate', function tenantAggregate(next) {
    const oid = tenantObjectId();
    if (!oid || isBypassed()) return next();

    const modelSchema = this.model()?.schema;
    if (!modelSchema?.path('tenantId')) return next();

    const pipeline = this.pipeline();
    const alreadyScoped = pipeline.some(stage => stage.$match && hasTenantPredicate(stage.$match));
    if (!alreadyScoped) {
      const firstStage = pipeline[0] || {};
      const insertAt = firstStage.$geoNear || firstStage.$search ? 1 : 0;
      pipeline.splice(insertAt, 0, { $match: { tenantId: oid } });
    }
    next();
  });

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
