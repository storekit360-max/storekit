'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  metric: { type: String, required: true },
  operator: { type: String, enum: ['gt', 'gte', 'lt', 'lte'], required: true },
  threshold: { type: Number, required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
  consecutiveRequired: { type: Number, min: 1, max: 12, default: 2 },
  consecutiveBreaches: { type: Number, min: 0, default: 0 },
  enabled: { type: Boolean, default: true, index: true },
  state: { type: String, enum: ['ok', 'firing'], default: 'ok', index: true },
  lastEvaluatedAt: { type: Date, default: null },
  version: { type: Number, default: 1, min: 1 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.models.AlertRule || mongoose.model('AlertRule', schema);
