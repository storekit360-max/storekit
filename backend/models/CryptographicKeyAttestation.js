'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  purpose: { type: String, enum: ['jwt_signing', 'backup_encryption', 'platform_secret_encryption'], required: true, index: true },
  keyId: { type: String, required: true, trim: true, minlength: 1, maxlength: 100, index: true },
  action: { type: String, enum: ['deployed', 'verified', 'retired'], required: true, index: true },
  environment: { type: String, required: true, trim: true, maxlength: 80 },
  deploymentId: { type: String, default: '', trim: true, maxlength: 180 },
  notes: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
  attestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attestedAt: { type: Date, default: Date.now, required: true, immutable: true },
}, { versionKey: false });

schema.index({ purpose: 1, keyId: 1, attestedAt: -1 });
schema.index({ attestedAt: -1 });

module.exports = mongoose.models.CryptographicKeyAttestation || mongoose.model('CryptographicKeyAttestation', schema);
