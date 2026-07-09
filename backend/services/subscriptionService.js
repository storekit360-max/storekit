'use strict';

/**
 * subscriptionService.js
 *
 * The full lifecycle engine for tenant billing:
 *
 *   super admin creates tenant + assigns plan
 *        └─▶ startSubscription()   → trial starts automatically (or 'active'
 *                                     immediately for free/no-trial plans)
 *   trial ends / billing period ends
 *        └─▶ tick() (scheduler)    → subscriptionStatus -> 'past_due',
 *                                     grace period starts
 *   grace period ends without payment
 *        └─▶ tick() (scheduler)    → tenant auto-suspended (status='suspended')
 *   tenant admin submits a payment
 *        └─▶ submitPayment()       → creates a pending TenantPayment
 *   super admin approves the payment
 *        └─▶ approvePayment()      → tenant reactivated, next period + next
 *                                     payment date/amount calculated automatically
 *   super admin rejects the payment
 *        └─▶ rejectPayment()       → tenant stays past_due/suspended
 *   admin decides to stop the business
 *        └─▶ deactivateTenant()    → super admin manually stops the store
 *
 * No cron dependency — the daily/hourly tick() is driven by
 * subscriptionScheduler.js using the same polling pattern as
 * services/backupScheduler.js.
 */

const Tenant = require('../models/Tenant');
const TenantPayment = require('../models/TenantPayment');

// How long a tenant keeps running after a trial/billing period ends before
// being auto-suspended for non-payment. Override with BILLING_GRACE_DAYS.
const GRACE_PERIOD_DAYS = Number(process.env.BILLING_GRACE_DAYS || 3);

function addCycle(date, cycle) {
  const d = new Date(date);
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function graceEndsFrom(date, plan) {
  const days = Number(plan?.graceDays ?? GRACE_PERIOD_DAYS);
  return new Date(new Date(date).getTime() + days * 24 * 60 * 60 * 1000);
}

// ── Start a brand-new subscription (called right after super admin creates a
//    tenant + assigns a plan, or assigns a plan to a tenant that never had a
//    billing state, e.g. a free-plan tenant upgrading to a paid plan) ───────
async function startSubscription(tenant, plan, billingCycle) {
  const cycle = billingCycle || tenant?.billing?.billingCycle || plan.billingCycle || 'monthly';
  const now = new Date();
  const price = Number(plan.price || 0);
  const trialDays = Number(plan.trialDays || 0);

  let set;

  if (price <= 0) {
    // Free plan — always active, no payments, no expiry enforcement.
    set = {
      status: 'active',
      'billing.subscriptionStatus': 'active',
      'billing.billingCycle': cycle,
      'billing.trialEndsAt': null,
      'billing.currentPeriodStart': now,
      'billing.currentPeriodEnd': null,
      'billing.nextPaymentDate': null,
      'billing.nextPaymentAmount': 0,
      'billing.gracePeriodEndsAt': null,
      'billing.cancelledAt': null,
      'billing.cancelReason': '',
    };
  } else if (trialDays > 0) {
    // Paid plan with a trial — runs free until trialEndsAt, then payment is due.
    const trialEndsAt = daysFromNow(trialDays);
    set = {
      status: 'active',
      'billing.subscriptionStatus': 'trial',
      'billing.billingCycle': cycle,
      'billing.trialEndsAt': trialEndsAt,
      'billing.currentPeriodStart': now,
      'billing.currentPeriodEnd': trialEndsAt,
      'billing.nextPaymentDate': trialEndsAt,
      'billing.nextPaymentAmount': price,
      'billing.gracePeriodEndsAt': null,
      'billing.cancelledAt': null,
      'billing.cancelReason': '',
    };
  } else {
    // Paid plan, no trial — active immediately, first payment due at period end.
    const periodEnd = addCycle(now, cycle);
    set = {
      status: 'active',
      'billing.subscriptionStatus': 'active',
      'billing.billingCycle': cycle,
      'billing.trialEndsAt': null,
      'billing.currentPeriodStart': now,
      'billing.currentPeriodEnd': periodEnd,
      'billing.nextPaymentDate': periodEnd,
      'billing.nextPaymentAmount': price,
      'billing.gracePeriodEndsAt': null,
      'billing.cancelledAt': null,
      'billing.cancelReason': '',
    };
  }

  return Tenant.findByIdAndUpdate(tenant._id, { $set: set }, { new: true });
}

// ── Called when super admin re-assigns a tenant to a different plan ────────
async function handlePlanChange(tenantId, newPlan) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const hadBillingState = !!(tenant.billing && tenant.billing.currentPeriodStart);
  const wasFree = !hadBillingState || Number(tenant.billing.nextPaymentAmount || 0) === 0;
  const isNowPaid = Number(newPlan.price || 0) > 0;

  // No billing history yet, or moving from a free plan onto a paid plan —
  // (re)start the subscription cleanly (trial if the new plan has one).
  if (!hadBillingState || (wasFree && isNowPaid)) {
    return startSubscription(tenant, newPlan, tenant.billing?.billingCycle);
  }

  // Otherwise just re-price the current cycle — the tenant keeps its current
  // period/trial, but the amount due next time reflects the new plan.
  return Tenant.findByIdAndUpdate(
    tenantId,
    { $set: { 'billing.nextPaymentAmount': Number(newPlan.price || 0) } },
    { new: true }
  );
}

