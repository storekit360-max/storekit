'use strict';

const mongoose = require('mongoose');

const draftSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  scheduleDraftGroup: { type: String, required: true, trim: true, index: true },
  scheduleName: { type: String, required: true, trim: true },
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialSchedule', default: null },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  platform: { type: String, enum: ['facebook', 'instagram'], required: true },
  scheduledFor: { type: Date, required: true },
  generatedContent: { type: String, required: true },
  editedContent: { type: String, default: '' },
  verifiedFeatures: [{ type: String, maxlength: 240 }],
  hashtags: [{ type: String, maxlength: 80 }],
  media: [{ url: String, order: Number, included: { type: Boolean, default: true } }],
  priceSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  manualOfferPrice: { type: Number, default: null, min: 0 },
  voucherSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  productSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  cta: { type: String, enum: ['none', 'shop_now', 'whatsapp'], default: 'none' },
  productUrl: { type: String, default: '' },
  validation: {
    valid: { type: Boolean, default: false },
    errors: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
  },
  confirmationStatus: { type: String, enum: ['awaiting', 'confirmed', 'invalid'], default: 'awaiting' },
  configSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  confirmedAt: { type: Date, default: null },
}, { timestamps: true });

draftSchema.index({ tenantId: 1, scheduleDraftGroup: 1, createdAt: 1 });
draftSchema.index({ tenantId: 1, confirmationStatus: 1, createdAt: -1 });
draftSchema.index({ tenantId: 1, scheduleDraftGroup: 1, product: 1, platform: 1 }, { unique: true });

module.exports = mongoose.models.SocialPostDraft || mongoose.model('SocialPostDraft', draftSchema);
