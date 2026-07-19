'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  countryCode: { type: String, required: true, uppercase: true, trim: true, minlength: 2, maxlength: 2 },
  regionCode: { type: String, default: '*', uppercase: true, trim: true, maxlength: 20 },
  rate: { type: Number, required: true, min: 0, max: 100 },
  inclusive: { type: Boolean, default: false },
  priority: { type: Number, default: 100 },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

schema.index({ countryCode: 1, regionCode: 1, priority: 1 });

module.exports = mongoose.models.BillingTaxRule || mongoose.model('BillingTaxRule', schema);
