'use strict';

const express = require('express');
const Plan    = require('../models/Plan');
const Tenant  = require('../models/Tenant');
const User    = require('../models/User');
const { auth } = require('../middleware/auth');
const { normalizeDomain } = require('../middleware/tenant');

const router = express.Router();

// ── Slug generation ────────────────────────────────────────────────────────────
async function generateUniqueSlug(name, excludeId) {
  const base = String(name || 'plan')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'plan';

  let slug = base;
  let counter = 2;
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

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC (no auth) — resolve-domain endpoint for Vercel edge middleware
// Called by frontend/middleware.js to resolve a domain → tenant siteUrl
// Protected by INTERNAL_SECRET header instead of JWT.
// ════════════════════════════════════════════════════════════════════════════
router.get('/resolve-domain', async (req, res) => {
  // Verify the internal secret — this endpoint is not for public consumption
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const rawDomain = normalizeDomain(req.query.domain || '');
  if (!rawDomain) return res.status(400).json({ message: 'domain query param required' });

  try {
    const tenant = await Tenant.findOne({
      status: 'active',
      domains: { $elemMatch: { domain: rawDomain, active: true } },
    }).populate('plan').lean();

    if (!tenant) {
      return res.json({ found: false, domain: rawDomain });
    }

    // Return the primary domain's https:// URL so the edge middleware can
    // use it as the SSR origin and inject X-Tenant-Domain correctly.
    const primaryDomain = tenant.domains.find(d => d.type === 'primary' && d.active)
      || tenant.domains.find(d => d.active);
    const siteUrl = primaryDomain
      ? `https://${primaryDomain.domain}`
      : (process.env.FRONTEND_URL || 'https://storekit.lk');

    return res.json({
      found:     true,
      domain:    rawDomain,
      tenantId:  tenant._id,
      storeName: tenant.storeName,
      slug:      tenant.slug,
      siteUrl,
      plan:      tenant.plan?.name || null,
      status:    tenant.status,
    });
  } catch (err) {
    console.error('[resolve-domain]', err.message);
    res.status(500).json({ message: 'Internal error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// All routes below require superadmin JWT
// ════════════════════════════════════════════════════════════════════════════
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
    const tenants = await Tenant.find()
      .populate('plan')
      .populate('owner', 'firstName lastName email username role')
      .sort({ createdAt: -1 });
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
    const domains   = [];

    if (domain) {
      const normalized = normalizeDomain(domain);
      // Check domain isn't already claimed by another tenant
      const existing = await Tenant.findOne({ 'domains.domain': normalized });
      if (existing) {
        return res.status(400).json({ message: `Domain ${normalized} is already assigned to tenant: ${existing.storeName}` });
      }
      domains.push({ domain: normalized, type: 'primary', verified: false, active: true });
    }

    const tenant = await Tenant.create({ storeName, slug: cleanSlug, plan, domains, settings: settings || {}, theme: theme || {} });

    const user = await User.create({
      firstName: adminFirstName || 'Store',
      lastName:  adminLastName  || 'Admin',
      username:  `${cleanSlug}-admin`,
      email:     adminEmail.toLowerCase().trim(),
      password:  adminPassword,
      role:      'admin',
      tenantId:  tenant._id,
      isActive:  true,
    });

    tenant.owner = user._id;
    await tenant.save();

    res.status(201).json(await Tenant.findById(tenant._id).populate('plan').populate('owner', 'firstName lastName email username role'));
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key — could be slug or domain
      if (err.message.includes('domains.domain')) {
        return res.status(400).json({ message: 'That domain is already assigned to another tenant' });
      }
      return res.status(400).json({ message: 'A tenant with that slug already exists' });
    }
    next(err);
  }
});

router.put('/tenants/:id', async (req, res, next) => {
  try {
    const allowed = ['storeName', 'plan', 'status', 'settings', 'theme', 'domains'];
    const patch   = {};
    for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];

    if (patch.domains) {
      patch.domains = patch.domains.filter(Boolean).map(d => ({
        domain:   normalizeDomain(d.domain || d),
        type:     d.type     || 'alias',
        verified: !!d.verified,
        active:   d.active   !== false,
      }));
    }

    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true })
      .populate('plan')
      .populate('owner', 'firstName lastName email username role');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    res.json(tenant);
  } catch (err) {
    if (err.code === 11000 && err.message.includes('domains.domain')) {
      return res.status(400).json({ message: 'One of those domains is already assigned to another tenant' });
    }
    next(err);
  }
});

router.delete('/tenants/:id', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    // Mark suspended rather than hard-delete to preserve audit trail
    tenant.status = 'suspended';
    await tenant.save();
    res.json({ message: 'Tenant suspended' });
  } catch (err) { next(err); }
});

router.post('/tenants/:id/domains', async (req, res, next) => {
  try {
    const domain = normalizeDomain(req.body.domain);
    if (!domain) return res.status(400).json({ message: 'Domain is required' });

    // Check domain isn't already claimed
    const existing = await Tenant.findOne({ 'domains.domain': domain, _id: { $ne: req.params.id } });
    if (existing) {
      return res.status(400).json({ message: `Domain ${domain} is already assigned to tenant: ${existing.storeName}` });
    }

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
    const admin    = await User.findOne({ tenantId: tenant._id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Tenant admin not found' });
    admin.password = password;
    await admin.save();
    res.json({ message: 'Password reset', email: admin.email, password });
  } catch (err) { next(err); }
});

module.exports = router;
