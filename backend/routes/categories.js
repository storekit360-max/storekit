const express = require('express');
const router = express.Router();
const { Category } = require('../models/index');
const Product = require('../models/Product');
const { adminAuth } = require('../middleware/auth');

function tenantIdForWrite(req) {
  return req.user?.tenantId || req.tenantId || null;
}

function requireTenantForAdmin(req, res) {
  const tenantId = tenantIdForWrite(req);
  if (!tenantId) {
    res.status(400).json({ message: 'Tenant not resolved. Open admin through the tenant store domain or re-login.' });
    return null;
  }
  return tenantId;
}


function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildCategoryPayload(body = {}) {
  const payload = { ...body };
  payload.name = String(payload.name || '').trim();
  payload.slug = slugify(payload.slug || payload.name);
  payload.parent = payload.parent || null;
  return payload;
}

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
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    const cats = await Category.find({ tenantId })
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
    const payload = buildCategoryPayload(req.body);
    if (!payload.name) return res.status(400).json({ message: 'Category name is required' });
    if (!payload.slug) return res.status(400).json({ message: 'Category slug is required' });

    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    payload.tenantId = tenantId;
    const cat = await Category.create(payload);
    res.status(201).json(cat);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Category slug already exists for this store' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ── ADMIN: Update category ───────────────────────────────────────────────────
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const payload = buildCategoryPayload(req.body);
    if (!payload.name) return res.status(400).json({ message: 'Category name is required' });
    if (!payload.slug) return res.status(400).json({ message: 'Category slug is required' });

    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    const existing = await Category.findOne({ _id: req.params.id, tenantId });
    if (!existing) return res.status(404).json({ message: 'Category not found' });

    // Prevent assigning a category as child of itself.
    if (payload.parent && String(payload.parent) === String(existing._id)) {
      return res.status(400).json({ message: 'A category cannot be its own parent' });
    }

    // Prevent making a parent category a child of one of its own subcategories.
    if (payload.parent) {
      const children = await Category.find({ tenantId, parent: existing._id }).select('_id').lean();
      const childIds = children.map(c => String(c._id));
      if (childIds.includes(String(payload.parent))) {
        return res.status(400).json({ message: 'Cannot move a category under its own subcategory' });
      }
    }

    delete payload.tenantId;
    const cat = await Category.findOneAndUpdate({ _id: req.params.id, tenantId }, payload, {
      new: true,
      runValidators: true,
    }).populate('parent', 'name slug');

    res.json(cat);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Category slug already exists for this store' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ── ADMIN: Hard delete category ─────────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenantForAdmin(req, res);
    if (!tenantId) return;
    const category = await Category.findOne({ _id: req.params.id, tenantId }).lean();
    if (!category) return res.status(404).json({ message: 'Category not found' });

    const children = await Category.find({ tenantId, parent: req.params.id }).select('_id name').lean();
    const categoryIds = [category._id, ...children.map(c => c._id)];

    // Do not leave products pointing at deleted categories.
    // Move affected products to uncategorized state instead of hiding/deleting products.
    const productUpdate = await Product.updateMany(
      { tenantId, category: { $in: categoryIds } },
      { $unset: { category: '', subCategory: '' }, $set: { updatedAt: new Date() } }
    );

    const deleteResult = await Category.deleteMany({ tenantId, _id: { $in: categoryIds } });

    return res.json({
      message: 'Category permanently deleted',
      deletedCount: deleteResult.deletedCount || 0,
      affectedProducts: productUpdate.modifiedCount || 0,
    });
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