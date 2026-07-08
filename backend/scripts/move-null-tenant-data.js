'use strict';
/**
 * Moves tenantId:null / missing documents to ONE selected tenant.
 * Use ONLY for data created during the regression window.
 * Example:
 *   TARGET_DOMAIN="storekit-oimh-three.vercel.app" node scripts/move-null-tenant-data.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const { normalizeDomain } = require('../middleware/tenant');

const COLLECTIONS = [
  'products','categories','banners','coupons','deals','settings','businesspages',
  'seasonalcampaigns','socialmedias','giftcards','deliveryservices','paymentgateways',
  'subscribers','reviews','orders','notifications','returnrequests','otps','automationrules','publishlogs'
];

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const domain = normalizeDomain(process.env.TARGET_DOMAIN || '');
  if (!domain) throw new Error('TARGET_DOMAIN is required');

  await mongoose.connect(process.env.MONGODB_URI);
  const tenant = await Tenant.findOne({ 'domains.domain': domain });
  if (!tenant) throw new Error(`Tenant not found for ${domain}`);

  console.log(`Moving null/shared documents to: ${tenant.storeName} (${tenant._id})`);
  for (const name of COLLECTIONS) {
    const exists = await mongoose.connection.db.listCollections({ name }).hasNext();
    if (!exists) continue;
    const result = await mongoose.connection.db.collection(name).updateMany(
      { $or: [{ tenantId: null }, { tenantId: { $exists: false } }] },
      { $set: { tenantId: tenant._id } }
    );
    if (result.modifiedCount) console.log(`${name}: ${result.modifiedCount}`);
  }
  await mongoose.disconnect();
}
main().catch(async err => { console.error(err); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
