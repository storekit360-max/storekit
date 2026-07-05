const express = require('express');
const router  = express.Router();
const { Coupon } = require('../models/index');
const Product = require('../models/Product');
const { adminAuth } = require('../middleware/auth');
const { DiscountEngine } = require('../services/discountEngine');

// ── Validate coupon (public) ──────────────────────────────────────────────────
// Single source of truth: delegates entirely to DiscountEngine.validateCoupon.
// NOTE: this is a PRE-CHECK only for UI feedback. The coupon is validated
// AGAIN, authoritatively, at order-creation time in routes/orders.js — a
// passing result here does not guarantee the order will succeed (e.g. if
// the usage limit is hit by another customer in between, or the cart
// contents change before checkout).
router.post('/validate', async (req, res) => {
  try {
    const { code, orderAmount, userId, email, categoryIds, productIds, brands, items } = req.body;

    if (!code) return res.status(400).json({ message: 'Coupon code is required' });

    // Build authoritative line items server-side from the DB (never trust
    // client-supplied prices/costPrice) so excludeSaleItems and profit-
    // protection checks reflect real, current product data.
    let lineItems = [];
    if (Array.isArray(items) && items.length > 0) {
      const ids = items.map(i => i.productId || i._id).filter(Boolean);
      const products = await Product.find({ _id: { $in: ids } });
      const productMap = new Map(products.map(p => [p._id.toString(), p]));

      lineItems = items
        .map(i => {
          const pid = String(i.productId || i._id);
          const product = productMap.get(pid);
          if (!product) return null;
          const quantity = Number(i.quantity) || 1;
          return DiscountEngine.buildLineItem(product, quantity);
        })
        .filter(Boolean);
    }

    const result = await DiscountEngine.validateCoupon(
      code,
      Number(orderAmount) || 0,
      { userId, email, categoryIds, productIds, brands, lineItems }
    );

    if (result.error) return res.status(400).json({ message: result.error });

    const { coupon, discount } = result;
    res.json({
      valid: true,
      discount,
      coupon: {
        code:        coupon.code,
        type:        coupon.type,
        value:       coupon.value,
        description: coupon.description,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — Get all coupons ───────────────────────────────────────────────────
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate('applicableCategories', 'name')
      .populate('applicableProducts', 'name')
      .sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Get all coupons (admin list view) ────────────────────────────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin — Create coupon ─────────────────────────────────────────────────────
router.post('/', adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json(coupon);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin — Update coupon ─────────────────────────────────────────────────────
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(coupon);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Admin — Delete coupon ─────────────────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;