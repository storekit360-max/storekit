'use strict';

const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema({
  domain: { type: String, required: true, lowercase: true, trim: true },
  type: { type: String, enum: ['primary', 'alias', 'system'], default: 'primary' },
  verified: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { _id: false });

const tenantSchema = new mongoose.Schema({
  storeName: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },
  domains: { type: [domainSchema], default: [] },
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

  subscription: {
    status: { type: String, enum: ['trial', 'active', 'past_due', 'grace', 'suspended', 'cancelled'], default: 'active' },
    billingCycle: { type: String, enum: ['monthly', 'yearly', 'once'], default: 'monthly' },
    currency: { type: String, default: 'LKR' },
    amount: { type: Number, default: 0 },
    trialStartedAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    nextBillingAt: { type: Date, default: null },
    graceEndsAt: { type: Date, default: null },
    autoRenew: { type: Boolean, default: false },
    lastPaymentAt: { type: Date, default: null },
  },

  billing: {
    subscriptionStatus: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'suspended', 'cancelled'],
      default: 'active',
    },
    billingCycle: { type: String, enum: ['monthly', 'yearly', 'once'], default: 'monthly' },
    trialEndsAt: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    nextPaymentDate: { type: Date, default: null },
    nextPaymentAmount: { type: Number, default: 0 },
    gracePeriodEndsAt: { type: Date, default: null },
    lastPaymentDate: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
    lastDeactivatedBy: { type: String, default: '' },
  },

  theme: {
    primaryColor: { type: String, default: '#15803d' },
    accentColor: { type: String, default: '#84cc16' },
    darkColor: { type: String, default: '#0f172a' },
    fontFamily: { type: String, default: 'Inter' },
  },
}, { timestamps: true });

tenantSchema.index({ 'domains.domain': 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);
