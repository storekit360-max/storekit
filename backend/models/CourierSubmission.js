'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  provider: { type: String, required: true, default: 'curfox' },
  state: { type: String, enum: ['submitting','submitted','failed','reconciliation_required'], default: 'submitting' },
  attemptId: { type: String, required: true },
  externalId: { type: String, default: '' },
  dryRun: { type: Boolean, default: false },
  error: { type: String, default: '' },
  responseReceivedAt: Date,
}, { timestamps: true });

schema.index({ tenantId: 1, orderId: 1, provider: 1 }, { unique: true });
schema.index({ tenantId: 1, state: 1, updatedAt: 1 });

module.exports = mongoose.models.CourierSubmission || mongoose.model('CourierSubmission', schema);
