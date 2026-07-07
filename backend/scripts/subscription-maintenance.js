'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const { runBillingMaintenance } = require('../services/subscriptionBillingService');

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const results = await runBillingMaintenance();
  console.log(JSON.stringify(results, null, 2));
  await mongoose.disconnect();
})().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
