/**
 * models/AutomationRule.js
 *
 * Stores automation rules for social media auto-posting.
 * One document per trigger type (new_product, product_discount, offer_active).
 */

const mongoose = require('mongoose');

const automationRuleSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    trigger: {
      type: String,
      enum: ['new_product', 'product_discount', 'offer_active', 'manual'],
      required: true,
    },
    label: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    platforms: {
      facebook:  { type: Boolean, default: false },
      instagram: { type: Boolean, default: false },
      tiktok:    { type: Boolean, default: false },
      whatsapp:  { type: Boolean, default: false },
      telegram:  { type: Boolean, default: false },
    },
    customMessage: {
      type: String,
      default: '',
    },
    minDiscountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  { timestamps: true }
);

automationRuleSchema.index({ tenantId: 1, trigger: 1 }, { unique: true });

module.exports = mongoose.model('AutomationRule', automationRuleSchema);