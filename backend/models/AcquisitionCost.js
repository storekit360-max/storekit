'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  incurredAt: { type: Date, required: true, index: true },
  source: { type: String, required: true, trim: true, maxlength: 80, index: true },
  campaign: { type: String, default: '', trim: true, maxlength: 160 },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3, index: true },
  notes: { type: String, default: '', trim: true, maxlength: 1000 },
  externalReference: { type: String, default: undefined, trim: true, maxlength: 200 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ currency: 1, incurredAt: -1 });
schema.index({ source: 1, incurredAt: -1 });
schema.index({ externalReference: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.AcquisitionCost || mongoose.model('AcquisitionCost', schema);
