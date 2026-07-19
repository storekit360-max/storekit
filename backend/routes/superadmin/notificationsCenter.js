'use strict';

const express = require('express');
const mongoose = require('mongoose');
const PlatformNotificationTemplate = require('../../models/PlatformNotificationTemplate');
const PlatformAnnouncement = require('../../models/PlatformAnnouncement');
const NotificationDelivery = require('../../models/NotificationDelivery');
const PlatformNotificationAutomation = require('../../models/PlatformNotificationAutomation');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const notificationService = require('../../services/platformNotificationService');
const { requireRecentStepUp } = require('../../middleware/stepUp');
const { recordDeployment } = require('../../services/deploymentService');

const router = express.Router();
const channels = ['email', 'sms', 'push', 'slack', 'webhook', 'in_app'];
const cleanKey = value => String(value || '').trim().toLowerCase();

router.get('/overview', requirePlatformPermission('notifications.view'), async (_req, res, next) => {
  try {
    const [templates, announcements, queued, failed, sent24h] = await Promise.all([PlatformNotificationTemplate.countDocuments(), PlatformAnnouncement.countDocuments(), NotificationDelivery.countDocuments({ status: { $in: ['queued', 'processing', 'failed'] } }), NotificationDelivery.countDocuments({ status: 'dead' }), NotificationDelivery.countDocuments({ status: 'sent', sentAt: { $gte: new Date(Date.now() - 86400000) } })]);
    res.json({ templates, announcements, queued, dead: failed, sent24h, worker: notificationService.getNotificationWorkerHealth() });
  } catch (error) { next(error); }
});

