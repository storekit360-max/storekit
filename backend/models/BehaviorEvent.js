'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventType: { type: String, required: true, trim: true, maxlength: 50 },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  device: { type: String, maxlength: 80, default: '' },
  source: { type: String, maxlength: 80, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  consentRevision: { type: Number, required: true, min: 0, default: 0 },
  interaction: {
    normalizedX: { type: Number, min: 0, max: 0.999, default: null },
    normalizedY: { type: Number, min: 0, max: 0.999, default: null },
    page: { type: String, default: '', maxlength: 40 },
    viewport: { type: String, enum: ['', 'mobile', 'tablet', 'desktop'], default: '' },
  },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, eventType: 1, createdAt: -1 });
schema.index({ tenantId: 1, customer: 1, createdAt: -1 });
schema.index({ tenantId: 1, product: 1, createdAt: -1 });
schema.index({ tenantId: 1, eventType: 1, 'interaction.page': 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.models.BehaviorEvent || mongoose.model('BehaviorEvent', schema);
