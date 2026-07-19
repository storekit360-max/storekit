'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
  visibility: { type: String, enum: ['internal'], default: 'internal' },
  pinned: { type: Boolean, default: false },
  editedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ tenantId: 1, pinned: -1, createdAt: -1 });

module.exports = mongoose.models.TenantNote || mongoose.model('TenantNote', schema);
