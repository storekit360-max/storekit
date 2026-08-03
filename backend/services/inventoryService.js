const Product = require('../models/Product');
async function deductStock({ tenantId, productId, quantity, variant }) {
  const q = { _id: productId, tenantId, isActive: true };
  if (variant) q.variantCombinations = { $elemMatch: { sku: variant.sku, stock: { $gte: quantity } } };
  else q.stock = { $gte: quantity };
  const update = variant ? { $inc: { 'variantCombinations.$.stock': -quantity, soldCount: quantity } } : { $inc: { stock: -quantity, soldCount: quantity } };
  return Product.findOneAndUpdate(q, update, { new: true }).lean();
}
module.exports = { deductStock };
