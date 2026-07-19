'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  group: { type: String, required: true, lowercase: true, trim: true, index: true },
  action: { type: String, required: true, lowercase: true, trim: true },
  label: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  system: { type: Boolean, default: true },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

module.exports = mongoose.models.PlatformPermission || mongoose.model('PlatformPermission', schema);
