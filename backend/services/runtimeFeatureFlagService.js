'use strict';

const crypto = require('crypto');
const RuntimeFeatureFlag = require('../models/RuntimeFeatureFlag');
const FeatureFlagExposure = require('../models/FeatureFlagExposure');

const CACHE_MS = 5000;
let cache = { expiresAt: 0, flags: [] };

function invalidateFlagCache() { cache = { expiresAt: 0, flags: [] }; }

async function loadFlags() {
  if (cache.expiresAt > Date.now()) return cache.flags;
  const flags = await RuntimeFeatureFlag.find().select('+salt').lean();
  cache = { flags, expiresAt: Date.now() + CACHE_MS };
  return flags;
}

function bucket(flag, subjectKey, suffix = 'rollout') {
  const digest = crypto.createHash('sha256').update(`${flag.salt}:${flag.key}:${flag.version}:${suffix}:${subjectKey}`).digest();
  return digest.readUInt32BE(0) / 0x100000000 * 100;
}

function subjectKey(context = {}) {
  return String(context.userId || context.anonymousId || context.tenantId || 'anonymous');
}

function selectVariant(flag, subject) {
  if (!flag.variants?.length) return { variant: '', payload: null };
  const point = bucket(flag, subject, 'variant'); let cumulative = 0;
  for (const variant of flag.variants) { cumulative += Number(variant.weight || 0); if (point < cumulative) return { variant: variant.key, payload: variant.payload ?? null }; }
  return { variant: '', payload: null };
}

function disabled(flag, reason) { return { key: flag.key, enabled: false, variant: '', payload: null, reason, version: flag.version }; }

function evaluateOne(flag, context, byKey, memo, stack = []) {
  if (memo.has(flag.key)) return memo.get(flag.key);
  if (stack.includes(flag.key)) { const result = disabled(flag, 'dependency_cycle'); memo.set(flag.key, result); return result; }
  const now = context.now ? new Date(context.now) : new Date();
  if (!flag.enabled) return disabled(flag, 'disabled');
  if (flag.killSwitch) return disabled(flag, 'kill_switch');
  if (flag.startsAt && new Date(flag.startsAt) > now) return disabled(flag, 'not_started');
  if (flag.endsAt && new Date(flag.endsAt) <= now) return disabled(flag, 'schedule_ended');
  if (flag.expiresAt && new Date(flag.expiresAt) <= now) return disabled(flag, 'expired');
  if (flag.entitlementKey && context.planFeatures?.[flag.entitlementKey] !== true) return disabled(flag, 'entitlement_missing');
  const tenantId = String(context.tenantId || '');
  if ((flag.tenantDenyIds || []).some(id => String(id) === tenantId)) return disabled(flag, 'tenant_denied');
  if (flag.tenantAllowIds?.length && !(flag.tenantAllowIds || []).some(id => String(id) === tenantId)) return disabled(flag, 'tenant_not_allowed');
  if (flag.countries?.length && !flag.countries.includes(String(context.country || '').toUpperCase())) return disabled(flag, 'country_not_targeted');
  if (flag.roles?.length && !flag.roles.includes(String(context.role || '').toLowerCase())) return disabled(flag, 'role_not_targeted');
  for (const dependencyKey of flag.dependencies || []) {
    const dependency = byKey.get(dependencyKey);
    if (!dependency || !evaluateOne(dependency, context, byKey, memo, [...stack, flag.key]).enabled) return disabled(flag, 'dependency_disabled');
  }
  const subject = subjectKey(context);
  if (bucket(flag, subject) >= Number(flag.rolloutPercentage || 0)) return disabled(flag, 'outside_rollout');
  const selected = selectVariant(flag, subject);
  const result = { key: flag.key, enabled: true, ...selected, reason: 'enabled', version: flag.version };
  memo.set(flag.key, result); return result;
}

async function evaluateFlags(keys, context = {}, { clientVisibleOnly = false } = {}) {
  const flags = await loadFlags(); const byKey = new Map(flags.map(flag => [flag.key, flag])); const memo = new Map();
  const selectedKeys = keys?.length ? Array.from(new Set(keys.map(key => String(key).toLowerCase()))) : flags.filter(flag => !clientVisibleOnly || flag.clientVisible).map(flag => flag.key);
  const evaluations = {};
  for (const key of selectedKeys) { const flag = byKey.get(key); if (!flag || (clientVisibleOnly && !flag.clientVisible)) continue; evaluations[key] = evaluateOne(flag, context, byKey, memo); }
  return evaluations;
}

async function recordExposures(evaluations, context = {}) {
  const keys = Object.keys(evaluations || {}); if (!keys.length) return;
  const flags = await RuntimeFeatureFlag.find({ key: { $in: keys } }).select('_id key version').lean(); const ids = new Map(flags.map(flag => [flag.key, flag]));
  const subject = subjectKey(context); const hashKey = process.env.FEATURE_EXPOSURE_HASH_KEY || process.env.JWT_SECRET;
  if (!hashKey) throw new Error('FEATURE_EXPOSURE_HASH_KEY or JWT_SECRET is required to record exposures');
  const subjectKeyHash = crypto.createHmac('sha256', hashKey).update(subject).digest('hex');
  const documents = keys.map(key => ({ flagId: ids.get(key)?._id, flagKey: key, flagVersion: evaluations[key].version, tenantId: context.tenantId || null, userId: context.userId || null, subjectKeyHash, enabled: evaluations[key].enabled, variant: evaluations[key].variant || '', reason: evaluations[key].reason, country: String(context.country || '').toUpperCase(), role: String(context.role || '').toLowerCase(), correlationId: context.correlationId || '' })).filter(document => document.flagId);
  if (documents.length) await FeatureFlagExposure.insertMany(documents, { ordered: false });
}

function validateVariants(variants = []) {
  if (!variants.length) return [];
  const keys = variants.map(variant => String(variant.key || '').trim());
  if (keys.some(key => !key) || new Set(keys).size !== keys.length) throw Object.assign(new Error('Variant keys must be unique and non-empty'), { statusCode: 400 });
  const total = variants.reduce((sum, variant) => sum + Number(variant.weight || 0), 0);
  if (Math.abs(total - 100) > 0.001) throw Object.assign(new Error('Variant weights must total 100'), { statusCode: 400 });
  return variants.map(variant => ({ key: String(variant.key).trim(), weight: Number(variant.weight), payload: variant.payload ?? null }));
}

async function assertNoDependencyCycle(key, dependencies) {
  const flags = await RuntimeFeatureFlag.find().select('key dependencies').lean(); const graph = new Map(flags.map(flag => [flag.key, flag.key === key ? dependencies : flag.dependencies])); graph.set(key, dependencies);
  function visit(node, path = []) { if (path.includes(node)) throw Object.assign(new Error(`Feature dependency cycle: ${[...path, node].join(' → ')}`), { statusCode: 400 }); for (const next of graph.get(node) || []) visit(next, [...path, node]); }
  visit(key);
}

module.exports = { assertNoDependencyCycle, bucket, evaluateFlags, evaluateOne, invalidateFlagCache, recordExposures, selectVariant, subjectKey, validateVariants };
