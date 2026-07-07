'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { ensureTenantSubscription, recordPayment } = require('../services/subscriptionBillingService');

const router = express.Router();
router.use(adminAuth);

function tenantIdOf(req) {
  return req.tenantId || req.user?.tenantId || req.user?.tenant;
}

router.get('/status', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant context missing' });
    const tenant = await Tenant.findById(tenantId).populate('plan').populate('subscription.lastInvoice');
    if (!tenant) return res.status(404).json({ message: 'Store not found' });
    await ensureTenantSubscription(tenant);
    const [invoices, payments] = await Promise.all([
      SubscriptionInvoice.find({ tenant: tenant._id }).populate('plan', 'name').sort({ createdAt: -1 }).limit(20),
      SubscriptionPayment.find({ tenant: tenant._id }).populate('invoice', 'invoiceNumber status total').sort({ createdAt: -1 }).limit(20),
    ]);
    res.json({ tenant, plan: tenant.plan, subscription: tenant.subscription, invoices, payments });
  } catch (err) { next(err); }
});

router.post('/payment-request', async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant context missing' });
    const invoice = req.body.invoiceId ? await SubscriptionInvoice.findOne({ _id: req.body.invoiceId, tenant: tenantId }) : null;
    const payment = await recordPayment({
      tenantId,
      invoiceId: invoice?._id || null,
      amount: req.body.amount ?? invoice?.total ?? 0,
      currency: req.body.currency || invoice?.currency || 'LKR',
      method: req.body.method || 'manual_request',
      status: 'pending',
      transactionId: req.body.transactionId || '',
      notes: req.body.notes || 'Store admin submitted payment request',
      recordedBy: req.user?._id || null,
    });
    res.status(201).json({ message: 'Payment request submitted. Super Admin will verify it.', payment });
  } catch (err) { next(err); }
});

module.exports = router;
