'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const { runMaintenance } = require('../services/subscriptionBillingService');
(async()=>{ await mongoose.connect(process.env.MONGODB_URI); console.log(JSON.stringify(await runMaintenance(), null, 2)); await mongoose.disconnect(); })().catch(async err=>{ console.error(err); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
