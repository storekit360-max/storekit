const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const Order      = require('../models/Order');
const Product    = require('../models/Product');
const { ReturnRequest, Review, Notification, OTP, GiftCard, Coupon } = require('../models/index');
const { adminAuth } = require('../middleware/auth');

const CONFIRM_HEADER = 'RESET-SALES-DATA';

router.get('/preview', adminAuth, async (req, res) => {
  try {
    const [orders, returns, reviews, notifications, otps, giftCards, coupons, products] =
      await Promise.all([
        Order.countDocuments(),
        ReturnRequest.countDocuments(),
        Review.countDocuments(),
        Notification.countDocuments(),
        OTP.countDocuments(),
        GiftCard.countDocuments(),
        Coupon.countDocuments(),
        Product.countDocuments(),
      ]);
    res.json({
      toDelete: { orders, returnRequests: returns, reviews, notifications, otpRecords: otps },
      toReset: {
        giftCards: `${giftCards} gift card(s)`,
        coupons:   `${coupons} coupon(s)`,
        products:  `${products} product(s)`,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/execute', adminAuth, async (req, res) => {
  if (req.headers['x-confirm-reset'] !== CONFIRM_HEADER) {
    return res.status(400).json({ message: 'Missing confirmation header' });
  }

  const stockOverrides = (
    req.body?.stockOverrides &&
    typeof req.body.stockOverrides === 'object' &&
    !Array.isArray(req.body.stockOverrides)
  ) ? req.body.stockOverrides : null;

  try {
    const results = {};

    const d1 = await Order.deleteMany({});
    results.ordersDeleted = d1.deletedCount;

    const d2 = await ReturnRequest.deleteMany({});
    results.returnsDeleted = d2.deletedCount;

    const d3 = await Review.deleteMany({});
    results.reviewsDeleted = d3.deletedCount;

    const d4 = await Notification.deleteMany({});
    results.notificationsDeleted = d4.deletedCount;

    const d5 = await OTP.deleteMany({});
    results.otpRecordsDeleted = d5.deletedCount;

    const gc = await GiftCard.updateMany(
      {},
      [{ $set: { balance: '$initialValue', usageHistory: [] } }]
    );
    results.giftCardsReset = gc.modifiedCount;

    const cp = await Coupon.updateMany(
      {},
      { $set: { usedCount: 0, usedBy: [], usedByEmails: [] } }
    );
    results.couponsReset = cp.modifiedCount;

    await Product.updateMany({}, { $set: { soldCount: 0 } });

    if (stockOverrides && Object.keys(stockOverrides).length > 0) {
      let fixed = 0;
      for (const [id, qty] of Object.entries(stockOverrides)) {
        if (!mongoose.Types.ObjectId.isValid(id)) continue;
        const n = parseInt(qty, 10);
        if (isNaN(n) || n < 0) continue;
        await Product.findByIdAndUpdate(id, { $set: { stock: n } });
        fixed++;
      }
      results.productsSoldCountReset = await Product.countDocuments();
      results.productsStockFixed = fixed;
    } else {
      results.productsSoldCountReset = await Product.countDocuments();
    }

    console.log('[RESET] Complete:', results);
    res.json({ success: true, message: 'Reset complete.', results });

  } catch (err) {
    console.error('[RESET] Error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;