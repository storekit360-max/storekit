const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, cashierName: String,
  status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  openingCash: { type: Number, default: 0 }, cashSales: { type: Number, default: 0 }, nonCashSales: { type: Number, default: 0 }, refunds: { type: Number, default: 0 }, transactionCount: { type: Number, default: 0 },
  countedCash: Number, expectedCash: Number, difference: Number, openedAt: { type: Date, default: Date.now }, closedAt: Date, closeNote: String,
}, { timestamps: true });
schema.index({ tenantId: 1, cashierId: 1, status: 1 });
module.exports = mongoose.model('PosShift', schema);
