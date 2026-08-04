'use strict';
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { Category } = require('../models/index');
const { adminAuth } = require('../middleware/auth');
const Order = require('../models/Order');
const TenantSequence = require('../models/TenantSequence');
const InventoryMovement = require('../models/InventoryMovement');
const { deductStock } = require('../services/inventoryService');
const HeldPosSale = require('../models/HeldPosSale');
const PosRefund = require('../models/PosRefund');
const PosShift = require('../models/PosShift');

async function nextNumber(tenantId, type) {
  const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const row = await TenantSequence.findOneAndUpdate({ tenantId, sequenceType: type, dateKey }, { $inc: { currentValue: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return `${type === 'pos_sale' ? 'POS' : 'RCP'}-${dateKey}-${String(row.currentValue).padStart(6, '0')}`;
}

function fail(res, code, message, items) { return res.status(400).json({ success: false, code, message, ...(items ? { items } : {}) }); }

router.post('/checkout', adminAuth, async (req, res) => {
  const tenantId = req.tenantId; const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!tenantId) return fail(res, 'UNAUTHORIZED', 'Tenant not resolved');
  if (!idempotencyKey) return fail(res, 'CHECKOUT_FAILED', 'Idempotency-Key is required');
  const existing = await Order.findOne({ tenantId, orderChannel: 'pos', 'pos.idempotencyKey': idempotencyKey }).lean();
  if (existing) return res.json({ success: true, duplicate: true, order: posOrderResponse(existing) });
  const input = Array.isArray(req.body.items) ? req.body.items : [];
  if (!input.length) return fail(res, 'EMPTY_CART', 'POS cart is empty');
  const payments = Array.isArray(req.body.payments) ? req.body.payments : [];
  const allowed = new Set(['cash','card','bank_transfer','qr','mobile_wallet']);
  if (!payments.length || payments.some(p => !allowed.has(p.method) || !(Number(p.amount) > 0))) return fail(res, 'INVALID_PAYMENT', 'Add valid payment amounts');
  let subtotal = 0; const lines = []; const deductions = []; let createdOrder = null;
  try {
    for (const item of input) {
      const product = await Product.findOne({ _id: item.productId, tenantId, isActive: true }).lean();
      if (!product) return fail(res, 'PRODUCT_NOT_FOUND', 'Product not found');
      const quantity = Number(item.quantity); if (!Number.isInteger(quantity) || quantity < 1) return fail(res, 'CHECKOUT_FAILED', 'Invalid quantity');
      let variant = null; let unit = priceOf(product);
      if (item.variantSku) { variant = (product.variantCombinations || []).find(v => v.sku === item.variantSku); if (!variant) return fail(res, 'VARIANT_NOT_FOUND', 'Variant not found'); unit = priceOf(variant); }
      if (item.clientPrice != null && Math.abs(Number(item.clientPrice) - unit) > 0.005) return fail(res, 'PRICE_CHANGED', `The price for ${product.name} changed. Refresh the cart and try again.`, [{ productId: product._id, currentPrice: unit }]);
      const deducted = await deductStock({ tenantId, productId: product._id, quantity, variant });
      if (!deducted) return fail(res, 'INSUFFICIENT_STOCK', `Insufficient stock for ${product.name}`);
      deductions.push({ productId: product._id, quantity, variant });
      const line = { product: product._id, name: product.name, image: product.thumbnail || product.images?.[0], price: unit, quantity, subtotal: unit * quantity, variantSku: variant?.sku || '' }; lines.push(line); subtotal += line.subtotal;
    }
    const total = Math.round(subtotal * 100) / 100; const paid = payments.reduce((s, p) => s + Number(p.amount), 0); const cash = payments.filter(p => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0);
    if (paid < total) { await restore(deductions, tenantId); return fail(res, 'PAYMENT_TOTAL_MISMATCH', 'Payment total is less than the sale total'); }
    const saleNumber = await nextNumber(tenantId, 'pos_sale'); const receiptNumber = await nextNumber(tenantId, 'pos_receipt'); const now = new Date();
    const order = await Order.create({ tenantId, orderNumber: saleNumber, orderChannel: 'pos', fulfillmentType: 'in_store', items: lines, billing: { firstName: req.body.guestCustomer?.name || 'Walk-in Customer', email: req.body.guestCustomer?.email || '', phone: req.body.guestCustomer?.phone || '' }, shipping: {}, paymentMethod: payments.length > 1 ? 'cash' : payments[0].method, paymentStatus: 'paid', orderStatus: 'delivered', subtotal, shippingCost: 0, tax: 0, total, deliveredAt: now, statusHistory: [{ status: 'delivered', note: 'POS sale completed', updatedBy: req.user?._id }], payments, pos: { saleNumber, receiptNumber, cashierId: req.user?._id, cashierName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(), completedAt: now, amountTendered: paid, changeGiven: Math.max(0, cash - total), idempotencyKey, clientRequestId: req.body.clientRequestId, terminalId: req.body.terminalId } });
    await InventoryMovement.insertMany(deductions.map(d => ({ tenantId, product: d.productId, variantSku: d.variant?.sku, movementType: 'pos_sale', quantityChange: -d.quantity, sourceType: 'pos_order', sourceId: order._id, orderNumber: order.orderNumber, receiptNumber, createdBy: req.user?._id, createdByName: order.pos.cashierName, idempotencyKey })));
    res.status(201).json({ success: true, order: posOrderResponse(order.toObject()) });
  } catch (err) { await restore(deductions, tenantId); if (err.code === 11000) { const duplicate = await Order.findOne({ tenantId, 'pos.idempotencyKey': idempotencyKey }).lean(); if (duplicate) return res.json({ success: true, duplicate: true, order: posOrderResponse(duplicate) }); } res.status(500).json({ success: false, code: 'CHECKOUT_FAILED', message: 'POS sale could not be completed' }); }
});

async function restore(rows, tenantId) { for (const row of rows) { if (row.variant) await Product.updateOne({ _id: row.productId, tenantId, 'variantCombinations.sku': row.variant.sku }, { $inc: { 'variantCombinations.$.stock': row.quantity, soldCount: -row.quantity } }); else await Product.updateOne({ _id: row.productId, tenantId }, { $inc: { stock: row.quantity, soldCount: -row.quantity } }); } }
function priceOf(p) { return Number(p.salePrice > 0 && p.salePrice < p.price ? p.salePrice : p.price || 0); }
function posOrderResponse(o) { return { id: o._id, orderNumber: o.orderNumber, saleNumber: o.pos?.saleNumber, receiptNumber: o.pos?.receiptNumber, subtotal: o.subtotal, tax: o.tax || 0, total: o.total, amountTendered: o.pos?.amountTendered || 0, changeGiven: o.pos?.changeGiven || 0, payments: o.payments || [], items: o.items || [], completedAt: o.pos?.completedAt }; }

router.post('/held-sales', adminAuth, async (req, res) => { if (!req.tenantId || !Array.isArray(req.body.items) || !req.body.items.length) return fail(res, 'INVALID_HOLD', 'A sale must contain items'); const sale = await HeldPosSale.create({ tenantId: req.tenantId, items: req.body.items, customer: req.body.customer, note: req.body.note, createdBy: req.user?._id, createdByName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() }); res.status(201).json({ success: true, sale }); });
router.get('/held-sales', adminAuth, async (req, res) => { const sales = await HeldPosSale.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).lean(); res.json({ sales }); });
router.post('/held-sales/:id/resume', adminAuth, async (req, res) => { const sale = await HeldPosSale.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean(); if (!sale) return res.status(404).json({ message: 'Held sale not found' }); const checked = []; const changes = []; for (const item of sale.items) { const p = await Product.findOne({ _id: item.productId, tenantId: req.tenantId, isActive: true }).lean(); if (!p) changes.push({ ...item, reason: 'Product unavailable' }); else { const v = item.variantSku ? (p.variantCombinations || []).find(x => x.sku === item.variantSku) : null; const price = v ? priceOf(v) : priceOf(p); const stock = v ? Number(v.stock || 0) : Number(p.stock || 0); if (stock < item.quantity) changes.push({ ...item, reason: 'Insufficient stock' }); else checked.push({ ...item, name: p.name, price, currentPrice: price }); } } res.json({ success: true, sale, items: checked, changes }); });
router.delete('/held-sales/:id', adminAuth, async (req, res) => { const result = await HeldPosSale.deleteOne({ _id: req.params.id, tenantId: req.tenantId }); if (!result.deletedCount) return res.status(404).json({ message: 'Held sale not found' }); res.json({ success: true }); });

router.post('/sales/:id/void', adminAuth, async (req, res) => { const reason = String(req.body.reason || '').trim(); if (!reason) return fail(res, 'VOID_REASON_REQUIRED', 'A void reason is required'); const order = await Order.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId, orderChannel: 'pos', 'pos.voidedAt': { $exists: false } }, { $set: { 'pos.voidedAt': new Date(), 'pos.voidReason': reason, 'pos.voidedBy': req.user?._id, paymentStatus: 'failed', orderStatus: 'cancelled' }, $push: { statusHistory: { status: 'cancelled', note: `POS sale voided: ${reason}`, updatedBy: req.user?._id } } }, { new: true }).lean(); if (!order) return res.status(409).json({ message: 'Sale not found or already voided' }); for (const item of order.items) await restore([{ productId: item.product, quantity: item.quantity, variant: item.variantSku ? { sku: item.variantSku } : null }], req.tenantId); res.json({ success: true, order: posOrderResponse(order) }); });

