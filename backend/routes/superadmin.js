'use strict';

const express = require('express');
const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { normalizeDomain } = require('../middleware/tenant');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const SubscriptionCoupon = require('../models/SubscriptionCoupon');
const {
  changeTenantPlan,
  ensureTenantSubscription,
  initializeTenantSubscription,
  issueInvoice,
  recordPayment,
  runBillingMaintenance,
} = require('../services/subscriptionBillingService');
const { bootstrapTenantStore } = require('../utils/tenantBootstrap');

const router = express.Router();

// Turns "Pro Plan" into "pro-plan", and "Pro Plan" (dup) into "pro-plan-2", etc.
async function generateUniqueSlug(name, excludeId) {
  const base = String(name || 'plan')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'plan';

  let slug = base;
  let counter = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Plan.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
}

function superAdminOnly(req, res, next) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  next();
}

router.use(auth, superAdminOnly);

router.get('/stats', async (_req, res, next) => {
  try {
    const [tenants, activeTenants, plans, admins, trialTenants, pastDueTenants, suspendedTenants, revenueAgg, openInvoices] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ status: 'active' }),
      Plan.countDocuments(),
      User.countDocuments({ role: 'admin' }),
      Tenant.countDocuments({ 'subscription.status': 'trialing' }),
      Tenant.countDocuments({ 'subscription.status': { $in: ['past_due', 'grace'] } }),
      Tenant.countDocuments({ status: { $in: ['expired', 'suspended'] } }),
      SubscriptionInvoice.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      SubscriptionInvoice.countDocuments({ status: { $in: ['issued', 'overdue'] } }),
    ]);
    res.json({
      tenants,
      activeTenants,
      plans,
      admins,
      trialTenants,
      pastDueTenants,
      suspendedTenants,
      subscriptionRevenue: Number(revenueAgg?.[0]?.total || 0),
      openInvoices,
    });
  } catch (err) { next(err); }
});

router.get('/plans', async (_req, res, next) => {
  try { res.json(await Plan.find().sort({ price: 1, name: 1 })); }
  catch (err) { next(err); }
});

router.post('/plans', async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (!body.name) return res.status(400).json({ message: 'Plan name is required' });
    // The Plan model requires a unique slug, but the create-plan form only
    // collects a name. Without this, Plan.create() throws a silent
    // "Path `slug` is required" validation error and the plan never saves.
    if (!body.slug) body.slug = await generateUniqueSlug(body.name);
    if (body.billing) {
      body.billing.monthlyPrice = Number(body.billing.monthlyPrice ?? body.price ?? 0);
      body.billing.yearlyPrice = Number(body.billing.yearlyPrice ?? (Number(body.billing.monthlyPrice || body.price || 0) * 12));
      body.billing.trialDays = Number(body.billing.trialDays || 0);
      body.billing.graceDays = Number(body.billing.graceDays ?? 3);
      body.billing.taxPercent = Number(body.billing.taxPercent || 0);
    }
    const plan = await Plan.create(body);
    res.status(201).json(plan);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A plan with that name/slug already exists' });
    next(err);
  }
});

router.put('/plans/:id', async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (body.name && !body.slug) body.slug = await generateUniqueSlug(body.name, req.params.id);
    const plan = await Plan.findByIdAndUpdate(req.params.id, { $set: body }, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json(plan);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A plan with that name/slug already exists' });
    next(err);
  }
});

router.delete('/plans/:id', async (req, res, next) => {
  try {
    const used = await Tenant.countDocuments({ plan: req.params.id });
    if (used) return res.status(400).json({ message: 'Cannot delete a plan assigned to tenants' });
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ message: 'Plan deleted' });
  } catch (err) { next(err); }
});

router.get('/tenants', async (_req, res, next) => {
  try {
    const tenants = await Tenant.find().populate('plan').populate('owner', 'firstName lastName email username role').sort({ createdAt: -1 });
    res.json(tenants);
  } catch (err) { next(err); }
});

