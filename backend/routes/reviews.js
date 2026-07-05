const express = require('express');
const router = express.Router();
const { Review } = require('../models/index');
const Product = require('../models/Product');
const { auth, adminAuth } = require('../middleware/auth');

// ── Admin routes FIRST ────────────────────────────────────────────────────────

router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('user', 'firstName lastName')
      .populate('product', 'name')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/admin/:id/approve', adminAuth, async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isApproved: !req.body.approved },
      { new: true }
    );
    res.json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Public routes ─────────────────────────────────────────────────────────────

router.get('/product/:productId', async (req, res) => {
  try {
    const reviews = await Review.find({
      product: req.params.productId,
      isApproved: true
    })
      .populate('user', 'firstName lastName avatar')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get products eligible for review by the current user (delivered orders, not yet reviewed)
router.get('/reviewable', auth, async (req, res) => {
  try {
    const Order = require('../models/Order');
    const orders = await Order.find({
      customer: req.user._id,
      orderStatus: 'delivered'
    }).select('items deliveredAt createdAt').populate('items.product', 'name images thumbnail slug');

    // Existing reviews by this user
    const existingReviews = await Review.find({ user: req.user._id }).select('product order');
    const reviewedKey = new Set(existingReviews.map(r => `${r.order}_${r.product}`));

    const reviewable = [];
    for (const order of orders) {
      for (const item of order.items) {
        if (!item.product) continue;
        const key = `${order._id}_${item.product._id}`;
        if (reviewedKey.has(key)) continue;
        reviewable.push({
          orderId: order._id,
          product: item.product,
          deliveredAt: order.deliveredAt || order.createdAt
        });
      }
    }

    res.json(reviewable);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { product, order: orderId, rating, title, comment } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: 'An order is required to leave a review.' });
    }

    // Verify the order belongs to this user, contains this product, and has been delivered
    const Order = require('../models/Order');
    const order = await Order.findOne({ _id: orderId, customer: req.user._id });
    if (!order) {
      return res.status(403).json({ message: 'You can only review products from your own orders.' });
    }
    if (order.orderStatus !== 'delivered') {
      return res.status(403).json({ message: 'You can only review products after your order has been delivered.' });
    }
    const purchasedProduct = order.items.find(i => String(i.product) === String(product));
    if (!purchasedProduct) {
      return res.status(403).json({ message: 'You can only review products you have purchased.' });
    }

    // Prevent duplicate review for the same product/order
    const existing = await Review.findOne({ product, user: req.user._id, order: orderId });
    if (existing) {
      return res.status(409).json({ message: 'You have already reviewed this product for this order.' });
    }

    const review = await Review.create({
      product, order: orderId, rating, title, comment,
      user: req.user._id,
      isVerifiedPurchase: true,
      isApproved: true
    });
    const reviews = await Review.find({ product, isApproved: true });
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / (reviews.length || 1);
    await Product.findByIdAndUpdate(product, {
      'ratings.average': avg,
      'ratings.count': reviews.length
    });
    res.status(201).json(review);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You have already reviewed this product for this order.' });
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;