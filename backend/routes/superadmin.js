'use strict';

const express = require('express');
const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const TenantPayment = require('../models/TenantPayment');
const { auth } = require('../middleware/auth');
const { normalizeDomain } = require('../middleware/tenant');
const subscriptionService = require('../services/subscriptionService');

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
    const [tenants, activeTenants, plans, admins] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ status: 'active' }),
      Plan.countDocuments(),
      User.countDocuments({ role: 'admin' }),
    ]);
    res.json({ tenants, activeTenants, plans, admins });
  } catch (err) { next(err); }
});

router.get('/monitoring', async (_req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [tenants, productAgg, orderAgg, monthlyOrderAgg, adminAgg, paymentAgg, pendingPayments] = await Promise.all([
      Tenant.find({})
        .populate('plan', 'name price currency billingCycle trialDays graceDays limits features')
        .populate('owner', 'firstName lastName email username role isActive lastLogin')
        .sort({ createdAt: -1 })
        .lean(),
      Product.aggregate([
        {
          $project: {
            tenantId: 1,
            isActive: 1,
            stock: 1,
            imageCount: {
              $add: [
                { $size: { $ifNull: ['$images', []] } },
                { $cond: [{ $ifNull: ['$thumbnail', false] }, 1, 0] },
              ],
            },
          },
        },
        { $group: { _id: '$tenantId', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } }, stock: { $sum: '$stock' }, imageCount: { $sum: '$imageCount' } } },
      ]),
      Order.aggregate([
        { $group: { _id: '$tenantId', total: { $sum: 1 }, revenue: { $sum: '$total' }, pending: { $sum: { $cond: [{ $eq: ['$orderStatus', 'pending'] }, 1, 0] } } } },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: monthStart } } },
        { $group: { _id: '$tenantId', total: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
      User.aggregate([
        { $match: { role: 'admin' } },
        { $group: { _id: '$tenantId', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
      ]),
      TenantPayment.aggregate([
        { $group: { _id: { tenant: '$tenant', status: '$status' }, count: { $sum: 1 }, total: { $sum: '$amount' } } },
      ]),
      TenantPayment.find({ status: 'pending' }).populate('tenant', 'storeName slug').sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    const byTenant = (rows) => rows.reduce((acc, row) => {
      if (row._id) acc[String(row._id)] = row;
      return acc;
    }, {});
    const productByTenant = byTenant(productAgg);
    const orderByTenant = byTenant(orderAgg);
    const monthlyOrderByTenant = byTenant(monthlyOrderAgg);
    const adminByTenant = byTenant(adminAgg);

    const paymentsByTenant = {};
    paymentAgg.forEach(row => {
      const tenantId = String(row._id?.tenant || '');
      if (!tenantId) return;
      if (!paymentsByTenant[tenantId]) paymentsByTenant[tenantId] = {};
      paymentsByTenant[tenantId][row._id.status] = { count: row.count, total: row.total };
    });

    const tenantRows = tenants.map(tenant => {
      const id = String(tenant._id);
      const limits = tenant.plan?.limits || {};
      const products = productByTenant[id] || {};
      const orders = orderByTenant[id] || {};
      const monthlyOrders = monthlyOrderByTenant[id] || {};
      const admins = adminByTenant[id] || {};
      const paymentSummary = paymentsByTenant[id] || {};
      const nextPayment = tenant.billing?.nextPaymentDate ? new Date(tenant.billing.nextPaymentDate) : null;
      const trialEnds = tenant.billing?.trialEndsAt ? new Date(tenant.billing.trialEndsAt) : null;
      const periodEnd = tenant.billing?.currentPeriodEnd ? new Date(tenant.billing.currentPeriodEnd) : null;
      const dueDate = nextPayment || trialEnds || periodEnd;

      return {
        _id: tenant._id,
        storeName: tenant.storeName,
        slug: tenant.slug,
        status: tenant.status,
        createdAt: tenant.createdAt,
        owner: tenant.owner || null,
        plan: tenant.plan || null,
        domains: tenant.domains || [],
        billing: tenant.billing || {},
        usage: {
          products: Number(products.total || 0),
          activeProducts: Number(products.active || 0),
          productLimit: Number(limits.products || 0),
          ordersTotal: Number(orders.total || 0),
          ordersThisMonth: Number(monthlyOrders.total || 0),
          ordersPerMonthLimit: Number(limits.ordersPerMonth || 0),
          revenueTotal: Number(orders.revenue || 0),
          revenueThisMonth: Number(monthlyOrders.revenue || 0),
          pendingOrders: Number(orders.pending || 0),
          admins: Number(admins.total || 0),
          activeAdmins: Number(admins.active || 0),
          adminLimit: Number(limits.admins || 0),
          storageMb: Number(((Number(products.imageCount || 0) * 0.25) + (Number(products.total || 0) * 0.02)).toFixed(1)),
          storageLimitMb: Number(limits.storageMb || 0),
          imageAssets: Number(products.imageCount || 0),
        },
        payments: {
          pending: paymentSummary.pending || { count: 0, total: 0 },
          approved: paymentSummary.approved || { count: 0, total: 0 },
          rejected: paymentSummary.rejected || { count: 0, total: 0 },
        },
        alerts: {
          hasNoDomain: !(tenant.domains || []).some(d => d.active && d.domain),
          domainPending: (tenant.domains || []).some(d => d.active && !d.verified),
          paymentDueSoon: !!(dueDate && dueDate <= inSevenDays && Number(tenant.billing?.nextPaymentAmount || tenant.plan?.price || 0) > 0),
          pastDue: ['past_due', 'grace'].includes(tenant.billing?.subscriptionStatus),
          suspended: tenant.status === 'suspended',
        },
      };
    });

    const totals = tenantRows.reduce((acc, tenant) => {
      acc.tenants += 1;
      acc.active += tenant.status === 'active' ? 1 : 0;
      acc.suspended += tenant.status === 'suspended' ? 1 : 0;
      acc.trial += tenant.billing?.subscriptionStatus === 'trial' ? 1 : 0;
      acc.pastDue += ['past_due', 'grace'].includes(tenant.billing?.subscriptionStatus) ? 1 : 0;
      acc.monthlyRevenue += tenant.plan?.billingCycle === 'monthly' && tenant.status === 'active' ? Number(tenant.billing?.nextPaymentAmount || tenant.plan?.price || 0) : 0;
      acc.yearlyRevenue += tenant.plan?.billingCycle === 'yearly' && tenant.status === 'active' ? Number(tenant.billing?.nextPaymentAmount || tenant.plan?.price || 0) : 0;
      acc.storeRevenue += tenant.usage.revenueTotal;
      acc.storeRevenueThisMonth += tenant.usage.revenueThisMonth;
      acc.pendingPaymentAmount += tenant.payments.pending.total || 0;
      acc.pendingPaymentCount += tenant.payments.pending.count || 0;
      acc.products += tenant.usage.products;
      acc.ordersThisMonth += tenant.usage.ordersThisMonth;
      acc.admins += tenant.usage.admins;
      return acc;
    }, {
      tenants: 0, active: 0, suspended: 0, trial: 0, pastDue: 0,
      monthlyRevenue: 0, yearlyRevenue: 0, storeRevenue: 0, storeRevenueThisMonth: 0,
      pendingPaymentAmount: 0, pendingPaymentCount: 0, products: 0, ordersThisMonth: 0, admins: 0,
    });

    res.json({
      generatedAt: now,
      totals,
      tenants: tenantRows,
      pendingPayments,
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
    const primaryDomain = domain ? normalizeDomain(domain) : '';
    if (primaryDomain) domains.push({ domain: primaryDomain, type: 'primary', verified: false, active: true });
    const tenantSettings = {
      ...(settings || {}),
      ...(primaryDomain && !(settings || {}).siteUrl ? { siteUrl: `https://${primaryDomain}` } : {}),
      metaTitle: (settings || {}).metaTitle || storeName,
      metaDescription: (settings || {}).metaDescription || `Shop online at ${storeName}.`,
    };

    const tenant = await Tenant.create({ storeName, slug: cleanSlug, plan, domains, settings: tenantSettings, theme: theme || {} });

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

    // Billing automation kicks in right here: the tenant now starts its
    // trial (or goes straight to 'active' for free/no-trial plans) with no
    // further manual configuration needed.
    const planDoc = await Plan.findById(plan);
    if (planDoc) await subscriptionService.startSubscription(tenant, planDoc);

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

    const existing = await Tenant.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Tenant not found' });

    // Detect plan/status transitions BEFORE saving so we know what changed.
    const planChanged = patch.plan && String(patch.plan) !== String(existing.plan);
    const statusChanged = patch.status && patch.status !== existing.status;

    let tenant = await Tenant.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true }).populate('plan').populate('owner', 'firstName lastName email username role');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    // Re-assigning a plan re-prices (or restarts) the tenant's billing cycle
    // automatically — no separate "configure billing" step needed.
    if (planChanged) {
      await subscriptionService.handlePlanChange(tenant._id, tenant.plan);
    }

    // The existing Status dropdown IS the manual activate/deactivate control:
    //  - switching to 'suspended' = admin decided to stop the business
    //  - switching to 'active'    = super admin manually reactivates the store
    if (statusChanged) {
      if (patch.status === 'suspended') {
        await subscriptionService.deactivateTenant(tenant._id, 'Deactivated by super admin', 'superadmin');
      } else if (patch.status === 'active') {
        await subscriptionService.reactivateTenant(tenant._id);
      }
    }

    if (planChanged || statusChanged) {
      tenant = await Tenant.findById(tenant._id).populate('plan').populate('owner', 'firstName lastName email username role');
    }

    res.json(tenant);
  } catch (err) { next(err); }
});

// ── Billing dashboard — income, pending payments, upcoming payments ───────
router.get('/billing/overview', async (_req, res, next) => {
  try { res.json(await subscriptionService.getOverview()); }
  catch (err) { next(err); }
});

// ── Billing — list submitted tenant payments (optionally filter by status) ─
router.get('/billing/payments', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const payments = await TenantPayment.find(filter)
      .populate('tenant', 'storeName slug status billing')
      .populate('plan', 'name price currency billingCycle')
      .populate('reviewedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) { next(err); }
});

// ── Billing — approve a payment: this is the one manual step that reactivates
//    / renews the plan after the admin has actually paid ──────────────────
router.post('/billing/payments/:id/approve', async (req, res, next) => {
  try {
    const payment = await subscriptionService.approvePayment(req.params.id, req.user._id);
    res.json(payment);
  } catch (err) {
    if (err.message === 'Payment not found') return res.status(404).json({ message: err.message });
    if (err.message === 'Payment already reviewed') return res.status(400).json({ message: err.message });
    next(err);
  }
});

router.post('/billing/payments/:id/reject', async (req, res, next) => {
  try {
    const payment = await subscriptionService.rejectPayment(req.params.id, req.user._id, req.body.reason);
    res.json(payment);
  } catch (err) {
    if (err.message === 'Payment not found') return res.status(404).json({ message: err.message });
    if (err.message === 'Payment already reviewed') return res.status(400).json({ message: err.message });
    next(err);
  }
});

// ── Manual "stop the business" / manual reactivate, as explicit endpoints
//    too (in addition to the status dropdown above), for a dedicated Billing
//    tab UI that doesn't want to touch the general tenant-edit form ────────
router.post('/tenants/:id/deactivate', async (req, res, next) => {
  try {
    const tenant = await subscriptionService.deactivateTenant(req.params.id, req.body.reason, 'superadmin');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    res.json(await Tenant.findById(tenant._id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) { next(err); }
});

router.post('/tenants/:id/reactivate', async (req, res, next) => {
  try {
    const tenant = await subscriptionService.reactivateTenant(req.params.id);
    res.json(await Tenant.findById(tenant._id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) {
    if (err.message === 'Tenant not found') return res.status(404).json({ message: err.message });
    next(err);
  }
});

router.post('/tenants/:id/domains', async (req, res, next) => {
  try {
    const domain = normalizeDomain(req.body.domain);
    if (!domain) return res.status(400).json({ message: 'Domain is required' });
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!tenant.domains.some(d => d.domain === domain)) {
      tenant.domains.push({ domain, type: req.body.type || 'alias', verified: !!req.body.verified, active: true });
      if (!tenant.settings?.siteUrl) tenant.settings = { ...(tenant.settings?.toObject ? tenant.settings.toObject() : tenant.settings || {}), siteUrl: `https://${domain}` };
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

module.exports = router;
