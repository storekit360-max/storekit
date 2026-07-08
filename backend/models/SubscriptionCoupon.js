'use strict';
const mongoose = require('mongoose');
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true, unique: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  value: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  maxRedemptions: { type: Number, default: 0 },
  redeemedCount: { type: Number, default: 0 },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, default: null },
  appliesToPlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }],
}, { timestamps: true });
module.exports = mongoose.models.SubscriptionCoupon || mongoose.model('SubscriptionCoupon', couponSchema);
