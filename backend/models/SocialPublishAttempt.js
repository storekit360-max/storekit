'use strict';

const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  queueItem: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduledSocialPost', required: true, index: true },
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialSchedule', required: true, index: true },
  platform: { type: String, enum: ['facebook', 'instagram'], required: true },
  attempt: { type: Number, required: true },
  requestMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  responseMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['success', 'temporary_failure', 'permanent_failure'], required: true },
  error: { type: String, default: '' },
  errorCode: { type: String, default: '' },
}, { timestamps: true });

attemptSchema.index({ tenantId: 1, queueItem: 1, attempt: 1 }, { unique: true });
attemptSchema.index({ tenantId: 1, schedule: 1, createdAt: -1 });

module.exports = mongoose.models.SocialPublishAttempt || mongoose.model('SocialPublishAttempt', attemptSchema);