router.get('/automations', requirePlatformPermission('notifications.view'), async (_req, res, next) => {
  try { res.json(await notificationService.ensureAutomationDefaults()); } catch (error) { next(error); }
});
router.post('/automations/deployment_complete/trigger', requirePlatformPermission('notifications.send'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const deploymentId = String(req.body?.deploymentId || '').trim(); const environment = String(req.body?.environment || '').trim(); const version = String(req.body?.version || '').trim();
    if (!/^[a-zA-Z0-9._:-]{3,120}$/.test(deploymentId) || !/^[a-zA-Z0-9._-]{2,40}$/.test(environment) || !version || version.length > 100) return res.status(400).json({ message: 'Valid deployment ID, environment, and version are required' });
    const deployment = await recordDeployment({ provider: 'manual', deploymentId, environment, version, status: 'ready', occurredAt: new Date() }, { source: 'manual', actorId: req.user._id });
    const result = await notificationService.enqueueSystemEvent('deployment_complete', deploymentId, { deploymentId, environment, version, eventDate: new Date().toISOString() });
    req.audit.set({ action: 'notification-automation.trigger', resource: 'notification-automation', resourceId: 'deployment_complete', metadata: { deploymentId, environment, version, queued: result.queued } });
    res.json({ ...result, deploymentId: deployment._id });
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});
router.put('/automations/:eventKey', requirePlatformPermission('notifications.manage'), async (req, res, next) => {
  try {
    const defaults = notificationService.AUTOMATION_DEFAULTS[req.params.eventKey];
    if (!defaults) return res.status(404).json({ message: 'Notification automation not found' });
    const allowedChannels = req.params.eventKey === 'deployment_complete' ? ['slack', 'webhook'] : channels;
    const selectedChannels = Array.from(new Set((req.body?.channels || []).filter(value => allowedChannels.includes(value))));
    if (req.body?.enabled !== false && !selectedChannels.length) return res.status(400).json({ message: 'An enabled automation requires at least one channel' });
    const leadDays = req.params.eventKey === 'trial_ending' || req.params.eventKey === 'payment_failed'
      ? Array.from(new Set((req.body?.leadDays || []).map(Number).filter(value => Number.isInteger(value) && value >= 0 && value <= 30))).sort((a, b) => b - a)
      : [];
    if (['trial_ending', 'payment_failed'].includes(req.params.eventKey) && req.body?.enabled !== false && !leadDays.length) return res.status(400).json({ message: 'Select at least one notification lead day' });
    const templateKeys = {};
    for (const channel of selectedChannels) {
      const key = cleanKey(req.body?.templateKeys?.[channel]); if (!key) continue;
      const valid = await PlatformNotificationTemplate.exists({ key, channel, enabled: true });
      if (!valid) return res.status(400).json({ message: `Template ${key} is not an enabled ${channel} template` });
      templateKeys[channel] = key;
    }
    const oldValue = await PlatformNotificationAutomation.findOne({ eventKey: req.params.eventKey }).lean();
    const item = await PlatformNotificationAutomation.findOneAndUpdate({ eventKey: req.params.eventKey }, { $set: { enabled: req.body?.enabled !== false, channels: selectedChannels, leadDays, templateKeys, updatedBy: req.user._id } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    req.audit.set({ action: 'notification-automation.update', resource: 'notification-automation', resourceId: req.params.eventKey, changes: { oldValue, newValue: item.toObject() } });
    res.json(item);
  } catch (error) { next(error); }
});

router.get('/templates', requirePlatformPermission('notifications.view'), async (_req, res, next) => { try { res.json(await PlatformNotificationTemplate.find().sort({ channel: 1, key: 1 }).lean()); } catch (error) { next(error); } });
router.post('/templates', requirePlatformPermission('notifications.manage'), async (req, res, next) => {
  try {
    const key = cleanKey(req.body?.key); if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(key) || !req.body?.name || !channels.includes(req.body?.channel) || !req.body?.body) return res.status(400).json({ message: 'Valid key, name, channel, and body are required' });
    const allowedVariables = notificationService.validateTemplateInput(req.body);
    const item = await PlatformNotificationTemplate.create({ key, name: String(req.body.name).trim(), description: String(req.body.description || '').trim(), channel: req.body.channel, locale: cleanKey(req.body.locale || 'en'), subject: String(req.body.subject || ''), body: String(req.body.body), allowedVariables, enabled: req.body.enabled !== false, createdBy: req.user._id, updatedBy: req.user._id });
    req.audit.set({ action: 'notification-template.create', resource: 'notification-template', resourceId: String(item._id) }); res.status(201).json(item);
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: 'Template key already exists' }); if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});
router.put('/templates/:id', requirePlatformPermission('notifications.manage'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid template identifier' });
    const expectedVersion = Number(req.body?.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return res.status(400).json({ message: 'A valid expected template version is required' });
    const existing = await PlatformNotificationTemplate.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ message: 'Template not found' });
    const merged = { ...existing, ...req.body }; const allowedVariables = notificationService.validateTemplateInput(merged);
    const set = { allowedVariables, updatedBy: req.user._id };
    for (const key of ['name', 'description', 'locale', 'subject', 'body', 'enabled']) if (req.body[key] !== undefined) set[key] = req.body[key];
    const item = await PlatformNotificationTemplate.findOneAndUpdate({ _id: req.params.id, version: expectedVersion }, { $set: set, $inc: { version: 1 } }, { new: true, runValidators: true });
    if (!item) return res.status(409).json({ message: 'Template changed since it was opened; reload before saving' });
    req.audit.set({ action: 'notification-template.update', resource: 'notification-template', resourceId: req.params.id, changes: { oldValue: existing, newValue: item.toObject(), changedFields: Object.keys(set).filter(key => key !== 'updatedBy') }, metadata: { expectedVersion, resultingVersion: item.version } });
    res.json(item);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.get('/announcements', requirePlatformPermission('notifications.view'), async (_req, res, next) => { try { res.json(await PlatformAnnouncement.find().populate('tenantIds planIds', 'storeName name').sort({ createdAt: -1 }).limit(200).lean()); } catch (error) { next(error); } });
router.post('/announcements', requirePlatformPermission('notifications.manage'), async (req, res, next) => {
  try {
    if (!req.body?.title || !req.body?.body) return res.status(400).json({ message: 'Title and message are required' });
    const startsAt = req.body.startsAt ? new Date(req.body.startsAt) : null; const endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null; if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime())) || (startsAt && endsAt && startsAt >= endsAt)) return res.status(400).json({ message: 'Announcement schedule is invalid' });
    const selectedChannels = Array.from(new Set((req.body.channels || []).filter(value => channels.includes(value))));
    const item = await PlatformAnnouncement.create({ title: String(req.body.title).trim(), body: String(req.body.body), kind: req.body.kind, severity: req.body.severity, status: startsAt && startsAt > new Date() ? 'scheduled' : 'draft', audience: req.body.audience, tenantIds: req.body.tenantIds || [], planIds: req.body.planIds || [], countries: (req.body.countries || []).map(value => String(value).toUpperCase()), channels: selectedChannels, templateKeys: req.body.templateKeys || {}, startsAt, endsAt, createdBy: req.user._id, updatedBy: req.user._id });
    req.audit.set({ action: 'announcement.create', resource: 'platform-announcement', resourceId: String(item._id) }); res.status(201).json(item);
  } catch (error) { next(error); }
});
router.post('/announcements/:id/publish', requirePlatformPermission('notifications.send'), async (req, res, next) => { try { const result = await notificationService.publishAnnouncement(req.params.id, req.user._id); req.audit.set({ action: 'announcement.publish', resource: 'platform-announcement', resourceId: req.params.id, metadata: { recipients: result.recipients, queued: result.queued } }); res.json(result); } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); } });
router.post('/announcements/:id/archive', requirePlatformPermission('notifications.manage'), async (req, res, next) => { try { const item = await PlatformAnnouncement.findByIdAndUpdate(req.params.id, { $set: { status: 'archived', endsAt: new Date(), updatedBy: req.user._id } }, { new: true }); if (!item) return res.status(404).json({ message: 'Announcement not found' }); await NotificationDelivery.updateMany({ announcement: item._id, status: { $in: ['queued', 'failed'] } }, { $set: { status: 'cancelled' } }); req.audit.set({ action: 'announcement.archive', resource: 'platform-announcement', resourceId: req.params.id }); res.json(item); } catch (error) { next(error); } });

router.get('/deliveries', requirePlatformPermission('notifications.view'), async (req, res, next) => {
  try { const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1); const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100); const query = {}; if (req.query.status) query.status = req.query.status; if (req.query.channel) query.channel = req.query.channel; const [rows, total] = await Promise.all([NotificationDelivery.find(query).populate('tenant', 'storeName slug').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), NotificationDelivery.countDocuments(query)]); res.json({ rows, total, page, pages: Math.ceil(total / limit) }); } catch (error) { next(error); }
});
router.post('/deliveries/:id/retry', requirePlatformPermission('notifications.manage'), async (req, res, next) => { try { const item = await NotificationDelivery.findOneAndUpdate({ _id: req.params.id, status: { $in: ['dead','failed'] } }, { $set: { status: 'queued', attempts: 0, nextAttemptAt: new Date(), lockedAt: null, lockedBy: '', lastError: '' } }, { new: true }); if (!item) return res.status(409).json({ message: 'Only failed or dead deliveries can be retried' }); req.audit.set({ action: 'notification-delivery.retry', resource: 'notification-delivery', resourceId: req.params.id }); res.json(item); } catch (error) { next(error); } });
router.post('/worker/run', requirePlatformPermission('notifications.manage'), async (_req, res, next) => { try { res.json(await notificationService.runNotificationWorkerOnce(100)); } catch (error) { next(error); } });

module.exports = router;
