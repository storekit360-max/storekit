'use strict';

const mongoose = require('mongoose');

// A billing payment submitted by a tenant admin (e.g. "I paid Rs. 5,000 via
// bank transfer, here's the reference") for the super admin to review and
// approve. This is the SaaS subscription payment (tenant -> platform), not a
// customer order payment (customer -> tenant storefront) — that flow already
// exists in routes/payments.js and is unrelated.
const tenantPaymentSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  plan:   { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },

  amount:   { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR' },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },

  // The subscription period this payment is meant to cover. On approval the
  // tenant's billing.currentPeriodStart/End are set from these so the tenant
  // stays in sync with what was actually paid for.
  periodStart: { type: Date, required: true },
  periodEnd:   { type: Date, required: true },

  // How the tenant admin says they paid — free text since gateways vary
  // (bank transfer, PayHere, manual cash, etc.) and slip/reference number.
  method:    { type: String, default: 'bank_transfer', trim: true },
  reference: { type: String, default: '', trim: true },
  proofUrl:  { type: String, default: '', trim: true },
  note:      { type: String, default: '', trim: true },

  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt:  { type: Date, default: null },
  reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('TenantPayment', tenantPaymentSchema);
