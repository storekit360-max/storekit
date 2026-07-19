'use strict';

const express = require('express');
const mongoose = require('mongoose');
const MetricSnapshot = require('../../models/MetricSnapshot');
const SystemError = require('../../models/SystemError');
const JobRun = require('../../models/JobRun');
const AlertRule = require('../../models/AlertRule');
const AlertEvent = require('../../models/AlertEvent');
const DeploymentRecord = require('../../models/DeploymentRecord');
const operationsService = require('../../services/operationsService');
const { listIntegrations } = require('../../services/platformIntegrationService');
const { getSocialSchedulerHealth } = require('../../services/socialScheduler');
const { getSubscriptionSchedulerHealth } = require('../../services/subscriptionScheduler');
const { getBackupSchedulerHealth } = require('../../services/backupScheduler');
const { getAcquisitionSyncSchedulerHealth } = require('../../services/acquisitionSyncScheduler');
const { getNotificationWorkerHealth } = require('../../services/platformNotificationService');
const supportRealtime = require('../../services/supportRealtimeService');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const { requireRecentStepUp } = require('../../middleware/stepUp');
const { recordDeployment } = require('../../services/deploymentService');

const router = express.Router();
const allowedMetrics = new Set(['api.errorRate', 'api.p95Ms', 'api.averageMs', 'process.memoryRssMb', 'process.heapUsedMb', 'process.eventLoopLagMs', 'database.pingMs', 'disk.usedPercent']);

router.get('/overview', requirePlatformPermission('monitoring.view'), async (_req, res, next) => {
  try {
    const [latest, openErrors, firingAlerts, failedJobs24h, jobSummaries, integrations] = await Promise.all([
      MetricSnapshot.findOne().sort({ capturedAt: -1 }).lean(),
      SystemError.countDocuments({ resolvedAt: null }),
      AlertRule.countDocuments({ enabled: true, state: 'firing' }),
      JobRun.countDocuments({ status: 'failed', startedAt: { $gte: new Date(Date.now() - 86400000) } }),
      JobRun.aggregate([{ $sort: { startedAt: -1 } }, { $group: { _id: '$jobName', lastStatus: { $first: '$status' }, lastStartedAt: { $first: '$startedAt' }, lastDurationMs: { $first: '$durationMs' }, lastMessage: { $first: '$message' } } }, { $sort: { _id: 1 } }]),
      listIntegrations(),
    ]);
    const realtimeSupport = supportRealtime.health();
    res.json({ generatedAt: new Date(), latest, counters: { openErrors, firingAlerts, failedJobs24h }, jobs: jobSummaries, scheduler: { social: getSocialSchedulerHealth(), subscriptions: getSubscriptionSchedulerHealth(), backups: getBackupSchedulerHealth(), acquisition: getAcquisitionSyncSchedulerHealth(), notifications: getNotificationWorkerHealth() }, database: { readyState: mongoose.connection.readyState, host: mongoose.connection.host || '', name: mongoose.connection.name || '' }, capabilities: { ...operationsService.runtimeCapabilities(), realtimeSupport: { backend: `${realtimeSupport.durability}+${realtimeSupport.transport}`, status: 'available', connectedClients: realtimeSupport.connectedClients, maxClients: realtimeSupport.maxClients } }, deployment: operationsService.deploymentStatus(), integrations });
  } catch (error) { next(error); }
});

router.get('/metrics', requirePlatformPermission('monitoring.view'), async (req, res, next) => {
  try {
    const hours = Math.min(Math.max(Number.parseInt(req.query.hours, 10) || 24, 1), 24 * 30);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 300, 1), 2000);
    const snapshots = await MetricSnapshot.find({ capturedAt: { $gte: new Date(Date.now() - hours * 3600000) } }).sort({ capturedAt: 1 }).limit(limit).lean();
    res.json({ snapshots, range: { hours, limit } });
  } catch (error) { next(error); }
});

