'use strict';

const express = require('express');
const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { normalizeDomain } = require('../middleware/tenant');
const { initializeTenantSubscription } = require('../services/subscriptionBillingService');

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
    if (domain) domains.push({ domain: normalizeDomain(domain), type: 'primary', verified: false, active: true });

    const planDoc = await Plan.findById(plan);
    if (!planDoc) return res.status(400).json({ message: 'Selected plan not found' });

    const tenant = await Tenant.create({ storeName, slug: cleanSlug, plan, domains, settings: settings || {}, theme: theme || {} });
    await initializeTenantSubscription(tenant, planDoc);

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

    res.status(201).json(await Tenant.findById(tenant._id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) { next(err); }
});

router.put('/tenants/:id', async (req, res, next) => {
  try {
    const allowed = ['storeName', 'plan', 'status', 'settings', 'theme', 'domains', 'subscription'];
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
    res.json(tenant);
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

module.exports = router;