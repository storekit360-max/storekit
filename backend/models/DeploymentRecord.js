'use strict';

const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  status: { type: String, required: true, enum: ['queued', 'building', 'deploying', 'ready', 'failed', 'cancelled', 'rolled_back'] },
  occurredAt: { type: Date, required: true },
  source: { type: String, required: true, enum: ['runtime', 'platform_api', 'manual'] },
  message: { type: String, default: '', maxlength: 500 },
}, { _id: false });

const schema = new mongoose.Schema({
  provider: { type: String, required: true, lowercase: true, trim: true, maxlength: 40 },
  externalId: { type: String, required: true, trim: true, maxlength: 160 },
  environment: { type: String, required: true, lowercase: true, trim: true, maxlength: 40, index: true },
  service: { type: String, default: 'storekit', trim: true, maxlength: 100 },
  status: { type: String, required: true, enum: ['queued', 'building', 'deploying', 'ready', 'failed', 'cancelled', 'rolled_back'], index: true },
  version: { type: String, default: '', trim: true, maxlength: 100 },
  commitSha: { type: String, default: '', lowercase: true, trim: true, maxlength: 64 },
  branch: { type: String, default: '', trim: true, maxlength: 160 },
  deploymentUrl: { type: String, default: '', maxlength: 1000 },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  durationMs: { type: Number, default: null, min: 0 },
  source: { type: String, required: true, enum: ['runtime', 'platform_api', 'manual'] },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  apiKeyId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformApiKey', default: null },
  history: { type: [historySchema], default: [] },
}, { timestamps: true });

schema.index({ provider: 1, externalId: 1, environment: 1 }, { unique: true });
schema.index({ createdAt: -1, status: 1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 730 * 24 * 60 * 60 });

module.exports = mongoose.models.DeploymentRecord || mongoose.model('DeploymentRecord', schema);
