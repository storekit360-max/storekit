const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  subtitle:    { type: String, default: '' },
  type:        { type: String, enum: ['today', 'weekly', 'custom'], default: 'today' },
  // Products included in this deal
  products:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  // Override discount % for the deal display (cosmetic — actual price lives on product)
  badgeLabel:  { type: String, default: '' },  // e.g. "50% OFF", "Deal of the Day"
  badgeColor:  { type: String, default: '#dc2626' },
  // Countdown
  endsAt:      { type: Date, required: true },
  // Display settings
  isActive:    { type: Boolean, default: true },
  sortOrder:   { type: Number, default: 0 },
  bgGradient:  { type: String, default: '' },  // optional CSS gradient for section bg
  accentColor: { type: String, default: '#dc2626' },
  // Stats
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

dealSchema.pre('save', function(next) { this.updatedAt = Date.now(); next(); });

module.exports = mongoose.model('Deal', dealSchema);