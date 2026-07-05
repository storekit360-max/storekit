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
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  description: { type: String, required: true },
  shortDescription: String,
  price: { type: Number, required: true },
  salePrice: Number,
  costPrice: Number,
  sku: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  subCategory: String,
  brand: String,
  images: [String],
  thumbnail: String,
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
  saleEndsAt: Date,
  ratings: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  views: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

productSchema.pre('save', function(next) {
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

module.exports = mongoose.model('Product', productSchema);