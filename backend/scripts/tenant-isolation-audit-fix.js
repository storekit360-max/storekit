'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
require('../models/Product');
require('../models/index');

const COLLECTIONS = [
  'products','categories','banners','coupons','settings','businesspages','deals','socialmedias',
  'seasonalcampaigns','giftcards','subscribers','notifications','orders','reviews','returnrequests',
  'paymentgateways','deliveryservices','otps'
];

async function safeDropIndex(col, name) {
  try {
    const indexes = await col.indexes();
    if (indexes.some(i => i.name === name)) {
      await col.dropIndex(name);
      console.log(`Dropped legacy index ${col.collectionName}.${name}`);
    }
  } catch (err) {
    if (!/index not found|ns not found/i.test(err.message)) throw err;
  }
}

async function safeCreateIndex(col, keys, options = {}) {
  try {
    await col.createIndex(keys, options);
  } catch (err) {
    if (err.code === 86) {
      console.log(`Index already exists: ${col.collectionName}.${options.name || 'custom'}`);
      return;
    }
    throw err;
  }
}

async function summarize(db, tenants) {
  console.log('TENANTS:', tenants.map(t => ({ id: String(t._id), storeName: t.storeName, domains: (t.domains || []).map(d => d.domain) })));
  for (const name of COLLECTIONS) {
    try {
      const rows = await db.collection(name).aggregate([
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
        { $project: { _id: 0, tenantId: { $toString: '$_id' }, count: 1 } },
      ]).toArray();
      console.log(name, rows);
    } catch (err) {
      if (!/ns does not exist/i.test(err.message)) console.warn(name, err.message);
    }
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  await safeDropIndex(db.collection('products'), 'slug_1');
  await safeDropIndex(db.collection('categories'), 'slug_1');
  await safeDropIndex(db.collection('coupons'), 'code_1');
  await safeDropIndex(db.collection('settings'), 'key_1');
  await safeDropIndex(db.collection('businesspages'), 'slug_1');
  await safeDropIndex(db.collection('giftcards'), 'code_1');
  await safeDropIndex(db.collection('subscribers'), 'email_1');
  await safeDropIndex(db.collection('paymentgateways'), 'gateway_1');
  await safeDropIndex(db.collection('deliveryservices'), 'code_1');

  await safeCreateIndex(db.collection('products'), { tenantId: 1, slug: 1 }, { unique: true, sparse: true, name: 'tenantId_1_slug_1' });
  await safeCreateIndex(db.collection('categories'), { tenantId: 1, slug: 1 }, { unique: true, sparse: true, name: 'tenantId_1_slug_1' });
  await safeCreateIndex(db.collection('coupons'), { tenantId: 1, code: 1 }, { unique: true, sparse: true, name: 'tenantId_1_code_1' });
  await safeCreateIndex(db.collection('settings'), { tenantId: 1, key: 1 }, { unique: true, sparse: true, name: 'tenantId_1_key_1' });
  await safeCreateIndex(db.collection('businesspages'), { tenantId: 1, slug: 1 }, { unique: true, sparse: true, name: 'tenantId_1_slug_1' });

  const tenants = await Tenant.find({}).lean();
  await summarize(db, tenants);
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
