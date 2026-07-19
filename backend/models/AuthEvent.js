'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  occurredAt: { type: Date, default: Date.now, required: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  email: { type: String, default: '', lowercase: true, trim: true },
  role: { type: String, default: '' },
  eventType: { type: String, enum: ['login', 'logout', 'session_revoked', 'account_locked', 'password_reset'], required: true, index: true },
  outcome: { type: String, enum: ['success', 'failure', 'blocked'], required: true, index: true },
  reason: { type: String, default: '', maxlength: 200 },
  authMethod: { type: String, default: '' },
  sessionId: { type: String, default: '', index: true },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  correlationId: { type: String, default: '', index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { versionKey: false });

schema.index({ occurredAt: -1, _id: -1 });
schema.index({ outcome: 1, occurredAt: -1 });
schema.index({ email: 1, occurredAt: -1 });

module.exports = mongoose.models.AuthEvent || mongoose.model('AuthEvent', schema);
