'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const TenantPayment = require('../models/TenantPayment');
const subscriptionService = require('../services/subscriptionService');
const billingLifecycle = require('../services/billingLifecycleService');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads', 'tenant-payment-proofs');
fs.mkdirSync(uploadDir, { recursive: true });

const proofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = String(file.originalname || 'payment-proof').replace(/[^a-zA-Z0-9._-]/g, '-');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
  },
});

const uploadProof = multer({
  storage: proofStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/|application\/pdf$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Payment proof must be an image or PDF'));
  },
});

function publicBase(req) {
  return `${req.protocol}://${req.get('host')}`;
}

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
    let tenant = await Tenant.findById(req.user.tenantId).populate('plan');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (tenant.plan && !tenant.billing?.currentPeriodStart) {
      await subscriptionService.startSubscription(tenant, tenant.plan);
      tenant = await Tenant.findById(req.user.tenantId).populate('plan');
    }
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

router.post('/quote', async (req, res, next) => {
  try { res.json(await subscriptionService.quoteSubscription(req.user.tenantId, req.body?.couponCode)); }
  catch (err) { next(err); }
});

// POST /api/billing/payments — submit proof of payment for super admin review
router.post('/payments', uploadProof.single('proof'), async (req, res, next) => {
  try {
    const { method, reference, note, couponCode } = req.body;
    const quote = await subscriptionService.quoteSubscription(req.user.tenantId, couponCode);
    if (quote.total > 0 && (!reference || !String(reference).trim())) return res.status(400).json({ message: 'A payment reference / slip number is required' });
    if (!req.file && quote.total > 0) return res.status(400).json({ message: 'Please upload the payment slip/proof file' });
    const proofUrl = req.file ? `${publicBase(req)}/uploads/tenant-payment-proofs/${req.file.filename}` : '';
    const payment = await subscriptionService.submitPayment(req.user.tenantId, { method: quote.total === 0 ? 'coupon' : method, reference: quote.total === 0 ? `COUPON-${quote.couponCode}` : reference, proofUrl, note, couponCode });
    if (payment.amount === 0) {
      const result = await billingLifecycle.approveManualPayment(payment._id, req.user._id);
      return res.status(201).json({ ...result.payment.toObject(), autoApproved: true, invoiceId: result.invoice._id });
    }
    res.status(201).json(payment);
  } catch (err) { next(err); }
});

module.exports = router;
