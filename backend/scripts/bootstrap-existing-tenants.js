'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const { normalizeDomain } = require('../middleware/tenant');
const { bootstrapTenantStore } = require('../utils/tenantBootstrap');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);

  const domain = normalizeDomain(process.env.TARGET_DOMAIN || '');
  const query = domain ? { 'domains.domain': domain } : {};
  const tenants = await Tenant.find(query);

  if (!tenants.length) {
    console.log(domain ? `No tenant found for ${domain}` : 'No tenants found');
    return;
  }

  for (const tenant of tenants) {
    await bootstrapTenantStore(tenant);
    console.log(`✅ Bootstrapped ${tenant.storeName} (${tenant._id})`);
  }
}

main()
  .then(async () => { await mongoose.disconnect(); console.log('DONE'); })
  .catch(async err => { console.error(err); await mongoose.disconnect().catch(() => {}); process.exit(1); });
