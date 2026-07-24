'use strict';

const mongoose = require('mongoose');

const courierIntegrationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  provider: { type: String, required: true, lowercase: true, trim: true, default: 'curfox' },
  displayName: { type: String, trim: true, default: '' },
  environment: { type: String, enum: ['sandbox', 'production'], default: 'production' },
  isDefault: { type: Boolean, default: false },
  connectionStatus: { type: String, enum: ['not_tested', 'connected', 'failed'], default: 'not_tested' },
  lastTestedAt: { type: Date },
  publicConfiguration: { type: mongoose.Schema.Types.Mixed, default: {} },
  capabilities: { type: [String], default: [] },
  encryptedCredentials: {
    ciphertext: { type: String, select: false }, iv: { type: String, select: false },
    tag: { type: String, select: false }, version: { type: Number, select: false, default: 1 },
  },
  enabled: { type: Boolean, default: false },
  courierTenant: { type: String, trim: true, default: '' },
  merchantEmail: { type: String, lowercase: true, trim: true, default: '' },
  encryptedPassword: {
    ciphertext: { type: String, select: false },
    iv: { type: String, select: false },
    tag: { type: String, select: false },
    version: { type: Number, select: false, default: 1 },
  },
  merchantBusinessId: { type: String, trim: true, default: '' },
  originCity: { type: String, trim: true, default: '' },
  originState: { type: String, trim: true, default: '' },
  defaultPackageWeight: { type: Number, min: 0.01, default: 1 },
  initialStatusKey: { type: String, enum: ['key_1','key_2'], default: 'key_1' },
  manualWaybillsEnabled: { type: Boolean, default: false },
  updatedBy: { type: String, default: '' },
}, { timestamps: true });

courierIntegrationSchema.index({ tenantId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.models.CourierIntegration || mongoose.model('CourierIntegration', courierIntegrationSchema);
