'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantPayment', default: null, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionInvoice', default: null },
  provider: { type: String, enum: ['manual', 'stripe', 'system'], required: true },
  providerAttemptId: { type: String, default: undefined, trim: true },
  attemptNumber: { type: Number, min: 1, default: 1 },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, trim: true },
  status: { type: String, enum: ['processing', 'succeeded', 'failed', 'requires_action'], required: true, index: true },
  failureCode: { type: String, default: '', maxlength: 100 },
  failureMessage: { type: String, default: '', maxlength: 500 },
  occurredAt: { type: Date, default: Date.now, required: true },
}, { timestamps: true });

schema.index({ tenantId: 1, occurredAt: -1 });
schema.index({ provider: 1, providerAttemptId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.BillingPaymentAttempt || mongoose.model('BillingPaymentAttempt', schema);
