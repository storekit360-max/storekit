'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  body: { type: String, required: true, maxlength: 20000 },
  kind: { type: String, enum: ['announcement', 'maintenance', 'trial_ending', 'payment_failed', 'tenant_suspended', 'deployment_complete', 'custom'], default: 'announcement', index: true },
  severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' },
  status: { type: String, enum: ['draft', 'scheduled', 'published', 'archived'], default: 'draft', index: true },
  audience: { type: String, enum: ['all', 'tenants', 'plans', 'countries'], default: 'all' },
  tenantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }],
  planIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }],
  countries: { type: [String], default: [] },
  channels: [{ type: String, enum: ['email', 'sms', 'push', 'slack', 'webhook', 'in_app'] }],
  templateKeys: { type: Map, of: String, default: {} },
  startsAt: { type: Date, default: null, index: true },
  endsAt: { type: Date, default: null },
  publishedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ status: 1, startsAt: 1, endsAt: 1 });
module.exports = mongoose.models.PlatformAnnouncement || mongoose.model('PlatformAnnouncement', schema);
