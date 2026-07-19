'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'AlertRule', required: true, index: true },
  occurredAt: { type: Date, default: Date.now, required: true },
  state: { type: String, enum: ['firing', 'resolved'], required: true, index: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
  metric: { type: String, required: true },
  value: { type: Number, required: true },
  threshold: { type: Number, required: true },
  message: { type: String, required: true, maxlength: 1000 },
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { versionKey: false });

schema.index({ occurredAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.models.AlertEvent || mongoose.model('AlertEvent', schema);
