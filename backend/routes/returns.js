const express = require('express');
const router  = express.Router();
const { ReturnRequest, Notification } = require('../models/index');
const Order   = require('../models/Order');
const Product = require('../models/Product');
const { auth, adminAuth } = require('../middleware/auth');
const {
  sendMail, getAdminEmail, isEmailEnabled,
  returnRequestCustomerHtml, returnRequestAdminHtml,
  returnApprovedCustomerHtml, returnRejectedCustomerHtml,
  returnReceivedCustomerHtml, returnRefundedCustomerHtml,
  returnStatusAdminHtml,
} = require('../utils/mailer');

// ── Status label helpers ──────────────────────────────────────────────────────
const STATUS_LABELS = {
  pending:  'Pending ⏳',
  approved: 'Approved ✅',
  rejected: 'Rejected ❌',
  received: 'Item Received 📦',
  refunded: 'Refunded 💰',
};

// ── Stock adjustment helper ───────────────────────────────────────────────────
// Called once when return reaches 'refunded' status.
// Only items marked 'restockable' get stock added back; others are written off.
async function adjustStockForReturn(returnReq) {
  if (returnReq.stockProcessed) return; // idempotent guard

  for (const item of returnReq.items) {
    if (!item.product) continue;

    if (item.itemConditionOnReturn === 'restockable' && !item.stockAdjusted) {
      // Add the returned quantity back to product stock
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity || 1 }
      });
      item.stockAdjusted = true;
    }
    // 'damaged' and 'refurbishable' → no stock change
  }

  returnReq.stockProcessed = true;
}

// ── Customer — Submit return request ──────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { order, items, reason, description, images } = req.body;

    // Validate order belongs to this customer
    const orderDoc = await Order.findOne({ _id: order, customer: req.user._id });
    if (!orderDoc) {
      return res.status(404).json({ message: 'Order not found or does not belong to you.' });
    }

    // Block duplicate / active return requests
    const existingReturn = await ReturnRequest.findOne({
      order,
      customer: req.user._id,
      status: { $in: ['pending', 'approved', 'received', 'refunded'] },
    });

    if (existingReturn) {
      const statusMessages = {
        pending:  'You already have a pending return request for this order.',
        approved: 'Your return request for this order has already been approved.',
        received: 'Your return item has already been received and is being processed.',
        refunded: 'This order has already been refunded.',
      };
      return res.status(400).json({
        message: statusMessages[existingReturn.status] || 'A return request already exists for this order.',
      });
    }

    // Enrich items with price from order for refund calculation
    // Strip admin-only fields (itemConditionOnReturn, stockAdjusted) so they
    // never arrive as null/invalid enum values from the customer request.
    const enrichedItems = (items || []).map(item => {
      const orderItem = orderDoc.items.find(
        oi => (oi.product?._id || oi.product)?.toString() === item.product?.toString()
      );
      const { itemConditionOnReturn, stockAdjusted, ...safeItem } = item;
      return { ...safeItem, price: orderItem?.price || 0 };
    });

    const returnReq = await ReturnRequest.create({
      order,
      customer:      req.user._id,
      customerEmail: req.user.email,
      items:         enrichedItems,
      reason,
      description,
      images: images || [],
    });

    await returnReq.populate('order', 'orderNumber total');

    const returnId     = returnReq._id.toString().slice(-8).toUpperCase();
    const orderNumber  = returnReq.order?.orderNumber || 'N/A';
    const customerName = `${req.user.firstName} ${req.user.lastName}`;

    // In-app notification (admin)
    await Notification.create({
      type:    'return_request',
      title:   '🔄 New Return Request',
      message: `${customerName} submitted a return request for order ${orderNumber}`,
      link:    `/admin/returns/${returnReq._id}`,
      data:    { returnId: returnReq._id, orderNumber },
    }).catch(() => {});

    // Email customer
    if (req.user.email && await isEmailEnabled('return_request_customer')) {
      sendMail({
        to:      req.user.email,
        subject: `Return Request Received — Order ${orderNumber} | StoreKit`,
        html:    await returnRequestCustomerHtml({ customerName, orderNumber, returnId, reason, description, items }),
      }).catch(err => console.error('[RETURN REQUEST CUSTOMER EMAIL]', err.message));
    }

    // Email admin
    if (await isEmailEnabled('return_request_admin')) {
      const adminEmail = await getAdminEmail();
      if (adminEmail) {
        sendMail({
          to:      adminEmail,
          subject: `[Admin] 🔄 New Return Request — Order ${orderNumber}`,
          html:    await returnRequestAdminHtml({
            customerName, customerEmail: req.user.email,
            customerPhone: req.user.phone || '', orderNumber,
            orderId: returnReq.order?._id, returnId, reason, description, items,
          }),
        }).catch(err => console.error('[RETURN REQUEST ADMIN EMAIL]', err.message));
      }
    }

    res.status(201).json(returnReq);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Customer — My return requests ─────────────────────────────────────────────
