'use strict';

const mongoose = require('mongoose');

const featureSchema = new mongoose.Schema({
  // ── Core features (main admin modules / sidebar sections) ──────────────
  products:       { type: Boolean, default: true },
  orders:         { type: Boolean, default: true },
  categories:     { type: Boolean, default: true },
  customers:      { type: Boolean, default: true },
  coupons:        { type: Boolean, default: false },
  giftCards:      { type: Boolean, default: false },
  banners:        { type: Boolean, default: false },
  seasonal:       { type: Boolean, default: false },
  deals:          { type: Boolean, default: false },
  reviews:        { type: Boolean, default: false },
  subscribers:    { type: Boolean, default: false },
  returns:        { type: Boolean, default: false },
  seo:            { type: Boolean, default: false },
  layoutEditor:   { type: Boolean, default: false },
  themeBuilder:   { type: Boolean, default: false },
  animations:     { type: Boolean, default: false },
  socialMedia:    { type: Boolean, default: false },
  aiPostCreator:  { type: Boolean, default: false },
  automation:     { type: Boolean, default: false },
  backup:         { type: Boolean, default: false },

  // ── Sub features (secondary capabilities that extend a core module) ────
  analytics:          { type: Boolean, default: false },
  customDomain:       { type: Boolean, default: true },
  metaPixel:          { type: Boolean, default: false },
  wishlist:           { type: Boolean, default: false },
  newsletter:         { type: Boolean, default: false },
  guestCheckout:      { type: Boolean, default: true },
  reviewApproval:     { type: Boolean, default: false },

  // ── Minor features (fine-grained operational toggles) ──────────────────
  autoConfirmOrders:  { type: Boolean, default: false },
  autoCancelDecision: { type: Boolean, default: false },
  maintenanceMode:    { type: Boolean, default: false },
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
  currency: { type: String, default: 'LKR' },
  billingCycle: { type: String, enum: ['monthly', 'yearly', 'once'], default: 'monthly' },
  billing: {
    monthlyPrice: { type: Number, default: 0 },
    yearlyPrice: { type: Number, default: 0 },
    trialDays: { type: Number, default: 0 },
    graceDays: { type: Number, default: 3 },
    taxPercent: { type: Number, default: 0 },
    autoRenew: { type: Boolean, default: true },
    allowMonthly: { type: Boolean, default: true },
    allowYearly: { type: Boolean, default: true },
    invoicePrefix: { type: String, default: 'INV' },
  },
  active: { type: Boolean, default: true },
  limits: { type: limitSchema, default: () => ({}) },
  features: { type: featureSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.models.Plan || mongoose.model('Plan', planSchema);