// ── Tenant admin submits proof of payment for the current amount owed ──────
async function submitPayment(tenantId, { method, reference, proofUrl, note, amount } = {}) {
  const tenant = await Tenant.findById(tenantId).populate('plan');
  if (!tenant) throw new Error('Tenant not found');
  const plan = tenant.plan;
  if (!plan) throw new Error('Tenant has no plan assigned');

  const cycle = tenant.billing?.billingCycle || plan.billingCycle || 'monthly';
  const periodStart = tenant.billing?.currentPeriodEnd || tenant.billing?.trialEndsAt || new Date();
  const periodEnd = addCycle(periodStart, cycle);
  const paymentAmount = amount != null && amount !== ''
    ? Number(amount)
    : Number(tenant.billing?.nextPaymentAmount ?? plan.price ?? 0);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    const err = new Error('Payment amount must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  return TenantPayment.create({
    tenant: tenant._id,
    plan: plan._id,
    amount: paymentAmount,
    currency: plan.currency || 'LKR',
    billingCycle: cycle,
    periodStart,
    periodEnd,
    method: method || 'bank_transfer',
    reference: reference || '',
    proofUrl: proofUrl || '',
    note: note || '',
    status: 'pending',
    submittedAt: new Date(),
  });
}

// ── Super admin approves a submitted payment — this is the single manual
//    step that reactivates/renews the plan after a successful payment ──────
async function approvePayment(paymentId, reviewerId) {
  const payment = await TenantPayment.findById(paymentId);
  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'pending') throw new Error('Payment already reviewed');

  const tenant = await Tenant.findById(payment.tenant).populate('plan');
  if (!tenant) throw new Error('Tenant not found');

  payment.status = 'approved';
  payment.reviewedAt = new Date();
  payment.reviewedBy = reviewerId;
  await payment.save();

  await Tenant.findByIdAndUpdate(tenant._id, {
    $set: {
      status: 'active',
      'billing.subscriptionStatus': 'active',
      'billing.currentPeriodStart': payment.periodStart,
      'billing.currentPeriodEnd': payment.periodEnd,
      'billing.nextPaymentDate': payment.periodEnd,
      'billing.nextPaymentAmount': Number(tenant.plan?.price || payment.amount || 0),
      'billing.lastPaymentDate': new Date(),
      'billing.gracePeriodEndsAt': null,
      'billing.cancelledAt': null,
      'billing.cancelReason': '',
      'billing.lastDeactivatedBy': '',
    },
  });

  return payment;
}

async function rejectPayment(paymentId, reviewerId, reason) {
  const payment = await TenantPayment.findById(paymentId);
  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'pending') throw new Error('Payment already reviewed');

  payment.status = 'rejected';
  payment.reviewedAt = new Date();
  payment.reviewedBy = reviewerId;
  payment.rejectionReason = reason || '';
  await payment.save();
  return payment;
}

// ── Super admin manually stops a tenant's business (no more auto-renewal) ──
async function deactivateTenant(tenantId, reason, by = 'superadmin') {
  return Tenant.findByIdAndUpdate(tenantId, {
    $set: {
      status: 'suspended',
      'billing.subscriptionStatus': 'cancelled',
      'billing.cancelledAt': new Date(),
      'billing.cancelReason': reason || '',
      'billing.lastDeactivatedBy': by,
    },
  }, { new: true });
}

// ── Super admin manually reactivates a tenant (independent of the payment
//    approval flow — e.g. goodwill reactivation, or reversing a deactivation)
async function reactivateTenant(tenantId) {
  const tenant = await Tenant.findById(tenantId).populate('plan');
  if (!tenant) throw new Error('Tenant not found');
  if (!tenant.plan) throw new Error('Tenant has no plan assigned');

  const cycle = tenant.billing?.billingCycle || tenant.plan.billingCycle || 'monthly';
  const now = new Date();
  const periodEnd = Number(tenant.plan.price || 0) > 0 ? addCycle(now, cycle) : null;

  return Tenant.findByIdAndUpdate(tenantId, {
    $set: {
      status: 'active',
      'billing.subscriptionStatus': 'active',
      'billing.currentPeriodStart': now,
      'billing.currentPeriodEnd': periodEnd,
      'billing.nextPaymentDate': periodEnd,
      'billing.nextPaymentAmount': Number(tenant.plan.price || 0),
      'billing.gracePeriodEndsAt': null,
      'billing.cancelledAt': null,
      'billing.cancelReason': '',
      'billing.lastDeactivatedBy': '',
    },
  }, { new: true });
}

