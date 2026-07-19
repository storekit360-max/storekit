'use strict';

const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema({
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  correlationId: { type: String, required: true, immutable: true, index: true },
  actor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  action: { type: String, required: true, trim: true, index: true },
  resource: { type: String, required: true, trim: true, index: true },
  resourceId: { type: String, default: '', trim: true },
  request: {
    method: { type: String, required: true },
    path: { type: String, required: true },
    endpoint: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  outcome: {
    status: { type: String, enum: ['success', 'failure'], required: true },
    statusCode: { type: Number, required: true },
    durationMs: { type: Number, required: true, min: 0 },
  },
  changes: {
    oldValue: { type: mongoose.Schema.Types.Mixed, default: undefined },
    newValue: { type: mongoose.Schema.Types.Mixed, default: undefined },
    changedFields: { type: [String], default: undefined },
  },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { versionKey: false });

auditEventSchema.index({ occurredAt: -1, _id: -1 });
auditEventSchema.index({ 'actor.userId': 1, occurredAt: -1 });
auditEventSchema.index({ resource: 1, resourceId: 1, occurredAt: -1 });
auditEventSchema.index({ 'outcome.status': 1, occurredAt: -1 });

module.exports = mongoose.models.AuditEvent || mongoose.model('AuditEvent', auditEventSchema);
