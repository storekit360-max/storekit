const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true }, order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  refundNumber: { type: String, required: true }, items: [{ productId: mongoose.Schema.Types.ObjectId, variantSku: String, quantity: Number, amount: Number, restocked: Boolean, damaged: Boolean }],
  amount: Number, reason: { type: String, required: true }, paymentMethod: String, createdBy: mongoose.Schema.Types.ObjectId, createdByName: String,
}, { timestamps: true });
module.exports = mongoose.model('PosRefund', schema);
