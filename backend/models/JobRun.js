'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  jobName: { type: String, required: true, index: true },
  runId: { type: String, required: true, unique: true },
  instanceId: { type: String, required: true },
  status: { type: String, enum: ['running', 'succeeded', 'failed', 'skipped'], required: true, index: true },
  startedAt: { type: Date, default: Date.now, required: true },
  completedAt: { type: Date, default: null },
  durationMs: { type: Number, default: null },
  processed: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  message: { type: String, default: '', maxlength: 1000 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { versionKey: false });

schema.index({ jobName: 1, startedAt: -1 });
schema.index({ startedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.models.JobRun || mongoose.model('JobRun', schema);
