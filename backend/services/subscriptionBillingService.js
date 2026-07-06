'use strict';

const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const SubscriptionCoupon = require('../models/SubscriptionCoupon');

function addDays(date, days) {
  const d = new Date(date || Date.now());
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function addMonths(date, months) {
  const d = new Date(date || Date.now());
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
}

function normalizeBillingCycle(cycle) {
  return ['monthly', 'yearly', 'once'].includes(cycle) ? cycle : 'monthly';
}

function getPlanPrice(plan, cycle) {
  const billing = plan?.billing || {};
  if (cycle === 'yearly') return Number(billing.yearlyPrice || (plan.price ? Number(plan.price) * 12 : 0));
  if (cycle === 'once') return Number(plan.price || billing.monthlyPrice || 0);
  return Number(billing.monthlyPrice || plan.price || 0);
}

function getPeriodEnd(start, cycle) {
  if (cycle === 'yearly') return addMonths(start, 12);
  if (cycle === 'once') return null;
  return addMonths(start, 1);
}

async function nextInvoiceNumber(prefix = 'INV') {
  const cleanPrefix = String(prefix || 'INV').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'INV';
  const count = await SubscriptionInvoice.countDocuments();
  return `${cleanPrefix}-${String(count + 1).padStart(6, '0')}`;
}

async function calculateDiscount({ couponCode, plan, billingCycle, subtotal }) {
  if (!couponCode) return { discount: 0, coupon: null };
  const coupon = await SubscriptionCoupon.findOne({ code: String(couponCode).toUpperCase().trim() });
  if (!coupon || !coupon.isUsableFor(plan._id, billingCycle)) return { discount: 0, coupon: null };
  const raw = coupon.type === 'fixed' ? Number(coupon.value) : subtotal * (Number(coupon.value) / 100);
  return { discount: Math.max(0, Math.min(subtotal, raw)), coupon };
}

async function issueInvoice({ tenant, plan, billingCycle, couponCode = '', status = 'issued', dueDays = 7, notes = '' }) {
  const cycle = normalizeBillingCycle(billingCycle || tenant.subscription?.billingCycle || plan.billingCycle);
  const periodStart = new Date();
  const periodEnd = getPeriodEnd(periodStart, cycle);
  const unitPrice = getPlanPrice(plan, cycle);
  const subtotal = unitPrice;
  const { discount, coupon } = await calculateDiscount({ couponCode, plan, billingCycle: cycle, subtotal });
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * (Number(plan.billing?.taxPercent || 0) / 100);
  const total = Math.max(0, taxable + tax);
  const invoice = await SubscriptionInvoice.create({
    invoiceNumber: await nextInvoiceNumber(plan.billing?.invoicePrefix),
    tenant: tenant._id,
    plan: plan._id,
    billingCycle: cycle,
    periodStart,
    periodEnd,
    currency: plan.currency || 'LKR',
    lineItems: [{ description: `${plan.name} ${cycle} subscription`, quantity: 1, unitPrice, amount: unitPrice }],
    subtotal,
    discount,
    tax,
    total,
    couponCode: coupon ? coupon.code : '',
    status,
    dueDate: addDays(periodStart, dueDays),
    notes,
  });
  if (coupon) {
    coupon.redemptionCount += 1;
    await coupon.save();
  }
  return invoice;
}

async function initializeTenantSubscription(tenant, plan, options = {}) {
  const now = new Date();
  const cycle = normalizeBillingCycle(options.billingCycle || plan.billingCycle || 'monthly');
  const trialDays = Number(options.trialDays ?? plan.billing?.trialDays ?? 0);
  const periodStart = now;
  const trialEnd = trialDays > 0 ? addDays(now, trialDays) : null;
  const currentPeriodEnd = trialEnd || getPeriodEnd(periodStart, cycle);
  tenant.subscription = {
    ...(tenant.subscription || {}),
    status: trialDays > 0 ? 'trialing' : 'active',
    billingCycle: cycle,
    trialStart: trialDays > 0 ? now : null,
    trialEnd,
    currentPeriodStart: periodStart,
    currentPeriodEnd,
    graceUntil: null,
    autoRenew: options.autoRenew ?? plan.billing?.autoRenew ?? true,
    cancelAtPeriodEnd: false,
    lastPaymentStatus: 'none',
    failedPaymentCount: 0,
    couponCode: options.couponCode ? String(options.couponCode).toUpperCase().trim() : '',
    suspendedReason: '',
  };
  tenant.status = 'active';
  await tenant.save();
  return tenant;
}

async function ensureTenantSubscription(tenant) {
  const plan = tenant.plan?.name ? tenant.plan : await Plan.findById(tenant.plan);
  if (!plan) return tenant;
  if (!tenant.subscription?.currentPeriodStart) {
    return initializeTenantSubscription(tenant, plan, {});
  }
  return refreshTenantLifecycle(tenant, plan);
}

async function refreshTenantLifecycle(tenant, planArg) {
  const plan = planArg?.name ? planArg : await Plan.findById(tenant.plan);
  const sub = tenant.subscription || {};
  const now = new Date();
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const graceDays = Number(plan?.billing?.graceDays ?? 3);

  if (sub.status === 'cancelled') {
    tenant.status = 'suspended';
    sub.suspendedReason = 'Subscription cancelled';
  } else if (periodEnd && periodEnd < now && !sub.autoRenew) {
    sub.status = 'expired';
    tenant.status = 'expired';
    sub.suspendedReason = 'Subscription expired and auto-renew is disabled';
  } else if (periodEnd && periodEnd < now && sub.lastPaymentStatus === 'failed') {
    const graceUntil = sub.graceUntil || addDays(periodEnd, graceDays);
    sub.graceUntil = graceUntil;
    if (new Date(graceUntil) < now) {
      sub.status = 'expired';
      tenant.status = 'expired';
      sub.suspendedReason = 'Grace period ended after failed payment';
    } else {
      sub.status = 'grace';
      tenant.status = 'active';
    }
  } else if (sub.trialEnd && new Date(sub.trialEnd) >= now) {
    sub.status = 'trialing';
    tenant.status = 'active';
  } else if (sub.status !== 'cancelled') {
    sub.status = tenant.status === 'suspended' ? sub.status : 'active';
  }

  tenant.subscription = sub;
  await tenant.save();
  return tenant;
}

async function changeTenantPlan(tenantId, { planId, billingCycle, couponCode, invoice = true }) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');
  const plan = await Plan.findById(planId || tenant.plan);
  if (!plan) throw new Error('Plan not found');
  tenant.plan = plan._id;
  await initializeTenantSubscription(tenant, plan, { billingCycle, couponCode });
  let createdInvoice = null;
  if (invoice) {
    createdInvoice = await issueInvoice({ tenant, plan, billingCycle: tenant.subscription.billingCycle, couponCode: tenant.subscription.couponCode, notes: 'Plan changed by Super Admin' });
    tenant.subscription.lastInvoice = createdInvoice._id;
    await tenant.save();
  }
  return { tenant: await Tenant.findById(tenant._id).populate('plan').populate('owner', 'firstName lastName email username role'), invoice: createdInvoice };
}

