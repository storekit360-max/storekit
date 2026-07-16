const mongoose = require('mongoose');

const variantOptionSchema = new mongoose.Schema({
  name: { type: String, required: true },       // e.g. "Size", "Color", "Material"
  type: { type: String, enum: ['size','color','text','button','material','style','storage','weight','flavor'], default: 'button' },
  required: { type: Boolean, default: true },
  values: [{
    label: String,      // e.g. "Large", "Red", "Cotton"
    value: String,      // e.g. "L", "#ff0000", "cotton"
    priceModifier: { type: Number, default: 0 }, // +/- price change
    stockCount: { type: Number, default: -1 },   // -1 = use main stock
    isAvailable: { type: Boolean, default: true }
  }]
}, { _id: false });

const productSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  name: { type: String, required: true },
  normalizedName: { type: String, default: '', select: false },
  slug: { type: String, required: true },
  description: { type: String, required: true },
  shortDescription: String,
  price: { type: Number, required: true },
  salePrice: Number,
  costPrice: Number,
  sku: { type: String },
  gtin: { type: String, trim: true, default: '' },
  mpn: { type: String, trim: true, default: '' },
  identifierExists: { type: Boolean, default: undefined },
  condition: { type: String, enum: ['new', 'refurbished', 'used'], default: 'new' },
  googleProductCategory: { type: String, trim: true, default: '' },
  normalizedSku: { type: String, default: '', select: false },
  // Legacy records are deliberately left ineligible until a duplicate audit
  // confirms they are safe. New/renamed products opt in after an application
  // level tenant-scoped duplicate check, allowing the indexes below to close
  // the race window without preventing unrelated edits to legacy duplicates.
  duplicateIndexEligible: { type: Boolean, default: false, select: false },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  subCategory: String,
  brand: String,
  images: [String],
  thumbnail: String,
  imageAttribution: {
    provider: { type: String, default: '' },
    photographer: { type: String, default: '' },
    photographerUrl: { type: String, default: '' },
    sourceUrl: { type: String, default: '' },
  },
  stock: { type: Number, default: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  weight: Number,
  dimensions: { length: Number, width: Number, height: Number },
  specifications: [{ key: String, value: String }],
  // Product variants — size, color, material etc
  variants: [variantOptionSchema],
  // For tracking combined variant stock (e.g. Red+L has 5 stock)
  variantCombinations: [{
    combination: mongoose.Schema.Types.Mixed, // { Size: 'L', Color: 'Red' }
    price: Number,
    salePrice: Number,
    stock: Number,
    sku: String,
    image: String
  }],
  tags: [String],
  isFeatured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  isOnSale: { type: Boolean, default: false },
  // Marks editable catalogue examples created during tenant onboarding.
  // Store admins can replace or delete them like any other product.
  isStarterSample: { type: Boolean, default: false },
  saleEndsAt: Date,
  ratings: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  views: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

productSchema.pre('save', function(next) {
  this.normalizedName = String(this.name || '').trim().toLocaleLowerCase('en');
  this.normalizedSku = String(this.sku || '').trim().toLocaleLowerCase('en');
  if (!this.slug) {
    let slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const MAX_SLUG_LEN = 75;
    if (slug.length > MAX_SLUG_LEN) {
      slug = slug.slice(0, MAX_SLUG_LEN);
      slug = slug.slice(0, slug.lastIndexOf('-')) || slug.slice(0, MAX_SLUG_LEN);
      slug = slug.replace(/-$/, '');
    }
    this.slug = slug;
  }
  this.updatedAt = Date.now();
  next();
});

productSchema.index({ tenantId: 1, slug: 1 }, { unique: true, sparse: true });
productSchema.index(
  { tenantId: 1, normalizedName: 1 },
  { unique: true, name: 'tenant_normalized_name_unique', partialFilterExpression: { duplicateIndexEligible: true, normalizedName: { $type: 'string', $gt: '' } } }
);
productSchema.index(
  { tenantId: 1, normalizedSku: 1 },
  { unique: true, name: 'tenant_normalized_sku_unique', partialFilterExpression: { duplicateIndexEligible: true, normalizedSku: { $type: 'string', $gt: '' } } }
);
productSchema.index({ tenantId: 1, isActive: 1, createdAt: -1 });
productSchema.index({ tenantId: 1, isActive: 1, category: 1, createdAt: -1 });
productSchema.index({ tenantId: 1, isActive: 1, brand: 1 });
productSchema.index({ tenantId: 1, isActive: 1, isFeatured: 1 });
productSchema.index({ tenantId: 1, isActive: 1, isOnSale: 1 });
productSchema.index({ tenantId: 1, isActive: 1, soldCount: -1 });
productSchema.index({ tenantId: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
