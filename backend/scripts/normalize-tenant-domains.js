'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const { normalizeDomain } = require('../middleware/tenant');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);

  const tenants = await Tenant.find({});
  for (const tenant of tenants) {
    let changed = false;
    const seen = new Set();

    tenant.domains = (tenant.domains || [])
      .map((entry) => {
        const clean = normalizeDomain(entry.domain);
        if (entry.domain !== clean) changed = true;
        return { ...entry.toObject?.() || entry, domain: clean };
      })
      .filter((entry) => {
        if (!entry.domain) return false;
        const key = `${entry.domain}:${entry.type || 'alias'}`;
        if (seen.has(key)) {
          changed = true;
          return false;
        }
        seen.add(key);
        return true;
      });

    if (changed) {
      await tenant.save();
      console.log(`Normalized domains for ${tenant.storeName}:`, tenant.domains.map(d => d.domain));
    }
  }

  console.log('Tenant domain normalization completed.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
