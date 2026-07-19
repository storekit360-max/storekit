'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  permissions: [{ type: String, lowercase: true, trim: true }],
  system: { type: Boolean, default: false },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

schema.index({ active: 1, name: 1 });

module.exports = mongoose.models.PlatformRole || mongoose.model('PlatformRole', schema);
