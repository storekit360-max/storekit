'use strict';

const mongoose = require('mongoose');

const featureSchema = new mongoose.Schema({
  products: { type: Boolean, default: true },
  orders: { type: Boolean, default: true },
  categories: { type: Boolean, default: true },
  customers: { type: Boolean, default: true },
  coupons: { type: Boolean, default: false },
  giftCards: { type: Boolean, default: false },
  banners: { type: Boolean, default: false },
  seasonal: { type: Boolean, default: false },
  deals: { type: Boolean, default: false },
  reviews: { type: Boolean, default: false },
  subscribers: { type: Boolean, default: false },
  returns: { type: Boolean, default: false },
  seo: { type: Boolean, default: false },
  layoutEditor: { type: Boolean, default: false },
  themeBuilder: { type: Boolean, default: false },
  animations: { type: Boolean, default: false },
  socialMedia: { type: Boolean, default: false },
  aiPostCreator: { type: Boolean, default: false },
  automation: { type: Boolean, default: false },
  backup: { type: Boolean, default: false },
  billing: { type: Boolean, default: true },
  analytics: { type: Boolean, default: false },
  customDomain: { type: Boolean, default: true },
  metaPixel: { type: Boolean, default: false },
  wishlist: { type: Boolean, default: false },
  newsletter: { type: Boolean, default: false },
  guestCheckout: { type: Boolean, default: true },
  reviewApproval: { type: Boolean, default: false },
  autoConfirmOrders: { type: Boolean, default: false },
  autoCancelDecision: { type: Boolean, default: false },
  maintenanceMode: { type: Boolean, default: false },
}, { _id: false });

const limitSchema = new mongoose.Schema({
  products: { type: Number, default: 100 },
  ordersPerMonth: { type: Number, default: 500 },
  admins: { type: Number, default: 2 },
  storageMb: { type: Number, default: 500 },
}, { _id: false });

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  price: { type: Number, default: 0 },
  monthlyPrice: { type: Number, default: 0 },
  yearlyPrice: { type: Number, default: 0 },
  currency: { type: String, default: 'LKR' },
  billingCycle: { type: String, enum: ['monthly', 'yearly', 'once'], default: 'monthly' },
  trialDays: { type: Number, default: 14 },
  graceDays: { type: Number, default: 7 },
  autoSuspend: { type: Boolean, default: true },
  autoRenew: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  limits: { type: limitSchema, default: () => ({}) },
  features: { type: featureSchema, default: () => ({}) },
}, { timestamps: true });

planSchema.pre('validate', function(next) {
  if (!this.slug && this.name) {
    this.slug = String(this.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  if (!this.monthlyPrice && this.price) this.monthlyPrice = this.price;
  if (!this.yearlyPrice && this.monthlyPrice) this.yearlyPrice = Math.round(this.monthlyPrice * 12 * 0.9);
  next();
});

module.exports = mongoose.models.Plan || mongoose.model('Plan', planSchema);
