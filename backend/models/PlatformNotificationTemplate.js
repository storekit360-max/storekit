'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 500 },
  channel: { type: String, enum: ['email', 'sms', 'push', 'slack', 'webhook', 'in_app'], required: true, index: true },
  locale: { type: String, default: 'en', lowercase: true, trim: true },
  subject: { type: String, default: '', maxlength: 240 },
  body: { type: String, required: true, maxlength: 100000 },
  allowedVariables: { type: [String], default: [] },
  enabled: { type: Boolean, default: true, index: true },
  version: { type: Number, default: 1, min: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ channel: 1, locale: 1, enabled: 1 });
module.exports = mongoose.models.PlatformNotificationTemplate || mongoose.model('PlatformNotificationTemplate', schema);
