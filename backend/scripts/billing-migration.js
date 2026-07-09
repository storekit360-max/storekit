'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const { initializeTenantSubscription, runMaintenance } = require('../services/subscriptionBillingService');
function slugify(v){ return String(v||'plan').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'plan'; }
(async()=>{
  await mongoose.connect(process.env.MONGODB_URI);
  const plans = await Plan.find({});
  for (const plan of plans) {
    if (!plan.slug) plan.slug = slugify(plan.name);
    plan.billing = { monthlyPrice: plan.billing?.monthlyPrice ?? plan.price ?? 0, yearlyPrice: plan.billing?.yearlyPrice ?? Math.round((plan.price || 0) * 10), trialDays: plan.billing?.trialDays ?? 0, graceDays: plan.billing?.graceDays ?? 3, autoRenew: !!plan.billing?.autoRenew, autoSuspend: plan.billing?.autoSuspend !== false };
    plan.limits = { products: plan.limits?.products ?? 100, admins: plan.limits?.admins ?? 2, ordersPerMonth: plan.limits?.ordersPerMonth ?? 500, storageMb: plan.limits?.storageMb ?? 500, templates: plan.limits?.templates ?? 1, coupons: plan.limits?.coupons ?? 10, banners: plan.limits?.banners ?? 5 };
    await plan.save();
    console.log('Plan billing ready:', plan.name);
  }
  const tenants = await Tenant.find({}).populate('plan');
  for (const tenant of tenants) if (!tenant.subscription || !tenant.subscription.status) await initializeTenantSubscription(tenant, tenant.plan);
  console.log('Billing maintenance:', await runMaintenance());
  await mongoose.disconnect();
})().catch(async err=>{ console.error(err); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
