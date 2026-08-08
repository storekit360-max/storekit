const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  orderNumber: { type: String, required: true, default: () => 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase() },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  guestInfo: {
    firstName: String, lastName: String,
    email: String, phone: String
  },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    image: String,
    price: Number,
    quantity: Number,
    subtotal: Number,
    variantSku: String
  }],
  billing: {
    firstName: String, lastName: String,
    country: String, street: String,
    city: String, phone: String, email: String
  },
  shipping: {
    firstName: String, lastName: String,
    country: String, street: String,
    city: String, phone: String
  },
  shipToDifferentAddress: { type: Boolean, default: false },
  paymentMethod: { type: String, enum: ['cash', 'card', 'qr', 'mobile_wallet', 'bank_transfer', 'cod', 'free', 'payhere', 'stripe', 'paypal', 'payzy', 'koko'], required: true },
  orderChannel: { type: String, enum: ['online', 'pos', 'manual'], default: 'online', index: true },
  fulfillmentType: { type: String, enum: ['delivery', 'pickup', 'in_store'], default: 'delivery' },
  pos: {
    saleNumber: String, receiptNumber: String, cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, cashierName: String,
    completedAt: Date, amountTendered: { type: Number, default: 0 }, changeGiven: { type: Number, default: 0 }, idempotencyKey: String, clientRequestId: String, terminalId: String,
    voidedAt: Date, voidReason: String, voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  payments: [{ method: { type: String, enum: ['cash','card','bank_transfer','qr','mobile_wallet'] }, amount: { type: Number, required: true }, reference: String, status: { type: String, enum: ['paid','pending','failed'], default: 'paid' }, receivedAt: { type: Date, default: Date.now } }],
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  statusHistory: [{
    status: String,
    note: String,
    updatedAt: { type: Date, default: Date.now },
    updatedBy: String
  }],
  couponCode: { type: String },
  couponDiscount: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
  notes: { type: String },
  trackingNumber: { type: String },
  deliveryPartner: { type: String },
  estimatedDelivery: { type: Date },
  deliveryService: { type: String, default: 'standard', trim: true },
  deliveryServiceName: { type: String, default: 'Standard Delivery', trim: true },
  courier: {
    provider: { type: String, default: '' },
    externalId: { type: String, default: '' },
    waybill: { type: String, default: '' },
    submittedAt: Date,
    lastSynchronizedAt: Date,
    externalStatus: { type: String, default: '' },
    trackingEvents: [{ status: String, dateTime: Date, dateTimeAgo: String, user: String, _id: false }],
    dryRun: { type: Boolean, default: false },
    dryRunReference: { type: String, default: '' },
    submissionState: { type: String, enum: ['not_submitted','submitting','submitted','failed','reconciliation_required'], default: 'not_submitted' },
    submissionError: { type: String, default: '' },
    submissionAttemptId: { type: String, default: '' },
    destinationCity: { type: String, default: '' },
    destinationState: { type: String, default: '' },
    packageWeight: Number,
    manualWaybill: { type: String, default: '' },
  },
  deliveredAt: { type: Date },
  isRead: { type: Boolean, default: false },
  giftCard: { type: String },
  giftCardDiscount: { type: Number, default: 0 },
  paymentSlip: { type: String }, // URL to uploaded bank transfer slip
  paymentSlipUploadedAt: { type: Date },
  cancelRequest: {
    requested:   { type: Boolean, default: false },
    requestedAt: { type: Date },
    reason:      { type: String },
    status:      { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
    resolvedAt:  { type: Date },
    resolvedBy:  { type: String },
  },

  // ── Admin tracking ──────────────────────────────────────────────────────
  adminNotes: [{
    note:      { type: String, required: true },
    addedBy:   { type: String },
    addedAt:   { type: Date, default: Date.now },
  }],
  lastActionAt:  { type: Date, default: Date.now },

  // ── Meta Pixel / CAPI deduplication ─────────────────────────────────────
  // metaEventId: the same event_id used in both the browser fbq Purchase call
  // and the backend CAPI sendPurchaseEvent call. Stored so OrderSuccess.js can
  // reuse it when the page is refreshed or visited cross-device, ensuring the
  // browser pixel always fires with an ID that matches what CAPI already sent.
  metaEventId: { type: String },
  metaFbp:     { type: String }, // _fbp cookie for Meta audience tracking
  metaFbc:     { type: String }, // _fbc cookie for Meta click attribution

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Payzy drafts intentionally remain hidden from operational order workflows until
// the signed callback confirms payment.
orderSchema.add({
  isPaymentDraft: { type: Boolean, default: false, index: true },
  paymentDraftExpiresAt: { type: Date, index: true },
  payzy: {
    signedRequest: { type: mongoose.Schema.Types.Mixed },
    signedFieldNames: String,
    paymentReference: String,
    callbackProcessedAt: Date,
    notificationsSentAt: Date,
    stockRestoredAt: Date,
    installmentPlan: { type: mongoose.Schema.Types.Mixed },
    returnOrigin: String,
  },
  koko: {
    signedRequest: { type: mongoose.Schema.Types.Mixed },
    paymentReference: String,
    callbackProcessedAt: Date,
    stockRestoredAt: Date,
    returnOrigin: String,
  },
});

orderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ tenantId: 1, deliveryService: 1, orderStatus: 1, 'courier.lastSynchronizedAt': 1 });
orderSchema.index({ tenantId: 1, 'courier.provider': 1, 'courier.submissionState': 1 });
orderSchema.index({ tenantId: 1, 'courier.waybill': 1 }, { sparse: true });
orderSchema.index({ tenantId: 1, orderStatus: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, paymentStatus: 1, orderStatus: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, isRead: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, 'pos.idempotencyKey': 1 }, { unique: true, sparse: true });

orderSchema.pre('save', function(next) {
  if (!this.orderNumber) {
    this.orderNumber = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', orderSchema);
