const express  = require('express');
const router   = express.Router();
const Deal     = require('../models/Deal');
const { adminAuth } = require('../middleware/auth');

// ── Public: get active deals (customer-facing) ────────────────────────────
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const { type } = req.query;
    const filter = { isActive: true, endsAt: { $gt: now } };
    if (type) filter.type = type;
    const deals = await Deal.find(filter)
      .populate({ path: 'products', match: { isActive: true }, select: 'name slug price salePrice thumbnail isOnSale isFeatured stock ratings variants category' })
      .sort({ sortOrder: 1, createdAt: -1 });
    // Filter out deals whose products are all gone
    const live = deals.map(d => ({ ...d.toObject(), products: d.products.filter(Boolean) }))
                      .filter(d => d.products.length > 0);
    res.json(live);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: get all deals ──────────────────────────────────────────────────
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const deals = await Deal.find()
      .populate({ path: 'products', select: 'name thumbnail price salePrice isActive' })
      .sort({ sortOrder: 1, createdAt: -1 });
    res.json(deals);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: create deal ────────────────────────────────────────────────────
router.post('/', adminAuth, async (req, res) => {
  try {
    const deal = await Deal.create(req.body);
    const populated = await Deal.findById(deal._id)
      .populate({ path: 'products', select: 'name thumbnail price salePrice isActive' });
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: update deal ────────────────────────────────────────────────────
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const deal = await Deal.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate({ path: 'products', select: 'name thumbnail price salePrice isActive' });
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    res.json(deal);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin: delete deal ────────────────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const deleted = await Deal.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Deal not found' });
    res.json({ message: 'Deal deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;