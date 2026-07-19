'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const { tick } = require('../services/subscriptionService');
(async()=>{ await mongoose.connect(process.env.MONGODB_URI); console.log(JSON.stringify(await tick(), null, 2)); await mongoose.disconnect(); })().catch(async err=>{ console.error(err); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
