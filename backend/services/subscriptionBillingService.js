'use strict';

const Plan = require('../models/Plan');
const Tenant = require('../models/Tenant');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const SubscriptionCoupon = require('../models/SubscriptionCoupon');
const { Notification } = require('../models/index');

function addDays(date, days) { const d = new Date(date || Date.now()); d.setDate(d.getDate() + Number(days || 0)); return d; }
function addMonths(date, months) { const d = new Date(date || Date.now()); d.setMonth(d.getMonth() + Number(months || 0)); return d; }
function normalizeBillingCycle(cycle) { return ['monthly', 'yearly', 'once'].includes(cycle) ? cycle : 'monthly'; }
function getPlanPrice(plan, cycle) {
  const billing = plan?.billing || {};
  if (cycle === 'yearly') return Number(billing.yearlyPrice || (billing.monthlyPrice ? Number(billing.monthlyPrice) * 12 : Number(plan.price || 0) * 12));
  if (cycle === 'once') return Number(plan.price || billing.monthlyPrice || 0);
  return Number(billing.monthlyPrice || plan.price || 0);
}
function getPeriodEnd(start, cycle) { if (cycle === 'yearly') return addMonths(start, 12); if (cycle === 'once') return null; return addMonths(start, 1); }
function daysBetween(a, b) { return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }
function money(n) { return Number(n || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 }); }

async function nextInvoiceNumber(prefix = 'INV') {
  const cleanPrefix = String(prefix || 'INV').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'INV';
  const count = await SubscriptionInvoice.countDocuments();
  return `${cleanPrefix}-${String(count + 1).padStart(6, '0')}`;
}

async function notifyTenant(tenant, type, title, message, meta = {}) {
  try {
    await Notification.create({ tenantId: tenant._id, type, title, message, meta, isRead: false });
  } catch (err) {
    console.warn('[billing notify]', err.message);
  }
}

async function calculateDiscount({ couponCode, plan, billingCycle, subtotal }) {
  if (!couponCode) return { discount: 0, coupon: null };
  const coupon = await SubscriptionCoupon.findOne({ code: String(couponCode).toUpperCase().trim() });
  if (!coupon || !coupon.isUsableFor(plan._id, billingCycle)) return { discount: 0, coupon: null };
  const raw = coupon.type === 'fixed' ? Number(coupon.value) : subtotal * (Number(coupon.value) / 100);
  return { discount: Math.max(0, Math.min(subtotal, raw)), coupon };
}

async function issueInvoice({ tenant, plan, billingCycle, couponCode = '', status = 'issued', dueDays = 7, notes = '', notify = true }) {
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
  if (coupon) { coupon.redemptionCount += 1; await coupon.save(); }
  tenant.subscription = tenant.subscription || {};
  tenant.subscription.lastInvoice = invoice._id;
  await tenant.save();
  if (notify) {
    await notifyTenant(tenant, 'subscription_invoice', 'Subscription invoice issued', `${invoice.invoiceNumber} is due. Amount: ${invoice.currency} ${money(invoice.total)}.`, { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber });
  }
  return invoice;
}

async function initializeTenantSubscription(tenant, plan, options = {}) {
  const now = new Date();
  const cycle = normalizeBillingCycle(options.billingCycle || plan.billingCycle || 'monthly');
  const trialDays = Number(options.trialDays ?? plan.billing?.trialDays ?? 0);
  const trialEnd = trialDays > 0 ? addDays(now, trialDays) : null;
  tenant.subscription = {
    ...(tenant.subscription || {}),
    status: trialDays > 0 ? 'trialing' : 'active',
    billingCycle: cycle,
    trialStart: trialDays > 0 ? now : null,
    trialEnd,
    currentPeriodStart: now,
    currentPeriodEnd: trialEnd || getPeriodEnd(now, cycle),
    graceUntil: null,
    autoRenew: options.autoRenew ?? plan.billing?.autoRenew ?? true,
    cancelAtPeriodEnd: false,
    lastPaymentStatus: 'none',
    failedPaymentCount: 0,
    couponCode: options.couponCode ? String(options.couponCode).toUpperCase().trim() : '',
    suspendedReason: '',
    reminders: { trialEndingSentAt: null, paymentDueSentAt: null, graceSentAt: null, expiredSentAt: null },
  };
  tenant.status = 'active';
  await tenant.save();
  return tenant;
}

