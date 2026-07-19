'use strict';

const crypto = require('crypto');
const express = require('express');
const RuntimeFeatureFlag = require('../../models/RuntimeFeatureFlag');
const FeatureFlagExposure = require('../../models/FeatureFlagExposure');
const Tenant = require('../../models/Tenant');
const { requireRecentStepUp } = require('../../middleware/stepUp');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const flags = require('../../services/runtimeFeatureFlagService');
const featureRegistry = require('../../config/featureRegistry');
const experimentService = require('../../services/featureFlagExperimentService');

const router = express.Router();

function normalizeList(values, transform = value => String(value).trim()) { return Array.from(new Set((Array.isArray(values) ? values : []).map(transform).filter(Boolean))); }

async function validateBody(body, key, existingId = null) {
  const dependencies = normalizeList(body.dependencies, value => String(value).trim().toLowerCase());
  if (dependencies.includes(key)) throw Object.assign(new Error('A flag cannot depend on itself'), { statusCode: 400 });
  const dependencyCount = await RuntimeFeatureFlag.countDocuments({ key: { $in: dependencies }, ...(existingId ? { _id: { $ne: existingId } } : {}) });
  if (dependencyCount !== dependencies.length) throw Object.assign(new Error('Every dependency must reference an existing flag'), { statusCode: 400 });
  await flags.assertNoDependencyCycle(key, dependencies);
  const variants = flags.validateVariants(body.variants || []);
  if (JSON.stringify(variants).length > 20000) throw Object.assign(new Error('Variant payload is too large'), { statusCode: 413 });
  const startsAt = body.startsAt ? new Date(body.startsAt) : null; const endsAt = body.endsAt ? new Date(body.endsAt) : null; const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if ([startsAt, endsAt, expiresAt].filter(Boolean).some(value => Number.isNaN(value.getTime()))) throw Object.assign(new Error('Flag schedule contains an invalid date'), { statusCode: 400 });
  if (startsAt && endsAt && startsAt >= endsAt) throw Object.assign(new Error('Flag end must be after its start'), { statusCode: 400 });
  const rolloutPercentage = Number(body.rolloutPercentage ?? 100); if (!Number.isFinite(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) throw Object.assign(new Error('Rollout percentage must be between 0 and 100'), { statusCode: 400 });
  const entitlementKey = String(body.entitlementKey || '').trim(); if (entitlementKey && !featureRegistry.keys.includes(entitlementKey)) throw Object.assign(new Error('Unknown plan entitlement key'), { statusCode: 400 });
  return { dependencies, variants, startsAt, endsAt, expiresAt, rolloutPercentage, entitlementKey, tenantAllowIds: normalizeList(body.tenantAllowIds), tenantDenyIds: normalizeList(body.tenantDenyIds), countries: normalizeList(body.countries, value => String(value).trim().toUpperCase()).filter(value => /^[A-Z]{2}$/.test(value)), roles: normalizeList(body.roles, value => String(value).trim().toLowerCase()) };
}

router.get('/', requirePlatformPermission('featureflags.view'), async (_req, res, next) => {
  try { res.json({ flags: await RuntimeFeatureFlag.find().sort({ key: 1 }).populate('tenantAllowIds tenantDenyIds', 'storeName slug').lean(), entitlementKeys: featureRegistry.keys }); }
  catch (error) { next(error); }
});

router.post('/', requirePlatformPermission('featureflags.manage'), async (req, res, next) => {
  try {
    const key = String(req.body?.key || '').trim().toLowerCase(); if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(key) || !req.body?.name) return res.status(400).json({ message: 'A valid key and name are required' });
    const clean = await validateBody(req.body, key);
    const flag = await RuntimeFeatureFlag.create({ key, name: String(req.body.name).trim(), description: String(req.body.description || '').trim(), enabled: req.body.enabled === true, killSwitch: req.body.killSwitch === true, clientVisible: req.body.clientVisible === true, ...clean, salt: crypto.randomBytes(24).toString('hex'), createdBy: req.user._id, updatedBy: req.user._id });
    flags.invalidateFlagCache(); req.audit.set({ action: 'feature-flag.create', resource: 'runtime-feature-flag', resourceId: String(flag._id), changes: { newValue: flag.toObject() } }); res.status(201).json(flag);
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: 'Feature flag key already exists' }); if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.put('/:id', requirePlatformPermission('featureflags.manage'), async (req, res, next) => {
  try {
    const existing = await RuntimeFeatureFlag.findById(req.params.id).select('+salt'); if (!existing) return res.status(404).json({ message: 'Feature flag not found' });
    const merged = { ...existing.toObject(), ...req.body }; const clean = await validateBody(merged, existing.key, existing._id);
    const allowed = ['name', 'description', 'enabled', 'clientVisible']; for (const key of allowed) if (req.body[key] !== undefined) existing[key] = req.body[key];
    Object.assign(existing, clean); existing.version += 1; existing.updatedBy = req.user._id; await existing.save(); flags.invalidateFlagCache();
    req.audit.set({ action: 'feature-flag.update', resource: 'runtime-feature-flag', resourceId: req.params.id, changes: { newValue: existing.toObject() } }); res.json(existing);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.post('/:id/kill', requirePlatformPermission('featureflags.manage'), requireRecentStepUp(), async (req, res, next) => {
  try { const flag = await RuntimeFeatureFlag.findByIdAndUpdate(req.params.id, { $set: { killSwitch: true, enabled: false, updatedBy: req.user._id }, $inc: { version: 1 } }, { new: true }); if (!flag) return res.status(404).json({ message: 'Feature flag not found' }); flags.invalidateFlagCache(); req.audit.set({ action: 'feature-flag.kill', resource: 'runtime-feature-flag', resourceId: req.params.id }); res.json(flag); }
  catch (error) { next(error); }
});

router.post('/:id/restore', requirePlatformPermission('featureflags.manage'), requireRecentStepUp(), async (req, res, next) => {
  try { const flag = await RuntimeFeatureFlag.findByIdAndUpdate(req.params.id, { $set: { killSwitch: false, enabled: false, updatedBy: req.user._id }, $inc: { version: 1 } }, { new: true }); if (!flag) return res.status(404).json({ message: 'Feature flag not found' }); flags.invalidateFlagCache(); req.audit.set({ action: 'feature-flag.restore', resource: 'runtime-feature-flag', resourceId: req.params.id }); res.json(flag); }
  catch (error) { next(error); }
});

router.post('/:id/simulate', requirePlatformPermission('featureflags.view'), async (req, res, next) => {
  try { const flag = await RuntimeFeatureFlag.findById(req.params.id).lean(); if (!flag) return res.status(404).json({ message: 'Feature flag not found' }); const tenant = req.body?.tenantId ? await Tenant.findById(req.body.tenantId).populate('plan').lean() : null; const context = { tenantId: tenant?._id || req.body?.tenantId, userId: req.body?.userId, anonymousId: req.body?.anonymousId || 'simulator', country: req.body?.country || tenant?.settings?.merchantCountryCode, role: req.body?.role, planFeatures: tenant?.plan?.features || {} }; const result = await flags.evaluateFlags([flag.key], context); res.json({ context, result: result[flag.key] }); }
  catch (error) { next(error); }
});

router.get('/analytics/exposures', requirePlatformPermission('featureflags.view'), async (req, res, next) => {
  try { const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 30, 1), 180); const since = new Date(Date.now() - days * 86400000); const rows = await FeatureFlagExposure.aggregate([{ $match: { occurredAt: { $gte: since } } }, { $group: { _id: { flagKey: '$flagKey', variant: '$variant', enabled: '$enabled', reason: '$reason' }, count: { $sum: 1 }, uniqueSubjects: { $addToSet: '$subjectKeyHash' } } }, { $project: { _id: 0, flagKey: '$_id.flagKey', variant: '$_id.variant', enabled: '$_id.enabled', reason: '$_id.reason', count: 1, uniqueSubjects: { $size: '$uniqueSubjects' } } }, { $sort: { flagKey: 1, count: -1 } }]); res.json({ days, rows }); }
  catch (error) { next(error); }
});

router.get('/analytics/experiments', requirePlatformPermission('featureflags.view'), async (req, res, next) => {
  try { res.json(await experimentService.experimentResults({ days: req.query.days })); }
  catch (error) { next(error); }
});

module.exports = router;
