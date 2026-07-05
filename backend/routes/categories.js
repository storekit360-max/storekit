const express = require('express');
const router = express.Router();
const { Category } = require('../models/index');
const { adminAuth } = require('../middleware/auth');

// ── PUBLIC: Get all active parent categories (no parent) ────────────────────
router.get('/', async (req, res) => {
  try {
    const cats = await Category.find({ isActive: true, parent: null })
      .sort({ sortOrder: 1, name: 1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUBLIC: Get all categories flat (admin use & coupon selector) ───────────
router.get('/all', async (req, res) => {
  try {
    const cats = await Category.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUBLIC: Get subcategories for a parent category ─────────────────────────
router.get('/sub/:parentId', async (req, res) => {
  try {
    const subs = await Category.find({
      isActive: true,
      parent: req.params.parentId,
    }).sort({ sortOrder: 1, name: 1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── ADMIN: Get ALL categories (including hidden) ─────────────────────────────
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const cats = await Category.find()
      .populate('parent', 'name')
      .sort({ sortOrder: 1, name: 1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── ADMIN: Create category or subcategory ────────────────────────────────────
router.post('/', adminAuth, async (req, res) => {
  try {
    const cat = await Category.create(req.body);
    res.status(201).json(cat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── ADMIN: Update category ───────────────────────────────────────────────────
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(cat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── ADMIN: Delete (soft-delete) category ────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await Category.findByIdAndUpdate(req.params.id, { isActive: false });
    // Also deactivate all subcategories of this parent
    await Category.updateMany({ parent: req.params.id }, { isActive: false });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUBLIC: Get sibling categories (same parent) ─────────────────────────────
router.get('/siblings/:categoryId', async (req, res) => {
  try {
    const current = await Category.findById(req.params.categoryId).lean();
    if (!current) return res.json([]);

    const siblings = await Category.find({
      isActive: true,
      parent: current.parent || null,
      _id: { $ne: current._id },
    })
      .sort({ sortOrder: 1, name: 1 })
      .limit(8)
      .lean();

    if (current.parent) {
      const parent = await Category.findById(current.parent).lean();
      siblings.forEach(s => {
        s.parent = current.parent;
        s.parentName = parent?.name || '';
      });
    }

    res.json(siblings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;