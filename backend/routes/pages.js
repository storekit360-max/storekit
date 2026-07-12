const express = require('express');
const router = express.Router();
const { BusinessPage } = require('../models/index');
const { adminAuth } = require('../middleware/auth');

const tenantPart = req => req.tenantId ? { tenantId: req.tenantId } : {};
const adminTenantId = req => req.user?.tenantId || req.tenantId || null;

// Public - Get page by slug
router.get('/:slug', async (req, res) => {
  try {
    const page = await BusinessPage.findOne({ ...tenantPart(req), slug: req.params.slug, isActive: true });
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(page);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public - Get footer/nav pages list
router.get('/', async (req, res) => {
  try {
    const { footer, nav } = req.query;
    const filter = { isActive: true };
    Object.assign(filter, tenantPart(req));
    if (footer === 'true') filter.showInFooter = true;
    if (nav === 'true') filter.showInNav = true;
    const pages = await BusinessPage.find(filter).select('slug title showInFooter showInNav sortOrder').sort({ sortOrder: 1 });
    res.json(pages);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Get all pages
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const tenantId = adminTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const pages = await BusinessPage.find({ tenantId }).sort({ sortOrder: 1 });
    res.json(pages);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Create
router.post('/admin', adminAuth, async (req, res) => {
  try {
    const tenantId = adminTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const page = await BusinessPage.create({ ...req.body, tenantId, updatedAt: Date.now() });
    res.status(201).json(page);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Update
router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const tenantId = adminTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const body = { ...req.body }; delete body.tenantId;
    const page = await BusinessPage.findOneAndUpdate({ _id: req.params.id, tenantId }, { ...body, updatedAt: Date.now() }, { new: true });
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(page);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Delete
router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    const tenantId = adminTenantId(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const page = await BusinessPage.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
