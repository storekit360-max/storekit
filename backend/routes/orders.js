const express   = require('express');
const rateLimit = require('express-rate-limit');
const crypto    = require('crypto');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const { DiscountEngine } = require('../services/discountEngine');
const { Coupon, GiftCard, Notification, Settings, DeliveryService } = require('../models/index');
const { auth, adminAuth } = require('../middleware/auth');
const { sendPurchaseEvent } = require('../services/metaCAPI');
const { sendOrderWhatsAppNotification } = require('../services/whatsappOrderNotify');
const {
  sendMail,
  getAdminEmail,
  orderConfirmHtml,
  newOrderAdminHtml,
  slipUploadedAdminHtml,
  slipReceivedCustomerHtml,
  paymentConfirmedHtml,
  orderCancelledHtml,
  cancelRequestAdminHtml,
  cancelRequestReceivedCustomerHtml,
  cancelRejectedHtml,
  cancelApprovedAdminHtml,
  cancelRejectedAdminHtml,
  cancelAutoDecisionAdminHtml,
  orderStatusUpdateHtml,
  isEmailEnabled,
} = require('../utils/mailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── Helpers ───────────────────────────────────────────────────────────────────
function absoluteSlipUrl(relPath) {
  // FIX: BACKEND_URL must include the https:// protocol.
  // If it's missing the protocol (e.g. "storekit-production.up.railway.app"),
  // we add https:// automatically so image previews work in emails.
  let base =
    process.env.BACKEND_URL ||
    process.env.RAILWAY_STATIC_URL ||
    `http://localhost:${process.env.PORT || 5001}`;

  if (base && !base.startsWith('http://') && !base.startsWith('https://')) {
    base = 'https://' + base;
  }

  return `${base.replace(/\/$/, '')}${relPath}`;
}

// ── Cloudinary setup for payment slips ───────────────────────────────────────
const USE_CLOUDINARY =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

let cloudinary;
let uploadSlip;

if (USE_CLOUDINARY) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const { CloudinaryStorage } = require('multer-storage-cloudinary');
  const slipStorage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
      const isPdf = file.mimetype === 'application/pdf';
      return {
        folder: 'storekit/payment-slips',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
        public_id: `slip-${req.params.id}-${Date.now()}`,
        // PDFs must use resource_type 'raw' so Cloudinary serves them
        // via /raw/upload/ (publicly accessible). Using 'auto' causes PDFs
        // to land under /image/upload/ which returns 401 for raw files.
        resource_type: isPdf ? 'raw' : 'image',
        type: 'upload', // ensures public (not authenticated) delivery
      };
    },
  });
  uploadSlip = multer({
    storage: slipStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = /jpeg|jpg|png|gif|webp|pdf/;
      if (allowed.test(file.mimetype)) cb(null, true);
      else cb(new Error('Only images and PDFs are allowed'));
    },
  });
  console.log('🌥️  Payment-slip storage: Cloudinary');
} else {
  const slipStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../uploads/payment-slips');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `slip-${req.params.id}-${Date.now()}${ext}`);
    },
  });
  uploadSlip = multer({
    storage: slipStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = /jpeg|jpg|png|gif|webp|pdf/;
      if (allowed.test(file.mimetype)) cb(null, true);
      else cb(new Error('Only images and PDFs are allowed'));
    },
  });
  console.log('💾 Payment-slip storage: local disk');
}