router.post('/tenants', async (req, res, next) => {
  try {
    const { storeName, slug, domain, plan, adminEmail, adminPassword, adminFirstName, adminLastName, settings, theme } = req.body;
    if (!storeName || !slug || !plan || !adminEmail || !adminPassword) {
      return res.status(400).json({ message: 'storeName, slug, plan, adminEmail and adminPassword are required' });
    }

    const cleanSlug = String(slug).toLowerCase().trim();
    const domains = [];
    if (domain) domains.push({ domain: normalizeDomain(domain), type: 'primary', verified: false, active: true });

    const selectedPlan = await Plan.findById(plan);
    if (!selectedPlan) return res.status(400).json({ message: 'Selected plan was not found' });

    const tenant = await Tenant.create({ storeName, slug: cleanSlug, plan, domains, settings: settings || {}, theme: theme || {} });
    await initializeTenantSubscription(tenant, selectedPlan, {
      billingCycle: req.body.billingCycle || selectedPlan.billingCycle || 'monthly',
      couponCode: req.body.couponCode || '',
      autoRenew: req.body.autoRenew !== false,
    });

    const user = await User.create({
      firstName: adminFirstName || 'Store',
      lastName: adminLastName || 'Admin',
      username: `${cleanSlug}-admin`,
      email: adminEmail.toLowerCase().trim(),
      password: adminPassword,
      role: 'admin',
      tenantId: tenant._id,
      isActive: true,
    });

    tenant.owner = user._id;
    await tenant.save();

    // Instant-store SaaS requirement: a newly-created tenant must be usable
    // immediately without manual scripts. Seed safe starter categories, hero
    // banner, COD delivery/payment, core pages and public settings.
    await bootstrapTenantStore(tenant);

    res.status(201).json(await Tenant.findById(tenant._id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) { next(err); }
});

router.put('/tenants/:id', async (req, res, next) => {
  try {
    const allowed = ['storeName', 'plan', 'status', 'settings', 'theme', 'domains'];
    const patch = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
    if (patch.domains) {
      patch.domains = patch.domains.filter(Boolean).map(d => ({
        domain: normalizeDomain(d.domain || d),
        type: d.type || 'alias',
        verified: !!d.verified,
        active: d.active !== false,
      }));
    }
    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true }).populate('plan').populate('owner', 'firstName lastName email username role');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    await ensureTenantSubscription(tenant);
    res.json(await Tenant.findById(req.params.id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) { next(err); }
});

router.post('/tenants/:id/domains', async (req, res, next) => {
  try {
    const domain = normalizeDomain(req.body.domain);
    if (!domain) return res.status(400).json({ message: 'Domain is required' });
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!tenant.domains.some(d => d.domain === domain)) {
      tenant.domains.push({ domain, type: req.body.type || 'alias', verified: !!req.body.verified, active: true });
      await tenant.save();
    }
    res.json(await Tenant.findById(req.params.id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) { next(err); }
});

router.delete('/tenants/:id/domains/:domain', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const domain = normalizeDomain(req.params.domain);
    tenant.domains = tenant.domains.filter(d => d.domain !== domain);
    await tenant.save();
    res.json(await Tenant.findById(req.params.id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) { next(err); }
});

router.post('/tenants/:id/reset-admin-password', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const password = req.body.password || 'Admin@123456';
    const admin = await User.findOne({ tenantId: tenant._id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Tenant admin not found' });
    admin.password = password;
    await admin.save();
    res.json({ message: 'Password reset', email: admin.email, password });
  } catch (err) { next(err); }
});


// ── SaaS Billing / Subscription Control ──────────────────────────────────
router.get('/billing/summary', async (_req, res, next) => {
  try {
    const [invoices, payments, coupons, tenants] = await Promise.all([
      SubscriptionInvoice.find().populate('tenant', 'storeName slug domains').populate('plan', 'name').sort({ createdAt: -1 }).limit(50),
      SubscriptionPayment.find().populate('tenant', 'storeName slug').populate('invoice', 'invoiceNumber status total').sort({ createdAt: -1 }).limit(50),
      SubscriptionCoupon.find().sort({ createdAt: -1 }),
      Tenant.find().populate('plan').populate('owner', 'firstName lastName email username role').sort({ createdAt: -1 }),
    ]);
    res.json({ invoices, payments, coupons, tenants });
  } catch (err) { next(err); }
});

router.post('/billing/maintenance', async (_req, res, next) => {
  try {
    const results = await runBillingMaintenance();
    res.json({ message: 'Billing maintenance completed', results });
  } catch (err) { next(err); }
});

router.post('/tenants/:id/billing/change-plan', async (req, res, next) => {
  try {
    const result = await changeTenantPlan(req.params.id, {
      planId: req.body.planId,
      billingCycle: req.body.billingCycle,
      couponCode: req.body.couponCode,
      invoice: req.body.invoice !== false,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/tenants/:id/billing/invoice', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id).populate('plan');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    await ensureTenantSubscription(tenant);
    const invoice = await issueInvoice({
      tenant,
      plan: tenant.plan,
      billingCycle: req.body.billingCycle || tenant.subscription?.billingCycle,
      couponCode: req.body.couponCode || tenant.subscription?.couponCode || '',
      status: req.body.status || 'issued',
      dueDays: req.body.dueDays || 7,
      notes: req.body.notes || 'Issued by Super Admin',
    });
    tenant.subscription.lastInvoice = invoice._id;
    await tenant.save();
    res.status(201).json(invoice);
  } catch (err) { next(err); }
});

router.post('/tenants/:id/billing/payment', async (req, res, next) => {
  try {
    const payment = await recordPayment({
      tenantId: req.params.id,
      invoiceId: req.body.invoiceId || null,
      amount: req.body.amount,
      currency: req.body.currency,
      method: req.body.method || 'manual',
      status: req.body.status || 'succeeded',
      transactionId: req.body.transactionId || '',
      failureReason: req.body.failureReason || '',
      notes: req.body.notes || '',
      recordedBy: req.user?._id || null,
    });
    res.status(201).json(payment);
  } catch (err) { next(err); }
});

router.post('/tenants/:id/billing/suspend', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    tenant.status = 'suspended';
    tenant.subscription = tenant.subscription || {};
    tenant.subscription.status = 'past_due';
    tenant.subscription.suspendedReason = req.body.reason || 'Suspended by Super Admin';
    await tenant.save();
    res.json(await Tenant.findById(req.params.id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) { next(err); }
});

router.post('/tenants/:id/billing/reactivate', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id).populate('plan');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    tenant.status = 'active';
    tenant.subscription = tenant.subscription || {};
    tenant.subscription.status = 'active';
    tenant.subscription.autoRenew = req.body.autoRenew ?? tenant.subscription.autoRenew ?? true;
    tenant.subscription.lastPaymentStatus = tenant.subscription.lastPaymentStatus || 'none';
    tenant.subscription.failedPaymentCount = 0;
    tenant.subscription.graceUntil = null;
    tenant.subscription.suspendedReason = '';
    if (!tenant.subscription.currentPeriodStart || req.body.extend) {
      const now = new Date();
      tenant.subscription.currentPeriodStart = now;
      const months = tenant.subscription.billingCycle === 'yearly' ? 12 : 1;
      const end = new Date(now);
      end.setMonth(end.getMonth() + months);
      tenant.subscription.currentPeriodEnd = tenant.subscription.billingCycle === 'once' ? null : end;
    }
    await tenant.save();
    res.json(await Tenant.findById(req.params.id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) { next(err); }
});

router.get('/tenants/:id/billing/history', async (req, res, next) => {
  try {
    const [invoices, payments] = await Promise.all([
      SubscriptionInvoice.find({ tenant: req.params.id }).populate('plan', 'name').sort({ createdAt: -1 }),
      SubscriptionPayment.find({ tenant: req.params.id }).populate('invoice', 'invoiceNumber status total').sort({ createdAt: -1 }),
    ]);
    res.json({ invoices, payments });
  } catch (err) { next(err); }
});

router.post('/billing/coupons', async (req, res, next) => {
  try {
    const body = { ...req.body, code: String(req.body.code || '').toUpperCase().trim() };
    if (!body.code) return res.status(400).json({ message: 'Coupon code is required' });
    if (!body.value) return res.status(400).json({ message: 'Coupon value is required' });
    const coupon = await SubscriptionCoupon.create(body);
    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Subscription coupon already exists' });
    next(err);
  }
});

router.put('/billing/coupons/:id', async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (body.code) body.code = String(body.code).toUpperCase().trim();
    const coupon = await SubscriptionCoupon.findByIdAndUpdate(req.params.id, { $set: body }, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json(coupon);
  } catch (err) { next(err); }
});

router.delete('/billing/coupons/:id', async (req, res, next) => {
  try {
    await SubscriptionCoupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Subscription coupon deleted' });
  } catch (err) { next(err); }
});

module.exports = router;