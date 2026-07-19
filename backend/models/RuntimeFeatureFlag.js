'use strict';

const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, maxlength: 60 },
  weight: { type: Number, required: true, min: 0, max: 100 },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z][a-z0-9_.-]{1,79}$/ },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 1000 },
  enabled: { type: Boolean, default: false, index: true },
  killSwitch: { type: Boolean, default: false, index: true },
  clientVisible: { type: Boolean, default: false, index: true },
  entitlementKey: { type: String, default: '', trim: true, maxlength: 80 },
  rolloutPercentage: { type: Number, min: 0, max: 100, default: 100 },
  tenantAllowIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Tenant', default: [] },
  tenantDenyIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Tenant', default: [] },
  countries: { type: [String], default: [], set: values => (values || []).map(value => String(value).toUpperCase()) },
  roles: { type: [String], default: [], set: values => (values || []).map(value => String(value).toLowerCase()) },
  dependencies: { type: [String], default: [], set: values => (values || []).map(value => String(value).toLowerCase()) },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  variants: { type: [variantSchema], default: [] },
  salt: { type: String, required: true, select: false },
  version: { type: Number, min: 1, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ enabled: 1, startsAt: 1, endsAt: 1 });

module.exports = mongoose.models.RuntimeFeatureFlag || mongoose.model('RuntimeFeatureFlag', schema);
