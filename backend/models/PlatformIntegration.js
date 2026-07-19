'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  provider: { type: String, required: true, unique: true, lowercase: true, trim: true },
  enabled: { type: Boolean, default: false, index: true },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
  encryptedSecrets: { type: mongoose.Schema.Types.Mixed, default: {}, select: false },
  configuredSecretFields: { type: [String], default: [] },
  lastTest: {
    status: { type: String, enum: ['never', 'healthy', 'degraded', 'failed', 'configuration_only'], default: 'never' },
    testedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    message: { type: String, default: '' },
    testedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  lastSync: {
    status: { type: String, enum: ['never', 'running', 'succeeded', 'failed', 'skipped'], default: 'never' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    nextEligibleAt: { type: Date, default: null },
    message: { type: String, default: '', maxlength: 500 },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ provider: 1, enabled: 1, 'lastSync.nextEligibleAt': 1 });

module.exports = mongoose.models.PlatformIntegration || mongoose.model('PlatformIntegration', schema);
