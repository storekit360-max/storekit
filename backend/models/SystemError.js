'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  occurredAt: { type: Date, default: Date.now, required: true },
  correlationId: { type: String, default: '', index: true },
  fingerprint: { type: String, required: true, index: true },
  name: { type: String, default: 'Error' },
  message: { type: String, required: true, maxlength: 1000 },
  method: { type: String, default: '' },
  path: { type: String, default: '' },
  statusCode: { type: Number, default: 500, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  occurrenceCount: { type: Number, default: 0 },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null, index: true },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolutionNote: { type: String, default: '', maxlength: 1000 },
}, { timestamps: true });

schema.index({ fingerprint: 1, resolvedAt: 1, lastSeenAt: -1 });
schema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.models.SystemError || mongoose.model('SystemError', schema);
