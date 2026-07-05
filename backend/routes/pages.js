const express = require('express');
const router = express.Router();
const { BusinessPage } = require('../models/index');
const { adminAuth } = require('../middleware/auth');

// Public - Get page by slug
router.get('/:slug', async (req, res) => {
  try {
    const page = await BusinessPage.findOne({ slug: req.params.slug, isActive: true });
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(page);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public - Get footer/nav pages list
router.get('/', async (req, res) => {
  try {
    const { footer, nav } = req.query;
    const filter = { isActive: true };
    if (footer === 'true') filter.showInFooter = true;
    if (nav === 'true') filter.showInNav = true;
    const pages = await BusinessPage.find(filter).select('slug title showInFooter showInNav sortOrder').sort({ sortOrder: 1 });
    res.json(pages);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Get all pages
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const pages = await BusinessPage.find().sort({ sortOrder: 1 });
    res.json(pages);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Create
router.post('/admin', adminAuth, async (req, res) => {
  try {
    const page = await BusinessPage.create({ ...req.body, updatedAt: Date.now() });
    res.status(201).json(page);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Update
router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const page = await BusinessPage.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: Date.now() }, { new: true });
    res.json(page);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Delete
router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await BusinessPage.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