router.post('/metrics/capture', requirePlatformPermission('monitoring.manage'), async (req, res, next) => {
  try { const snapshot = await operationsService.captureMetricSnapshot(); req.audit.set({ action: 'monitoring.snapshot.capture', resource: 'metric-snapshot', resourceId: String(snapshot?._id || '') }); res.status(201).json(snapshot); }
  catch (error) { next(error); }
});

router.get('/errors', requirePlatformPermission('monitoring.view'), async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1); const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const filter = req.query.resolved === 'true' ? { resolvedAt: { $ne: null } } : req.query.resolved === 'all' ? {} : { resolvedAt: null };
    const [errors, total] = await Promise.all([SystemError.find(filter).sort({ lastSeenAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), SystemError.countDocuments(filter)]);
    res.json({ errors, page: { number: page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.post('/errors/:id/resolve', requirePlatformPermission('monitoring.manage'), async (req, res, next) => {
  try {
    const error = await SystemError.findByIdAndUpdate(req.params.id, { $set: { resolvedAt: new Date(), resolvedBy: req.user._id, resolutionNote: String(req.body?.note || '').trim().slice(0, 1000) } }, { new: true, runValidators: true });
    if (!error) return res.status(404).json({ message: 'Error event not found' });
    req.audit.set({ action: 'monitoring.error.resolve', resource: 'system-error', resourceId: req.params.id }); res.json(error);
  } catch (error) { next(error); }
});

router.get('/jobs', requirePlatformPermission('monitoring.view'), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500); const filter = {};
    if (req.query.jobName) filter.jobName = String(req.query.jobName).slice(0, 100); if (req.query.status) filter.status = req.query.status;
    res.json({ runs: await JobRun.find(filter).sort({ startedAt: -1 }).limit(limit).lean() });
  } catch (error) { next(error); }
});

router.get('/deployments', requirePlatformPermission('monitoring.view'), async (req, res, next) => {
  try { const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200); const environment = String(req.query.environment || '').trim().toLowerCase(); const status = String(req.query.status || '').trim().toLowerCase(); const filter = { ...(environment ? { environment } : {}), ...(status ? { status } : {}) }; const [rows,total] = await Promise.all([DeploymentRecord.find(filter).sort({ createdAt: -1 }).limit(limit).lean(), DeploymentRecord.countDocuments(filter)]); res.json({ rows, total, limit }); }
  catch (error) { next(error); }
});

router.post('/deployments/events', requirePlatformPermission('monitoring.manage'), requireRecentStepUp(), async (req, res, next) => {
  try { const item = await recordDeployment(req.body, { source: 'manual', actorId: req.user._id }); req.audit.set({ action: 'monitoring.deployment.record', resource: 'deployment-record', resourceId: String(item._id), metadata: { provider: item.provider, environment: item.environment, status: item.status, externalId: item.externalId } }); res.status(202).json(item); }
  catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); if (error.code === 11000) return res.status(409).json({ message: 'A concurrent deployment event was recorded; refresh and retry' }); next(error); }
});

router.get('/alerts', requirePlatformPermission('monitoring.view'), async (_req, res, next) => {
  try { const [rules, events] = await Promise.all([AlertRule.find().sort({ severity: -1, name: 1 }).lean(), AlertEvent.find().sort({ occurredAt: -1 }).limit(100).populate('ruleId', 'name slug').lean()]); res.json({ rules, events, allowedMetrics: Array.from(allowedMetrics) }); }
  catch (error) { next(error); }
});

