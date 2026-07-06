'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function dropIndexIfExists(collectionName, indexName) {
  const col = mongoose.connection.db.collection(collectionName);
  try {
    const indexes = await col.indexes();
    if (indexes.some(i => i.name === indexName)) {
      await col.dropIndex(indexName);
      console.log(`Dropped ${collectionName}.${indexName}`);
    }
  } catch (err) {
    if (!/index not found|ns not found/i.test(err.message)) throw err;
  }
}

async function ensureIndex(collectionName, spec, options = {}) {
  await mongoose.connection.db.collection(collectionName).createIndex(spec, options);
  console.log(`Ensured ${collectionName}.${JSON.stringify(spec)}`);
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);

  await dropIndexIfExists('deliveryservices', 'code_1');
  await ensureIndex('deliveryservices', { tenantId: 1, code: 1 }, { unique: true, sparse: true });
  await ensureIndex('products', { tenantId: 1, slug: 1 }, { unique: true, sparse: true });
  await ensureIndex('categories', { tenantId: 1, slug: 1 }, { unique: true, sparse: true });
  await ensureIndex('banners', { tenantId: 1 });
  await ensureIndex('settings', { tenantId: 1, key: 1 }, { unique: true, sparse: true });
  await ensureIndex('businesspages', { tenantId: 1, slug: 1 }, { unique: true, sparse: true });

  console.log('Sell-ready indexes completed.');
}

main()
  .then(async () => { await mongoose.disconnect(); })
  .catch(async err => { console.error(err); await mongoose.disconnect().catch(() => {}); process.exit(1); });
