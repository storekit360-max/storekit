'use strict';
const express = require('express');
const Tenant = require('../models/Tenant');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const { auth } = require('../middleware/auth');
const { renewTenant, subscriptionView } = require('../services/subscriptionBillingService');

const router = express.Router();
function superAdminOnly(req, res, next) { if (req.user?.role !== 'superadmin') return res.status(403).json({ message:'Super admin access required' }); next(); }
router.use(auth, superAdminOnly);

router.get('/summary', async (_req, res, next) => {
  try {
    const tenants = await Tenant.find({}).populate('plan').sort({ createdAt:-1 });
    const payments = await SubscriptionPayment.find({}).populate('tenantId','storeName domains').populate('planId','name').sort({ createdAt:-1 }).limit(100);
    const invoices = await SubscriptionInvoice.find({}).populate('tenantId','storeName').sort({ createdAt:-1 }).limit(100);
    const rows = tenants.map(subscriptionView);
    const mrr = rows.reduce((sum, r) => sum + (r.billingCycle === 'monthly' && ['active','trial','grace'].includes(r.subscription?.status) ? Number(r.amount||0) : 0), 0);
    const arr = rows.reduce((sum, r) => sum + (r.billingCycle === 'yearly' && ['active','trial','grace'].includes(r.subscription?.status) ? Number(r.amount||0) : 0), 0);
    res.json({ rows, payments, invoices, metrics:{ mrr, arr, active: rows.filter(r=>r.subscription?.status==='active').length, trials: rows.filter(r=>r.subscription?.status==='trial').length, grace: rows.filter(r=>r.subscription?.status==='grace').length, suspended: rows.filter(r=>r.status==='suspended' || r.subscription?.status==='suspended').length, pendingPayments: payments.filter(p=>p.status==='pending').length } });
  } catch (err) { next(err); }
});
router.post('/payments/:id/approve', async (req, res, next) => {
  try {
    const payment = await SubscriptionPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message:'Payment not found' });
    payment.status='approved'; payment.reviewedBy=req.user._id; payment.reviewedAt=new Date(); payment.adminNote=req.body.note || '';
    await payment.save();
    const tenant = await renewTenant(payment.tenantId, req.user._id);
    res.json({ payment, tenant });
  } catch (err) { next(err); }
});
router.post('/payments/:id/reject', async (req, res, next) => {
  try {
    const payment = await SubscriptionPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message:'Payment not found' });
    payment.status='rejected'; payment.reviewedBy=req.user._id; payment.reviewedAt=new Date(); payment.adminNote=req.body.note || '';
    await payment.save();
    res.json(payment);
  } catch (err) { next(err); }
});
router.put('/tenants/:id/subscription', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id).populate('plan');
    if (!tenant) return res.status(404).json({ message:'Tenant not found' });
    tenant.subscription = { ...(tenant.subscription || {}), ...(req.body.subscription || req.body || {}) };
    if (req.body.status) tenant.status = req.body.status;
    await tenant.save();
    res.json(await Tenant.findById(tenant._id).populate('plan'));
  } catch (err) { next(err); }
});
module.exports = router;