router.post('/sales/:id/refund', adminAuth, async (req, res) => { const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenantId, orderChannel: 'pos' }).lean(); if (!order) return res.status(404).json({ message: 'POS sale not found' }); const reason = String(req.body.reason || '').trim(); const requested = Array.isArray(req.body.items) ? req.body.items : []; if (!reason || !requested.length) return fail(res, 'INVALID_REFUND', 'Refund items and reason are required'); const prior = await PosRefund.find({ tenantId: req.tenantId, order: order._id }).lean(); const used = prior.flatMap(r => r.items).reduce((m, x) => m.set(String(x.productId) + ':' + (x.variantSku || ''), (m.get(String(x.productId) + ':' + (x.variantSku || '')) || 0) + Number(x.quantity || 0)), new Map()); let amount = 0; const items = []; for (const x of requested) { const original = order.items.find(i => String(i.product) === String(x.productId) && (i.variantSku || '') === (x.variantSku || '')); const key = String(x.productId) + ':' + (x.variantSku || ''); const qty = Number(x.quantity); if (!original || !Number.isInteger(qty) || qty < 1 || qty + (used.get(key) || 0) > original.quantity) return fail(res, 'REFUND_EXCEEDS_SOLD', 'Refund quantity exceeds the sold quantity'); const restocked = Boolean(x.restocked) && !Boolean(x.damaged); items.push({ productId: x.productId, variantSku: x.variantSku, quantity: qty, amount: Number(original.price) * qty, restocked, damaged: Boolean(x.damaged) }); amount += Number(original.price) * qty; if (restocked) await restore([{ productId: x.productId, quantity: qty, variant: x.variantSku ? { sku: x.variantSku } : null }], req.tenantId); } const refund = await PosRefund.create({ tenantId: req.tenantId, order: order._id, refundNumber: `RF-${Date.now()}`, items, amount, reason, paymentMethod: req.body.paymentMethod || 'cash', createdBy: req.user?._id, createdByName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() }); res.status(201).json({ success: true, refund }); });

