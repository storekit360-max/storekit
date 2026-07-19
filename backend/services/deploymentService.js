'use strict';

const DeploymentRecord = require('../models/DeploymentRecord');
const { deploymentStatus } = require('./operationsService');

const STATUSES = new Set(['queued', 'building', 'deploying', 'ready', 'failed', 'cancelled', 'rolled_back']);
const TERMINAL = new Set(['ready', 'failed', 'cancelled', 'rolled_back']);
const transitions = {
  queued: new Set(['queued', 'building', 'deploying', 'ready', 'failed', 'cancelled']),
  building: new Set(['building', 'deploying', 'ready', 'failed', 'cancelled']),
  deploying: new Set(['deploying', 'ready', 'failed', 'cancelled']),
  ready: new Set(['ready', 'rolled_back']),
  failed: new Set(['failed']),
  cancelled: new Set(['cancelled']),
  rolled_back: new Set(['rolled_back']),
};

function bounded(value, limit) { return String(value || '').trim().slice(0, limit); }
function cleanIdentifier(value, label, limit = 160) { const result = bounded(value, limit); if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(result)) throw Object.assign(new Error(`Valid ${label} is required`), { statusCode: 400 }); return result; }

function normalizeDeployment(input = {}) {
  const provider = cleanIdentifier(input.provider, 'deployment provider', 40).toLowerCase();
  const externalId = cleanIdentifier(input.externalId || input.deploymentId, 'deployment identifier');
  const environment = cleanIdentifier(input.environment, 'deployment environment', 40).toLowerCase();
  const status = bounded(input.status, 30).toLowerCase();
  if (!STATUSES.has(status)) throw Object.assign(new Error('Unsupported deployment status'), { statusCode: 400 });
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 10 * 60 * 1000 || occurredAt.getTime() < Date.now() - 366 * 24 * 60 * 60 * 1000) throw Object.assign(new Error('Deployment event timestamp is invalid'), { statusCode: 400 });
  const commitSha = bounded(input.commitSha, 64).toLowerCase();
  if (commitSha && !/^[a-f0-9]{7,64}$/.test(commitSha)) throw Object.assign(new Error('Commit SHA must contain 7–64 hexadecimal characters'), { statusCode: 400 });
  const deploymentUrl = bounded(input.deploymentUrl, 1000);
  if (deploymentUrl && !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#]|$)/.test(deploymentUrl)) throw Object.assign(new Error('Deployment URL must use HTTPS'), { statusCode: 400 });
  return { provider, externalId, environment, status, occurredAt, service: bounded(input.service || 'storekit', 100), version: bounded(input.version, 100), commitSha, branch: bounded(input.branch, 160), deploymentUrl, message: bounded(input.message, 500) };
}

async function recordDeployment(input, attribution = {}) {
  const payload = normalizeDeployment(input); const key = { provider: payload.provider, externalId: payload.externalId, environment: payload.environment };
  const existing = await DeploymentRecord.findOne(key);
  if (existing && !transitions[existing.status]?.has(payload.status)) throw Object.assign(new Error(`Deployment cannot transition from ${existing.status} to ${payload.status}`), { statusCode: 409 });
  if (existing?.status === payload.status) return existing;
  if (existing?.history.some(item => item.status === payload.status && item.occurredAt.getTime() === payload.occurredAt.getTime())) return existing;
  const startedAt = existing?.startedAt || (['queued', 'building', 'deploying'].includes(payload.status) ? payload.occurredAt : null);
  const completedAt = TERMINAL.has(payload.status) ? payload.occurredAt : null;
  const durationMs = completedAt && startedAt ? Math.max(0, completedAt.getTime() - startedAt.getTime()) : null;
  const set = { status: payload.status, service: payload.service, source: attribution.source || 'platform_api', ...(payload.version ? { version: payload.version } : {}), ...(payload.commitSha ? { commitSha: payload.commitSha } : {}), ...(payload.branch ? { branch: payload.branch } : {}), ...(payload.deploymentUrl ? { deploymentUrl: payload.deploymentUrl } : {}), ...(startedAt ? { startedAt } : {}), completedAt, durationMs, actorId: attribution.actorId || existing?.actorId || null, apiKeyId: attribution.apiKeyId || existing?.apiKeyId || null };
  const writeFilter = existing ? { ...key, status: existing.status } : key;
  const item = await DeploymentRecord.findOneAndUpdate(writeFilter, { $set: set, $setOnInsert: key, $push: { history: { $each: [{ status: payload.status, occurredAt: payload.occurredAt, source: attribution.source || 'platform_api', message: payload.message }], $slice: -50 } } }, { upsert: !existing, new: true, runValidators: true, setDefaultsOnInsert: true });
  if (!item) throw Object.assign(new Error('Deployment changed concurrently; reload before recording another event'), { statusCode: 409 });
  return item;
}

async function recordRuntimeDeployment() {
  const runtime = deploymentStatus();
  if (!runtime.deploymentId || !['railway', 'vercel'].includes(runtime.provider)) return null;
  return recordDeployment({ provider: runtime.provider, deploymentId: runtime.deploymentId, environment: runtime.environment, status: 'ready', service: runtime.serviceId || 'storekit', commitSha: runtime.commitSha, version: runtime.commitSha ? runtime.commitSha.slice(0, 12) : '', occurredAt: new Date() }, { source: 'runtime' });
}

module.exports = { STATUSES, TERMINAL, normalizeDeployment, recordDeployment, recordRuntimeDeployment, transitions };
