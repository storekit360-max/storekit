'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, enum: ['percent', 'fixed'], required: true },
  value: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR', uppercase: true, trim: true },
  applicablePlanIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Plan', default: [] },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  maxRedemptions: { type: Number, min: 0, default: 0 },
  maxRedemptionsPerTenant: { type: Number, min: 1, default: 1 },
  redemptionCount: { type: Number, min: 0, default: 0 },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.models.BillingCoupon || mongoose.model('BillingCoupon', schema);
