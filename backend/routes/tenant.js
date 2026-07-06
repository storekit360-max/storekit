'use strict';

const express = require('express');
const { resolveTenant } = require('../middleware/tenant');
const { auth } = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const Product = require('../models/Product');
const { Category, Banner, PaymentGateway, DeliveryService, BusinessPage } = require('../models/index');
const { bootstrapTenantStore } = require('../utils/tenantBootstrap');

const router = express.Router();

router.get('/current', resolveTenant, (req, res) => {
  res.json({ tenant: req.tenant, plan: req.plan });
});

// GET /tenant/my — returns the logged-in admin's own tenant + plan, resolved
// from their JWT (req.user.tenantId) rather than the request's Host header.
// The admin panel isn't always served from the tenant's own domain (e.g. it
// runs on a shared app domain locally or on Vercel), so domain-based lookup
// (/current above) can resolve the wrong tenant or none at all. This is what
// the admin UI uses to know which plan features are enabled.
router.get('/my', auth, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!req.user.tenantId) return res.json({ tenant: null, plan: null });

    const tenant = await Tenant.findById(req.user.tenantId).populate('plan');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    res.json({ tenant, plan: tenant.plan });
  } catch (err) { next(err); }
});


router.get('/readiness', auth, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const tenantId = req.user.tenantId || req.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });

    const [tenant, products, categories, banners, paymentGateways, deliveryServices, pages] = await Promise.all([
      Tenant.findById(tenantId).populate('plan').lean(),
      Product.countDocuments({ tenantId, isActive: true }),
      Category.countDocuments({ tenantId, isActive: true }),
      Banner.countDocuments({ tenantId, isActive: true }),
      PaymentGateway.countDocuments({ tenantId, isEnabled: true }),
      DeliveryService.countDocuments({ tenantId, isEnabled: true }),
      BusinessPage.countDocuments({ tenantId, isActive: true }),
    ]);

    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const checks = [
      { key: 'domain', label: 'Domain connected', done: Array.isArray(tenant.domains) && tenant.domains.some(d => d.active && d.domain), action: 'Add a tenant domain in Super Admin' },
      { key: 'theme', label: 'Template/theme selected', done: !!(tenant.theme?.template || tenant.theme?.theme || tenant.theme?.primaryColor), action: 'Open Theme Builder and save a template' },
      { key: 'categories', label: 'Categories ready', done: categories > 0, action: 'Create categories or run tenant bootstrap' },
      { key: 'products', label: 'Products added', done: products > 0, action: 'Add your first product' },
      { key: 'banner', label: 'Homepage banner ready', done: banners > 0, action: 'Create at least one active banner' },
      { key: 'payment', label: 'Payment method enabled', done: paymentGateways > 0, action: 'Enable COD or another payment method' },
      { key: 'delivery', label: 'Delivery method enabled', done: deliveryServices > 0, action: 'Enable a delivery service' },
      { key: 'pages', label: 'Policy/contact pages ready', done: pages >= 2, action: 'Add About, Contact, Terms and Privacy pages' },
    ];

    const completed = checks.filter(c => c.done).length;
    const score = Math.round((completed / checks.length) * 100);

    res.json({
      score,
      completed,
      total: checks.length,
      readyToSell: score >= 80 && products > 0,
      counts: { products, categories, banners, paymentGateways, deliveryServices, pages },
      checks,
    });
  } catch (err) { next(err); }
});

router.post('/bootstrap', auth, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const tenantId = req.user.tenantId || req.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    await bootstrapTenantStore(tenant);
    res.json({ message: 'Starter store data is ready' });
  } catch (err) { next(err); }
});

router.put('/settings', resolveTenant, auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (req.user.role === 'admin' && String(req.user.tenantId || '') !== String(req.tenantId)) {
      return res.status(403).json({ message: 'Tenant access denied' });
    }
    const tenant = await Tenant.findByIdAndUpdate(req.tenantId, {
      $set: {
        settings: req.body.settings || req.tenant.settings,
        theme: req.body.theme || req.tenant.theme,
      },
    }, { new: true }).populate('plan');
    res.json(tenant);
  } catch (err) { next(err); }
});

module.exports = router;