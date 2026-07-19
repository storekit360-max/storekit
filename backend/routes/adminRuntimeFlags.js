'use strict';

const express = require('express');
const Tenant = require('../models/Tenant');
const { auth } = require('../middleware/auth');
const { evaluateFlags, recordExposures } = require('../services/runtimeFeatureFlagService');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user?.role)) return res.status(403).json({ message: 'Admin access required' });
    const tenantId = req.user.tenantId || req.tenantId; if (!tenantId) return res.status(400).json({ message: 'Tenant is not associated with this account' });
    const tenant = req.tenant?._id && String(req.tenant._id) === String(tenantId) ? req.tenant : await Tenant.findById(tenantId).populate('plan');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const context = { tenantId: tenant._id, userId: req.user._id, country: tenant.settings?.merchantCountryCode || '', role: req.user.role, planFeatures: tenant.plan?.features || {}, correlationId: req.correlationId };
    const evaluations = await evaluateFlags([], context, { clientVisibleOnly: true });
    if (req.query.recordExposure === 'true') await recordExposures(evaluations, context);
    res.set('Cache-Control', 'private, no-store'); res.json({ flags: evaluations });
  } catch (error) { next(error); }
});

module.exports = router;
