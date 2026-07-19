'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  type: { type: String, enum: ['totp'], default: 'totp' },
  enabled: { type: Boolean, default: false, index: true },
  encryptedSecret: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  recoveryCodeHashes: { type: [String], default: [], select: false },
  enrolledAt: { type: Date, default: null },
  lastUsedAt: { type: Date, default: null },
  recoveryCodesRegeneratedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.models.MfaFactor || mongoose.model('MfaFactor', schema);
