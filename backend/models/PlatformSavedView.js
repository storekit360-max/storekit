'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  module: { type: String, enum: ['tenant_workspace'], required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  normalizedName: { type: String, required: true, maxlength: 80 },
  isDefault: { type: Boolean, default: false },
  state: {
    filters: {
      search: { type: String, default: '', maxlength: 100 },
      status: { type: String, enum: ['', 'active', 'suspended', 'pending'], default: '' },
      archived: { type: String, enum: ['false', 'true', 'all'], default: 'false' },
    },
  },
}, { timestamps: true, versionKey: false });

schema.index({ ownerId: 1, module: 1, normalizedName: 1 }, { unique: true });
schema.index({ ownerId: 1, module: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

module.exports = mongoose.models.PlatformSavedView || mongoose.model('PlatformSavedView', schema);
