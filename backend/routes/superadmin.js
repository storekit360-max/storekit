'use strict';

const express = require('express');
const crypto = require('crypto');
const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const TenantPayment = require('../models/TenantPayment');
const { auth } = require('../middleware/auth');
const { normalizeDomain } = require('../middleware/tenant');
const subscriptionService = require('../services/subscriptionService');
const {
  deleteTenantData,
  expectedDeletionConfirmation,
  getTenantDataCounts,
  validateTenantDeletionConfirmation,
} = require('../services/tenantDeletionService');
const { bootstrapTenantStore } = require('../utils/tenantBootstrap');
const { normalizeWhatsappNumber } = require('../utils/whatsappConfig');
const { generateStarterKit, normalizeStarterKit, sanitizeBrief } = require('../services/tenantStarterKit');

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

router.post('/tenant-starter-kit/preview', async (req, res, next) => {
  try {
    const brief = sanitizeBrief(req.body || {});
    if (!brief.storeName || brief.storeName === 'New Store') {
      return res.status(400).json({ message: 'Store name is required before generating a starter kit' });
    }
    const result = await generateStarterKit(brief);
    res.json({ ...result, brief });
  } catch (err) { next(err); }
});

async function cleanupFailedTenantCreation(tenantId) {
  if (!tenantId) return;
  try {
    await deleteTenantData(tenantId);
    await Tenant.deleteOne({ _id: tenantId });
  } catch (error) {
    console.error('[TENANT_CREATE_CLEANUP_FAILED]', { tenantId: String(tenantId), error: error.message });
  }
}

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
    await subscriptionService.syncTenantsForPlanUpdate(plan);
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

router.get('/tenants/:id/deletion-preview', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id).select('storeName slug status deletion').lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (tenant.deletion?.state === 'deleting') {
      return res.status(409).json({ message: 'Tenant deletion is already in progress' });
    }
    const data = await getTenantDataCounts(tenant._id);
    res.json({
      tenant: { _id: tenant._id, storeName: tenant.storeName, slug: tenant.slug, status: tenant.status },
      ...data,
      confirmationText: expectedDeletionConfirmation(tenant.slug),
    });
  } catch (err) { next(err); }
});

