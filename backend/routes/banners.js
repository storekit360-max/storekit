const express = require('express');
const router = express.Router();
const { Banner } = require('../models/index');
const Tenant = require('../models/Tenant');
const { adminAuth } = require('../middleware/auth');
const { REQUIRED_BANNER_POSITIONS, seedDefaultBanner } = require('../utils/tenantBootstrap');

// Public - Get active banners (with optional position filter)
router.get('/', async (req, res) => {
  try {
    // Banners are edited live by store admins. Never allow the browser/CDN to
    // serve the previous banner after a successful save.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const { position, positions } = req.query;
    const now = new Date();
    const filter = {
      isActive: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ]
    };
    const requestedPositions = String(positions || '').split(',').map(value => value.trim()).filter(Boolean);
    if (requestedPositions.length) filter.position = { $in: requestedPositions.slice(0, 10) };
    else if (position) filter.position = position;
    const banners = await Banner.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
    res.json(banners);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public - Get banners by position (convenience route)
router.get('/by-position/:position', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const now = new Date();
    const banners = await Banner.find({
      position: req.params.position,
      isActive: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ]
    }).sort({ sortOrder: 1 });
    res.json(banners);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Get all banners (no date/active filter)
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const { position } = req.query;
    const filter = position ? { position } : {};
    const banners = await Banner.find(filter).sort({ sortOrder: 1, createdAt: -1 });
    res.json(banners);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Get banner stats summary
router.get('/admin/stats', adminAuth, async (req, res) => {
  try {
    const stats = await Banner.aggregate([
      { $group: { _id: '$position', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }
    ]);
    res.json(stats);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Fill only missing banner types with tenant-branded defaults.
router.post('/admin/ensure-defaults', adminAuth, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const inserted = await seedDefaultBanner(tenant);
    res.json({ inserted, message: inserted ? `${inserted} missing banner types were created` : 'All banner types already exist' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Create banner
router.post('/', adminAuth, async (req, res) => {
  try {
    const banner = await Banner.create(req.body);
    res.status(201).json(banner);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Update banner
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    res.json(banner);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Bulk update sort order
router.put('/admin/reorder', adminAuth, async (req, res) => {
  try {
    const { items } = req.body; // [{ _id, sortOrder }]
    await Promise.all(items.map(item => Banner.findByIdAndUpdate(item._id, { sortOrder: item.sortOrder })));
    res.json({ message: 'Reordered' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Delete banner
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });
    if (REQUIRED_BANNER_POSITIONS.includes(banner.position)) {
      const remaining = await Banner.countDocuments({ position: banner.position });
      if (remaining <= 1) {
        return res.status(409).json({ message: 'Every banner type must keep at least one record. Hide this banner instead of deleting it.' });
      }
    }
    await Banner.deleteOne({ _id: banner._id });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
