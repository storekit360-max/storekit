'use strict';
const mongoose = require('mongoose');

const platformExpenseSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR', uppercase: true, trim: true },
  incurredAt: { type: Date, default: Date.now, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

platformExpenseSchema.index({ tenantId: 1, incurredAt: -1 });
module.exports = mongoose.models.PlatformExpense || mongoose.model('PlatformExpense', platformExpenseSchema);
