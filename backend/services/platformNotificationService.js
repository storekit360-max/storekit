'use strict';

const crypto = require('crypto');
const axios = require('axios');
const NotificationDelivery = require('../models/NotificationDelivery');
const PlatformNotificationTemplate = require('../models/PlatformNotificationTemplate');
const PlatformAnnouncement = require('../models/PlatformAnnouncement');
const PlatformNotificationAutomation = require('../models/PlatformNotificationAutomation');
const Tenant = require('../models/Tenant');
const { Notification } = require('../models');
const { sendMail } = require('../utils/mailer');
const { resolvedIntegration } = require('./platformIntegrationService');
const webhookEvents = require('./webhookEventService');

const WORKER_ID = `${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
let timer = null;
let running = false;
const health = { workerId: WORKER_ID, running: false, lastRunAt: null, lastError: '', processed: 0 };
const AUTOMATION_DEFAULTS = Object.freeze({
  trial_ending: { channels: ['email', 'in_app'], leadDays: [7, 3, 1] },
  payment_failed: { channels: ['email', 'in_app'], leadDays: [3, 1] },
  tenant_suspended: { channels: ['email', 'in_app'], leadDays: [] },
  deployment_complete: { channels: ['slack', 'webhook'], leadDays: [] },
});
const EVENT_COPY = Object.freeze({
  trial_ending: { subject: 'Your StoreKit trial ends in {{daysRemaining}} day(s)', body: 'Hello {{firstName}}, your trial for {{storeName}} ends on {{dueDate}}. Review your subscription now to keep your storefront available.' },
  payment_failed: { subject: 'Payment required for {{storeName}}', body: 'Hello {{firstName}}, payment for {{storeName}} is overdue. The grace period ends on {{dueDate}}. Please update your subscription to avoid interruption.' },
  tenant_suspended: { subject: '{{storeName}} has been suspended', body: 'Hello {{firstName}}, {{storeName}} was suspended on {{eventDate}}. Reason: {{reason}}. Contact support if you need assistance.' },
  deployment_complete: { subject: 'Deployment completed: {{environment}}', body: 'StoreKit version {{version}} completed deployment to {{environment}} at {{eventDate}}. Deployment ID: {{deploymentId}}.' },
});

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const variablePattern = /{{\s*([a-zA-Z][a-zA-Z0-9_.-]{0,79})\s*}}/g;

function variablesIn(value) { return Array.from(String(value || '').matchAll(variablePattern), match => match[1]); }
function render(value, variables, allowedVariables, html = false) {
  const allowed = new Set(allowedVariables || []);
  return String(value || '').replace(variablePattern, (_match, key) => {
    if (!allowed.has(key)) return '';
    const replacement = variables?.[key] ?? '';
    return html ? escapeHtml(replacement) : String(replacement);
  });
}

function validateTemplateInput(input) {
  const allowedVariables = Array.from(new Set((input.allowedVariables || []).map(value => String(value).trim()).filter(value => /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(value))));
  const unknown = [...variablesIn(input.subject), ...variablesIn(input.body)].filter(key => !allowedVariables.includes(key));
  if (unknown.length) throw Object.assign(new Error(`Template uses variables that are not allowlisted: ${Array.from(new Set(unknown)).join(', ')}`), { statusCode: 400 });
  return allowedVariables;
}

async function ensureAutomationDefaults() {
  await Promise.all(Object.entries(AUTOMATION_DEFAULTS).map(([eventKey, value]) => PlatformNotificationAutomation.updateOne(
    { eventKey },
    { $setOnInsert: { eventKey, enabled: true, channels: value.channels, leadDays: value.leadDays } },
    { upsert: true }
  )));
  return PlatformNotificationAutomation.find().sort({ eventKey: 1 }).lean();
}

async function enqueueTenantEvent(eventKey, tenantInput, occurrenceKey, variables = {}) {
  const fallback = AUTOMATION_DEFAULTS[eventKey];
  if (!fallback || eventKey === 'deployment_complete') throw Object.assign(new Error('Unsupported tenant notification event'), { statusCode: 400 });
  const automation = await PlatformNotificationAutomation.findOne({ eventKey }).lean() || { eventKey, enabled: true, ...fallback, templateKeys: {} };
  if (!automation.enabled) return { queued: 0, skipped: automation.channels?.length || 0, disabled: true };
  const tenant = tenantInput?.owner ? tenantInput : await Tenant.findById(tenantInput).populate('owner', 'email phone firstName lastName').select('storeName slug owner settings plan status billing').lean();
  if (!tenant) throw Object.assign(new Error('Tenant not found'), { statusCode: 404 });
  const baseVariables = { storeName: tenant.storeName, firstName: tenant.owner?.firstName || 'Store Admin', ...variables };
  let queued = 0; let skipped = 0;
  for (const channel of automation.channels || []) {
    const destination = destinationFor(channel, tenant);
    if (!destination && !['slack', 'webhook'].includes(channel)) { skipped += 1; continue; }
    const templateKey = automation.templateKeys?.get?.(channel) || automation.templateKeys?.[channel];
    const template = templateKey ? await PlatformNotificationTemplate.findOne({ key: templateKey, channel, enabled: true }).lean() : null;
    const copy = EVENT_COPY[eventKey];
    const allowedVariables = template?.allowedVariables || Object.keys(baseVariables);
    const subject = render(template?.subject || copy.subject, baseVariables, allowedVariables);
    const body = render(template?.body || copy.body, baseVariables, allowedVariables, channel === 'email');
    const idempotencyKey = `automation:${eventKey}:${tenant._id}:${String(occurrenceKey)}:${channel}`.slice(0, 180);
    const result = await NotificationDelivery.updateOne({ idempotencyKey }, { $setOnInsert: { idempotencyKey, template: template?._id || null, tenant: tenant._id, user: tenant.owner?._id || null, channel, destination, subject, body, status: 'queued', nextAttemptAt: new Date(), metadata: { automationEvent: eventKey, occurrenceKey: String(occurrenceKey) } } }, { upsert: true });
    if (result.upsertedCount) queued += 1; else skipped += 1;
  }
  return { queued, skipped, disabled: false };
}

async function enqueueSystemEvent(eventKey, occurrenceKey, variables = {}) {
  if (eventKey !== 'deployment_complete') throw Object.assign(new Error('Unsupported system notification event'), { statusCode: 400 });
  const fallback = AUTOMATION_DEFAULTS[eventKey];
  const automation = await PlatformNotificationAutomation.findOne({ eventKey }).lean() || { eventKey, enabled: true, ...fallback, templateKeys: {} };
  if (!automation.enabled) return { queued: 0, skipped: automation.channels?.length || 0, disabled: true };
  let queued = 0; let skipped = 0;
  for (const channel of (automation.channels || []).filter(value => ['slack', 'webhook'].includes(value))) {
    const templateKey = automation.templateKeys?.get?.(channel) || automation.templateKeys?.[channel];
    const template = templateKey ? await PlatformNotificationTemplate.findOne({ key: templateKey, channel, enabled: true }).lean() : null;
    const copy = EVENT_COPY[eventKey]; const allowedVariables = template?.allowedVariables || Object.keys(variables);
    const idempotencyKey = `automation:${eventKey}:platform:${String(occurrenceKey)}:${channel}`.slice(0, 180);
    const result = await NotificationDelivery.updateOne({ idempotencyKey }, { $setOnInsert: { idempotencyKey, template: template?._id || null, tenant: null, user: null, channel, destination: 'platform-integration', subject: render(template?.subject || copy.subject, variables, allowedVariables), body: render(template?.body || copy.body, variables, allowedVariables), status: 'queued', nextAttemptAt: new Date(), metadata: { automationEvent: eventKey, occurrenceKey: String(occurrenceKey), environment: variables.environment, version: variables.version } } }, { upsert: true });
    if (result.upsertedCount) queued += 1; else skipped += 1;
  }
  return { queued, skipped, disabled: false };
}

const dateKey = value => new Date(value).toISOString().slice(0, 10);
const utcDayBounds = (daysAhead, now = new Date()) => { const start = new Date(now); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() + daysAhead); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1); return { start, end }; };
async function scanLifecycleAutomations(now = new Date()) {
  const automations = await ensureAutomationDefaults();
  const byKey = Object.fromEntries(automations.map(item => [item.eventKey, item]));
  const summary = { tenants: 0, queued: 0, skipped: 0 };
  const scan = async (eventKey, dateField, status, dueVariable) => {
    const automation = byKey[eventKey]; if (!automation?.enabled) return;
    for (const leadDays of automation.leadDays || []) {
      const { start, end } = utcDayBounds(leadDays, now);
      const tenants = await Tenant.find({ status: { $ne: 'suspended' }, [`billing.subscriptionStatus`]: status, [dateField]: { $gte: start, $lt: end } }).populate('owner', 'email phone firstName lastName').select('storeName slug owner settings plan status billing').lean();
      for (const tenant of tenants) {
        const due = dateField.split('.').reduce((value, key) => value?.[key], tenant);
        const result = await enqueueTenantEvent(eventKey, tenant, `${dateKey(due)}:${leadDays}`, { daysRemaining: leadDays, [dueVariable]: dateKey(due) });
        summary.tenants += 1; summary.queued += result.queued; summary.skipped += result.skipped;
      }
    }
  };
  await scan('trial_ending', 'billing.trialEndsAt', 'trial', 'dueDate');
  await scan('payment_failed', 'billing.gracePeriodEndsAt', 'past_due', 'dueDate');
  return summary;
}

async function resolveRecipients(announcement) {
  const query = { status: { $ne: 'pending' }, 'management.archivedAt': null };
  if (announcement.audience === 'tenants') query._id = { $in: announcement.tenantIds };
  if (announcement.audience === 'plans') query.plan = { $in: announcement.planIds };
  if (announcement.audience === 'countries') query['settings.merchantCountryCode'] = { $in: announcement.countries };
  return Tenant.find(query).populate('owner', 'email phone firstName lastName').select('storeName slug owner settings plan status').lean();
}

function destinationFor(channel, tenant) {
  if (channel === 'email') return tenant.owner?.email || tenant.settings?.storeEmail || '';
  if (channel === 'sms') return tenant.owner?.phone || tenant.settings?.storePhone || tenant.settings?.phone || '';
  if (channel === 'in_app' || channel === 'push') return String(tenant.owner?._id || '');
  return 'platform-integration';
}

async function publishAnnouncement(announcementId, actorId) {
  const announcement = await PlatformAnnouncement.findById(announcementId);
  if (!announcement) throw Object.assign(new Error('Announcement not found'), { statusCode: 404 });
  if (!announcement.channels.length) throw Object.assign(new Error('Select at least one delivery channel'), { statusCode: 400 });
  const tenants = await resolveRecipients(announcement);
  let queued = 0; let skipped = 0;
  for (const tenant of tenants) {
    for (const channel of announcement.channels) {
      const destination = destinationFor(channel, tenant);
      if (!destination && !['slack', 'webhook'].includes(channel)) { skipped += 1; continue; }
      const templateKey = announcement.templateKeys?.get?.(channel) || announcement.templateKeys?.[channel];
      const template = templateKey ? await PlatformNotificationTemplate.findOne({ key: templateKey, channel, enabled: true }).lean() : null;
      const variables = { storeName: tenant.storeName, firstName: tenant.owner?.firstName || 'Store Admin', announcementTitle: announcement.title, announcementBody: announcement.body };
      const subject = template ? render(template.subject, variables, template.allowedVariables) : announcement.title;
      const body = template ? render(template.body, variables, template.allowedVariables, channel === 'email') : announcement.body;
      const idempotencyKey = `announcement:${announcement._id}:${tenant._id}:${channel}`;
      const result = await NotificationDelivery.updateOne({ idempotencyKey }, { $setOnInsert: { idempotencyKey, announcement: announcement._id, template: template?._id || null, tenant: tenant._id, user: tenant.owner?._id || null, channel, destination, subject, body, status: 'queued', nextAttemptAt: new Date(), metadata: { announcementKind: announcement.kind, severity: announcement.severity } } }, { upsert: true });
      if (result.upsertedCount) queued += 1; else skipped += 1;
    }
  }
  announcement.status = 'published'; announcement.publishedAt = new Date(); announcement.updatedBy = actorId; await announcement.save();
  return { announcement, recipients: tenants.length, queued, skipped };
}

async function sendDelivery(delivery) {
  if (delivery.channel === 'email') { const info = await sendMail({ to: delivery.destination, subject: delivery.subject, html: delivery.body }); return info?.messageId || ''; }
  if (delivery.channel === 'in_app') { const item = await Notification.create({ tenantId: delivery.tenant, type: 'system', title: delivery.subject, message: delivery.body, data: { announcementId: delivery.announcement, severity: delivery.metadata?.severity, channel: delivery.channel } }); return String(item._id); }
  if (delivery.channel === 'push') { const integration = await resolvedIntegration('push-gateway'); if (!integration.enabled || !integration.config.endpoint) throw new Error('Push gateway integration is not enabled'); const response = await axios.post(integration.config.endpoint, { userId: delivery.destination, tenantId: String(delivery.tenant), title: delivery.subject, body: delivery.body, data: delivery.metadata || {} }, { headers: { Authorization: `Bearer ${integration.secrets.apiKey}` }, timeout: 10000, maxRedirects: 0 }); return String(response.data?.id || response.headers['x-request-id'] || ''); }
  if (delivery.channel === 'slack') { const integration = await resolvedIntegration('slack'); if (!integration.enabled || !integration.secrets.webhookUrl) throw new Error('Slack integration is not enabled'); const response = await axios.post(integration.secrets.webhookUrl, { text: `*${delivery.subject}*\n${delivery.body}` }, { timeout: 10000, maxRedirects: 0 }); return String(response.headers['x-slack-req-id'] || ''); }
  if (delivery.channel === 'sms') { const integration = await resolvedIntegration('twilio'); if (!integration.enabled) throw new Error('Twilio integration is not enabled'); const auth = Buffer.from(`${integration.config.accountSid}:${integration.secrets.authToken}`).toString('base64'); const body = new URLSearchParams({ To: delivery.destination, From: integration.config.fromNumber, Body: `${delivery.subject}\n${delivery.body}`.slice(0, 1500) }); const response = await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(integration.config.accountSid)}/Messages.json`, body.toString(), { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }); return response.data?.sid || ''; }
  if (delivery.channel === 'webhook') { const integration = await resolvedIntegration('notification-webhook'); if (!integration.enabled || !integration.config.endpoint) throw new Error('Notification webhook integration is not enabled'); const payload = { id: String(delivery._id), event: delivery.metadata?.automationEvent || delivery.metadata?.announcementKind || 'custom', tenantId: String(delivery.tenant || ''), subject: delivery.subject, body: delivery.body, createdAt: delivery.createdAt }; const signature = crypto.createHmac('sha256', integration.secrets.signingSecret).update(JSON.stringify(payload)).digest('hex'); const started=Date.now(); try { const response = await axios.post(integration.config.endpoint, payload, { headers: { 'X-StoreKit-Signature': `sha256=${signature}` }, timeout: 10000, maxRedirects: 0 }); await webhookEvents.record({direction:'outbound',provider:'notification-webhook',eventId:String(delivery._id),eventType:payload.event,tenantId:delivery.tenant,status:'succeeded',httpStatus:response.status,durationMs:Date.now()-started,processedAt:new Date(),deliveryId:delivery._id,payload}); return String(response.headers['x-request-id'] || ''); } catch(error) { await webhookEvents.record({direction:'outbound',provider:'notification-webhook',eventId:String(delivery._id),eventType:payload.event,tenantId:delivery.tenant,status:'failed',httpStatus:error.response?.status||null,durationMs:Date.now()-started,processedAt:new Date(),deliveryId:delivery._id,error:String(error.message).slice(0,1000),payload}); throw error; } }
  throw new Error('Unsupported delivery channel');
}