async function ensureTenantSubscription(tenant) {
  const plan = tenant.plan?.name ? tenant.plan : await Plan.findById(tenant.plan);
  if (!plan) return tenant;
  if (!tenant.subscription?.currentPeriodStart) return initializeTenantSubscription(tenant, plan, {});
  return refreshTenantLifecycle(tenant, plan);
}

async function refreshTenantLifecycle(tenant, planArg) {
  const plan = planArg?.name ? planArg : await Plan.findById(tenant.plan);
  if (!plan) return tenant;
  const sub = tenant.subscription || {};
  sub.reminders = sub.reminders || {};
  const now = new Date();
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const graceDays = Number(plan.billing?.graceDays ?? 3);

  if (sub.status === 'cancelled') {
    tenant.status = 'suspended';
    sub.suspendedReason = 'Subscription cancelled';
  } else if (sub.trialEnd && new Date(sub.trialEnd) >= now) {
    sub.status = 'trialing';
    tenant.status = 'active';
    const left = daysBetween(now, sub.trialEnd);
    if (left <= 3 && !sub.reminders.trialEndingSentAt) {
      await notifyTenant(tenant, 'subscription_trial_ending', 'Trial ending soon', `Your trial ends in ${Math.max(left, 0)} day(s). Please complete monthly payment to keep your store active.`);
      sub.reminders.trialEndingSentAt = now;
    }
  } else if (periodEnd && periodEnd < now) {
    const unpaidOpenInvoice = await SubscriptionInvoice.findOne({ tenant: tenant._id, status: { $in: ['issued', 'overdue'] } }).sort({ createdAt: -1 });
    if (unpaidOpenInvoice) {
      unpaidOpenInvoice.status = 'overdue';
      await unpaidOpenInvoice.save();
    }
    const graceUntil = sub.graceUntil || addDays(periodEnd, graceDays);
    sub.graceUntil = graceUntil;
    if (new Date(graceUntil) < now) {
      sub.status = 'expired';
      tenant.status = 'expired';
      sub.suspendedReason = 'Subscription expired after grace period';
      if (!sub.reminders.expiredSentAt) {
        await notifyTenant(tenant, 'subscription_expired', 'Store suspended', 'Your subscription grace period ended. Please contact support or complete payment to reactivate your store.');
        sub.reminders.expiredSentAt = now;
      }
    } else {
      sub.status = 'grace';
      tenant.status = 'active';
      if (!sub.reminders.graceSentAt) {
        await notifyTenant(tenant, 'subscription_grace', 'Payment grace period started', `Your store is still active, but payment is overdue. Grace period ends on ${new Date(graceUntil).toLocaleDateString()}.`);
        sub.reminders.graceSentAt = now;
      }
    }
  } else if (periodEnd) {
    sub.status = tenant.status === 'suspended' ? sub.status : 'active';
    const daysLeft = daysBetween(now, periodEnd);
    if (daysLeft <= 5 && daysLeft >= 0 && !sub.reminders.paymentDueSentAt) {
      const existing = await SubscriptionInvoice.findOne({ tenant: tenant._id, status: { $in: ['issued', 'overdue'] }, periodEnd: { $gte: now } });
      if (!existing && sub.autoRenew !== false) {
        await issueInvoice({ tenant, plan, billingCycle: sub.billingCycle, couponCode: sub.couponCode, dueDays: Math.max(daysLeft, 1), notes: 'Auto-generated renewal invoice', notify: true });
      } else {
        await notifyTenant(tenant, 'subscription_payment_due', 'Subscription payment due soon', `Your ${sub.billingCycle} subscription ends in ${daysLeft} day(s). Please complete payment to avoid interruption.`);
      }
      sub.reminders.paymentDueSentAt = now;
    }
  } else {
    sub.status = 'active';
    tenant.status = tenant.status === 'expired' ? 'active' : tenant.status;
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
  if (invoice) createdInvoice = await issueInvoice({ tenant, plan, billingCycle: tenant.subscription.billingCycle, couponCode: tenant.subscription.couponCode, notes: 'Plan changed by Super Admin' });
  return { tenant: await Tenant.findById(tenant._id).populate('plan').populate('owner', 'firstName lastName email username role'), invoice: createdInvoice };
}

async function recordPayment({ tenantId, invoiceId, amount, currency, method = 'manual', status = 'succeeded', transactionId = '', failureReason = '', notes = '', recordedBy = null }) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');
  const invoice = invoiceId ? await SubscriptionInvoice.findById(invoiceId) : null;
  const plan = await Plan.findById(tenant.plan);
  const payment = await SubscriptionPayment.create({ tenant: tenant._id, invoice: invoice?._id || null, amount: Number(amount ?? invoice?.total ?? 0), currency: currency || invoice?.currency || plan?.currency || 'LKR', billingCycle: tenant.subscription?.billingCycle || plan?.billingCycle || 'monthly', method, status, transactionId, failureReason, recordedBy, notes });

  tenant.subscription = tenant.subscription || {};
  tenant.subscription.lastPaymentStatus = status === 'failed' ? 'failed' : status === 'pending' ? 'pending' : 'succeeded';
  if (status === 'failed') {
    tenant.subscription.failedPaymentCount = Number(tenant.subscription.failedPaymentCount || 0) + 1;
    await notifyTenant(tenant, 'subscription_payment_failed', 'Subscription payment failed', failureReason || 'Your subscription payment failed. Please complete payment to avoid suspension.');
  } else if (status === 'succeeded') {
    tenant.subscription.failedPaymentCount = 0;
    tenant.subscription.status = 'active';
    tenant.status = 'active';
    tenant.subscription.graceUntil = null;
    tenant.subscription.suspendedReason = '';
    tenant.subscription.reminders = { trialEndingSentAt: null, paymentDueSentAt: null, graceSentAt: null, expiredSentAt: null };
    const start = new Date();
    tenant.subscription.currentPeriodStart = start;
    tenant.subscription.currentPeriodEnd = getPeriodEnd(start, tenant.subscription.billingCycle || 'monthly');
    await notifyTenant(tenant, 'subscription_payment_confirmed', 'Subscription payment confirmed', `Payment received. Your ${tenant.subscription.billingCycle} subscription is active until ${tenant.subscription.currentPeriodEnd ? new Date(tenant.subscription.currentPeriodEnd).toLocaleDateString() : 'lifetime'}.`);
  }
  if (invoice && status === 'succeeded') { invoice.status = 'paid'; invoice.paidAt = new Date(); await invoice.save(); tenant.subscription.lastInvoice = invoice._id; }
  if (invoice && status === 'failed') { invoice.status = 'overdue'; await invoice.save(); tenant.subscription.lastInvoice = invoice._id; }
  await tenant.save();
  return payment;
}

async function runBillingMaintenance() {
  const tenants = await Tenant.find().populate('plan');
  const results = [];
  for (const tenant of tenants) {
    await refreshTenantLifecycle(tenant, tenant.plan); // eslint-disable-line no-await-in-loop
    results.push({ tenantId: tenant._id, storeName: tenant.storeName, status: tenant.status, subscriptionStatus: tenant.subscription?.status, periodEnd: tenant.subscription?.currentPeriodEnd, graceUntil: tenant.subscription?.graceUntil });
  }
  return results;
}

module.exports = { addDays, addMonths, changeTenantPlan, ensureTenantSubscription, getPlanPrice, initializeTenantSubscription, issueInvoice, recordPayment, refreshTenantLifecycle, runBillingMaintenance };
