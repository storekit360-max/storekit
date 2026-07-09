'use strict';
const mongoose = require('mongoose');

const subscriptionPaymentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR', uppercase: true },
  billingCycle: { type: String, enum: ['monthly','yearly','once'], default: 'monthly' },
  status: { type: String, enum: ['pending','approved','rejected','failed'], default: 'pending', index: true },
  proofUrl: { type: String, default: '' },
  note: { type: String, default: '' },
  adminNote: { type: String, default: '' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: Date,
  periodStart: Date,
  periodEnd: Date,
}, { timestamps: true });

module.exports = mongoose.models.SubscriptionPayment || mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
