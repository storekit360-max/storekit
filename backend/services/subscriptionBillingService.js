'use strict';
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const { Notification } = require('../models/index');

const DAY = 24 * 60 * 60 * 1000;
function addDays(date, days) { return new Date(new Date(date).getTime() + Number(days || 0) * DAY); }
function addMonths(date, months) { const d = new Date(date); d.setMonth(d.getMonth() + months); return d; }
function daysLeft(date) { if (!date) return null; return Math.ceil((new Date(date).getTime() - Date.now()) / DAY); }
function amountForPlan(plan, cycle) {
  if (!plan) return 0;
  if (cycle === 'yearly') return Number(plan.billing?.yearlyPrice ?? plan.price ?? 0);
  return Number(plan.billing?.monthlyPrice ?? plan.price ?? 0);
}
function nextDate(from, cycle) {
  if (cycle === 'yearly') return addMonths(from, 12);
  if (cycle === 'once') return null;
  return addMonths(from, 1);
}
async function createInvoice(tenant, periodStart, periodEnd) {
  const plan = tenant.plan?._id ? tenant.plan : await Plan.findById(tenant.plan);
  const invoiceNumber = `SK-${Date.now()}-${String(tenant._id).slice(-5)}`;
  return SubscriptionInvoice.create({
    tenantId: tenant._id,
    planId: plan?._id,
    invoiceNumber,
    amount: tenant.subscription?.amount ?? amountForPlan(plan, tenant.subscription?.billingCycle || plan?.billingCycle || 'monthly'),
    currency: tenant.subscription?.currency || plan?.currency || 'LKR',
    billingCycle: tenant.subscription?.billingCycle || plan?.billingCycle || 'monthly',
    dueAt: tenant.subscription?.nextBillingAt || periodEnd,
    periodStart,
    periodEnd,
  });
}
async function initializeTenantSubscription(tenant, planDoc) {
  const plan = planDoc || await Plan.findById(tenant.plan);
  const now = new Date();
  const cycle = plan?.billingCycle || 'monthly';
  const trialDays = Number(plan?.billing?.trialDays || 0);
  const amount = amountForPlan(plan, cycle);
  tenant.subscription = {
    ...(tenant.subscription || {}),
    status: trialDays > 0 ? 'trial' : 'active',
    billingCycle: cycle,
    currency: plan?.currency || tenant.settings?.currency || 'LKR',
    amount,
    trialStartedAt: trialDays > 0 ? now : tenant.subscription?.trialStartedAt,
    trialEndsAt: trialDays > 0 ? addDays(now, trialDays) : tenant.subscription?.trialEndsAt,
    currentPeriodStartedAt: now,
    nextBillingAt: trialDays > 0 ? addDays(now, trialDays) : nextDate(now, cycle),
    graceEndsAt: null,
    autoRenew: !!plan?.billing?.autoRenew,
    autoSuspend: plan?.billing?.autoSuspend !== false,
  };
  await tenant.save();
  return tenant;
}
async function renewTenant(tenantId, reviewerId) {
  const tenant = await Tenant.findById(tenantId).populate('plan');
  if (!tenant) throw new Error('Tenant not found');
  const now = new Date();
  const cycle = tenant.subscription?.billingCycle || tenant.plan?.billingCycle || 'monthly';
  const periodEnd = nextDate(now, cycle);
  tenant.status = 'active';
  tenant.subscription = {
    ...(tenant.subscription || {}),
    status: 'active',
    currentPeriodStartedAt: now,
    nextBillingAt: periodEnd,
    graceEndsAt: null,
    lastPaymentAt: now,
    amount: amountForPlan(tenant.plan, cycle),
    currency: tenant.plan?.currency || tenant.subscription?.currency || 'LKR',
  };
  await tenant.save();
  await createInvoice(tenant, now, periodEnd);
  await Notification.create({ type:'payment_confirmed', title:'Subscription renewed', message:`${tenant.storeName} subscription was renewed.`, link:'/superadmin', data:{ tenantId, reviewerId } }).catch(()=>{});
  return tenant;
}
async function runMaintenance() {
  const tenants = await Tenant.find({}).populate('plan');
  const now = new Date();
  const updates = [];
  for (const tenant of tenants) {
    const sub = tenant.subscription || {};
    const graceDays = Number(tenant.plan?.billing?.graceDays ?? 3);
    if (!sub.nextBillingAt) {
      await initializeTenantSubscription(tenant, tenant.plan);
    } else if (sub.status !== 'suspended' && sub.nextBillingAt && new Date(sub.nextBillingAt) < now) {
      if (!sub.graceEndsAt) {
        tenant.subscription.status = 'grace';
        tenant.subscription.graceEndsAt = addDays(now, graceDays);
        await tenant.save();
      } else if (new Date(sub.graceEndsAt) < now && sub.autoSuspend !== false) {
        tenant.subscription.status = 'suspended';
        tenant.status = 'suspended';
        await tenant.save();
      }
    }
    updates.push({ tenantId: tenant._id, storeName: tenant.storeName, status: tenant.status, subscriptionStatus: tenant.subscription?.status, nextBillingAt: tenant.subscription?.nextBillingAt, daysLeft: daysLeft(tenant.subscription?.nextBillingAt) });
  }
  return updates;
}
function subscriptionView(tenant) {
  const plan = tenant?.plan || null;
  const sub = tenant?.subscription || {};
  return {
    tenantId: tenant?._id,
    storeName: tenant?.storeName,
    status: tenant?.status,
    plan,
    subscription: sub,
    nextBillingAt: sub.nextBillingAt || null,
    trialEndsAt: sub.trialEndsAt || null,
    graceEndsAt: sub.graceEndsAt || null,
    daysLeft: daysLeft(sub.nextBillingAt || sub.trialEndsAt || sub.graceEndsAt),
    amount: sub.amount ?? amountForPlan(plan, sub.billingCycle || plan?.billingCycle || 'monthly'),
    currency: sub.currency || plan?.currency || 'LKR',
    billingCycle: sub.billingCycle || plan?.billingCycle || 'monthly',
  };
}
module.exports = { addDays, daysLeft, amountForPlan, initializeTenantSubscription, renewTenant, runMaintenance, subscriptionView };
