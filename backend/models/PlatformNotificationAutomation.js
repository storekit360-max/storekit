'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true, enum: ['trial_ending', 'payment_failed', 'tenant_suspended', 'deployment_complete'], index: true },
  enabled: { type: Boolean, default: true, index: true },
  channels: { type: [String], enum: ['email', 'sms', 'push', 'slack', 'webhook', 'in_app'], default: ['email', 'in_app'] },
  templateKeys: { type: Map, of: String, default: {} },
  leadDays: { type: [Number], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.models.PlatformNotificationAutomation || mongoose.model('PlatformNotificationAutomation', schema);
