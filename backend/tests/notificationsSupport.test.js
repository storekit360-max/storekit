'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PlatformNotificationTemplate = require('../models/PlatformNotificationTemplate');
const NotificationDelivery = require('../models/NotificationDelivery');
const PlatformNotificationAutomation = require('../models/PlatformNotificationAutomation');
const SupportTicket = require('../models/SupportTicket');
const SupportMessage = require('../models/SupportMessage');
const { AUTOMATION_DEFAULTS, render, validateTemplateInput } = require('../services/platformNotificationService');
const { deadlines } = require('../services/supportService');
const supportRealtime = require('../services/supportRealtimeService');

test('notification schemas enforce idempotency, queue state, and indexed claims', () => {
  assert.equal(PlatformNotificationTemplate.schema.path('key').options.unique, true);
  assert.equal(NotificationDelivery.schema.path('idempotencyKey').options.unique, true);
  assert.deepEqual(NotificationDelivery.schema.path('status').enumValues, ['queued','processing','sent','failed','dead','cancelled']);
  assert.ok(NotificationDelivery.schema.indexes().some(([keys]) => keys.status === 1 && keys.nextAttemptAt === 1 && keys.lockedAt === 1));
});

test('lifecycle automations are persisted, bounded, and retry idempotent', () => {
  assert.equal(PlatformNotificationAutomation.schema.path('eventKey').options.unique, true);
  assert.deepEqual(Object.keys(AUTOMATION_DEFAULTS).sort(), ['deployment_complete','payment_failed','tenant_suspended','trial_ending']);
  assert.deepEqual(AUTOMATION_DEFAULTS.trial_ending.leadDays, [7,3,1]);
  const service = fs.readFileSync(path.join(__dirname, '../services/platformNotificationService.js'), 'utf8');
  assert.match(service, /automation:\$\{eventKey\}:\$\{tenant\._id\}/);
  assert.match(service, /\$setOnInsert/);
  assert.match(service, /scanLifecycleAutomations/);
});

test('template rendering only substitutes allowlisted variables and escapes email values', () => {
  assert.deepEqual(validateTemplateInput({ subject: '{{title}}', body: 'Hi {{name}}', allowedVariables: ['title','name'] }), ['title','name']);
  assert.throws(() => validateTemplateInput({ body: '{{secret}}', allowedVariables: [] }), /not allowlisted/);
  assert.equal(render('Hi {{name}} {{secret}}', { name: '<Admin>', secret: 'hidden' }, ['name'], true), 'Hi &lt;Admin&gt; ');
});

test('support records are tenant scoped and internal notes are distinct', () => {
  assert.equal(SupportTicket.schema.path('tenant').options.required, true);
  assert.ok(SupportTicket.schema.indexes().some(([keys]) => keys.tenant === 1 && keys.status === 1));
  assert.ok(SupportMessage.schema.path('kind').enumValues.includes('internal_note'));
  assert.equal(SupportMessage.schema.path('tenant').options.required, true);
});

test('tenant support actions create platform notifications outside tenant scope', () => {
  const service = fs.readFileSync(path.join(__dirname, '../services/supportService.js'), 'utf8');
  assert.match(service, /withoutTenantScope/);
  assert.equal((service.match(/withoutTenantScope\(\(\) => Notification\.create/g) || []).length, 2);
  assert.match(service, /type: 'support_ticket'/);
  assert.match(service, /type: 'support_reply'/);
});

test('urgent SLA deadlines are stricter than normal deadlines', () => {
  const now = new Date('2026-01-01T00:00:00Z'); const urgent = deadlines('urgent', now); const normal = deadlines('normal', now);
  assert.ok(urgent.firstResponseDueAt < normal.firstResponseDueAt);
  assert.ok(urgent.resolutionDueAt < normal.resolutionDueAt);
});

test('realtime support isolates tenants and never emits internal notes to tenant streams', () => {
  const tenantClient = { platform: false, tenantId: 'tenant-a' };
  assert.equal(supportRealtime.visibleToClient(tenantClient, { tenantId: 'tenant-a', kind: 'reply' }), true);
  assert.equal(supportRealtime.visibleToClient(tenantClient, { tenantId: 'tenant-b', kind: 'reply' }), false);
  assert.equal(supportRealtime.visibleToClient(tenantClient, { tenantId: 'tenant-a', kind: 'internal_note' }), false);
  assert.equal(supportRealtime.visibleToClient({ platform: true }, { tenantId: 'tenant-b', kind: 'internal_note' }), true);
  const health = supportRealtime.health();
  assert.equal(health.transport, 'sse');
  assert.equal(health.durability, 'mongodb_polling');
  assert.ok(health.maxClients > health.maxPerUser);
});

test('support streams are authenticated, bounded, heartbeat-driven, and reconnectable', () => {
  const service = fs.readFileSync(path.join(__dirname, '../services/supportRealtimeService.js'), 'utf8');
  const platform = fs.readFileSync(path.join(__dirname, '../routes/superadmin/support.js'), 'utf8');
  const tenant = fs.readFileSync(path.join(__dirname, '../routes/support.js'), 'utf8');
  const hook = fs.readFileSync(path.join(__dirname, '../../frontend/src/hooks/useSupportRealtime.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(platform, /'\/stream', requirePlatformPermission\('support\.view'\)/);
  assert.match(tenant, /'\/stream', adminAuth/);
  assert.match(service, /MAX_CLIENTS = 500/);
  assert.match(service, /MAX_PER_USER = 3/);
  assert.match(service, /SupportMessage.*SupportTicket/s);
  assert.match(service, /text\/event-stream/);
  assert.match(hook, /Authorization: `Bearer/);
  assert.match(hook, /AbortController/);
  assert.match(hook, /Math\.min\(30000/);
  assert.match(server, /text\/event-stream/);
});

test('notification and support APIs require dynamic permissions and tenant ownership', () => {
  const notificationRoute = fs.readFileSync(path.join(__dirname, '../routes/superadmin/notificationsCenter.js'), 'utf8');
  const supportRoute = fs.readFileSync(path.join(__dirname, '../routes/superadmin/support.js'), 'utf8');
  const tenantRoute = fs.readFileSync(path.join(__dirname, '../routes/support.js'), 'utf8');
  assert.match(notificationRoute, /notifications\.send/); assert.match(notificationRoute, /notifications\.manage/);
  assert.match(notificationRoute, /notification-automation\.update/);
  assert.match(notificationRoute, /enabled automation requires at least one channel/);
  assert.match(supportRoute, /support\.reply/); assert.match(supportRoute, /support\.manage/);
  assert.match(supportRoute, /supportRealtime\.connect/);
  assert.match(tenantRoute, /tenant: tenantId\(req\)/); assert.match(tenantRoute, /kind: \{ \$ne: 'internal_note' \}/);
});

test('billing lifecycle queues notifications and never sends reminders inline', () => {
  const subscription = fs.readFileSync(path.join(__dirname, '../services/subscriptionService.js'), 'utf8');
  assert.match(subscription, /enqueueTenantEvent\('tenant_suspended'/);
  assert.match(subscription, /scanLifecycleAutomations/);
  assert.doesNotMatch(subscription, /await sendMail\(/);
});
