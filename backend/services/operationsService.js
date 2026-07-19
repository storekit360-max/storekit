'use strict';

const crypto = require('crypto');
const os = require('os');
const fs = require('fs/promises');
const { monitorEventLoopDelay } = require('perf_hooks');
const mongoose = require('mongoose');
const MetricSnapshot = require('../models/MetricSnapshot');
const SystemError = require('../models/SystemError');
const JobRun = require('../models/JobRun');
const AlertRule = require('../models/AlertRule');
const AlertEvent = require('../models/AlertEvent');
const PlatformIntegration = require('../models/PlatformIntegration');
const { getSnapshot, consumeWindowSnapshot } = require('../middleware/monitoring');

const INSTANCE_ID = `${os.hostname()}-${process.pid}`;
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
let timer = null;

const defaultRules = [
  { name: 'High API error rate', slug: 'api-error-rate', metric: 'api.errorRate', operator: 'gt', threshold: 5, severity: 'critical', consecutiveRequired: 2 },
  { name: 'Slow API p95', slug: 'api-p95-latency', metric: 'api.p95Ms', operator: 'gt', threshold: 1500, severity: 'warning', consecutiveRequired: 2 },
  { name: 'High process memory', slug: 'process-memory', metric: 'process.memoryRssMb', operator: 'gt', threshold: 512, severity: 'critical', consecutiveRequired: 2 },
  { name: 'Database latency', slug: 'database-latency', metric: 'database.pingMs', operator: 'gt', threshold: 500, severity: 'critical', consecutiveRequired: 2 },
  { name: 'Event loop lag', slug: 'event-loop-lag', metric: 'process.eventLoopLagMs', operator: 'gt', threshold: 200, severity: 'warning', consecutiveRequired: 2 },
];

function redactMessage(value) {
  return String(value || 'Unexpected error')
    .replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b(sk_|re_|AIza)[A-Za-z0-9_.-]{12,}\b/g, '[REDACTED]')
    .slice(0, 1000);
}

async function recordSystemError(error, req, statusCode = 500) {
  const message = redactMessage(error?.message);
  const fingerprint = crypto.createHash('sha256').update(`${error?.name || 'Error'}|${message}|${req?.method || ''}|${String(req?.originalUrl || req?.path || '').split('?')[0]}`).digest('hex');
  const now = new Date();
  return SystemError.findOneAndUpdate(
    { fingerprint, resolvedAt: null },
    {
      $set: { lastSeenAt: now, correlationId: req?.correlationId || '', statusCode, actorId: req?.user?._id || null, tenantId: req?.tenantId || req?.user?.tenantId || null },
      $setOnInsert: { occurredAt: now, firstSeenAt: now, name: error?.name || 'Error', message, method: req?.method || '', path: String(req?.originalUrl || req?.path || '').split('?')[0] },
      $inc: { occurrenceCount: 1 },
    },
    { upsert: true, new: true }
  );
}

function getMetric(snapshot, path) {
  return path.split('.').reduce((value, key) => value?.[key], snapshot);
}

function compare(value, operator, threshold) {
  if (!Number.isFinite(Number(value))) return false;
  if (operator === 'gt') return value > threshold;
  if (operator === 'gte') return value >= threshold;
  if (operator === 'lt') return value < threshold;
  if (operator === 'lte') return value <= threshold;
  return false;
}

async function evaluateAlerts(snapshot) {
  const rules = await AlertRule.find({ enabled: true });
  for (const rule of rules) {
    const value = Number(getMetric(snapshot, rule.metric));
    const breached = compare(value, rule.operator, rule.threshold);
    const nextBreaches = breached ? rule.consecutiveBreaches + 1 : 0;
    const shouldFire = breached && nextBreaches >= rule.consecutiveRequired;
    const previousState = rule.state;
    rule.consecutiveBreaches = nextBreaches; rule.lastEvaluatedAt = new Date(); rule.state = shouldFire ? 'firing' : 'ok';
    // eslint-disable-next-line no-await-in-loop
    await rule.save();
    if (rule.state !== previousState) {
      // eslint-disable-next-line no-await-in-loop
      await AlertEvent.create({ ruleId: rule._id, state: rule.state === 'firing' ? 'firing' : 'resolved', severity: rule.severity, metric: rule.metric, value, threshold: rule.threshold, message: `${rule.name}: ${value} ${rule.operator} ${rule.threshold}` });
    }
  }
}

async function ensureDefaultAlertRules() {
  // Rules created before optimistic concurrency was introduced have no stored
  // version. Backfill them before serving update requests so a first edit can
  // never silently overwrite a concurrent operator's change.
  await AlertRule.updateMany({ version: { $exists: false } }, { $set: { version: 1 } });
  await AlertRule.bulkWrite(defaultRules.map(rule => ({ updateOne: { filter: { slug: rule.slug }, update: { $setOnInsert: rule }, upsert: true } })), { ordered: false });
}

