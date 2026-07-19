'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MetricSnapshot = require('../models/MetricSnapshot');
const SystemError = require('../models/SystemError');
const JobRun = require('../models/JobRun');
const AlertEvent = require('../models/AlertEvent');
const operations = require('../services/operationsService');
const operationsRouter = require('../routes/superadmin/operations');

test('operations collections have bounded retention and durable operational fields', () => {
  const metricTtl = MetricSnapshot.schema.indexes().find(([keys, options]) => keys.capturedAt === 1 && options.expireAfterSeconds);
  const errorTtl = SystemError.schema.indexes().find(([keys, options]) => keys.lastSeenAt === 1 && options.expireAfterSeconds);
  const jobTtl = JobRun.schema.indexes().find(([keys, options]) => keys.startedAt === 1 && options.expireAfterSeconds);
  const alertTtl = AlertEvent.schema.indexes().find(([keys, options]) => keys.occurredAt === 1 && options.expireAfterSeconds);
  assert.ok(metricTtl); assert.ok(errorTtl); assert.ok(jobTtl); assert.ok(alertTtl);
  assert.ok(SystemError.schema.path('fingerprint'));
  assert.ok(JobRun.schema.path('runId'));
  assert.equal(MetricSnapshot.schema.indexes().filter(([keys]) => keys.capturedAt !== undefined).length, 1);
});

test('alert comparison supports allowlisted operators and nested metrics', () => {
  assert.equal(operations.getMetric({ api: { p95Ms: 1800 } }, 'api.p95Ms'), 1800);
  assert.equal(operations.compare(6, 'gt', 5), true);
  assert.equal(operations.compare(5, 'gte', 5), true);
  assert.equal(operations.compare(4, 'lt', 5), true);
  assert.equal(operations.compare(5, 'lte', 5), true);
  assert.equal(operations.compare(5, 'invalid', 5), false);
  assert.ok(operationsRouter.allowedMetrics.has('database.pingMs'));
  assert.ok(operationsRouter.allowedMetrics.has('disk.usedPercent'));
});

test('infrastructure status exposes bounded non-secret runtime capabilities', async () => {
  const disk = await operations.diskStatus(process.cwd());
  assert.equal(['available', 'unavailable'].includes(disk.status), true);
  assert.equal(Number.isFinite(disk.usedPercent), true);
  const capabilities = operations.runtimeCapabilities();
  assert.equal(capabilities.queue.backend, 'mongodb');
  assert.equal(typeof capabilities.redis.configured, 'boolean');
  assert.equal(Object.values(operations.deploymentStatus()).some(value => typeof value !== 'string'), false);
  const serialized = JSON.stringify({ capabilities, deployment: operations.deploymentStatus() });
  assert.doesNotMatch(serialized, /PASSWORD|SECRET|TOKEN|mongodb(\+srv)?:\/\//i);
});

test('system error sanitization redacts bearer tokens, query secrets, and provider keys', () => {
  const output = operations.redactMessage('Bearer abc.def token?token=secret-value sk_12345678901234567890');
  assert.equal(output.includes('abc.def'), false);
  assert.equal(output.includes('secret-value'), false);
  assert.equal(output.includes('sk_12345678901234567890'), false);
  assert.match(output, /\[REDACTED\]/);
});

test('all operations APIs enforce monitoring permissions and mutations are audited', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/operations.js'), 'utf8');
  const routes = source.split('\n').filter(line => /^router\.(get|post|put|delete)\(/.test(line.trim()));
  routes.forEach(line => assert.match(line, /requirePlatformPermission\('monitoring\.(view|manage)'\)/));
  assert.match(source, /req\.audit\.set/);
  assert.match(source, /Unsupported alert metric/);
  assert.match(source, /Unsupported alert operator/);
});

test('critical schedulers persist tracked job outcomes and server starts monitoring', () => {
  const subscription = fs.readFileSync(path.join(__dirname, '../services/subscriptionScheduler.js'), 'utf8');
  const backups = fs.readFileSync(path.join(__dirname, '../services/backupScheduler.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(subscription, /runTrackedJob\('subscription-billing'/);
  assert.match(backups, /runTrackedJob\('backup-/);
  assert.match(subscription, /getSubscriptionSchedulerHealth/);
  assert.match(backups, /getBackupSchedulerHealth/);
  assert.match(server, /startOperationsMonitoring\(\)/);
});

test('request monitoring bounds latency samples and server errors are persisted', () => {
  const monitoring = fs.readFileSync(path.join(__dirname, '../middleware/monitoring.js'), 'utf8');
  const security = fs.readFileSync(path.join(__dirname, '../middleware/security.js'), 'utf8');
  assert.match(monitoring, /recentDurations\.length > 1000/);
  assert.match(monitoring, /consumeWindowSnapshot/);
  assert.match(security, /recordSystemError/);
});