async function claimOne() {
  const stale = new Date(Date.now() - 5 * 60 * 1000);
  return NotificationDelivery.findOneAndUpdate({ status: { $in: ['queued', 'failed', 'processing'] }, nextAttemptAt: { $lte: new Date() }, $or: [{ lockedAt: null }, { lockedAt: { $lt: stale } }] }, { $set: { status: 'processing', lockedAt: new Date(), lockedBy: WORKER_ID }, $inc: { attempts: 1 } }, { new: true, sort: { nextAttemptAt: 1 } });
}

async function runNotificationWorkerOnce(limit = 25) {
  if (running) return { ...health, skipped: true };
  running = true; health.running = true; health.lastRunAt = new Date(); let processed = 0;
  try {
    const automation = await scanLifecycleAutomations();
    const dueCampaigns = await PlatformAnnouncement.find({ status: 'scheduled', startsAt: { $lte: new Date() } }).select('_id').limit(20).lean();
    for (const campaign of dueCampaigns) await publishAnnouncement(campaign._id, null);
    while (processed < limit) {
      const delivery = await claimOne(); if (!delivery) break;
      try { const providerMessageId = await sendDelivery(delivery); await NotificationDelivery.updateOne({ _id: delivery._id, lockedBy: WORKER_ID }, { $set: { status: 'sent', sentAt: new Date(), providerMessageId, lockedAt: null, lockedBy: '', lastError: '' } }); }
      catch (error) { const dead = delivery.attempts >= delivery.maxAttempts; const delay = Math.min(24 * 60, 2 ** Math.max(0, delivery.attempts - 1) * 5); await NotificationDelivery.updateOne({ _id: delivery._id, lockedBy: WORKER_ID }, { $set: { status: dead ? 'dead' : 'failed', nextAttemptAt: new Date(Date.now() + delay * 60000), lockedAt: null, lockedBy: '', lastError: String(error.message || error).slice(0, 2000) } }); }
      processed += 1;
    }
    health.processed += processed; health.lastError = ''; return { ...health, processedThisRun: processed, automation };
  } catch (error) { health.lastError = error.message; throw error; }
  finally { running = false; health.running = false; }
}

function startNotificationWorker() { if (timer || process.env.DISABLE_SCHEDULERS === 'true') return; timer = setInterval(() => runNotificationWorkerOnce().catch(error => console.error('[NOTIFICATION_WORKER_FAILED]', error.message)), 30000); timer.unref(); setTimeout(() => runNotificationWorkerOnce().catch(() => {}), 5000).unref(); }
function stopNotificationWorker() { if (timer) clearInterval(timer); timer = null; }
function getNotificationWorkerHealth() { return { ...health }; }

module.exports = { AUTOMATION_DEFAULTS, escapeHtml, render, validateTemplateInput, ensureAutomationDefaults, enqueueTenantEvent, enqueueSystemEvent, scanLifecycleAutomations, resolveRecipients, publishAnnouncement, runNotificationWorkerOnce, startNotificationWorker, stopNotificationWorker, getNotificationWorkerHealth };
