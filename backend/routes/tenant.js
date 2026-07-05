'use strict';

const express = require('express');
const { resolveTenant } = require('../middleware/tenant');
const { auth } = require('../middleware/auth');
const Tenant = require('../models/Tenant');

const router = express.Router();

router.get('/current', resolveTenant, (req, res) => {
  res.json({ tenant: req.tenant, plan: req.plan });
});

// GET /tenant/my — returns the logged-in admin's own tenant + plan, resolved
// from their JWT (req.user.tenantId) rather than the request's Host header.
// The admin panel isn't always served from the tenant's own domain (e.g. it
// runs on a shared app domain locally or on Vercel), so domain-based lookup
// (/current above) can resolve the wrong tenant or none at all. This is what
// the admin UI uses to know which plan features are enabled.
router.get('/my', auth, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!req.user.tenantId) return res.json({ tenant: null, plan: null });

    const tenant = await Tenant.findById(req.user.tenantId).populate('plan');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    res.json({ tenant, plan: tenant.plan });
  } catch (err) { next(err); }
});

router.put('/settings', resolveTenant, auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (req.user.role === 'admin' && String(req.user.tenantId || '') !== String(req.tenantId)) {
      return res.status(403).json({ message: 'Tenant access denied' });
    }
    const tenant = await Tenant.findByIdAndUpdate(req.tenantId, {
      $set: {
        settings: req.body.settings || req.tenant.settings,
        theme: req.body.theme || req.tenant.theme,
      },
    }, { new: true }).populate('plan');
    res.json(tenant);
  } catch (err) { next(err); }
});

module.exports = router;