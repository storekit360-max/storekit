'use strict';

const mongoose = require('mongoose');

const subscriptionPaymentSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionInvoice', default: null, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR' },
  billingCycle: { type: String, enum: ['monthly', 'yearly', 'once'], default: 'monthly' },
  method: { type: String, default: 'manual' },
  transactionId: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'succeeded', 'failed', 'refunded'], default: 'succeeded', index: true },
  failureReason: { type: String, default: '' },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  paidAt: { type: Date, default: Date.now },
  notes: { type: String, default: '' },
}, { timestamps: true });

subscriptionPaymentSchema.index({ tenant: 1, createdAt: -1 });

module.exports = mongoose.models.SubscriptionPayment || mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
