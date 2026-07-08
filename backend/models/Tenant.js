'use strict';

const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema({
  domain: { type: String, required: true, lowercase: true, trim: true },
  type: { type: String, enum: ['primary', 'alias', 'system'], default: 'primary' },
  verified: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { _id: false });

const subscriptionSchema = new mongoose.Schema({
  status: { type: String, enum: ['trialing', 'active', 'past_due', 'grace', 'suspended', 'cancelled'], default: 'trialing' },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  trialStartedAt: { type: Date, default: null },
  trialEndsAt: { type: Date, default: null },
  currentPeriodStart: { type: Date, default: null },
  currentPeriodEnd: { type: Date, default: null },
  nextBillingAt: { type: Date, default: null },
  graceEndsAt: { type: Date, default: null },
  lastPaidAt: { type: Date, default: null },
  suspendedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  autoRenew: { type: Boolean, default: false },
  reminders: {
    trial7: { type: Boolean, default: false },
    trial3: { type: Boolean, default: false },
    renewal7: { type: Boolean, default: false },
    renewal3: { type: Boolean, default: false },
    dueToday: { type: Boolean, default: false },
    grace: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false },
  },
}, { _id: false });

const tenantSchema = new mongoose.Schema({
  storeName: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },
  domains: { type: [domainSchema], default: [] },
  subscription: { type: subscriptionSchema, default: () => ({}) },
  settings: {
    storeEmail: { type: String, default: '' },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    currency: { type: String, default: 'LKR' },
    country: { type: String, default: 'Sri Lanka' },
    timezone: { type: String, default: 'Asia/Colombo' },
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
  },
  theme: {
    primaryColor: { type: String, default: '#15803d' },
    accentColor: { type: String, default: '#84cc16' },
    darkColor: { type: String, default: '#0f172a' },
    fontFamily: { type: String, default: 'Inter' },
    template: { type: String, default: 'modern-pro' },
  },
}, { timestamps: true });

tenantSchema.index({ 'domains.domain': 1 }, { unique: true, sparse: true });
tenantSchema.index({ 'subscription.status': 1, 'subscription.nextBillingAt': 1 });

module.exports = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);
