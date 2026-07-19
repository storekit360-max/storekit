'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  flagId: { type: mongoose.Schema.Types.ObjectId, ref: 'RuntimeFeatureFlag', required: true, index: true },
  flagKey: { type: String, required: true, index: true },
  flagVersion: { type: Number, required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  subjectKeyHash: { type: String, required: true, index: true },
  enabled: { type: Boolean, required: true },
  variant: { type: String, default: '' },
  reason: { type: String, required: true, maxlength: 100 },
  country: { type: String, default: '' },
  role: { type: String, default: '' },
  correlationId: { type: String, default: '', index: true },
  occurredAt: { type: Date, default: Date.now, required: true },
}, { versionKey: false });

schema.index({ flagKey: 1, occurredAt: -1 });
schema.index({ flagKey: 1, flagVersion: 1, tenantId: 1, variant: 1, occurredAt: 1 });
schema.index({ occurredAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.models.FeatureFlagExposure || mongoose.model('FeatureFlagExposure', schema);
