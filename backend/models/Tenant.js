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
    storePhone: { type: String, default: '' },
    storeAddress: { type: String, default: '' },
    emailFromName: { type: String, default: '' },
    emailFromAddress: { type: String, default: '' },
    emailReplyTo: { type: String, default: '' },
    resendApiKey: { type: String, default: '' },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    currency: { type: String, default: 'LKR' },
    country: { type: String, default: 'Sri Lanka' },
    timezone: { type: String, default: 'Asia/Colombo' },
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' },
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    storeTagline: { type: String, default: '' },
    heroBrowseAllLabel: { type: String, default: 'Browse All' },
    heroStats: { type: String, default: '[]' },
    siteUrl: { type: String, default: '' },
    siteLanguage: { type: String, default: 'en' },
    ogTitle: { type: String, default: '' },
    ogDescription: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    twitterHandle: { type: String, default: '' },
    facebookUrl: { type: String, default: '' },
    instagramUrl: { type: String, default: '' },
    twitterUrl: { type: String, default: '' },
    linkedinUrl: { type: String, default: '' },
    youtubeUrl: { type: String, default: '' },
    pinterestUrl: { type: String, default: '' },
    tiktokUrl: { type: String, default: '' },
    whatsappNumber: { type: String, default: '' },
    googleAnalytics: { type: String, default: '' },
    googleTagManager: { type: String, default: '' },
    googleSearchConsole: { type: String, default: '' },
    facebookPixel: { type: String, default: '' },
    currencyCode: { type: String, default: 'LKR' },
    bankTransferEnabled: { type: Boolean, default: true },
    bankName: { type: String, default: '' },
    bankAccountName: { type: String, default: '' },
    bankAccountNumber: { type: String, default: '' },
    bankBranch: { type: String, default: '' },
    codEnabled: { type: Boolean, default: true },
    robotsTxt: { type: String, default: '' },
    seo_config: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Ordered/enabled storefront sections saved by Admin > Layout Builder.
    // This must be declared because Mongoose strict mode drops unknown nested
    // settings keys even though tenant.save() itself succeeds.
    layout_builder: { type: mongoose.Schema.Types.Mixed, default: {} },
    loaderStyle: { type: String, default: 'classic-ring' },
    loadingText: { type: String, default: 'Preparing your shopping experience' },
    marketingTrackingEnabled: { type: Boolean, default: true },
    enableNewsletter: { type: Boolean, default: true },
    starterImagesProvider: { type: String, default: '' },
    starterImagesAttributionUrl: { type: String, default: '' },
    homepageProductLimit: { type: Number, default: 8 },
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

  // Used only to serialize an explicitly verified Super Admin deletion. The
  // timestamp also lets a later request recover from a process interruption.
  deletion: {
    state: { type: String, enum: ['idle', 'deleting'], default: 'idle' },
    requestedAt: { type: Date, default: null },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },

  theme: {
    theme: { type: String, default: 'default' },
    primaryColor: { type: String, default: '#15803d' },
    primaryDarkColor: { type: String, default: '' },
    primaryLightColor: { type: String, default: '' },
    secondaryColor: { type: String, default: '' },
    accentColor: { type: String, default: '#84cc16' },
    darkColor: { type: String, default: '#0f172a' },
    darkBgColor: { type: String, default: '' },
    fontStyle: { type: String, default: 'default' },
    fontFamily: { type: String, default: 'default' },
    darkMode: { type: Boolean, default: false },
    storeTemplate: { type: String, default: 'classic' },
    template: { type: String, default: '' },
    layoutTemplate: { type: String, default: '' },
    customCSS: { type: String, default: '' },
    logoSize: { type: Number, default: 48 },
  },

  // Non-sensitive business context captured by Super Admin during onboarding.
  // It is kept outside storefront settings so it is not exposed by /api/settings.
  onboarding: {
    businessType: { type: String, default: '' },
    businessDescription: { type: String, default: '' },
    itemExamples: { type: [String], default: [] },
    targetCustomers: { type: String, default: '' },
    brandTone: { type: String, default: '' },
    starterKitSource: { type: String, enum: ['', 'ai', 'fallback', 'manual'], default: '' },
    starterKitGeneratedAt: { type: Date, default: null },
  },
}, { timestamps: true });

tenantSchema.index({ 'domains.domain': 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.Tenant || mongoose.model('Tenant', tenantSchema);
