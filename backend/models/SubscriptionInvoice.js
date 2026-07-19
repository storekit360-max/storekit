'use strict';
const mongoose = require('mongoose');

const subscriptionInvoiceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  invoiceNumber: { type: String, required: true, unique: true },
  amount: { type: Number, required: true, min: 0 },
  subtotal: { type: Number, required: true, min: 0, default: 0 },
  discountAmount: { type: Number, min: 0, default: 0 },
  taxAmount: { type: Number, min: 0, default: 0 },
  taxLines: { type: [{ name: String, rate: Number, amount: Number, inclusive: Boolean }], default: [] },
  couponCode: { type: String, default: '', uppercase: true, trim: true },
  currency: { type: String, default: 'LKR', uppercase: true },
  billingCycle: { type: String, enum: ['monthly','yearly','once'], default: 'monthly' },
  status: { type: String, enum: ['draft','open','issued','paid','past_due','void','uncollectible','refunded','partially_refunded'], default: 'issued', index: true },
  dueAt: Date,
  paidAt: Date,
  periodStart: Date,
  periodEnd: Date,
  notes: String,
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantPayment', default: null },
  provider: { type: String, enum: ['manual', 'stripe'], default: 'manual' },
  providerInvoiceId: { type: String, default: undefined, trim: true },
  hostedInvoiceUrl: { type: String, default: '', trim: true },
  refundedAmount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

subscriptionInvoiceSchema.index({ provider: 1, providerInvoiceId: 1 }, { unique: true, sparse: true });
subscriptionInvoiceSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.models.SubscriptionInvoice || mongoose.model('SubscriptionInvoice', subscriptionInvoiceSchema);
