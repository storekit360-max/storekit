'use strict';

const mongoose = require('mongoose');

const scheduledSocialPostSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialSchedule', required: true, index: true },
  draft: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialPostDraft', default: null },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  platform: { type: String, enum: ['facebook', 'instagram'], required: true, index: true },
  content: { type: String, required: true },
  generatedContent: { type: String, default: '' },
  verifiedFeatures: [{ type: String }],
  hashtags: [{ type: String }],
  media: [{ url: String, order: Number, included: { type: Boolean, default: true }, platformMediaId: String }],
  cta: { type: String, enum: ['none', 'shop_now', 'whatsapp'], default: 'none' },
  productUrl: { type: String, required: true },
  scheduledFor: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'published', 'failed', 'skipped', 'cancelled', 'needs_review'],
    default: 'pending',
    index: true,
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  nextAttemptAt: { type: Date, default: null },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: String, default: '' },
  idempotencyKey: { type: String, required: true },
  cycle: { type: Number, default: 0, min: 0 },
  lastError: { type: String, default: '' },
  lastErrorCode: { type: String, default: '' },
  publishedPostId: { type: String, default: '' },
  publishedUrl: { type: String, default: '' },
  publishedAt: { type: Date, default: null },
  priceSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  manualOfferPrice: { type: Number, default: null, min: 0 },
  voucherSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  productSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  changePolicy: { type: String, enum: ['needs_review', 'regenerate'], default: 'needs_review' },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });

scheduledSocialPostSchema.index({ tenantId: 1, status: 1, scheduledFor: 1, nextAttemptAt: 1 });
scheduledSocialPostSchema.index({ tenantId: 1, schedule: 1, status: 1 });
scheduledSocialPostSchema.index({ tenantId: 1, platform: 1, createdAt: -1 });
scheduledSocialPostSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.models.ScheduledSocialPost || mongoose.model('ScheduledSocialPost', scheduledSocialPostSchema);
