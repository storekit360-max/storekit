'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  number: { type: String, required: true, unique: true, index: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true, trim: true, maxlength: 180 },
  category: { type: String, enum: ['account', 'billing', 'technical', 'security', 'feature_request', 'other'], default: 'technical', index: true },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal', index: true },
  status: { type: String, enum: ['open', 'pending_customer', 'pending_internal', 'resolved', 'closed'], default: 'open', index: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  tags: { type: [String], default: [] },
  firstResponseDueAt: { type: Date, required: true },
  resolutionDueAt: { type: Date, required: true },
  firstRespondedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  escalatedAt: { type: Date, default: null },
  escalationReason: { type: String, default: '', maxlength: 500 },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  messageCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

schema.index({ tenant: 1, status: 1, lastMessageAt: -1 });
schema.index({ status: 1, priority: 1, firstResponseDueAt: 1 });
module.exports = mongoose.models.SupportTicket || mongoose.model('SupportTicket', schema);