router.post('/alerts/rules', requirePlatformPermission('monitoring.manage'), async (req, res, next) => {
  try {
    if (!allowedMetrics.has(req.body?.metric)) return res.status(400).json({ message: 'Unsupported alert metric' });
    const name = String(req.body?.name || '').trim(); const slug = String(req.body?.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!name || !slug) return res.status(400).json({ message: 'Alert rule name is required' });
    if (!['gt', 'gte', 'lt', 'lte'].includes(req.body?.operator)) return res.status(400).json({ message: 'Unsupported alert operator' });
    if (!Number.isFinite(Number(req.body?.threshold))) return res.status(400).json({ message: 'Alert threshold must be a number' });
    if (req.body?.severity && !['info', 'warning', 'critical'].includes(req.body.severity)) return res.status(400).json({ message: 'Unsupported alert severity' });
    if (name.length > 160) return res.status(400).json({ message: 'Alert rule name cannot exceed 160 characters' });
    const consecutiveRequired = Number(req.body?.consecutiveRequired ?? 2);
    if (!Number.isInteger(consecutiveRequired) || consecutiveRequired < 1 || consecutiveRequired > 12) return res.status(400).json({ message: 'Consecutive samples must be an integer from 1 to 12' });
    const rule = await AlertRule.create({ name, slug, metric: req.body.metric, operator: req.body.operator, threshold: Number(req.body.threshold), severity: req.body.severity, consecutiveRequired, updatedBy: req.user._id });
    req.audit.set({ action: 'monitoring.alert-rule.create', resource: 'alert-rule', resourceId: String(rule._id), changes: { newValue: rule.toObject() } }); res.status(201).json(rule);
  } catch (error) { next(error); }
});

router.put('/alerts/rules/:id', requirePlatformPermission('monitoring.manage'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid alert rule identifier' });
    const expectedVersion = Number(req.body?.expectedVersion); if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return res.status(400).json({ message: 'A valid expected alert rule version is required' });
    const existing = await AlertRule.findById(req.params.id).lean(); if (!existing) return res.status(404).json({ message: 'Alert rule not found' });
    const allowed = ['name', 'operator', 'threshold', 'severity', 'consecutiveRequired', 'enabled']; const update = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))); update.updatedBy = req.user._id;
    if (update.name !== undefined) { update.name = String(update.name).trim().slice(0, 160); if (!update.name) return res.status(400).json({ message: 'Alert rule name is required' }); }
    if (update.operator !== undefined && !['gt', 'gte', 'lt', 'lte'].includes(update.operator)) return res.status(400).json({ message: 'Unsupported alert operator' });
    if (update.threshold !== undefined) { update.threshold = Number(update.threshold); if (!Number.isFinite(update.threshold)) return res.status(400).json({ message: 'Alert threshold must be a number' }); }
    if (update.severity !== undefined && !['info', 'warning', 'critical'].includes(update.severity)) return res.status(400).json({ message: 'Unsupported alert severity' });
    if (update.consecutiveRequired !== undefined) { update.consecutiveRequired = Number(update.consecutiveRequired); if (!Number.isInteger(update.consecutiveRequired) || update.consecutiveRequired < 1 || update.consecutiveRequired > 12) return res.status(400).json({ message: 'Consecutive samples must be an integer from 1 to 12' }); }
    const rule = await AlertRule.findOneAndUpdate({ _id: req.params.id, version: expectedVersion }, { $set: update, $inc: { version: 1 } }, { new: true, runValidators: true });
    if (!rule) return res.status(409).json({ message: 'Alert rule changed since it was opened; reload before saving' });
    req.audit.set({ action: 'monitoring.alert-rule.update', resource: 'alert-rule', resourceId: req.params.id, changes: { oldValue: existing, newValue: rule.toObject(), changedFields: Object.keys(update).filter(key => key !== 'updatedBy') }, metadata: { expectedVersion, resultingVersion: rule.version } }); res.json(rule);
  } catch (error) { next(error); }
});

router.post('/alerts/events/:id/acknowledge', requirePlatformPermission('monitoring.manage'), async (req, res, next) => {
  try { const event = await AlertEvent.findByIdAndUpdate(req.params.id, { $set: { acknowledgedAt: new Date(), acknowledgedBy: req.user._id } }, { new: true }); if (!event) return res.status(404).json({ message: 'Alert event not found' }); req.audit.set({ action: 'monitoring.alert.acknowledge', resource: 'alert-event', resourceId: req.params.id }); res.json(event); }
  catch (error) { next(error); }
});

module.exports = router;
module.exports.allowedMetrics = allowedMetrics;
