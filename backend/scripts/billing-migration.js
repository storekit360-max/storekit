'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const { initializeTenantSubscription } = require('../services/subscriptionBillingService');
function slugify(v){return String(v||'plan').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||'plan'}
(async()=>{ await mongoose.connect(process.env.MONGODB_URI); const plans=await Plan.find(); for(const p of plans){ let changed=false; if(!p.slug){p.slug=slugify(p.name); changed=true} if(!p.monthlyPrice){p.monthlyPrice=p.price||0; changed=true} if(!p.yearlyPrice){p.yearlyPrice=Math.round((p.monthlyPrice||0)*12*0.9); changed=true} if(p.trialDays==null){p.trialDays=14; changed=true} if(p.graceDays==null){p.graceDays=7; changed=true} if(changed) await p.save(); console.log('Plan billing ready:', p.name); } const tenants=await Tenant.find().populate('plan'); const out=[]; for(const t of tenants){ await initializeTenantSubscription(t,t.plan); out.push({tenantId:t._id,storeName:t.storeName,status:t.status,subscriptionStatus:t.subscription.status}); } console.log('Billing maintenance:', out); await mongoose.disconnect(); })().catch(async e=>{console.error(e); await mongoose.disconnect().catch(()=>{}); process.exit(1);});
