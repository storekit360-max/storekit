const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  scheduledAt: { type: Date, required: true },
  caption: { type: String, required: true, maxlength: 5000 },
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platforms: [{ type: String, enum: ['facebook', 'instagram', 'tiktok', 'whatsapp', 'telegram'] }],
  startAt: { type: Date, required: true },
  gapMinutes: { type: Number, required: true, min: 1, max: 10080 },
  productsPerDay: { type: Number, required: true, min: 1, max: 50 },
  offerPercent: { type: Number, default: 0, min: 0, max: 95 },
  voucherCode: { type: String, default: '' },
  includeSinhala: { type: Boolean, default: true },
  ctaType: { type: String, enum: ['shop_now', 'whatsapp', 'none'], default: 'shop_now' },
  items: { type: [itemSchema], default: [] },
  createdAt: { type: Date, default: Date.now, expires: 86400 },
});

module.exports = mongoose.models.SocialScheduleDraft || mongoose.model('SocialScheduleDraft', schema);
