'use strict';
const express = require('express');
const Tenant = require('../models/Tenant');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const { Notification } = require('../models/index');
const { adminAuth } = require('../middleware/auth');
const { subscriptionView } = require('../services/subscriptionBillingService');

const router = express.Router();
router.use(adminAuth);

async function currentTenant(req) {
  if (!req.user.tenantId) return null;
  return Tenant.findById(req.user.tenantId).populate('plan');
}
router.get('/status', async (req, res, next) => {
  try {
    const tenant = await currentTenant(req);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const [payments, invoices] = await Promise.all([
      SubscriptionPayment.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(20),
      SubscriptionInvoice.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(20),
    ]);
    res.json({ ...subscriptionView(tenant), payments, invoices });
  } catch (err) { next(err); }
});
router.post('/payment-proof', async (req, res, next) => {
  try {
    const tenant = await currentTenant(req);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const proofUrl = String(req.body.proofUrl || '').trim();
    if (!proofUrl) return res.status(400).json({ message: 'Payment proof URL is required' });
    const payment = await SubscriptionPayment.create({
      tenantId: tenant._id,
      planId: tenant.plan?._id || tenant.plan,
      amount: Number(req.body.amount || tenant.subscription?.amount || tenant.plan?.price || 0),
      currency: tenant.subscription?.currency || tenant.plan?.currency || 'LKR',
      billingCycle: tenant.subscription?.billingCycle || tenant.plan?.billingCycle || 'monthly',
      proofUrl,
      note: req.body.note || '',
      submittedBy: req.user._id,
    });
    await Notification.create({ type:'payment_slip', title:'Subscription payment proof uploaded', message:`${tenant.storeName} uploaded payment proof.`, link:'/superadmin', data:{ tenantId: tenant._id, paymentId: payment._id } }).catch(()=>{});
    res.status(201).json(payment);
  } catch (err) { next(err); }
});
module.exports = router;
