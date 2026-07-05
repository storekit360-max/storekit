'use strict';

/**
 * One-time tenant isolation DB migration.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node backend/scripts/tenant-isolation-migration.js
 *
 * Optional orphan backfill:
 *   BACKFILL_TENANT_DOMAIN="example.com" MONGODB_URI="..." node backend/scripts/tenant-isolation-migration.js
 *
 * BACKFILL_TENANT_DOMAIN assigns old tenantId:null storefront data to that tenant.
 * Run without BACKFILL_TENANT_DOMAIN if you want old shared data to remain hidden.
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { normalizeDomain } = require('../middleware/tenant');
const Tenant = require('../models/Tenant');
require('../models/Product');
require('../models/Order');
require('../models/User');
const models = require('../models/index');

const COLLECTIONS = [
  'products', 'orders', 'users', 'categories', 'coupons', 'banners', 'reviews',
  'notifications', 'settings', 'giftcards', 'returnrequests', 'otps',
  'seasonalcampaigns', 'paymentgateways', 'deliveryservices', 'businesspages',
  'subscribers', 'deals', 'socialmedias', 'automationrules', 'publishlogs',
];

async function dropIndexIfExists(collection, name) {
  try {
    const indexes = await collection.indexes();
    if (indexes.some(i => i.name === name)) {
      await collection.dropIndex(name);
      console.log(`Dropped ${collection.collectionName}.${name}`);
    }
  } catch (err) {
    if (!/index not found|ns not found/i.test(err.message)) throw err;
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);

  const db = mongoose.connection.db;

  for (const name of COLLECTIONS) {
    await db.collection(name).createIndex({ tenantId: 1 });
  }

  await dropIndexIfExists(db.collection('products'), 'slug_1');
  await dropIndexIfExists(db.collection('categories'), 'slug_1');
  await dropIndexIfExists(db.collection('coupons'), 'code_1');
  await dropIndexIfExists(db.collection('settings'), 'key_1');
  await dropIndexIfExists(db.collection('giftcards'), 'code_1');
  await dropIndexIfExists(db.collection('paymentgateways'), 'gateway_1');
  await dropIndexIfExists(db.collection('businesspages'), 'slug_1');
  await dropIndexIfExists(db.collection('subscribers'), 'email_1');
  await dropIndexIfExists(db.collection('users'), 'email_1');
  await dropIndexIfExists(db.collection('users'), 'username_1');

  await db.collection('products').createIndex({ tenantId: 1, slug: 1 }, { unique: true, sparse: true });
  await db.collection('categories').createIndex({ tenantId: 1, slug: 1 }, { unique: true, sparse: true });
  await db.collection('coupons').createIndex({ tenantId: 1, code: 1 }, { unique: true, sparse: true });
  await db.collection('settings').createIndex({ tenantId: 1, key: 1 }, { unique: true, sparse: true });
  await db.collection('giftcards').createIndex({ tenantId: 1, code: 1 }, { unique: true, sparse: true });
  await db.collection('paymentgateways').createIndex({ tenantId: 1, gateway: 1 }, { unique: true, sparse: true });
  await db.collection('businesspages').createIndex({ tenantId: 1, slug: 1 }, { unique: true, sparse: true });
  await db.collection('subscribers').createIndex({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
  await db.collection('users').createIndex({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
  await db.collection('users').createIndex({ tenantId: 1, username: 1 }, { unique: true, sparse: true });

  const domain = normalizeDomain(process.env.BACKFILL_TENANT_DOMAIN || '');
  if (domain) {
    const tenant = await Tenant.findOne({ 'domains.domain': domain });
    if (!tenant) throw new Error(`No tenant found for BACKFILL_TENANT_DOMAIN=${domain}`);
    for (const name of COLLECTIONS.filter(n => n !== 'users')) {
      const result = await db.collection(name).updateMany(
        { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] },
        { $set: { tenantId: tenant._id } }
      );
      if (result.modifiedCount) console.log(`Backfilled ${result.modifiedCount} ${name} docs to ${tenant.storeName}`);
    }
  }

  console.log('Tenant isolation migration completed.');
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