router.delete('/tenants/:id', async (req, res, next) => {
  let claimedTenant = null;
  try {
    const tenant = await Tenant.findById(req.params.id).select('storeName slug status deletion');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    validateTenantDeletionConfirmation(tenant, req.body?.confirmationText);

    const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
    claimedTenant = await Tenant.findOneAndUpdate(
      {
        _id: tenant._id,
        $or: [
          { 'deletion.state': { $ne: 'deleting' } },
          { 'deletion.requestedAt': { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          status: 'suspended',
          'deletion.state': 'deleting',
          'deletion.requestedAt': new Date(),
          'deletion.requestedBy': req.user._id,
        },
      },
      { new: true, runValidators: true }
    );
    if (!claimedTenant) return res.status(409).json({ message: 'Tenant deletion is already in progress' });

    const result = await deleteTenantData(tenant._id);
    // A final sweep catches any request that was already in flight immediately
    // before the tenant was suspended and the deletion lock was acquired.
    const finalSweep = await deleteTenantData(tenant._id);
    const tenantResult = await Tenant.deleteOne({ _id: tenant._id, 'deletion.state': 'deleting' });
    if (tenantResult.deletedCount !== 1) throw new Error('Tenant record could not be finalized after data cleanup');

    const deleted = { ...result.deleted };
    for (const [key, value] of Object.entries(finalSweep.deleted)) deleted[key] = (deleted[key] || 0) + value;
    const total = Object.values(deleted).reduce((sum, value) => sum + Number(value || 0), 0);
    console.warn('[TENANT_DELETED]', {
      tenantId: String(tenant._id),
      deletedBy: String(req.user._id),
      records: total,
    });
    res.json({ message: `${tenant.storeName} was permanently deleted`, deleted, total });
  } catch (err) {
    if (claimedTenant?._id) {
      await Tenant.updateOne(
        { _id: claimedTenant._id, 'deletion.state': 'deleting' },
        {
          $set: {
            // If cleanup was interrupted after deleting any child records, do
            // not expose a partially deleted storefront. A verified retry can
            // safely finish the idempotent cleanup.
            status: 'suspended',
            'deletion.state': 'idle',
            'deletion.requestedAt': null,
            'deletion.requestedBy': null,
          },
        }
      ).catch(() => {});
    }
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    next(err);
  }
});

router.post('/tenants', async (req, res, next) => {
  let createdTenantId = null;
  try {
    const {
      storeName, slug, domain, plan, adminEmail, adminPassword, adminFirstName,
      adminLastName, settings, theme, onboarding = {}, starterKit: requestedStarterKit,
    } = req.body;
    if (![storeName, slug, plan, adminEmail, adminPassword].every(value => String(value || '').trim())) {
      return res.status(400).json({ message: 'storeName, slug, plan, adminEmail and adminPassword are required' });
    }

    const cleanSlug = String(slug).toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '');
    if (!cleanSlug || cleanSlug.length > 70) return res.status(400).json({ message: 'Enter a valid tenant slug (maximum 70 characters)' });
    const planDoc = await Plan.findById(plan);
    if (!planDoc) return res.status(400).json({ message: 'Selected plan does not exist' });

    const initializeStore = onboarding.initializeStore !== false;
    const brief = sanitizeBrief({
      ...onboarding,
      storeName,
      currency: settings?.currency || onboarding.currency || 'LKR',
    });
    let starterKitResult = { starterKit: null, warnings: [] };
    if (initializeStore) {
      starterKitResult = requestedStarterKit
        ? {
            starterKit: normalizeStarterKit(
              requestedStarterKit,
              brief,
              requestedStarterKit.source === 'ai' ? 'ai' : 'fallback'
            ),
            warnings: [],
          }
        : await generateStarterKit(brief);
    }
    const starterKit = starterKitResult.starterKit;
    const domains = [];
    const primaryDomain = domain ? normalizeDomain(domain) : '';
    if (primaryDomain) domains.push({ domain: primaryDomain, type: 'primary', verified: false, active: true });
    const starterLogoUrl = primaryDomain && !['localhost', '127.0.0.1'].includes(primaryDomain)
      ? `https://${primaryDomain}/api/settings/starter-logo.svg`
      : '/api/settings/starter-logo.svg';
    const requestedWhatsapp = String(settings?.whatsappNumber || settings?.whatsapp || '').trim();
    const normalizedWhatsapp = normalizeWhatsappNumber(requestedWhatsapp, settings?.country || 'Sri Lanka');
    if (requestedWhatsapp && !normalizedWhatsapp) {
      return res.status(400).json({ message: 'Enter a valid WhatsApp number including the country code' });
    }
    const configuredWhatsapp = normalizedWhatsapp ? `+${normalizedWhatsapp}` : '';
    const tenantSettings = {
      ...(starterKit?.settings || {}),
      ...(settings || {}),
      whatsapp: configuredWhatsapp,
      whatsappNumber: configuredWhatsapp,
      ...(primaryDomain && !(settings || {}).siteUrl ? { siteUrl: `https://${primaryDomain}` } : {}),
      heroStats: typeof settings?.heroStats === 'string'
        ? settings.heroStats
        : JSON.stringify(settings?.heroStats || starterKit?.settings?.heroStats || []),
      metaTitle: (settings || {}).metaTitle || starterKit?.settings?.metaTitle || storeName,
      metaDescription: (settings || {}).metaDescription || starterKit?.settings?.metaDescription || `Shop online at ${storeName}.`,
      logoUrl: settings?.logoUrl || (initializeStore ? starterLogoUrl : ''),
      faviconUrl: settings?.faviconUrl || (initializeStore ? starterLogoUrl : ''),
    };
    const tenantTheme = { ...(starterKit?.theme || {}), ...(theme || {}) };
    const onboardingData = {
      businessType: brief.businessType,
      businessDescription: brief.businessDescription,
      itemExamples: brief.itemExamples,
      targetCustomers: brief.targetCustomers,
      brandTone: brief.brandTone,
      starterKitSource: starterKit?.source || '',
      starterKitGeneratedAt: starterKit ? new Date() : null,
    };

    const tenant = await Tenant.create({
      storeName: brief.storeName,
      slug: cleanSlug,
      plan,
      domains,
      settings: tenantSettings,
      theme: tenantTheme,
      onboarding: onboardingData,
    });
    createdTenantId = tenant._id;

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

    let bootstrapResult = null;
    if (initializeStore) {
      const populatedForBootstrap = await Tenant.findById(tenant._id).populate('plan');
      bootstrapResult = await bootstrapTenantStore(populatedForBootstrap, { starterKit });
    }

    // Billing automation kicks in right here: the tenant now starts its
    // trial (or goes straight to 'active' for free/no-trial plans) with no
    // further manual configuration needed.
    if (planDoc) await subscriptionService.startSubscription(tenant, planDoc);

    const populated = await Tenant.findById(tenant._id).populate('plan').populate('owner', 'firstName lastName email username role');
    res.status(201).json({
      ...populated.toObject(),
      starterKitResult: initializeStore ? {
        source: starterKit?.source || 'fallback',
        summary: starterKit?.summary || '',
        warnings: [...(starterKitResult.warnings || []), ...(bootstrapResult?.warnings || [])],
        created: bootstrapResult,
      } : null,
    });
  } catch (err) {
    if (createdTenantId) await cleanupFailedTenantCreation(createdTenantId);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'tenant details';
      return res.status(409).json({ message: `A tenant already uses this ${field}` });
    }
    next(err);
  }
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
    if (existing.deletion?.state === 'deleting') {
      return res.status(409).json({ message: 'Tenant deletion is in progress' });
    }

    // Detect plan/status transitions BEFORE saving so we know what changed.
    const planChanged = patch.plan && String(patch.plan) !== String(existing.plan);
    const statusChanged = patch.status && patch.status !== existing.status;

    let tenant = await Tenant.findOneAndUpdate(
      { _id: req.params.id, 'deletion.state': { $ne: 'deleting' } },
      { $set: patch },
      { new: true, runValidators: true }
    ).populate('plan').populate('owner', 'firstName lastName email username role');
    if (!tenant) return res.status(409).json({ message: 'Tenant deletion is in progress' });

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
    const suppliedPassword = typeof req.body.password === 'string' ? req.body.password : '';
    if (suppliedPassword && suppliedPassword.length < 12) {
      return res.status(400).json({ message: 'Password must contain at least 12 characters' });
    }
    const password = suppliedPassword || `${crypto.randomBytes(12).toString('base64url')}!9a`;
    const admin = await User.findOne({ tenantId: tenant._id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Tenant admin not found' });
    admin.password = password;
    await admin.save();
    res.json({ message: 'Password reset', email: admin.email, password });
  } catch (err) { next(err); }
});

module.exports = router;
