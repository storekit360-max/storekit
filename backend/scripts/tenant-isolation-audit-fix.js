'use strict';

/**
 * Tenant isolation audit + index hardening.
 *
 * Run after deploying tenant-isolation code:
 *   cd backend
 *   node scripts/tenant-isolation-audit-fix.js
 *
 * This script does NOT move tenant data between tenants. It only:
 *   - normalizes tenant domains
 *   - removes unsafe legacy global settings with tenantId:null/missing
 *   - drops legacy single-field unique indexes that cause cross-tenant conflicts
 *   - creates tenant-scoped indexes
 *   - prints per-collection tenant counts for verification
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const { normalizeDomain } = require('../middleware/tenant');

const COLLECTIONS = [
  { name: 'products', unique: [['slug']] },
  { name: 'categories', unique: [['slug']] },
  { name: 'coupons', unique: [['code']] },
  { name: 'banners' },
  { name: 'reviews' },
  { name: 'notifications' },
  { name: 'settings', unique: [['key']] },
  { name: 'giftcards', unique: [['code']] },
  { name: 'returnrequests' },
  { name: 'otps' },
  { name: 'seasonalcampaigns' },
  { name: 'paymentgateways', unique: [['gateway']] },
  { name: 'deliveryservices', unique: [['code']] },
  { name: 'businesspages', unique: [['slug']] },
  { name: 'subscribers', unique: [['email']] },
  { name: 'deals' },
  { name: 'socialmedias' },
];

async function safeDropIndex(collection, indexName) {
  try {
    const indexes = await collection.indexes();
    if (indexes.some(i => i.name === indexName)) {
      await collection.dropIndex(indexName);
      console.log(`Dropped legacy index ${collection.collectionName}.${indexName}`);
    }
  } catch (err) {
    if (!/index not found|ns not found/i.test(err.message)) throw err;
  }
}

async function ensureIndexes(db) {
  for (const item of COLLECTIONS) {
    const col = db.collection(item.name);
    await col.createIndex({ tenantId: 1 });

    for (const fields of item.unique || []) {
      const legacyName = fields.map(f => `${f}_1`).join('_');
      await safeDropIndex(col, legacyName);
      const key = { tenantId: 1 };
      fields.forEach(f => { key[f] = 1; });
      await col.createIndex(key, { unique: true, sparse: true });
    }
  }
}

async function normalizeTenantDomains() {
  const tenants = await Tenant.find({});
  for (const tenant of tenants) {
    let changed = false;
    tenant.domains = (tenant.domains || []).map(d => {
      const normalized = normalizeDomain(d.domain);
      if (d.domain !== normalized) changed = true;
      return { ...d.toObject?.() || d, domain: normalized };
    });
    if (changed) await tenant.save();
  }
}

async function deleteUnsafeGlobalSettings(db) {
  const result = await db.collection('settings').deleteMany({
    $or: [{ tenantId: null }, { tenantId: { $exists: false } }],
  });
  if (result.deletedCount) console.log(`Deleted unsafe global/null settings: ${result.deletedCount}`);
}

async function printAudit(db) {
  const tenants = await Tenant.find({}, { storeName: 1, domains: 1, status: 1 }).lean();
  console.log('TENANTS:', tenants.map(t => ({
    id: String(t._id),
    storeName: t.storeName,
    status: t.status,
    domains: (t.domains || []).map(d => d.domain),
  })));

  for (const item of COLLECTIONS) {
    const rows = await db.collection(item.name).aggregate([
      { $group: { _id: '$tenantId', count: { $sum: 1 } } },
    ]).toArray();
    console.log(item.name, rows.map(r => ({ tenantId: r._id ? String(r._id) : null, count: r.count })));
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  await normalizeTenantDomains();
  await ensureIndexes(db);
  await deleteUnsafeGlobalSettings(db);
  await printAudit(db);
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