router.post('/shifts/open', adminAuth, async (req, res) => { const existing = await PosShift.findOne({ tenantId: req.tenantId, cashierId: req.user?._id, status: 'open' }); if (existing) return res.json({ success: true, shift: existing }); const shift = await PosShift.create({ tenantId: req.tenantId, cashierId: req.user?._id, cashierName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(), openingCash: Math.max(0, Number(req.body.openingCash || 0)) }); res.status(201).json({ success: true, shift }); });
router.get('/shifts/current', adminAuth, async (req, res) => { res.json({ shift: await PosShift.findOne({ tenantId: req.tenantId, cashierId: req.user?._id, status: 'open' }).lean() }); });
router.get('/shifts', adminAuth, async (req, res) => { res.json({ shifts: await PosShift.find({ tenantId: req.tenantId }).sort({ openedAt: -1 }).limit(100).lean() }); });
router.post('/shifts/:id/close', adminAuth, async (req, res) => { const shift = await PosShift.findOne({ _id: req.params.id, tenantId: req.tenantId, cashierId: req.user?._id, status: 'open' }); if (!shift) return res.status(404).json({ message: 'Open shift not found' }); shift.countedCash = Number(req.body.countedCash || 0); shift.expectedCash = shift.openingCash + shift.cashSales - shift.refunds; shift.difference = shift.countedCash - shift.expectedCash; shift.status = 'closed'; shift.closedAt = new Date(); shift.closeNote = req.body.note || ''; await shift.save(); res.json({ success: true, shift }); });

