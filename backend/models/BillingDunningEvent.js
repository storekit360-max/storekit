'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionInvoice', default: null },
  event: { type: String, enum: ['payment_due', 'payment_failed', 'grace_started', 'reminder', 'suspended', 'recovered'], required: true, index: true },
  attemptNumber: { type: Number, default: 0, min: 0 },
  scheduledFor: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  channel: { type: String, enum: ['system', 'email'], default: 'system' },
  deliveryStatus: { type: String, enum: ['not_applicable', 'pending', 'delivered', 'failed'], default: 'not_applicable', index: true },
  deliveryError: { type: String, default: '', maxlength: 500 },
  message: { type: String, default: '', maxlength: 1000 },
  occurredAt: { type: Date, default: Date.now, required: true },
}, { versionKey: false });

schema.index({ tenantId: 1, occurredAt: -1 });
schema.index({ occurredAt: 1 }, { expireAfterSeconds: 2 * 365 * 24 * 60 * 60 });

module.exports = mongoose.models.BillingDunningEvent || mongoose.model('BillingDunningEvent', schema);
