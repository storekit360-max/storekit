'use strict';

const mongoose = require('mongoose');

const featureSchema = new mongoose.Schema({
  // Core store operations
  dashboard: { type: Boolean, default: true },
  products: { type: Boolean, default: true },
  orders: { type: Boolean, default: true },
  categories: { type: Boolean, default: true },
  customers: { type: Boolean, default: true },
  inventory: { type: Boolean, default: true },
  payments: { type: Boolean, default: true },
  delivery: { type: Boolean, default: true },

  // Marketing / sales
  coupons: { type: Boolean, default: false },
  deals: { type: Boolean, default: false },
  seasonal: { type: Boolean, default: false },
  banners: { type: Boolean, default: false },
  giftCards: { type: Boolean, default: false },
  reviews: { type: Boolean, default: false },
  subscribers: { type: Boolean, default: false },
  returns: { type: Boolean, default: false },
  wishlist: { type: Boolean, default: false },
  newsletter: { type: Boolean, default: false },

  // Storefront design
  themeBuilder: { type: Boolean, default: false },
  layoutEditor: { type: Boolean, default: false },
  templates: { type: Boolean, default: false },
  customCss: { type: Boolean, default: false },
  animations: { type: Boolean, default: false },
  customDomain: { type: Boolean, default: true },

  // SEO / analytics / integrations
  seo: { type: Boolean, default: false },
  analytics: { type: Boolean, default: false },
  metaPixel: { type: Boolean, default: false },
  googleAnalytics: { type: Boolean, default: false },
  socialMedia: { type: Boolean, default: false },
  whatsapp: { type: Boolean, default: false },

  // Automation / operations
  aiPostCreator: { type: Boolean, default: false },
  automation: { type: Boolean, default: false },
  backup: { type: Boolean, default: false },
  monitoring: { type: Boolean, default: false },
  autoConfirmOrders: { type: Boolean, default: false },
  autoCancelDecision: { type: Boolean, default: false },
  maintenanceMode: { type: Boolean, default: false },
  reviewApproval: { type: Boolean, default: false },
  guestCheckout: { type: Boolean, default: true },
}, { _id: false, strict: false });

const limitSchema = new mongoose.Schema({
  products: { type: Number, default: 100, min: 0 },
  admins: { type: Number, default: 2, min: 0 },
  ordersPerMonth: { type: Number, default: 500, min: 0 },
  storageMb: { type: Number, default: 500, min: 0 },
  templates: { type: Number, default: 1, min: 0 },
  coupons: { type: Number, default: 10, min: 0 },
  banners: { type: Number, default: 5, min: 0 },
}, { _id: false });

const billingSchema = new mongoose.Schema({
  monthlyPrice: { type: Number, default: 0, min: 0 },
  yearlyPrice: { type: Number, default: 0, min: 0 },
  trialDays: { type: Number, default: 0, min: 0 },
  graceDays: { type: Number, default: 3, min: 0 },
  autoRenew: { type: Boolean, default: false },
  autoSuspend: { type: Boolean, default: true },
}, { _id: false });

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  price: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'LKR', uppercase: true, trim: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly', 'once'], default: 'monthly' },
  active: { type: Boolean, default: true },
  limits: { type: limitSchema, default: () => ({}) },
  features: { type: featureSchema, default: () => ({}) },
  billing: { type: billingSchema, default: () => ({}) },
}, { timestamps: true });

planSchema.pre('validate', function(next) {
  if (!this.slug && this.name) {
    this.slug = String(this.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  if (!this.price) {
    this.price = this.billingCycle === 'yearly' ? (this.billing?.yearlyPrice || 0) : (this.billing?.monthlyPrice || 0);
  }
  next();
});

module.exports = mongoose.models.Plan || mongoose.model('Plan', planSchema);
