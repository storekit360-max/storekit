'use strict';

const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
}, { _id: false });

const subscriptionInvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, trim: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly', 'once'], default: 'monthly' },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  currency: { type: String, default: 'LKR' },
  lineItems: { type: [lineItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  couponCode: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'issued', 'paid', 'void', 'overdue'], default: 'issued', index: true },
  dueDate: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  notes: { type: String, default: '' },
}, { timestamps: true });

subscriptionInvoiceSchema.index({ tenant: 1, createdAt: -1 });
subscriptionInvoiceSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.models.SubscriptionInvoice || mongoose.model('SubscriptionInvoice', subscriptionInvoiceSchema);
