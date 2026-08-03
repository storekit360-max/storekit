const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  items: [{ productId: mongoose.Schema.Types.ObjectId, variantSku: String, quantity: Number, price: Number, name: String }],
  customer: { name: String, phone: String, email: String }, note: String,
  createdBy: mongoose.Schema.Types.ObjectId, createdByName: String,
}, { timestamps: true });
module.exports = mongoose.model('HeldPosSale', schema);
