'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  group: { type: String, required: true, trim: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  valueType: { type: String, enum: ['string', 'boolean', 'number', 'url', 'email', 'color', 'enum'], required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ group: 1, key: 1 });

module.exports = mongoose.models.PlatformSetting || mongoose.model('PlatformSetting', schema);
