'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantPayment', required: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionInvoice', default: null },
  provider: { type: String, enum: ['manual', 'stripe'], required: true },
  providerRefundId: { type: String, default: '', trim: true },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, uppercase: true },
  status: { type: String, enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled'], required: true, index: true },
  reason: { type: String, enum: ['duplicate', 'fraudulent', 'requested_by_customer', 'other'], default: 'requested_by_customer' },
  note: { type: String, default: '', maxlength: 1000 },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  processedAt: { type: Date, default: null },
  failureMessage: { type: String, default: '', maxlength: 500 },
  idempotencyKey: { type: String, required: true, unique: true },
}, { timestamps: true });

schema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.models.BillingRefund || mongoose.model('BillingRefund', schema);
