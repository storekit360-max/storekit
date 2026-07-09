'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const { adminAuth } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '..', 'uploads', 'payment-proofs');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = String(file.originalname || 'proof').replace(/[^a-zA-Z0-9._-]/g, '-');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function daysUntil(date) {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function publicBase(req) {
  return `${req.protocol}://${req.get('host')}`;
}

async function loadTenant(req) {
  if (req.tenant?._id) {
    return Tenant.findById(req.tenant._id).populate('plan').lean();
  }
  const adminTenantId = req.user?.tenantId || req.user?.tenant;
  if (adminTenantId) return Tenant.findById(adminTenantId).populate('plan').lean();
  return null;
}

function buildStatus(tenant) {
  const plan = tenant?.plan || null;
  const sub = tenant?.subscription || {};
  const nextBillingAt = sub.nextBillingAt || sub.currentPeriodEnd || null;
  const trialEndsAt = sub.trialEndsAt || null;
  const graceEndsAt = sub.graceEndsAt || null;
  const status = sub.status || tenant?.subscriptionStatus || 'active';
  const billingCycle = sub.billingCycle || plan?.billingCycle || 'monthly';
  const currency = sub.currency || plan?.currency || tenant?.settings?.currency || 'LKR';
  const amount = sub.amount || (billingCycle === 'yearly' ? plan?.billing?.yearlyPrice : plan?.billing?.monthlyPrice) || plan?.price || 0;

  let daysLeft = daysUntil(nextBillingAt);
  if (status === 'trial') daysLeft = daysUntil(trialEndsAt);
  if (status === 'grace' || status === 'past_due') daysLeft = daysUntil(graceEndsAt);

  return {
    tenantId: String(tenant?._id || ''),
    storeName: tenant?.storeName || '',
    status: tenant?.status || 'active',
    subscriptionStatus: status,
    billingCycle,
    currency,
    amount,
    plan: plan ? {
      _id: String(plan._id),
      name: plan.name,
      currency: plan.currency,
      billingCycle: plan.billingCycle,
      price: plan.price,
      billing: plan.billing || {},
      limits: plan.limits || {},
      features: plan.features || {},
    } : null,
    nextBillingAt,
    trialEndsAt,
    graceEndsAt,
    currentPeriodStart: sub.currentPeriodStart || null,
    currentPeriodEnd: sub.currentPeriodEnd || null,
    daysLeft,
    canUploadProof: ['trial', 'active', 'past_due', 'grace'].includes(status),
  };
}

router.get(['/', '/status', '/summary'], adminAuth, async (req, res, next) => {
  try {
    const tenant = await loadTenant(req);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found for admin billing' });
    const payments = await mongoose.connection.db.collection('subscriptionpayments').find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(20).toArray().catch(() => []);
    return res.json({ ...buildStatus(tenant), payments });
  } catch (err) { next(err); }
});

router.post(['/payment-proof', '/payments', '/submit-payment'], adminAuth, upload.single('proof'), async (req, res, next) => {
  try {
    const tenant = await loadTenant(req);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found for admin billing' });
    const amount = Number(req.body.amount || buildStatus(tenant).amount || 0);
    const currency = req.body.currency || buildStatus(tenant).currency || 'LKR';
    const proofUrl = req.file ? `${publicBase(req)}/uploads/payment-proofs/${req.file.filename}` : (req.body.proofUrl || '');
    if (!proofUrl) return res.status(400).json({ message: 'Payment proof file or URL is required' });

    const doc = {
      tenantId: tenant._id,
      amount,
      currency,
      proofUrl,
      note: req.body.note || '',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await mongoose.connection.db.collection('subscriptionpayments').insertOne(doc);
    return res.status(201).json({ message: 'Payment proof submitted for review', payment: doc });
  } catch (err) { next(err); }
});

module.exports = router;
