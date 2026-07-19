'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  role: { type: String, required: true, index: true },
  authMethod: { type: String, enum: ['password', 'google', 'password_reset', 'registration', 'impersonation'], required: true },
  impersonatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  impersonationReason: { type: String, default: '', maxlength: 500 },
  tokenVersion: { type: Number, required: true, default: 0 },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  deviceLabel: { type: String, default: '' },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null, index: true },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revokeReason: { type: String, default: '', maxlength: 500 },
  mfaVerifiedAt: { type: Date, default: null },
  lastStepUpAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, revokedAt: 1, expiresAt: -1 });
schema.index({ role: 1, revokedAt: 1, lastSeenAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.AuthSession || mongoose.model('AuthSession', schema);
