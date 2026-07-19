'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  idempotencyKey: { type: String, required: true, unique: true, maxlength: 180 },
  announcement: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAnnouncement', default: null, index: true },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformNotificationTemplate', default: null },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  channel: { type: String, enum: ['email', 'sms', 'push', 'slack', 'webhook', 'in_app'], required: true, index: true },
  destination: { type: String, default: '', maxlength: 1000 },
  subject: { type: String, default: '', maxlength: 240 },
  body: { type: String, required: true, maxlength: 100000 },
  status: { type: String, enum: ['queued', 'processing', 'sent', 'failed', 'dead', 'cancelled'], default: 'queued', index: true },
  attempts: { type: Number, default: 0, min: 0 },
  maxAttempts: { type: Number, default: 5, min: 1, max: 10 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: String, default: '' },
  providerMessageId: { type: String, default: '' },
  lastError: { type: String, default: '', maxlength: 2000 },
  sentAt: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ status: 1, nextAttemptAt: 1, lockedAt: 1 });
schema.index({ tenant: 1, createdAt: -1 });
module.exports = mongoose.models.NotificationDelivery || mongoose.model('NotificationDelivery', schema);
