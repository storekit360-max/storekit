'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
require('../models/SubscriptionInvoice');
require('../models/SubscriptionPayment');
require('../models/SubscriptionCoupon');
const { initializeTenantSubscription, runBillingMaintenance } = require('../services/subscriptionBillingService');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);

  const plans = await Plan.find();
  for (const plan of plans) {
    plan.billing = {
      monthlyPrice: Number(plan.billing?.monthlyPrice ?? plan.price ?? 0),
      yearlyPrice: Number(plan.billing?.yearlyPrice ?? (Number(plan.billing?.monthlyPrice ?? plan.price ?? 0) * 12)),
      trialDays: Number(plan.billing?.trialDays ?? 0),
      graceDays: Number(plan.billing?.graceDays ?? 3),
      taxPercent: Number(plan.billing?.taxPercent ?? 0),
      autoRenew: plan.billing?.autoRenew !== false,
      allowMonthly: plan.billing?.allowMonthly !== false,
      allowYearly: plan.billing?.allowYearly !== false,
      invoicePrefix: plan.billing?.invoicePrefix || 'INV',
    };
    await plan.save();
    console.log('Plan billing ready:', plan.name);
  }

  const tenants = await Tenant.find().populate('plan');
  for (const tenant of tenants) {
    if (!tenant.subscription?.currentPeriodStart) {
      await initializeTenantSubscription(tenant, tenant.plan, {
        billingCycle: tenant.plan?.billingCycle || 'monthly',
        autoRenew: tenant.plan?.billing?.autoRenew !== false,
      });
      console.log('Subscription initialized:', tenant.storeName);
    }
  }

  const results = await runBillingMaintenance();
  console.log('Billing maintenance:', results);
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