async function captureMetricSnapshot() {
  if (mongoose.connection.readyState !== 1) return null;
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const cumulative = getSnapshot();
  const window = consumeWindowSnapshot();
  const pingStarted = Date.now();
  let databaseStatus = 'connected';
  try { await mongoose.connection.db.admin().ping(); } catch (_) { databaseStatus = 'unhealthy'; }
  const disk = await diskStatus();
  const integrationRows = await PlatformIntegration.find().select('lastTest.status').lean();
  const integrationCounts = integrationRows.reduce((result, row) => { const status = row.lastTest?.status || 'never'; if (status === 'healthy') result.healthy++; else if (status === 'failed') result.failed++; else result.neverTested++; return result; }, { healthy: 0, failed: 0, neverTested: 0, total: integrationRows.length });
  const snapshot = await MetricSnapshot.create({
    instanceId: INSTANCE_ID,
    process: { uptimeSeconds: Math.round(process.uptime()), memoryRssMb: Number((memory.rss / 1048576).toFixed(1)), heapUsedMb: Number((memory.heapUsed / 1048576).toFixed(1)), heapTotalMb: Number((memory.heapTotal / 1048576).toFixed(1)), externalMb: Number((memory.external / 1048576).toFixed(1)), cpuUserMs: Math.round(cpu.user / 1000), cpuSystemMs: Math.round(cpu.system / 1000), eventLoopLagMs: Number((loopDelay.mean / 1e6 || 0).toFixed(2)) },
    database: { status: databaseStatus, readyState: mongoose.connection.readyState, pingMs: Date.now() - pingStarted },
    disk,
    api: { totalRequests: cumulative.totalRequests, ...window },
    integrations: integrationCounts,
  });
  loopDelay.reset();
  await evaluateAlerts(snapshot.toObject());
  return snapshot;
}

async function diskStatus(target = process.cwd()) {
  try {
    const stats = await fs.statfs(target);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return { status: 'available', totalMb: Number((total / 1048576).toFixed(1)), freeMb: Number((free / 1048576).toFixed(1)), usedPercent: total > 0 ? Number((((total - free) / total) * 100).toFixed(2)) : 0 };
  } catch (error) {
    return { status: 'unavailable', totalMb: 0, freeMb: 0, usedPercent: 0, error: redactMessage(error.message) };
  }
}

function deploymentStatus() {
  return {
    provider: process.env.RAILWAY_ENVIRONMENT_NAME ? 'railway' : process.env.VERCEL_ENV ? 'vercel' : 'unknown',
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || '',
    serviceId: process.env.RAILWAY_SERVICE_ID || '',
    commitSha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '',
    region: process.env.RAILWAY_REPLICA_REGION || process.env.VERCEL_REGION || '',
  };
}

function runtimeCapabilities() {
  const redisConfigured = Boolean(process.env.REDIS_URL);
  return {
    cache: { backend: redisConfigured ? 'redis_configured_but_not_connected' : 'process_memory', distributed: false, status: redisConfigured ? 'unsupported' : 'available' },
    redis: { configured: redisConfigured, status: redisConfigured ? 'unsupported_client_not_installed' : 'not_configured' },
    queue: { backend: 'mongodb', durable: true, status: mongoose.connection.readyState === 1 ? 'available' : 'unavailable' },
    smtp: { configured: Boolean(process.env.RESEND_API_KEY || (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS)), provider: process.env.RESEND_API_KEY ? 'resend' : process.env.EMAIL_HOST ? 'smtp' : 'none' },
  };
}

function startOperationsMonitoring() {
  if (timer) return timer;
  ensureDefaultAlertRules().then(captureMetricSnapshot).catch(error => console.error('[OPERATIONS_MONITOR_START_FAILED]', error.message));
  timer = setInterval(() => captureMetricSnapshot().catch(error => console.error('[METRIC_SNAPSHOT_FAILED]', error.message)), 5 * 60 * 1000);
  timer.unref?.();
  return timer;
}

async function runTrackedJob(jobName, operation, metadata = {}) {
  const runId = crypto.randomUUID(); const startedAt = new Date();
  const run = await JobRun.create({ jobName, runId, instanceId: INSTANCE_ID, status: 'running', startedAt, metadata });
  try {
    const result = await operation();
    const summary = result && typeof result === 'object' ? result : {};
    await run.updateOne({ $set: { status: summary.skipped ? 'skipped' : 'succeeded', completedAt: new Date(), durationMs: Date.now() - startedAt.getTime(), processed: Number(summary.processed || 0), failed: Number(summary.failed || 0), message: redactMessage(summary.message || '') } });
    return result;
  } catch (error) {
    await run.updateOne({ $set: { status: 'failed', completedAt: new Date(), durationMs: Date.now() - startedAt.getTime(), message: redactMessage(error.message) } }).catch(() => {});
    await recordSystemError(error, { method: 'JOB', originalUrl: jobName, correlationId: runId }, 500).catch(() => {});
    throw error;
  }
}

module.exports = { INSTANCE_ID, captureMetricSnapshot, compare, defaultRules, deploymentStatus, diskStatus, ensureDefaultAlertRules, evaluateAlerts, getMetric, recordSystemError, redactMessage, runTrackedJob, runtimeCapabilities, startOperationsMonitoring };
