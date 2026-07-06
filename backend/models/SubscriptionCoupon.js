'use strict';

const mongoose = require('mongoose');

const subscriptionCouponSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true, unique: true },
  name: { type: String, default: '' },
  type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  value: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR' },
  billingCycles: [{ type: String, enum: ['monthly', 'yearly', 'once'] }],
  planIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }],
  maxRedemptions: { type: Number, default: 0 },
  redemptionCount: { type: Number, default: 0 },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, default: null },
  active: { type: Boolean, default: true },
  notes: { type: String, default: '' },
}, { timestamps: true });

subscriptionCouponSchema.methods.isUsableFor = function isUsableFor(planId, billingCycle) {
  const now = new Date();
  if (!this.active) return false;
  if (this.validFrom && this.validFrom > now) return false;
  if (this.validUntil && this.validUntil < now) return false;
  if (this.maxRedemptions > 0 && this.redemptionCount >= this.maxRedemptions) return false;
  if (this.billingCycles?.length && !this.billingCycles.includes(billingCycle)) return false;
  if (this.planIds?.length && !this.planIds.some(id => String(id) === String(planId))) return false;
  return true;
};

module.exports = mongoose.models.SubscriptionCoupon || mongoose.model('SubscriptionCoupon', subscriptionCouponSchema);
