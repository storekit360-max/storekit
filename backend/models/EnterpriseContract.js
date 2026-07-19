'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  contractNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  status: { type: String, enum: ['draft', 'active', 'expired', 'terminated'], default: 'draft', index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly', 'once'], required: true },
  paymentTermsDays: { type: Number, min: 0, max: 365, default: 30 },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, default: null },
  autoRenew: { type: Boolean, default: false },
  purchaseOrder: { type: String, default: '', maxlength: 120 },
  notes: { type: String, default: '', maxlength: 2000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ tenantId: 1, status: 1, startsAt: -1 });

module.exports = mongoose.models.EnterpriseContract || mongoose.model('EnterpriseContract', schema);