// ── Dashboard aggregates for the super admin billing view ──────────────────
async function getOverview() {
  const [pendingAgg, incomeAgg, byBillingStatus, tenants, upcoming] = await Promise.all([
    TenantPayment.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    TenantPayment.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    Tenant.aggregate([
      { $group: { _id: '$billing.subscriptionStatus', count: { $sum: 1 } } },
    ]),
    Tenant.find({})
      .select('storeName slug domains billing status plan owner createdAt')
      .populate('plan', 'name price currency billingCycle trialDays graceDays limits features')
      .populate('owner', 'firstName lastName email')
      .sort({ createdAt: -1 }),
    Tenant.find({ 'billing.nextPaymentDate': { $ne: null, $lte: daysFromNow(7) } })
      .select('storeName slug billing plan status')
      .populate('plan', 'name price currency billingCycle')
      .sort({ 'billing.nextPaymentDate': 1 })
      .limit(50),
  ]);

  return {
    pendingPayments: { count: pendingAgg[0]?.count || 0, total: pendingAgg[0]?.total || 0 },
    totalIncome: { count: incomeAgg[0]?.count || 0, total: incomeAgg[0]?.total || 0 },
    tenantsByStatus: byBillingStatus.reduce((acc, row) => {
      acc[row._id || 'unknown'] = row.count;
      return acc;
    }, {}),
    tenantStatus: {
      active: tenants.filter(t => t.status === 'active').length,
      suspended: tenants.filter(t => t.status === 'suspended').length,
      pending: tenants.filter(t => t.status === 'pending').length,
    },
    recurring: {
      monthly: tenants.reduce((sum, t) => (
        t.status === 'active' && t.plan?.billingCycle === 'monthly'
          ? sum + Number(t.billing?.nextPaymentAmount || t.plan?.price || 0)
          : sum
      ), 0),
      yearly: tenants.reduce((sum, t) => (
        t.status === 'active' && t.plan?.billingCycle === 'yearly'
          ? sum + Number(t.billing?.nextPaymentAmount || t.plan?.price || 0)
          : sum
      ), 0),
    },
    tenants,
    upcomingPayments: upcoming,
  };
}

// ── Scheduler tick — trial/period expiry and grace-period auto-suspend ─────
async function tick() {
  const now = new Date();

  // 1. Trials that have ended -> past_due, grace period starts
  const endedTrials = await Tenant.find({ 'billing.subscriptionStatus': 'trial', 'billing.trialEndsAt': { $lte: now } }).populate('plan');
  await Promise.all(endedTrials.map(tenant => Tenant.findByIdAndUpdate(tenant._id, {
    $set: { 'billing.subscriptionStatus': 'past_due', 'billing.gracePeriodEndsAt': graceEndsFrom(now, tenant.plan) },
  })));

  // 2. Active PAID subscriptions whose period has ended -> past_due, grace period starts
  //    (nextPaymentAmount > 0 excludes free plans, which never expire this way)
  const endedPeriods = await Tenant.find({
    'billing.subscriptionStatus': 'active',
    'billing.currentPeriodEnd': { $ne: null, $lte: now },
    'billing.nextPaymentAmount': { $gt: 0 },
  }).populate('plan');
  await Promise.all(endedPeriods.map(tenant => Tenant.findByIdAndUpdate(tenant._id, {
    $set: { 'billing.subscriptionStatus': 'past_due', 'billing.gracePeriodEndsAt': graceEndsFrom(now, tenant.plan) },
  })));

  // 3. past_due tenants whose grace period has expired -> auto-suspend
  await Tenant.updateMany(
    { 'billing.subscriptionStatus': 'past_due', 'billing.gracePeriodEndsAt': { $lte: now } },
    { $set: { status: 'suspended', 'billing.subscriptionStatus': 'suspended', 'billing.lastDeactivatedBy': 'system' } }
  );
}

module.exports = {
  GRACE_PERIOD_DAYS,
  addCycle,
  startSubscription,
  handlePlanChange,
  submitPayment,
  approvePayment,
  rejectPayment,
  deactivateTenant,
  reactivateTenant,
  getOverview,
  tick,
};
