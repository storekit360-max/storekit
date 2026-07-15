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
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, eventType: 1, createdAt: -1 });
schema.index({ tenantId: 1, customer: 1, createdAt: -1 });
schema.index({ tenantId: 1, product: 1, createdAt: -1 });

module.exports = mongoose.models.BehaviorEvent || mongoose.model('BehaviorEvent', schema);
