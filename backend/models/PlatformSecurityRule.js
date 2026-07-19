'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  kind: { type: String, enum: ['ip_block', 'country_block', 'route_block'], required: true, default: 'ip_block', index: true },
  value: { type: String, required: true, trim: true, maxlength: 600 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  active: { type: Boolean, default: true, index: true },
  expiresAt: { type: Date, default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  disabledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  disabledAt: { type: Date, default: null },
  hitCount: { type: Number, default: 0, min: 0 },
  lastMatchedAt: { type: Date, default: null },
  lastMatchedIp: { type: String, default: '', maxlength: 80 },
  lastMatchedPath: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

schema.index({ kind: 1, value: 1, active: 1 });
schema.index({ active: 1, expiresAt: 1 });

module.exports = mongoose.models.PlatformSecurityRule || mongoose.model('PlatformSecurityRule', schema);