router.get('/sales', adminAuth, async (req, res) => { const page = Math.max(1, Number(req.query.page) || 1); const limit = 25; const filter = { tenantId: req.tenantId, orderChannel: 'pos' }; const [orders, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Order.countDocuments(filter)]); res.json({ orders: orders.map(posOrderResponse), page, pages: Math.ceil(total / limit), total }); });
router.get('/sales/receipt/:receiptNumber', adminAuth, async (req, res) => { const order = await Order.findOne({ tenantId: req.tenantId, orderChannel: 'pos', 'pos.receiptNumber': String(req.params.receiptNumber).trim() }).lean(); if (!order) return res.status(404).json({ message: 'Receipt not found' }); res.json(posOrderResponse(order)); });
router.get('/sales/:id', adminAuth, async (req, res) => { const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenantId, orderChannel: 'pos' }).lean(); if (!order) return res.status(404).json({ message: 'POS sale not found' }); res.json(posOrderResponse(order)); });
router.get('/checkout/status/:idempotencyKey', adminAuth, async (req, res) => { const order = await Order.findOne({ tenantId: req.tenantId, orderChannel: 'pos', 'pos.idempotencyKey': req.params.idempotencyKey }).lean(); res.json({ found: Boolean(order), order: order ? posOrderResponse(order) : null }); });

router.get('/products/search', adminAuth, async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    const inStock = req.query.inStock === 'true';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 24));
    const filter = { tenantId: req.tenantId, isActive: true };
    if (category) filter.category = category;
    if (inStock) filter.stock = { $gt: 0 };
    if (q) {
      const exact = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: exact, $options: 'i' } }, { sku: exact }, { gtin: exact }, { brand: { $regex: exact, $options: 'i' } },
        { 'variantCombinations.sku': exact }, { 'variantCombinations.gtin': exact },
      ];
    }
    const [products, total, categories] = await Promise.all([
      Product.find(filter).select('name price salePrice stock sku gtin brand category variants variantCombinations soldCount').populate('category', 'name').sort(q ? { name: 1 } : { soldCount: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
      Category.find({ tenantId: req.tenantId, isActive: true }).select('_id name').sort({ name: 1 }).lean(),
    ]);
    res.json({ products, categories, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: 'Could not search POS products' }); }
});

module.exports = router;
