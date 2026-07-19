'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingCoupon', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantPayment', required: true, unique: true },
  status: { type: String, enum: ['reserved', 'redeemed', 'released'], default: 'reserved', index: true },
  discountAmount: { type: Number, required: true, min: 0 },
  reservedAt: { type: Date, default: Date.now },
  redeemedAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ couponId: 1, tenantId: 1, status: 1 });

module.exports = mongoose.models.BillingCouponRedemption || mongoose.model('BillingCouponRedemption', schema);
