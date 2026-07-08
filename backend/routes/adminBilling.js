'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Tenant = require('../models/Tenant');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { Notification } = require('../models/index');
const { auth } = require('../middleware/auth');
const { ensureOpenInvoice } = require('../services/subscriptionBillingService');

const router = express.Router();
router.use(auth);

function requireTenantAdmin(req, res, next) {
  if (!['admin', 'superadmin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}
router.use(requireTenantAdmin);

async function tenantFor(req) {
  const id = req.user?.tenantId || req.tenantId;
  if (!id) return null;
  return Tenant.findById(id).populate('plan').populate('owner', 'email firstName lastName');
}

const proofDir = path.join(__dirname, '../uploads/subscription-proofs');
fs.mkdirSync(proofDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, proofDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safe = `${req.user?._id || 'admin'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safe);
  },
});

const uploadProof = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPG, PNG, WebP, GIF or PDF files are allowed'), ok);
  },
});

function uploadMiddleware(req, res, next) {
  uploadProof.single('proof')(req, res, err => {
    if (err) return res.status(400).json({ message: `File upload error: ${err.message}` });
    next();
  });
}

router.get('/status', async (req, res, next) => {
  try {
    const tenant = await tenantFor(req);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const invoices = await SubscriptionInvoice.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(30);
    const payments = await SubscriptionPayment.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(30);
    const openInvoice = await ensureOpenInvoice(tenant);

    const subscription = tenant.subscription || {};
    const now = Date.now();
    const daysUntilTrialEnd = subscription.trialEndsAt ? Math.ceil((new Date(subscription.trialEndsAt).getTime() - now) / 86400000) : null;
    const daysUntilNextBilling = subscription.nextBillingAt ? Math.ceil((new Date(subscription.nextBillingAt).getTime() - now) / 86400000) : null;
    const daysUntilGraceEnd = subscription.graceEndsAt ? Math.ceil((new Date(subscription.graceEndsAt).getTime() - now) / 86400000) : null;

    res.json({
      tenant,
      plan: tenant.plan,
      subscription,
      planDates: {
        trialStartedAt: subscription.trialStartedAt,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        nextBillingAt: subscription.nextBillingAt,
        graceEndsAt: subscription.graceEndsAt,
        suspendedAt: subscription.suspendedAt,
        lastPaidAt: subscription.lastPaidAt,
        daysUntilTrialEnd,
        daysUntilNextBilling,
        daysUntilGraceEnd,
      },
      openInvoice,
      invoices,
      payments,
    });
  } catch (e) { next(e); }
});

router.post('/proof-upload', uploadMiddleware, async (req, res, next) => {
  try {
    const tenant = await tenantFor(req);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const rel = `/uploads/subscription-proofs/${req.file.filename}`;
    const base = `${req.protocol}://${req.get('host')}`;
    res.status(201).json({ url: `${base}${rel}`, path: rel, filename: req.file.filename });
  } catch (e) { next(e); }
});

router.post('/payments', async (req, res, next) => {
  try {
    const tenant = await tenantFor(req);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const invoice = req.body.invoiceId
      ? await SubscriptionInvoice.findOne({ _id: req.body.invoiceId, tenantId: tenant._id })
      : await ensureOpenInvoice(tenant);

    const amount = Number(req.body.amount || invoice?.total || 0);
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Valid payment amount is required' });

    const payment = await SubscriptionPayment.create({
      tenantId: tenant._id,
      invoiceId: invoice?._id,
      amount,
      currency: req.body.currency || invoice?.currency || tenant.plan?.currency || 'LKR',
      method: req.body.method || 'manual_bank',
      reference: req.body.reference || '',
      proofUrl: req.body.proofUrl || '',
      submittedBy: req.user._id,
      status: 'pending',
      note: req.body.note || '',
    });

    if (invoice) {
      invoice.status = 'pending_review';
      invoice.paymentProofUrl = payment.proofUrl;
      invoice.notes = req.body.note || invoice.notes;
      await invoice.save();
    }

    await Notification.create({
      tenantId: tenant._id,
      type: 'payment_slip',
      title: 'Subscription payment submitted',
      message: `${tenant.storeName} submitted ${payment.currency} ${payment.amount.toLocaleString()} for review`,
      link: '/superadmin',
      data: { paymentId: payment._id, invoiceId: invoice?._id, subscriptionPayment: true },
    }).catch(() => {});

    res.status(201).json(payment);
  } catch (e) { next(e); }
});

module.exports = router;
