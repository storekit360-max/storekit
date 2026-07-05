'use strict';

const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema({
  domain: { type: String, required: true, lowercase: true, trim: true },
  type: { type: String, enum: ['primary', 'alias', 'system'], default: 'primary' },
  verified: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { _id: false });

const defaultTenantSettings = {
  storeEmail: '',
  phone: '',
  whatsapp: '',
  currency: 'LKR',
  country: 'Sri Lanka',
  timezone: 'Asia/Colombo',
  logoUrl: '',
  faviconUrl: '',
  metaTitle: '',
  metaDescription: '',
};

const defaultTenantTheme = {
  theme: 'default',
  primaryColor: '#15803d',
  primaryDarkColor: '#0f5f2e',
  primaryLightColor: '#22c55e',
  secondaryColor: '#84cc16',
  accentColor: '#84cc16',
  darkBgColor: '#0f172a',
  darkColor: '#0f172a',
  fontStyle: 'default',
  fontFamily: 'default',
  darkMode: false,
  customCSS: '',
};

const tenantSchema = new mongoose.Schema({
  storeName: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },
  domains: { type: [domainSchema], default: [] },

  // Tenant settings/theme must be flexible because admin Settings + Theme Builder
  // save many flat keys. A strict nested schema silently dropped keys like
  // fontStyle, darkMode, primaryDarkColor, customCSS, etc., so values saved but
  // could not be applied to the storefront.
  settings: { type: mongoose.Schema.Types.Mixed, default: () => ({ ...defaultTenantSettings }) },
  theme: { type: mongoose.Schema.Types.Mixed, default: () => ({ ...defaultTenantTheme }) },
}, { timestamps: true, minimize: false });

tenantSchema.index({ 'domains.domain': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Tenant', tenantSchema);