const express = require('express');
const router = express.Router();
const { Banner } = require('../models/index');
const { adminAuth } = require('../middleware/auth');

// Public - Get active banners (with optional position filter)
router.get('/', async (req, res) => {
  try {
    const { position } = req.query;
    const now = new Date();
    const filter = {
      isActive: true,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ]
    };
    if (position) filter.position = position;
    const banners = await Banner.find(filter).sort({ sortOrder: 1, createdAt: -1 });
    res.json(banners);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public - Get banners by position (convenience route)
router.get('/by-position/:position', async (req, res) => {
  try {
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
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
