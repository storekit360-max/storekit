'use strict';
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');

const DAY_MS = 24 * 60 * 60 * 1000;
function addDays(date, days) { return new Date(new Date(date).getTime() + Number(days || 0) * DAY_MS); }
function addMonths(date, months) { const d = new Date(date); d.setMonth(d.getMonth() + Number(months || 1)); return d; }
function addYears(date, years) { const d = new Date(date); d.setFullYear(d.getFullYear() + Number(years || 1)); return d; }
function moneyForPlan(plan, cycle) { return Number(cycle === 'yearly' ? (plan.yearlyPrice || plan.price || 0) : (plan.monthlyPrice || plan.price || 0)); }
function makeInvoiceNumber() { return `INV-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; }

async function initializeTenantSubscription(tenant, planDoc) {
  const plan = planDoc || await Plan.findById(tenant.plan);
  const now = new Date();
  const cycle = (tenant.subscription?.billingCycle || plan?.billingCycle) === 'yearly' ? 'yearly' : 'monthly';
  const trialDays = Number(plan?.trialDays ?? 14);
  const trialEndsAt = trialDays > 0 ? addDays(now, trialDays) : now;
  tenant.subscription = {
    ...(tenant.subscription || {}),
    status: trialDays > 0 ? 'trialing' : 'active',
    billingCycle: cycle,
    trialStartedAt: tenant.subscription?.trialStartedAt || now,
    trialEndsAt: tenant.subscription?.trialEndsAt || trialEndsAt,
    currentPeriodStart: tenant.subscription?.currentPeriodStart || now,
    currentPeriodEnd: tenant.subscription?.currentPeriodEnd || (cycle === 'yearly' ? addYears(now, 1) : addMonths(now, 1)),
    nextBillingAt: tenant.subscription?.nextBillingAt || trialEndsAt,
    autoRenew: !!plan?.autoRenew,
    reminders: tenant.subscription?.reminders || {},
  };
  await tenant.save();
  return tenant;
}

async function ensureOpenInvoice(tenant) {
  const plan = await Plan.findById(tenant.plan);
  if (!plan) return null;
  const cycle = tenant.subscription?.billingCycle || 'monthly';
  const existing = await SubscriptionInvoice.findOne({ tenantId: tenant._id, status: { $in: ['unpaid','pending_review','overdue'] } }).sort({ createdAt: -1 });
  if (existing) return existing;
  const start = tenant.subscription?.currentPeriodStart || new Date();
  const end = tenant.subscription?.nextBillingAt || (cycle === 'yearly' ? addYears(start, 1) : addMonths(start, 1));
  const subtotal = moneyForPlan(plan, cycle);
  return SubscriptionInvoice.create({
    tenantId: tenant._id, planId: plan._id, invoiceNumber: makeInvoiceNumber(), billingCycle: cycle,
    periodStart: start, periodEnd: end, dueDate: end, currency: plan.currency || 'LKR', subtotal, total: subtotal, status: 'unpaid'
  });
}

async function approvePayment(paymentId, reviewerId) {
  const payment = await SubscriptionPayment.findById(paymentId);
  if (!payment) throw new Error('Payment not found');
  const tenant = await Tenant.findById(payment.tenantId).populate('plan');
  if (!tenant) throw new Error('Tenant not found');
  const invoice = payment.invoiceId ? await SubscriptionInvoice.findById(payment.invoiceId) : null;
  payment.status = 'approved'; payment.reviewedBy = reviewerId; payment.reviewedAt = new Date();
  await payment.save();
  if (invoice) { invoice.status = 'paid'; invoice.paidAt = new Date(); invoice.reviewedAt = new Date(); invoice.reviewedBy = reviewerId; await invoice.save(); }
  const cycle = tenant.subscription?.billingCycle || 'monthly';
  const now = new Date();
  tenant.status = 'active';
  tenant.subscription.status = 'active';
  tenant.subscription.lastPaidAt = now;
  tenant.subscription.currentPeriodStart = now;
  tenant.subscription.currentPeriodEnd = cycle === 'yearly' ? addYears(now, 1) : addMonths(now, 1);
  tenant.subscription.nextBillingAt = tenant.subscription.currentPeriodEnd;
  tenant.subscription.graceEndsAt = null;
  tenant.subscription.suspendedAt = null;
  tenant.subscription.reminders = {};
  await tenant.save();
  return { payment, tenant, invoice };
}

async function rejectPayment(paymentId, reviewerId, note='') {
  const payment = await SubscriptionPayment.findById(paymentId);
  if (!payment) throw new Error('Payment not found');
  payment.status = 'rejected'; payment.reviewedBy = reviewerId; payment.reviewedAt = new Date(); payment.note = note || payment.note;
  await payment.save();
  if (payment.invoiceId) await SubscriptionInvoice.findByIdAndUpdate(payment.invoiceId, { $set: { status: 'rejected', reviewedBy: reviewerId, reviewedAt: new Date(), notes: note } });
  return payment;
}

async function runMaintenance({ createInvoices = true } = {}) {
  const now = new Date();
  const tenants = await Tenant.find().populate('plan');
  const results = [];
  for (const tenant of tenants) {
    if (!tenant.subscription) await initializeTenantSubscription(tenant, tenant.plan);
    const plan = tenant.plan;
    const graceDays = Number(plan?.graceDays ?? 7);
    let changed = false;
    const next = tenant.subscription?.nextBillingAt ? new Date(tenant.subscription.nextBillingAt) : null;
    const trialEnd = tenant.subscription?.trialEndsAt ? new Date(tenant.subscription.trialEndsAt) : null;
    if (tenant.subscription.status === 'trialing' && trialEnd && trialEnd <= now) {
      tenant.subscription.status = 'past_due';
      tenant.subscription.nextBillingAt = trialEnd;
      changed = true;
    }
    if (['active','past_due'].includes(tenant.subscription.status) && next && next <= now) {
      tenant.subscription.status = graceDays > 0 ? 'grace' : 'suspended';
      tenant.subscription.graceEndsAt = graceDays > 0 ? addDays(now, graceDays) : now;
      if (tenant.subscription.status === 'suspended') { tenant.status = 'suspended'; tenant.subscription.suspendedAt = now; }
      changed = true;
      if (createInvoices) await ensureOpenInvoice(tenant);
    }
    if (tenant.subscription.status === 'grace' && tenant.subscription.graceEndsAt && new Date(tenant.subscription.graceEndsAt) <= now) {
      tenant.subscription.status = 'suspended'; tenant.subscription.suspendedAt = now; tenant.status = 'suspended'; changed = true;
    }
    if (changed) await tenant.save();
    results.push({ tenantId: tenant._id, storeName: tenant.storeName, status: tenant.status, subscriptionStatus: tenant.subscription.status });
  }
  return results;
}

module.exports = { addDays, addMonths, addYears, moneyForPlan, initializeTenantSubscription, ensureOpenInvoice, approvePayment, rejectPayment, runMaintenance };