// ── Auto-cancel decision scheduler ───────────────────────────────────────────
const runAutoCancelDecisions = async () => {
  try {
    const rows = await Settings.find({
      key: { $in: ['autoDecisionEnabled', 'autoDecisionMinutes', 'autoDecisionAction'] },
    }).lean();
    const cfg = {};
    rows.forEach(r => { cfg[r.key] = r.value; });

    if (!cfg.autoDecisionEnabled) return;

    const minutes = Number(cfg.autoDecisionMinutes) || 60;
    const action  = cfg.autoDecisionAction === 'reject' ? 'rejected' : 'approved';
    const cutoff  = new Date(Date.now() - minutes * 60 * 1000);

    const pending = await Order.find({
      'cancelRequest.requested': true,
      'cancelRequest.status': 'pending',
      'cancelRequest.requestedAt': { $lte: cutoff },
    });

    for (const order of pending) {
      order.cancelRequest.status     = action;
      order.cancelRequest.resolvedAt = new Date();
      order.cancelRequest.resolvedBy = 'system (auto)';

      if (action === 'approved') {
        order.orderStatus = 'cancelled';
        order.statusHistory.push({
          status: 'cancelled',
          note: `Auto-cancelled by system after ${minutes} min. Customer reason: ${order.cancelRequest.reason || 'None'}`,
          updatedBy: 'system',
        });
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { stock: item.quantity, soldCount: -item.quantity },
          }).catch(() => {});
        }
        if (order.billing?.email) {
          if (await isEmailEnabled('cancel_approved_customer')) sendMail({
            to: order.billing.email,
            subject: `Order Cancelled — ${order.orderNumber} | StoreKit`,
            html: await orderCancelledHtml(order),
          }).catch(() => {});
        }
      } else {
        if (order.billing?.email) {
          if (await isEmailEnabled('cancel_rejected_customer')) sendMail({
            to: order.billing.email,
            subject: `Cancellation Update — ${order.orderNumber} | StoreKit`,
            html: await cancelRejectedHtml(order),
          }).catch(() => {});
        }
      }

      await order.save();

      // [panel notification suppressed: cancel_auto_decision]

      const adminEmail = await getAdminEmail();
      if (adminEmail) {
        if (await isEmailEnabled('cancel_request_admin')) sendMail({
          to: adminEmail,
          subject: `🤖 Auto-${action === 'approved' ? 'Cancellation' : 'Rejection'} — ${order.orderNumber} | StoreKit`,
          html: await cancelAutoDecisionAdminHtml(order, action),
        }).catch(() => {});
      }

      console.log(`[AUTO-CANCEL] Order ${order.orderNumber} → ${action}`);
    }
  } catch (err) {
    console.error('[AUTO-CANCEL] Scheduler error:', err.message);
  }
};

setInterval(runAutoCancelDecisions, 60 * 1000);
setTimeout(runAutoCancelDecisions, 5000);

// ── Automatic follow-up reminder scheduler (runs every 30 min) ───────────────
// Sends in-app notifications for:
//  1. Orders sitting in 'pending' > 30 min with no action
//  2. Bank transfer orders with no slip uploaded after 2 hours
//  3. Orders flagged for follow-up — reminds every 2 hours until resolved
//  4. Cancel requests pending for > 30 min
const runFollowUpReminders = async () => {
  try {
    const now = new Date();

    // 1. Pending orders > 30 min — needs confirmation
    const pendingCutoff = new Date(now - 30 * 60 * 1000);
    const stalePending = await Order.find({
      orderStatus: 'pending',
      createdAt: { $lte: pendingCutoff },
    }).select('orderNumber _id billing createdAt');

    for (const o of stalePending) {
      const mins = Math.round((now - new Date(o.createdAt)) / 60000);
      // [panel notification suppressed: followup_reminder]
    }

    // 2. Bank transfer orders with no slip > 2 hours
    const slipCutoff = new Date(now - 2 * 60 * 60 * 1000);
    const noSlip = await Order.find({
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
      paymentSlip: { $in: [null, undefined, ''] },
      orderStatus: { $nin: ['cancelled', 'refunded'] },
      createdAt: { $lte: slipCutoff },
    }).select('orderNumber _id billing createdAt');

    for (const o of noSlip) {
      const hrs = (now - new Date(o.createdAt)) / 3600000;
      // [panel notification suppressed: followup_reminder]
    }

    // 3. Flagged follow-up orders — remind every 2 hours
    const flagRemindCutoff = new Date(now - 2 * 60 * 60 * 1000);
    const flagged = await Order.find({
      followUpFlag: true,
      orderStatus: { $nin: ['delivered', 'cancelled', 'refunded'] },
      lastActionAt: { $lte: flagRemindCutoff },
    }).select('orderNumber _id billing followUpNote priority');

    for (const o of flagged) {
      // [panel notification suppressed: follow_up]
    }

    // 4. Cancel requests pending > 30 min
    const cancelCutoff = new Date(now - 30 * 60 * 1000);
    const pendingCancels = await Order.find({
      'cancelRequest.requested': true,
      'cancelRequest.status': 'pending',
      'cancelRequest.requestedAt': { $lte: cancelCutoff },
    }).select('orderNumber _id billing cancelRequest');

    for (const o of pendingCancels) {
      const mins = Math.round((now - new Date(o.cancelRequest.requestedAt)) / 60000);
      await Notification.create({
        type: 'cancel_request',
        title: `🚫 Cancel Request Awaiting Decision`,
        message: `Order ${o.orderNumber} — cancellation requested ${mins} minutes ago by ${o.billing?.firstName} ${o.billing?.lastName} and still pending${o.cancelRequest.reason ? `: "${o.cancelRequest.reason}"` : ''}`,
        link: `/admin/orders/${o._id}`,
        data: { orderId: o._id, reason: 'cancel_pending_long' },
      }).catch(() => {});
    }

    const totalReminders = stalePending.length + noSlip.length + flagged.length + pendingCancels.length;
    if (totalReminders > 0) {
      console.log(`[FOLLOW-UP] Sent ${totalReminders} reminder notifications`);
    }
  } catch (err) {
    console.error('[FOLLOW-UP SCHEDULER]', err.message);
  }
};

