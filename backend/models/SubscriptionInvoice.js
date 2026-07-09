'use strict';
const mongoose = require('mongoose');

const subscriptionInvoiceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  invoiceNumber: { type: String, required: true, unique: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR', uppercase: true },
  billingCycle: { type: String, enum: ['monthly','yearly','once'], default: 'monthly' },
  status: { type: String, enum: ['draft','issued','paid','void'], default: 'issued' },
  dueAt: Date,
  paidAt: Date,
  periodStart: Date,
  periodEnd: Date,
  notes: String,
}, { timestamps: true });

module.exports = mongoose.models.SubscriptionInvoice || mongoose.model('SubscriptionInvoice', subscriptionInvoiceSchema);
