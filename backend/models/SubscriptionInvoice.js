'use strict';
const mongoose = require('mongoose');
const invoiceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
  invoiceNumber: { type: String, required: true, unique: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  periodStart: Date,
  periodEnd: Date,
  dueDate: Date,
  currency: { type: String, default: 'LKR' },
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'unpaid', 'pending_review', 'paid', 'rejected', 'void', 'overdue'], default: 'unpaid', index: true },
  notes: { type: String, default: '' },
  paymentProofUrl: { type: String, default: '' },
  paidAt: Date,
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
module.exports = mongoose.models.SubscriptionInvoice || mongoose.model('SubscriptionInvoice', invoiceSchema);
