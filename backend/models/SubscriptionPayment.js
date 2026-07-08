'use strict';
const mongoose = require('mongoose');
const paymentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionInvoice', default: null, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'LKR' },
  method: { type: String, enum: ['manual_bank', 'cash', 'card', 'gateway', 'other'], default: 'manual_bank' },
  reference: { type: String, default: '' },
  proofUrl: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'failed'], default: 'pending', index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: Date,
  note: { type: String, default: '' },
}, { timestamps: true });
module.exports = mongoose.models.SubscriptionPayment || mongoose.model('SubscriptionPayment', paymentSchema);
