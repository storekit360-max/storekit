'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { evaluateFlags, recordExposures } = require('../services/runtimeFeatureFlagService');

const router = express.Router();
const limiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

router.post('/evaluate', limiter, async (req, res, next) => {
  try {
    if (!req.tenant?._id) return res.status(404).json({ message: 'Store not resolved' });
    const anonymousId = String(req.body?.anonymousId || req.get('X-Anonymous-ID') || '').trim().slice(0, 120);
    if (!anonymousId) return res.status(400).json({ message: 'Anonymous subject ID is required' });
    const requestedKeys = Array.isArray(req.body?.keys) ? req.body.keys.slice(0, 100) : [];
    const context = { tenantId: req.tenant._id, anonymousId, country: req.body?.country || req.tenant.settings?.merchantCountryCode || '', role: 'customer', planFeatures: req.plan?.features || {}, correlationId: req.correlationId };
    const evaluations = await evaluateFlags(requestedKeys, context, { clientVisibleOnly: true });
    if (req.body?.recordExposure === true) await recordExposures(evaluations, context);
    res.set('Cache-Control', 'private, no-store'); res.json({ flags: evaluations });
  } catch (error) { next(error); }
});

module.exports = router;