async function recordPayment({ tenantId, invoiceId, amount, currency, method = 'manual', status = 'succeeded', transactionId = '', failureReason = '', notes = '', recordedBy = null }) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');
  const invoice = invoiceId ? await SubscriptionInvoice.findById(invoiceId) : null;
  const plan = await Plan.findById(tenant.plan);
  const payment = await SubscriptionPayment.create({
    tenant: tenant._id,
    invoice: invoice?._id || null,
    amount: Number(amount ?? invoice?.total ?? 0),
    currency: currency || invoice?.currency || plan?.currency || 'LKR',
    billingCycle: tenant.subscription?.billingCycle || plan?.billingCycle || 'monthly',
    method,
    status,
    transactionId,
    failureReason,
    recordedBy,
    notes,
  });

  tenant.subscription = tenant.subscription || {};
  tenant.subscription.lastPaymentStatus = status === 'failed' ? 'failed' : status === 'pending' ? 'pending' : 'succeeded';
  if (status === 'failed') {
    tenant.subscription.failedPaymentCount = Number(tenant.subscription.failedPaymentCount || 0) + 1;
  } else if (status === 'succeeded') {
    tenant.subscription.failedPaymentCount = 0;
    tenant.subscription.status = 'active';
    tenant.status = 'active';
    tenant.subscription.graceUntil = null;
    tenant.subscription.suspendedReason = '';
    const start = new Date();
    tenant.subscription.currentPeriodStart = start;
    tenant.subscription.currentPeriodEnd = getPeriodEnd(start, tenant.subscription.billingCycle || 'monthly');
  }
  if (invoice && status === 'succeeded') {
    invoice.status = 'paid';
    invoice.paidAt = new Date();
    await invoice.save();
    tenant.subscription.lastInvoice = invoice._id;
  }
  await tenant.save();
  return payment;
}

async function runBillingMaintenance() {
  const tenants = await Tenant.find().populate('plan');
  const results = [];
  for (const tenant of tenants) {
    // eslint-disable-next-line no-await-in-loop
    await refreshTenantLifecycle(tenant, tenant.plan);
    results.push({ tenantId: tenant._id, storeName: tenant.storeName, status: tenant.status, subscriptionStatus: tenant.subscription?.status });
  }
  return results;
}

module.exports = {
  addDays,
  addMonths,
  changeTenantPlan,
  ensureTenantSubscription,
  getPlanPrice,
  initializeTenantSubscription,
  issueInvoice,
  recordPayment,
  refreshTenantLifecycle,
  runBillingMaintenance,
};
