'use strict';

const FeatureFlagExposure = require('../models/FeatureFlagExposure');
const RuntimeFeatureFlag = require('../models/RuntimeFeatureFlag');

const DAY_MS = 24 * 60 * 60 * 1000;

function wilsonInterval(successes, total, z = 1.96) {
  if (!total) return { low: 0, high: 0 };
  const rate = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = rate + (z * z) / (2 * total);
  const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * total)) / total);
  return {
    low: Number(Math.max(0, (centre - margin) / denominator * 100).toFixed(2)),
    high: Number(Math.min(1, (centre + margin) / denominator) * 100).toFixed(2),
  };
}

function summarizeVariant(row, control = null) {
  const assignments = Number(row.assignments || 0);
  const conversions = Number(row.conversions || 0);
  const conversionRate = assignments ? conversions / assignments * 100 : 0;
  const controlRate = control?.assignments ? control.conversions / control.assignments * 100 : null;
  return {
    key: row.variant,
    assignments,
    conversions,
    conversionRate: Number(conversionRate.toFixed(2)),
    confidence95: wilsonInterval(conversions, assignments),
    liftVsControl: controlRate && row.variant !== control.variant
      ? Number(((conversionRate - controlRate) / controlRate * 100).toFixed(2))
      : null,
    evidence: assignments < 100 ? 'insufficient_sample' : 'directional',
  };
}

function summarizeExperiments(rows, flags, contaminated = []) {
  const flagMap = new Map(flags.map(flag => [`${flag.key}:${flag.version}`, flag]));
  const contaminationMap = new Map(contaminated.map(row => [`${row.flagKey}:${row.flagVersion}`, Number(row.tenants || 0)]));
  const groups = new Map();
  for (const row of rows) {
    const id = `${row.flagKey}:${row.flagVersion}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return Array.from(groups.entries()).map(([id, variants]) => {
    const flag = flagMap.get(id);
    const configured = flag?.variants?.map(item => item.key) || [];
    variants.sort((a, b) => configured.indexOf(a.variant) - configured.indexOf(b.variant));
    const control = variants.find(item => item.variant === 'control') || variants[0];
    return {
      flagKey: variants[0].flagKey,
      flagName: flag?.name || variants[0].flagKey,
      flagVersion: variants[0].flagVersion,
      controlVariant: control.variant,
      excludedContaminatedTenants: contaminationMap.get(id) || 0,
      variants: variants.map(row => summarizeVariant(row, control)),
      conclusion: variants.every(row => Number(row.assignments || 0) >= 100)
        ? 'Directional only; confidence intervals are descriptive and do not prove causation.'
        : 'Insufficient sample. Collect at least 100 uncontaminated tenant assignments per variant before directional comparison.',
    };
  }).sort((a, b) => a.flagKey.localeCompare(b.flagKey) || b.flagVersion - a.flagVersion);
}

async function experimentResults({ days = 30 } = {}) {
  const boundedDays = Math.min(Math.max(Number(days) || 30, 1), 180);
  const from = new Date(Date.now() - boundedDays * DAY_MS);
  const to = new Date();
  const base = [
    { $match: { occurredAt: { $gte: from, $lte: to }, enabled: true, variant: { $type: 'string', $ne: '' }, tenantId: { $ne: null } } },
    { $group: { _id: { flagKey: '$flagKey', flagVersion: '$flagVersion', tenantId: '$tenantId', variant: '$variant' }, firstExposureAt: { $min: '$occurredAt' }, exposureEvents: { $sum: 1 } } },
    { $group: { _id: { flagKey: '$_id.flagKey', flagVersion: '$_id.flagVersion', tenantId: '$_id.tenantId' }, assignments: { $push: { variant: '$_id.variant', firstExposureAt: '$firstExposureAt', exposureEvents: '$exposureEvents' } } } },
  ];
  const [rows, contaminated, flags] = await Promise.all([
    FeatureFlagExposure.aggregate([
      ...base,
      { $match: { 'assignments.1': { $exists: false } } },
      { $unwind: '$assignments' },
      { $lookup: { from: 'orders', let: { tenant: '$_id.tenantId', exposedAt: '$assignments.firstExposureAt' }, pipeline: [
        { $match: { $expr: { $and: [
          { $eq: ['$tenantId', '$$tenant'] },
          { $gte: ['$createdAt', '$$exposedAt'] },
          { $lte: ['$createdAt', to] },
          { $eq: ['$paymentStatus', 'paid'] },
        ] } } },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ], as: 'paidOrders' } },
      { $group: { _id: { flagKey: '$_id.flagKey', flagVersion: '$_id.flagVersion', variant: '$assignments.variant' }, assignments: { $sum: 1 }, conversions: { $sum: { $cond: [{ $gt: [{ $size: '$paidOrders' }, 0] }, 1, 0] } }, exposureEvents: { $sum: '$assignments.exposureEvents' } } },
      { $project: { _id: 0, flagKey: '$_id.flagKey', flagVersion: '$_id.flagVersion', variant: '$_id.variant', assignments: 1, conversions: 1, exposureEvents: 1 } },
    ]),
    FeatureFlagExposure.aggregate([...base, { $match: { 'assignments.1': { $exists: true } } }, { $group: { _id: { flagKey: '$_id.flagKey', flagVersion: '$_id.flagVersion' }, tenants: { $sum: 1 } } }, { $project: { _id: 0, flagKey: '$_id.flagKey', flagVersion: '$_id.flagVersion', tenants: 1 } }]),
    RuntimeFeatureFlag.find({ 'variants.0': { $exists: true } }).select('key name version variants.key').lean(),
  ]);
  return {
    range: { from, to, days: boundedDays },
    methodology: 'Tenant-level conversion: an uncontaminated tenant converts when it receives at least one paid order after its first recorded exposure in the selected window. Tenants exposed to multiple variants for the same flag version are excluded. Guest and customer identities are never joined to pseudonymous exposure identifiers.',
    experiments: summarizeExperiments(rows, flags, contaminated),
  };
}

module.exports = { experimentResults, summarizeExperiments, summarizeVariant, wilsonInterval };
