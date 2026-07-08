'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const { runMaintenance } = require('../services/subscriptionBillingService');
(async()=>{ await mongoose.connect(process.env.MONGODB_URI); const results=await runMaintenance(); console.log(JSON.stringify(results,null,2)); await mongoose.disconnect(); })().catch(async e=>{console.error(e); await mongoose.disconnect().catch(()=>{}); process.exit(1);});
