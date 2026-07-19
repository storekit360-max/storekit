'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DeploymentRecord = require('../models/DeploymentRecord');
const scopes = require('../config/developerScopes');
const openapi = require('../config/platformOpenApi');
const { normalizeDeployment, transitions } = require('../services/deploymentService');
const { publicDeployment } = require('../routes/platformApi');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('deployment records are idempotently keyed, bounded, attributable, and retained', () => {
  assert.ok(DeploymentRecord.schema.indexes().some(([fields,options]) => fields.provider === 1 && fields.externalId === 1 && fields.environment === 1 && options.unique));
  assert.ok(DeploymentRecord.schema.indexes().some(([fields,options]) => fields.createdAt === 1 && options.expireAfterSeconds === 730 * 24 * 60 * 60));
  assert.ok(DeploymentRecord.schema.path('history'));
  assert.ok(DeploymentRecord.schema.path('apiKeyId'));
  assert.ok(DeploymentRecord.schema.path('actorId'));
});

test('deployment input validation rejects unsafe URLs, identifiers, commits, and timestamps', () => {
  const event = normalizeDeployment({ provider: 'Railway', externalId: 'deploy_123', environment: 'Production', status: 'ready', commitSha: 'abcdef123456', deploymentUrl: 'https://storekit.example/release', occurredAt: new Date() });
  assert.equal(event.provider, 'railway'); assert.equal(event.environment, 'production'); assert.equal(event.status, 'ready');
  assert.throws(() => normalizeDeployment({ provider: 'x', externalId: '../ bad', environment: 'prod', status: 'ready' }), /deployment identifier/);
  assert.throws(() => normalizeDeployment({ provider: 'x', externalId: 'id1', environment: 'prod', status: 'ready', deploymentUrl: 'http://internal.example' }), /HTTPS/);
  assert.throws(() => normalizeDeployment({ provider: 'x', externalId: 'id1', environment: 'prod', status: 'ready', commitSha: 'not-a-sha' }), /Commit SHA/);
  assert.throws(() => normalizeDeployment({ provider: 'x', externalId: 'id1', environment: 'prod', status: 'unknown' }), /Unsupported/);
});

test('deployment lifecycle prevents terminal regressions and uses optimistic state writes', () => {
  assert.equal(transitions.ready.has('deploying'), false);
  assert.equal(transitions.ready.has('rolled_back'), true);
  assert.equal(transitions.failed.has('ready'), false);
  const service = read('services/deploymentService.js');
  assert.match(service, /writeFilter = existing \? \{ \.\.\.key, status: existing\.status \}/);
  assert.match(service, /Deployment changed concurrently/);
  assert.match(service, /\$slice: -50/);
  assert.match(service, /existing\?\.status === payload\.status/);
});

test('CI deployment ingestion uses scoped revocable API keys and authoritative OpenAPI/SDK contracts', () => {
  assert.ok(scopes.keys.includes('deployments.read'));
  assert.ok(scopes.keys.includes('deployments.write'));
  assert.equal(openapi.info.version, '1.1.0');
  assert.equal(openapi.paths['/deployments/events'].post.operationId, 'recordDeploymentEvent');
  const route = read('routes/platformApi.js'); const middleware = read('middleware/platformApiAuth.js'); const sdk = read('services/platformSdkService.js');
  assert.match(route, /requireApiScope\('deployments\.write'\)/);
  assert.match(route, /platformApiAuth,platformAudit/);
  assert.match(route, /apiKeyId:req\.platformApiKey\._id/);
  assert.match(route, /developer\.deployment\.record/);
  assert.match(middleware, /Invalid, expired, or revoked platform API key/);
  assert.match(middleware, /ApiRateLimitBucket\.findOneAndUpdate/);
  assert.match(sdk, /recordDeploymentEvent\(event\)/);
  assert.match(sdk, /record_deployment_event\(self, event\)/);
  const publicValue = publicDeployment({ _id: 'deployment-id', provider: 'railway', externalId: 'ext', environment: 'production', status: 'ready', actorId: 'operator-id', apiKeyId: 'key-id', history: [{ status: 'ready' }] });
  assert.equal(publicValue.id, 'deployment-id');
  assert.equal('actorId' in publicValue, false); assert.equal('apiKeyId' in publicValue, false); assert.equal('history' in publicValue, false);
});

test('operations, notification completion, runtime discovery, dashboard, and UI share the deployment registry', () => {
  const operations = read('routes/superadmin/operations.js'); const notifications = read('routes/superadmin/notificationsCenter.js'); const server = read('server.js'); const dashboard = read('../frontend/src/pages/superadmin/SuperAdminDashboard.js'); const ui = read('../frontend/src/pages/superadmin/SuperAdminOperations.js');
  assert.match(operations, /deployments', requirePlatformPermission\('monitoring\.view'\)/);
  assert.match(operations, /deployments\/events', requirePlatformPermission\('monitoring\.manage'\), requireRecentStepUp\(\)/);
  assert.match(operations, /monitoring\.deployment\.record/);
  assert.match(notifications, /recordDeployment\([\s\S]*status: 'ready'/);
  assert.match(server, /recordRuntimeDeployment\(\)/);
  assert.match(dashboard, /Recent Deployments/);
  assert.match(dashboard, /monitoring\.view/);
  assert.match(ui, /Authoritative deployment history/);
  assert.match(ui, /canManage/);
});
