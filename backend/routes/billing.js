'use strict';

const express = require('express');
const { auth } = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const TenantPayment = require('../models/TenantPayment');
const subscriptionService = require('../services/subscriptionService');

const router = express.Router();

// This route is for the STORE ADMIN to view/manage their own tenant's
// subscription — not to be confused with routes/payments.js, which handles
// customer checkout payments on the storefront.
function tenantScoped(req, res, next) {
  if (!['admin', 'superadmin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  if (!req.user.tenantId) {
    return res.status(400).json({ message: 'No tenant is associated with this account' });
  }
  next();
}

router.use(auth, tenantScoped);

// GET /api/billing/status — current plan, subscription state, next payment info
router.get('/status', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.user.tenantId).populate('plan');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    res.json({ tenant, plan: tenant.plan, billing: tenant.billing });
  } catch (err) { next(err); }
});

// GET /api/billing/payments — this tenant's own payment history
router.get('/payments', async (req, res, next) => {
  try {
    const payments = await TenantPayment.find({ tenant: req.user.tenantId }).sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) { next(err); }
});

// POST /api/billing/payments — submit proof of payment for super admin review
router.post('/payments', async (req, res, next) => {
  try {
    const { method, reference, note, amount } = req.body;
    if (!reference || !String(reference).trim()) {
      return res.status(400).json({ message: 'A payment reference / slip number is required' });
    }
    const payment = await subscriptionService.submitPayment(req.user.tenantId, { method, reference, note, amount });
    res.status(201).json(payment);
  } catch (err) { next(err); }
});

module.exports = router;