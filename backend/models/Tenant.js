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
  theme: {
    primaryColor: { type: String, default: '#15803d' },
    accentColor: { type: String, default: '#84cc16' },
    darkColor: { type: String, default: '#0f172a' },
    fontFamily: { type: String, default: 'Inter' },
  },
}, { timestamps: true });

tenantSchema.index({ 'domains.domain': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Tenant', tenantSchema);