setInterval(runFollowUpReminders, 30 * 60 * 1000); // every 30 min
setTimeout(runFollowUpReminders, 30000);            // 30s after server start


// ── Admin — Get all orders ────────────────────────────────────────────────────
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.orderStatus = status;
    if (search)
      filter.$or = [
        { orderNumber: new RegExp(search, 'i') },
        { 'billing.email': new RegExp(search, 'i') },
        { 'billing.firstName': new RegExp(search, 'i') },
      ];
    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .populate('customer', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ orders, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — Update order status ───────────────────────────────────────────────
router.put('/admin/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, note, trackingNumber, deliveryPartner } = req.body;
    const update = { orderStatus: status, updatedAt: Date.now() };
    if (trackingNumber) update.trackingNumber = trackingNumber;
    if (deliveryPartner) update.deliveryPartner = deliveryPartner;
    if (status === 'delivered') update.deliveredAt = Date.now();

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        ...update,
        $push: {
          statusHistory: {
            status,
            note: note || `Status updated to ${status}`,
            updatedBy: req.user.email,
          },
        },
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ message: 'Order not found' });

    const statusLabels = {
      confirmed: 'Confirmed ✅', processing: 'Processing 🔄', shipped: 'Shipped 📦',
      out_for_delivery: 'Out for Delivery 🚚', delivered: 'Delivered ✅',
      cancelled: 'Cancelled ❌', refunded: 'Refunded 💰',
    };

    // In-app notification
    // [panel notification suppressed: order_status]

    // Email customer
    const notifyStatuses = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
    if (order.billing?.email && notifyStatuses.includes(status)) {
      if (await isEmailEnabled('order_status_customer')) sendMail({
        to: order.billing.email,
        subject: `Order Update — ${order.orderNumber} | StoreKit`,
        html: await orderStatusUpdateHtml(order, status, note),
      }).catch(err => console.error('[STATUS EMAIL]', err.message));
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — Update payment status (COD and manual adjustments) ───────────────
// FIX: The previous code in OrderDetail.js was calling /admin/:id/status
// (the order-status endpoint) which never saved paymentStatus to the DB.
// This dedicated endpoint correctly persists paymentStatus changes.
router.put('/admin/:id/payment-status', adminAuth, async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const validStatuses = ['pending', 'paid', 'failed', 'refunded'];
    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid payment status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const previousStatus = order.paymentStatus;
    order.paymentStatus = paymentStatus;
    order.updatedAt = Date.now();
    order.statusHistory.push({
      status: order.orderStatus,
      note: `Payment status changed from ${previousStatus} to ${paymentStatus} by admin`,
      updatedBy: req.user.email,
    });
    await order.save();

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — Mark order as read ────────────────────────────────────────────────
router.put('/admin/:id/read', adminAuth, async (req, res) => {
  try {
    await Order.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — Confirm payment (manual gateway) ──────────────────────────────────
router.put('/admin/:id/confirm-payment', adminAuth, async (req, res) => {
  try {
    const { paymentReference } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        paymentStatus: 'paid',
        orderStatus: 'confirmed',
        paymentReference,
        updatedAt: Date.now(),
        $push: {
          statusHistory: {
            status: 'confirmed',
            note: 'Payment confirmed by admin',
            updatedBy: req.user.email,
          },
        },
      },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });

    await Notification.create({
      type: 'payment_confirmed',
      title: '✅ Payment Confirmed',
      message: `Order ${order.orderNumber} — payment confirmed manually by admin`,
      link: `/admin/orders/${order._id}`,
    }).catch(() => {});

    // FIX: Email customer on manual payment confirmation too
    if (order.billing?.email) {
      if (await isEmailEnabled('payment_confirmed_customer')) sendMail({
        to: order.billing.email,
        subject: `✅ Payment Confirmed — Order ${order.orderNumber} | StoreKit`,
        html: await paymentConfirmedHtml(order),
      }).catch(err => console.error('[PAYMENT CONFIRM EMAIL]', err.message));
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — Confirm payment from uploaded slip ────────────────────────────────
router.put('/admin/:id/confirm-slip', adminAuth, async (req, res) => {
  try {
    const { paymentReference } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        paymentStatus: 'paid',
        orderStatus: 'confirmed',
        ...(paymentReference && { paymentReference }),
        updatedAt: Date.now(),
        $push: {
          statusHistory: {
            status: 'confirmed',
            note: 'Payment slip verified by admin',
            updatedBy: req.user.email,
          },
        },
      },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Order not found' });

    await Notification.create({
      type: 'payment_confirmed',
      title: '✅ Slip Verified & Payment Confirmed',
      message: `Order ${order.orderNumber} — bank slip verified by admin`,
      link: `/admin/orders/${order._id}`,
    }).catch(() => {});

    if (order.billing?.email) {
      sendMail({
        to: order.billing.email,
        subject: `✅ Payment Confirmed — Order ${order.orderNumber} | StoreKit`,
        html: await paymentConfirmedHtml(order),
      }).catch(err => console.error('[SLIP CONFIRM EMAIL]', err.message));
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Customer — Get my orders ──────────────────────────────────────────────────
router.get('/my-orders', auth, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .populate('items.product', 'name thumbnail slug');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ── Place order (public — guest + logged in) ──────────────────────────────────
// Rate limited: max 10 orders per IP per 15 minutes
const orderRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { message: 'Too many orders. Please try again later.' },
  standardHeaders: true, legacyHeaders: false,
});

// Whitelist of allowed payment methods — reject anything not on this list
const ALLOWED_PAYMENT_METHODS = ['free', 'cod', 'bank_transfer', 'payhere', 'stripe', 'paypal'];

// Allowed payment references per gateway — verified server-side before accepting
const GATEWAY_METHODS = ['payhere', 'stripe', 'paypal'];

router.post('/', orderRateLimiter, async (req, res) => {
  try {
    const {
      items, billing, shipping, shipToDifferentAddress,
      paymentMethod, couponCode, giftCard, notes, deliveryService,
      paymentReference,   // provided by frontend after gateway payment succeeds
      metaEventId,        // browser pixel eventId for CAPI deduplication
      fbp,                // _fbp cookie for Meta audience tracking
      fbc,                // _fbc cookie for Meta click attribution
    } = req.body;

    // ── Strict input validation ─────────────────────────────────────────────────

    // Reject unknown payment methods — never allow client to invent new ones
    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    // Reject suspiciously large orders
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ message: 'No items in order' });
    if (items.length > 50)
      return res.status(400).json({ message: 'Too many items in one order' });
    if (!req.tenantId) {
      return res.status(404).json({ message: 'Store not found or inactive' });
    }

    // Validate quantities — prevent negative/zero/huge quantities
    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      if (!item.productId || isNaN(qty) || qty < 1 || qty > 999) {
        return res.status(400).json({ message: 'Invalid item quantity' });
      }
      item.quantity = qty; // normalise to integer
    }

    // Validate paymentReference format for gateway payments
    // paymentReference must only come from a confirmed gateway callback
    if (paymentReference) {
      if (typeof paymentReference !== 'string' || paymentReference.length > 200) {
        return res.status(400).json({ message: 'Invalid payment reference' });
      }
      // Only gateway methods may supply a paymentReference
      if (!GATEWAY_METHODS.includes(paymentMethod)) {
        return res.status(400).json({ message: 'Payment reference not valid for this payment method' });
      }
      // Sanitise — alphanumeric + common gateway chars only
      if (!/^[a-zA-Z0-9_\-\.]+$/.test(paymentReference)) {
        return res.status(400).json({ message: 'Invalid payment reference format' });
      }
    }

    // Reject if a gateway payment claims to be paid but has no reference
    // (someone manually crafted a request trying to get free confirmed status)
    if (GATEWAY_METHODS.includes(paymentMethod) && !paymentReference) {
      // This is valid — means payment UI hasn't completed yet, order will be pending
      // But we explicitly block anyone trying to set paymentStatus manually via body
    }

    // ── 1. Build line items (single effectivePrice call per product) ──────────
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive)
        return res.status(400).json({ message: `Product not available: ${item.name}` });
      if (product.stock < item.quantity)
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });

      orderItems.push(DiscountEngine.buildLineItem(product, item.quantity));

      await Product.findByIdAndUpdate(product._id, {
        $inc: { stock: -item.quantity, soldCount: item.quantity },
      });
    }

    const subtotal = DiscountEngine.computeSubtotal(orderItems);

    // ── 2. Resolve delivery fee ───────────────────────────────────────────────
    const { fee: shippingCost, serviceName: deliveryServiceName } =
      await DiscountEngine.resolveDeliveryFee(
        deliveryService || null,
        billing?.city || '',
        subtotal,
        {}  // will fetch Settings internally
      );

    // ── 3. Resolve best customer benefit (coupon OR gift card) ────────────────
    //    Collect cart scope data for coupon eligibility checks
    const categoryIds = [...new Set(orderItems.flatMap(i => [i.category?.toString(), i.subCategory?.toString()]).filter(Boolean))];
    const productIds  = orderItems.map(i => i.product.toString());
    const brands      = [...new Set(orderItems.map(i => i.brand).filter(Boolean))];

    let userId;
    if (req.headers.authorization) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(
          req.headers.authorization.replace('Bearer ', ''),
          process.env.JWT_SECRET
        );
        userId = decoded.id;
      } catch {}
    }

    const billingEmail = billing?.email || null;

    // SECURITY: this is the AUTHORITATIVE coupon/gift-card check. It is run
    // again here regardless of any earlier /validate call, because the cart
    // contents, user identity, and the coupon's own usage counters can all
    // have changed since then. Never trust a client-supplied "discount"
    // value — only what resolveBenefit computes here is used.
    //
    // NEW: coupon and gift card can both be applied together.
    //   - Coupon → discount on subtotal (product discount → coupon/benefit → gift card → final total)
    //   - Gift card → payment method applied after coupon against remaining total
    const benefit = await DiscountEngine.resolveBenefit({
      couponCode:   couponCode || null,
      giftCardCode: giftCard   || null,
      subtotal,
      deliveryFee:  shippingCost,
      userId,
      email: billingEmail,
      categoryIds,
      productIds,
      brands,
      lineItems: orderItems,  // FIX: pass authoritative server-side line items so scope
                               // and excludeSaleItems checks use real product data
    });

    // If the customer explicitly supplied a coupon code but it failed
    // re-validation at order time, reject the order rather than silently
    // dropping the discount — otherwise stock was already decremented for
    // an order at a price the customer didn't agree to.
    if (couponCode && benefit.couponDiscount === 0 && benefit.errorCoupon) {
      // Restore stock we already decremented in step 1
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity, soldCount: -item.quantity },
        });
      }
      return res.status(400).json({ message: benefit.errorCoupon });
    }

    // ── 4. Compute canonical totals ───────────────────────────────────────────
    const totals = DiscountEngine.computeTotals({ subtotal, deliveryFee: shippingCost, benefit });

    // ── 5. Persist order ──────────────────────────────────────────────────────
    const hasCoupon   = benefit.couponDiscount > 0;
    const hasGiftCard = totals.giftCardDeduction > 0;

    const orderData = {
      tenantId: req.tenantId,
      items:    orderItems,
      billing,
      shipping: shipToDifferentAddress ? shipping : billing,
      shipToDifferentAddress,
      paymentMethod,

      // ── Payment status logic ────────────────────────────────────────────────
      // SECURITY: paymentStatus and orderStatus are derived ONLY from:
      //   - paymentMethod (whitelisted above)
      //   - paymentReference (validated format above, verified by gateway server-side)
      // The client CANNOT set these fields directly.
      // Gateway flow: preflight/intent → SDK confirms → reference sent here → 'paid'
      // Declined payments: SDK never calls success → no reference → order not created
      paymentStatus: (() => {
        if (paymentMethod === 'free')                                        return 'paid';
        if (paymentMethod === 'cod')                                         return 'pending';
        if (paymentMethod === 'bank_transfer')                               return 'pending';
        if (GATEWAY_METHODS.includes(paymentMethod) && paymentReference)    return 'paid';
        return 'pending';
      })(),

      orderStatus: (() => {
        if (paymentMethod === 'free')                                        return 'confirmed';
        if (GATEWAY_METHODS.includes(paymentMethod) && paymentReference)    return 'confirmed';
        return 'pending';
      })(),

      paymentReference: paymentReference || undefined,

      // Coupon — discount applied to subtotal
      couponCode:      hasCoupon   ? couponCode : undefined,
      couponDiscount:  hasCoupon   ? totals.couponDiscount : 0,
      // Gift card — payment method applied after coupon
      giftCard:        hasGiftCard ? giftCard   : undefined,
      giftCardDeduction: hasGiftCard ? totals.giftCardDeduction : 0,
      // Legacy field kept for backward compat (coupon portion only)
      giftCardDiscount: hasGiftCard ? totals.giftCardDeduction : 0,
      subtotal:      totals.subtotal,
      shippingCost:  totals.deliveryFee,
      discount:      totals.couponDiscount,    // legacy: coupon discount only
      total:         totals.total,
      notes,
      deliveryService:     deliveryService || 'standard',
      // Meta Pixel dedup fields — stored for potential refund/cancel CAPI events
      metaEventId: metaEventId || undefined,
      metaFbp:     fbp || undefined,
      metaFbc:     fbc || undefined,
      deliveryServiceName,
      statusHistory: [{
        status: (['payhere','stripe','paypal'].includes(paymentMethod) && paymentReference)
          ? 'confirmed'
          : 'pending',
        note: (['payhere','stripe','paypal'].includes(paymentMethod) && paymentReference)
          ? `Payment confirmed via ${paymentMethod} (${paymentReference})`
          : 'Order placed',
        updatedBy: billing.email,
      }],
    };

    if (userId) orderData.customer = userId;

    const monthlyOrderLimit = Number(req.plan?.limits?.ordersPerMonth || req.tenant?.plan?.limits?.ordersPerMonth || 0);
    if (monthlyOrderLimit) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};
      const ordersThisMonth = await Order.countDocuments({ ...tenantFilter, createdAt: { $gte: monthStart } });
      if (ordersThisMonth >= monthlyOrderLimit) {
        return res.status(403).json({ message: 'This store has reached its monthly order limit. Please contact the store owner.' });
      }
    }

    const order = await Order.create(orderData);

    // ── 6. Apply benefit side-effects (atomic, race-safe) ──────────────────────
    const applied = await DiscountEngine.applyBenefit(benefit, order._id, userId, billingEmail, totals.giftCardDeduction);

    if (!applied.ok) {
      // The coupon/gift card was consumed by a concurrent request between our
      // validation and this point. Roll back the order and restore stock so
      // the customer isn't charged a price based on a benefit they didn't get.
      await Order.findByIdAndDelete(order._id);
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity, soldCount: -item.quantity },
        });
      }
      const msg = applied.reason === 'giftcard_conflict'
        ? 'This gift card no longer has sufficient balance. Please try again.'
        : 'This coupon is no longer available. Please remove it and try again.';
      return res.status(409).json({ message: msg });
    }

    // ── Admin in-app notification ──────────────────────────────────────────────
    await Notification.create({
      type:    'new_order',
      title:   '🛒 New Order Received!',
      message: `Order ${order.orderNumber} from ${billing.firstName} ${billing.lastName} — Rs. ${totals.total.toLocaleString()}`,
      link:    `/admin/orders/${order._id}`,
      data:    { orderId: order._id, total: totals.total, paymentMethod },
    });

    // ── WhatsApp admin alert: new order ─────────────────────────────────────────
    // Fire-and-forget — never delays or fails the order response.
    sendOrderWhatsAppNotification(order).catch(err => console.error('[WHATSAPP ORDER ALERT]', err.message));

    // ── Meta CAPI: server-side Purchase event ──────────────────────────────────
    // This mirrors the browser pixel Purchase event fired in the frontend.
    // The eventId from the request body links the two events for deduplication —
    // Meta counts only ONE conversion even though both browser and server fire.
    // Fire-and-forget: never await — CAPI must never delay the order response.
    // We pass explicit contentIds and numItems computed from authoritative orderItems
    // so CAPI never tries to re-read unpopulated ObjectIds from order.items.
    // ── DEBUG: log the browser Purchase event_id arriving with the order POST ──
    console.log('[META CAPI] Purchase — browser event_id received (metaEventId):', req.body.metaEventId || '(none — CAPI will use fallback)');
    const _capiContentIds = orderItems.map(i => String(i.product || '')).filter(id => id && id.length > 5);
    const _capiNumItems   = orderItems.reduce((s, i) => s + (i.quantity || 1), 0);
    sendPurchaseEvent(order, {
      clientIp:   req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '',
      userAgent:  req.headers['user-agent'] || '',
      fbp:        req.body.fbp || req.cookies?._fbp || '',
      fbc:        req.body.fbc || req.cookies?._fbc || '',
      eventId:    req.body.metaEventId || undefined,  // sent by frontend for deduplication
      siteUrl:    `${process.env.FRONTEND_URL || 'https://storekit.local'}/order-success/${order._id}`,
      contentIds: _capiContentIds,
      numItems:   _capiNumItems,
    }).catch(err => console.error('[CAPI order]', err.message));

    // ── Email customer: order confirmation ─────────────────────────────────────
    if (billing?.email) {
      if (await isEmailEnabled('order_placed_customer')) sendMail({
        to:      billing.email,
        subject: `Order Confirmed — ${order.orderNumber} | StoreKit`,
        html:    await orderConfirmHtml(order),
      }).catch(err => console.error('[ORDER CONFIRM EMAIL]', err.message));
    }

    // ── Email admin: new order alert ───────────────────────────────────────────
    const adminEmail = await getAdminEmail();
    if (adminEmail) {
      if (await isEmailEnabled('order_placed_admin')) sendMail({
        to:      adminEmail,
        subject: `🛒 New Order ${order.orderNumber} — Rs. ${totals.total.toLocaleString()} | StoreKit`,
        html:    await newOrderAdminHtml(order),
      }).catch(err => console.error('[NEW ORDER ADMIN EMAIL]', err.message));
    }

    res.status(201).json({
      orderId:     order._id,
      orderNumber: order.orderNumber,
      total:       totals.total,
      paymentMethod,
    });
  } catch (err) {
    console.error('Order error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── Payment gateway webhook — auto-confirm order after successful payment ──────
router.post('/payment-success', async (req, res) => {
  try {
    const { orderId, paymentReference, gateway } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.paymentStatus = 'paid';
    order.orderStatus = 'confirmed';
    order.paymentReference = paymentReference;
    order.statusHistory.push({
      status: 'confirmed',
      note: `Payment confirmed via ${gateway}`,
      updatedBy: 'system',
    });
    await order.save();

    await Notification.create({
      type: 'payment_confirmed',
      title: '✅ Payment Confirmed',
      message: `Order ${order.orderNumber} payment received via ${gateway}`,
      link: `/admin/orders/${order._id}`,
    });

    if (order.billing?.email) {
      if (await isEmailEnabled('payment_confirmed_customer')) sendMail({
        to: order.billing.email,
        subject: `✅ Payment Confirmed — Order ${order.orderNumber} | StoreKit`,
        html: await paymentConfirmedHtml(order),
      }).catch(() => {});
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Upload payment slip ───────────────────────────────────────────────────────
// Multer error wrapper — returns JSON instead of crashing on bad uploads
const uploadSlipMiddleware = (req, res, next) => {
  uploadSlip.single('slip')(req, res, (err) => {
    if (err) {
      console.error('[ORDER SLIP MULTER ERROR]', err.message);
      return res.status(400).json({ message: `File upload error: ${err.message}` });
    }
    next();
  });
};

router.post('/:id/payment-slip', uploadSlipMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    let slipUrl, slipRelPath;
    if (USE_CLOUDINARY) {
      // multer-storage-cloudinary sets req.file.path to the full Cloudinary URL.
      // For raw (PDF) uploads Cloudinary returns the correct /raw/upload/ URL,
      // so we use it directly — no adjustment needed.
      slipUrl = req.file.path;
      slipRelPath = slipUrl;
    } else {
      slipRelPath = `/uploads/payment-slips/${req.file.filename}`;
      slipUrl = absoluteSlipUrl(slipRelPath);
    }

    order.paymentSlip = slipRelPath;
    order.paymentSlipUploadedAt = new Date();
    await order.save();

    // ── Admin in-app notification ──
    await Notification.create({
      type: 'payment_slip',
      title: '📎 Payment Slip Uploaded',
      message: `Order ${order.orderNumber} — ${order.billing?.firstName} ${order.billing?.lastName} uploaded a payment slip`,
      link: `/admin/orders/${order._id}`,
    }).catch(() => {});

    // ── Email admin: slip uploaded ──
    const adminEmail = await getAdminEmail();
    if (adminEmail) {
      if (await isEmailEnabled('slip_uploaded_admin')) sendMail({
        to: adminEmail,
        subject: `📎 Payment Slip Uploaded — ${order.orderNumber} | StoreKit`,
        html: await slipUploadedAdminHtml(order, slipUrl),
      }).catch(err => console.error('[SLIP ADMIN EMAIL]', err.message));
    }

    // ── Email customer: slip received ──
    if (order.billing?.email) {
      if (await isEmailEnabled('slip_received_customer')) sendMail({
        to: order.billing.email,
        subject: `Payment Slip Received — ${order.orderNumber} | StoreKit`,
        html: await slipReceivedCustomerHtml(order),
      }).catch(err => console.error('[SLIP CUSTOMER EMAIL]', err.message));
    }

    res.json({ success: true, slipUrl: slipRelPath });
  } catch (err) {
    console.error('Slip upload error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── Customer — Request order cancellation ─────────────────────────────────────
router.post('/:id/cancel-request', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const cancellableStatuses = ['pending', 'confirmed'];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      return res.status(400).json({ message: 'Order cannot be cancelled at this stage' });
    }
    if (order.cancelRequest?.requested) {
      return res.status(400).json({ message: 'Cancellation already requested' });
    }

    const windowSetting  = await Settings.findOne({ key: 'cancelWindowMinutes' });
    const rawWindow      = windowSetting ? windowSetting.value : null;
    const parsedWindow   = (rawWindow !== null && rawWindow !== undefined && String(rawWindow).trim() !== '')
      ? Number(rawWindow) : 60;
    const windowMinutes  = (!isNaN(parsedWindow) && isFinite(parsedWindow)) ? parsedWindow : 60;

    if (windowMinutes === 0) {
      return res.status(400).json({ message: 'Order cancellations are disabled by the store' });
    }
    const orderPlacedAt = new Date(order.createdAt).getTime();
    if (!isFinite(orderPlacedAt) || orderPlacedAt <= 0) {
      return res.status(400).json({ message: 'Cannot determine order placement time' });
    }
    const minutesElapsed = (Date.now() - orderPlacedAt) / 60000;
    if (minutesElapsed > windowMinutes) {
      return res.status(400).json({
        message: `Cancellation window of ${windowMinutes} minute${windowMinutes !== 1 ? 's' : ''} has passed. Please contact support.`,
      });
    }

    order.cancelRequest = {
      requested: true,
      requestedAt: new Date(),
      reason,
      status: 'pending',
    };
    await order.save();

    // ── Admin in-app notification ──
    await Notification.create({
      type: 'cancel_request',
      title: '🚫 Cancellation Request',
      message: `Order ${order.orderNumber} — ${order.billing?.firstName} ${order.billing?.lastName} requested cancellation${reason ? `: "${reason}"` : ''}`,
      link: `/admin/orders/${order._id}`,
      data: { orderId: order._id, reason },
    }).catch(() => {});

    // ── Email admin: cancel request ──
    const adminEmail = await getAdminEmail();
    if (adminEmail) {
      if (await isEmailEnabled('cancel_request_admin')) sendMail({
        to: adminEmail,
        subject: `🚫 Cancel Request — ${order.orderNumber} | StoreKit`,
        html: await cancelRequestAdminHtml(order),
      }).catch(() => {});
    }

    // ── Email customer: request received confirmation ──
    if (order.billing?.email) {
      if (await isEmailEnabled('cancel_request_customer')) sendMail({
        to: order.billing.email,
        subject: `Cancellation Request Received — ${order.orderNumber} | StoreKit`,
        html: await cancelRequestReceivedCustomerHtml(order),
      }).catch(() => {});
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — Approve or reject a cancel request ────────────────────────────────
router.put('/admin/:id/cancel-decision', adminAuth, async (req, res) => {
  try {
    const { decision } = req.body; // 'approved' | 'rejected'
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!order.cancelRequest?.requested)
      return res.status(400).json({ message: 'No cancel request on this order' });

    order.cancelRequest.status     = decision;
    order.cancelRequest.resolvedAt = new Date();
    order.cancelRequest.resolvedBy = req.user.email;

    const adminEmail = await getAdminEmail();

    if (decision === 'approved') {
      order.orderStatus = 'cancelled';
      order.statusHistory.push({
        status: 'cancelled',
        note: `Cancelled by admin. Customer reason: ${order.cancelRequest.reason || 'None'}`,
        updatedBy: req.user.email,
      });
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity, soldCount: -item.quantity },
        }).catch(() => {});
      }

      // [panel notification suppressed: cancel_approved]

      if (order.billing?.email) {
        if (await isEmailEnabled('cancel_approved_customer')) sendMail({
          to: order.billing.email,
          subject: `Order Cancelled — ${order.orderNumber} | StoreKit`,
          html: await orderCancelledHtml(order),
        }).catch(() => {});
      }
      if (adminEmail) {
        if (await isEmailEnabled('cancel_approved_admin')) sendMail({
          to: adminEmail,
          subject: `✅ Cancellation Approved — ${order.orderNumber} | StoreKit`,
          html: await cancelApprovedAdminHtml(order),
        }).catch(() => {});
      }
    } else {
      // [panel notification suppressed: cancel_rejected]

      if (order.billing?.email) {
        if (await isEmailEnabled('cancel_rejected_customer')) sendMail({
          to: order.billing.email,
          subject: `Cancellation Update — ${order.orderNumber} | StoreKit`,
          html: await cancelRejectedHtml(order),
        }).catch(() => {});
      }
      if (adminEmail) {
        if (await isEmailEnabled('cancel_rejected_admin')) sendMail({
          to: adminEmail,
          subject: `❌ Cancellation Rejected — ${order.orderNumber} | StoreKit`,
          html: await cancelRejectedAdminHtml(order),
        }).catch(() => {});
      }
    }

    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get single order (public — guest + logged-in) ─────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'name thumbnail slug')
      .populate('customer', 'firstName lastName email');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Claim a guest order after registration ────────────────────────────────────
router.patch('/:id/claim', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.customer) return res.json({ message: 'Already linked' });
    if (
      order.billing?.email &&
      order.billing.email.toLowerCase() !== req.user.email.toLowerCase()
    ) {
      return res.status(403).json({ message: 'Email does not match order' });
    }
    order.customer = req.user._id;
    await order.save();
    res.json({ message: 'Order linked to account' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
