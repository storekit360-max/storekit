'use strict';

const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  draftGroup: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'stopped', 'failed'],
    default: 'draft',
    index: true,
  },
  platforms: [{ type: String, enum: ['facebook', 'instagram'] }],
  timezone: { type: String, required: true, default: 'Asia/Colombo' },
  startDate: { type: String, required: true },
  dailyStartTime: { type: String, required: true },
  postGapMinutes: { type: Number, min: 1, max: 1440, default: 5 },
  postsPerDay: { type: Number, min: 1, max: 500, default: 5 },
  postingDays: [{ type: Number, min: 0, max: 6 }],
  languageMode: { type: String, enum: ['english', 'sinhala_mixed'], default: 'english' },
  cta: { type: String, enum: ['none', 'shop_now', 'whatsapp'], default: 'none' },
  productOrder: { type: String, enum: ['selected', 'newest', 'random', 'price_asc', 'price_desc'], default: 'selected' },
  repeat: { type: Boolean, default: false },
  repeatCycle: { type: Number, default: 0, min: 0 },
  changePolicy: { type: String, enum: ['needs_review', 'regenerate'], default: 'needs_review' },
  voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  additionalDiscountPercent: { type: Number, min: 0, max: 99, default: 0 },
  configSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  counts: {
    total: { type: Number, default: 0 },
    published: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    needsReview: { type: Number, default: 0 },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  nextRunAt: { type: Date, default: null, index: true },
  lastExecutionAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  resumedAt: { type: Date, default: null },
  stoppedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

scheduleSchema.index({ tenantId: 1, status: 1, nextRunAt: 1 });
scheduleSchema.index({ tenantId: 1, createdAt: -1 });
scheduleSchema.index({ tenantId: 1, draftGroup: 1 }, { unique: true });

module.exports = mongoose.models.SocialSchedule || mongoose.model('SocialSchedule', scheduleSchema);