router.get('/my-returns', auth, async (req, res) => {
  try {
    const returns = await ReturnRequest.find({ customer: req.user._id })
      .populate('order', 'orderNumber total orderStatus')
      .sort({ createdAt: -1 });
    res.json(returns);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — All return requests ───────────────────────────────────────────────
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    const total   = await ReturnRequest.countDocuments(filter);
    const returns = await ReturnRequest.find(filter)
      .populate('order', 'orderNumber total createdAt orderStatus paymentStatus')
      .populate('customer', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ returns, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — Get single return ─────────────────────────────────────────────────
router.get('/admin/:id', adminAuth, async (req, res) => {
  try {
    const ret = await ReturnRequest.findById(req.params.id)
      .populate({
        path: 'order',
        populate: { path: 'items.product', select: 'name stock thumbnail' }
      })
      .populate('customer', 'firstName lastName email phone');
    if (!ret) return res.status(404).json({ message: 'Return request not found' });
    res.json(ret);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin — Update return status ──────────────────────────────────────────────
router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const {
      status, adminNote,
      refundAmount, courierCharge, refundMethod,
      itemConditions, // { [itemIndex]: 'restockable' | 'refurbishable' | 'damaged' }
    } = req.body;

    // Load the full return doc (not lean — we need .save() for nested updates)
    const ret = await ReturnRequest.findById(req.params.id)
      .populate('order', 'orderNumber total orderStatus paymentStatus')
      .populate('customer', 'firstName lastName email phone');

    if (!ret) return res.status(404).json({ message: 'Return request not found' });

    // ── Apply item condition markings ────────────────────────────────────────
    if (itemConditions && typeof itemConditions === 'object') {
      Object.entries(itemConditions).forEach(([idx, cond]) => {
        if (ret.items[idx]) {
          ret.items[idx].itemConditionOnReturn = cond;
        }
      });
    }

    // ── Compute net refund amount ─────────────────────────────────────────────
    const grossRefund  = Number(refundAmount) || 0;
    const courier      = Number(courierCharge) || 0;
    const netRefund    = Math.max(0, grossRefund - courier);

    ret.status         = status;
    ret.adminNote      = adminNote;
    ret.refundAmount   = grossRefund;
    ret.courierCharge  = courier;
    ret.netRefundAmount = netRefund;
    if (refundMethod) ret.refundMethod = refundMethod;
    ret.updatedAt      = Date.now();

    // ── When status becomes 'refunded': adjust stock + update order ──────────
    if (status === 'refunded') {
      // 1. Adjust stock per item condition
      await adjustStockForReturn(ret);

      // 2. Update the linked order → refunded
      if (ret.order?._id && !ret.orderStatusUpdated) {
        await Order.findByIdAndUpdate(ret.order._id, {
          orderStatus:   'refunded',
          paymentStatus: 'refunded',
          updatedAt:     Date.now(),
          $push: {
            statusHistory: {
              status:    'refunded',
              note:      `Return processed. Refunded Rs. ${netRefund.toLocaleString()} to customer (courier deduction: Rs. ${courier.toLocaleString()}).`,
              updatedBy: 'admin',
              updatedAt: new Date(),
            }
          }
        });
        ret.orderStatusUpdated = true;
      }
    }

    await ret.save();

    // Re-populate for response
    await ret.populate('order', 'orderNumber total orderStatus paymentStatus');

    const customerName  = `${ret.customer?.firstName || ''} ${ret.customer?.lastName || ''}`.trim();
    const customerEmail = ret.customerEmail || ret.customer?.email;
    const orderNumber   = ret.order?.orderNumber || 'N/A';
    const returnId      = ret._id.toString().slice(-8).toUpperCase();

    // In-app notification
    await Notification.create({
      type:    'return_status',
      title:   `Return ${STATUS_LABELS[status] || status}`,
      message: `Return #${returnId} for order ${orderNumber} (${customerName}) updated to ${status}`,
      link:    `/admin/returns/${ret._id}`,
      data:    { returnId: ret._id, status, orderNumber },
    }).catch(() => {});

    // Customer emails
    if (customerEmail) {
      const basePayload = { customerName, orderNumber, returnId, adminNote };

      if (status === 'approved' && await isEmailEnabled('return_approved_customer')) {
        sendMail({
          to:      customerEmail,
          subject: `Return Approved — Order ${orderNumber} | StoreKit`,
          html:    await returnApprovedCustomerHtml({ ...basePayload, refundAmount: netRefund, refundMethod }),
        }).catch(err => console.error('[RETURN APPROVED EMAIL]', err.message));
      }

      if (status === 'rejected' && await isEmailEnabled('return_rejected_customer')) {
        sendMail({
          to:      customerEmail,
          subject: `Return Request Update — Order ${orderNumber} | StoreKit`,
          html:    await returnRejectedCustomerHtml(basePayload),
        }).catch(err => console.error('[RETURN REJECTED EMAIL]', err.message));
      }

      if (status === 'received' && await isEmailEnabled('return_received_customer')) {
        sendMail({
          to:      customerEmail,
          subject: `We Received Your Return — Order ${orderNumber} | StoreKit`,
          html:    await returnReceivedCustomerHtml(basePayload),
        }).catch(err => console.error('[RETURN RECEIVED EMAIL]', err.message));
      }

      if (status === 'refunded' && await isEmailEnabled('return_refunded_customer')) {
        sendMail({
          to:      customerEmail,
          subject: `Refund Processed — Order ${orderNumber} | StoreKit`,
          html:    await returnRefundedCustomerHtml({
            ...basePayload,
            refundAmount:   netRefund,
            courierCharge:  courier,
            grossRefund,
            refundMethod,
          }),
        }).catch(err => console.error('[RETURN REFUNDED EMAIL]', err.message));
      }
    }

    // Admin copy
    if (await isEmailEnabled('return_status_admin')) {
      const adminEmail = await getAdminEmail();
      if (adminEmail) {
        sendMail({
          to:      adminEmail,
          subject: `[Admin] Return ${status.toUpperCase()} — Order ${orderNumber}`,
          html:    await returnStatusAdminHtml({
            customerName, customerEmail, orderNumber, returnId,
            newStatus: status,
            refundAmount: netRefund, courierCharge: courier, grossRefund,
            refundMethod, adminNote,
          }),
        }).catch(err => console.error('[RETURN STATUS ADMIN EMAIL]', err.message));
      }
    }

    res.json(ret);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;