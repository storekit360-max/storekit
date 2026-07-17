'use strict';

const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');
const svc = require('../services/socialSchedulingService');
const SocialSchedule = require('../models/SocialSchedule');
const SocialPostDraft = require('../models/SocialPostDraft');

router.use(adminAuth);

const handle = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    console.error('[SocialScheduling]', error.message);
    res.status(error.statusCode || 400).json({ message: error.message || 'Social scheduling request failed' });
  }
};

router.get('/products', handle(async (req, res) => {
  res.json(await svc.listProductOptions(svc.requiredTenantId(req), req.query));
}));

router.post('/draft-batches', handle(async (req, res) => {
  res.status(201).json(await svc.generateDraftBatch(req, req.body || {}));
}));

router.get('/draft-batches', handle(async (req, res) => {
  res.json(await svc.listDraftBatches(svc.requiredTenantId(req), req.query));
}));

router.get('/draft-batches/:group', handle(async (req, res) => {
  res.json(await svc.listDrafts(svc.requiredTenantId(req), req.params.group));
}));

router.delete('/draft-batches/:group', handle(async (req, res) => {
  res.json(await svc.deleteDraftBatch(svc.requiredTenantId(req), req.params.group));
}));

router.get('/drafts/:id', handle(async (req, res) => {
  const draft = await SocialPostDraft.findOne({ _id: req.params.id, tenantId: svc.requiredTenantId(req) }).lean();
  if (!draft) return res.status(404).json({ message: 'Draft not found' });
  res.json(draft);
}));

router.put('/drafts/:id', handle(async (req, res) => {
  res.json(await svc.updateDraft(svc.requiredTenantId(req), req.params.id, req.body || {}, req.user._id));
}));

router.delete('/drafts/:id', handle(async (req, res) => {
  res.json(await svc.deleteDraft(svc.requiredTenantId(req), req.params.id));
}));

router.post('/drafts/:id/confirm', handle(async (req, res) => {
  res.json(await svc.confirmDraft(svc.requiredTenantId(req), req.params.id, req.user._id));
}));

router.post('/drafts/:id/regenerate', handle(async (req, res) => {
  res.json(await svc.regenerateDraft(svc.requiredTenantId(req), req.params.id, req.body || {}));
}));

router.post('/draft-batches/:group/confirm-all', handle(async (req, res) => {
  res.json(await svc.confirmAll(svc.requiredTenantId(req), req.params.group, req.user._id));
}));

router.post('/draft-batches/:group/schedule', handle(async (req, res) => {
  res.status(201).json(await svc.createSchedule(svc.requiredTenantId(req), req.params.group, req.user._id));
}));

router.get('/schedules', handle(async (req, res) => {
  res.json(await svc.listSchedules(svc.requiredTenantId(req), req.query));
}));

router.get('/schedules/:id', handle(async (req, res) => {
  const tenantId = svc.requiredTenantId(req);
  const schedule = await SocialSchedule.findOne({ _id: req.params.id, tenantId, deletedAt: null }).lean();
  if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
  const queue = await svc.listQueue(tenantId, { schedule: req.params.id, page: req.query.page || 1, limit: req.query.limit || 50 });
  res.json({ schedule, queue });
}));

['pause', 'resume', 'stop'].forEach(action => {
  router.post(`/schedules/:id/${action}`, handle(async (req, res) => {
    res.json(await svc.scheduleAction(svc.requiredTenantId(req), req.params.id, action));
  }));
});

router.delete('/schedules/:id', handle(async (req, res) => {
  res.json(await svc.deleteSchedule(svc.requiredTenantId(req), req.params.id));
}));

router.get('/queue', handle(async (req, res) => {
  res.json(await svc.listQueue(svc.requiredTenantId(req), req.query));
}));

router.put('/queue/:id', handle(async (req, res) => {
  res.json(await svc.updateQueueItem(svc.requiredTenantId(req), req.params.id, req.body || {}));
}));

router.delete('/queue/:id', handle(async (req, res) => {
  res.json(await svc.cancelQueueItem(svc.requiredTenantId(req), req.params.id));
}));

router.post('/queue/:id/retry', handle(async (req, res) => {
  res.json(await svc.retryQueueItem(svc.requiredTenantId(req), req.params.id));
}));

router.get('/publish-logs', handle(async (req, res) => {
  res.json(await svc.getPublishLogs(svc.requiredTenantId(req), req.query));
}));

router.get('/worker/health', handle(async (_req, res) => {
  const { getSocialSchedulerHealth } = require('../services/socialScheduler');
  res.json(getSocialSchedulerHealth());
}));

module.exports = router;
