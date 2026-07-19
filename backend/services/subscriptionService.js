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
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const BillingDunningEvent = require('../models/BillingDunningEvent');
const billingCommercial = require('./billingCommercialService');

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

function addDays(date, days) {
  return new Date(new Date(date).getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);
}

function graceEndsFrom(date, plan) {
  const days = Number(plan?.graceDays ?? GRACE_PERIOD_DAYS);
  return new Date(new Date(date).getTime() + days * 24 * 60 * 60 * 1000);
}

function subscriptionSetFromBilling(set) {
  const output = {};
  if ('billing.subscriptionStatus' in set) output['subscription.status'] = set['billing.subscriptionStatus'];
  if ('billing.billingCycle' in set) output['subscription.billingCycle'] = set['billing.billingCycle'];
  if ('billing.trialEndsAt' in set) output['subscription.trialEndsAt'] = set['billing.trialEndsAt'];
  if ('billing.currentPeriodStart' in set) output['subscription.currentPeriodStart'] = set['billing.currentPeriodStart'];
  if ('billing.currentPeriodEnd' in set) output['subscription.currentPeriodEnd'] = set['billing.currentPeriodEnd'];
  if ('billing.nextPaymentDate' in set) output['subscription.nextBillingAt'] = set['billing.nextPaymentDate'];
  if ('billing.nextPaymentAmount' in set) output['subscription.amount'] = set['billing.nextPaymentAmount'];
  if ('billing.gracePeriodEndsAt' in set) output['subscription.graceEndsAt'] = set['billing.gracePeriodEndsAt'];
  if ('billing.lastPaymentDate' in set) output['subscription.lastPaymentAt'] = set['billing.lastPaymentDate'];
  return output;
}

function withMirroredSubscription(set) {
  return { ...set, ...subscriptionSetFromBilling(set) };
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
    set = withMirroredSubscription({
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
    });
  } else if (trialDays > 0) {
    // Paid plan with a trial — runs free until trialEndsAt, then payment is due.
    const trialEndsAt = daysFromNow(trialDays);
    set = withMirroredSubscription({
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
    });
  } else {
    // Paid plan, no trial — active immediately, first payment due at period end.
    const periodEnd = addCycle(now, cycle);
    set = withMirroredSubscription({
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
    });
  }

  return Tenant.findByIdAndUpdate(tenant._id, { $set: set }, { new: true });
}

// ── Called when super admin re-assigns a tenant to a different plan ────────
async function handlePlanChange(tenantId, newPlan) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  // A super-admin tenant plan reassignment should apply the new plan's trial,
  // billing cycle, amount, and next payment date from the reassignment time.
  return startSubscription(tenant, newPlan, newPlan.billingCycle || tenant.billing?.billingCycle);
}

function billingSetForPlanUpdate(tenant, plan) {
  const now = new Date();
  const price = Number(plan.price || 0);
  const cycle = plan.billingCycle || tenant.billing?.billingCycle || 'monthly';
  const currentStatus = tenant.billing?.subscriptionStatus || 'active';
  const currentStart = tenant.billing?.currentPeriodStart || now;

  if (price <= 0) {
    return withMirroredSubscription({
      status: 'active',
      'billing.subscriptionStatus': 'active',
      'billing.billingCycle': cycle,
      'billing.trialEndsAt': null,
      'billing.currentPeriodStart': currentStart,
      'billing.currentPeriodEnd': null,
      'billing.nextPaymentDate': null,
      'billing.nextPaymentAmount': 0,
      'billing.gracePeriodEndsAt': null,
    });
  }

  if (currentStatus === 'trial' && Number(plan.trialDays || 0) > 0) {
    const trialEndsAt = addDays(currentStart, Number(plan.trialDays || 0));
    const expired = trialEndsAt <= now;
    return withMirroredSubscription({
      status: expired ? tenant.status : 'active',
      'billing.subscriptionStatus': expired ? 'past_due' : 'trial',
      'billing.billingCycle': cycle,
      'billing.trialEndsAt': trialEndsAt,
      'billing.currentPeriodStart': currentStart,
      'billing.currentPeriodEnd': trialEndsAt,
      'billing.nextPaymentDate': trialEndsAt,
      'billing.nextPaymentAmount': price,
      'billing.gracePeriodEndsAt': expired ? graceEndsFrom(now, plan) : null,
    });
  }

  if (['cancelled', 'suspended'].includes(currentStatus)) {
    return withMirroredSubscription({
      'billing.billingCycle': cycle,
      'billing.nextPaymentAmount': price,
    });
  }

  const periodStart = tenant.billing?.currentPeriodStart || now;
  const periodEnd = addCycle(periodStart, cycle);
  const expired = periodEnd <= now;
  return withMirroredSubscription({
    status: expired ? tenant.status : 'active',
    'billing.subscriptionStatus': expired ? 'past_due' : 'active',
    'billing.billingCycle': cycle,
    'billing.trialEndsAt': null,
    'billing.currentPeriodStart': periodStart,
    'billing.currentPeriodEnd': periodEnd,
    'billing.nextPaymentDate': periodEnd,
    'billing.nextPaymentAmount': price,
    'billing.gracePeriodEndsAt': expired ? graceEndsFrom(now, plan) : null,
  });
}

async function syncTenantsForPlanUpdate(plan) {
  const tenants = await Tenant.find({ plan: plan._id });
  const updated = [];
  for (const tenant of tenants) {
    const set = billingSetForPlanUpdate(tenant, plan);
    const next = await Tenant.findByIdAndUpdate(tenant._id, { $set: set }, { new: true });
    if (next) updated.push(next);
  }
  return updated.length;
}

// ── Tenant admin submits proof of payment for the current amount owed ──────
async function submitPayment(tenantId, { method, reference, proofUrl, note, couponCode } = {}) {
  const tenant = await Tenant.findById(tenantId).populate('plan');
  if (!tenant) throw new Error('Tenant not found');
  const plan = tenant.plan;
  if (!plan) throw new Error('Tenant has no plan assigned');

  const existingPending = await TenantPayment.exists({ tenant: tenant._id, status: { $in: ['pending', 'processing'] } });
  if (existingPending) { const error = new Error('A subscription payment is already awaiting review'); error.statusCode = 409; throw error; }
  const quote = await billingCommercial.calculateQuote(tenant, plan, couponCode);
  const cycle = quote.billingCycle;
  const periodStart = tenant.billing?.currentPeriodEnd || tenant.billing?.trialEndsAt || new Date();
  const periodEnd = addCycle(periodStart, cycle);
  const paymentAmount = quote.total;

  if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
    const err = new Error('Payment amount cannot be negative');
    err.statusCode = 400;
    throw err;
  }

  const payment = await TenantPayment.create({
    tenant: tenant._id,
    plan: plan._id,
    amount: paymentAmount,
    subtotal: quote.subtotal, discountAmount: quote.discountAmount, taxAmount: quote.taxAmount,
    currency: quote.currency,
    billingCycle: cycle,
    periodStart,
    periodEnd,
    method: method || 'bank_transfer',
    reference: reference || '',
    proofUrl: proofUrl || '',
    note: note || '',
    status: 'pending',
    couponCode: quote.coupon?.code || '',
    quoteSnapshot: { taxLines: quote.taxLines, contractId: quote.contract?._id || null, calculatedAt: new Date() },
    submittedAt: new Date(),
  });
  try { await billingCommercial.reserveCoupon(quote, tenant._id, payment._id); return payment; }
  catch (error) { await TenantPayment.deleteOne({ _id: payment._id, status: 'pending' }).catch(() => {}); throw error; }
}

async function quoteSubscription(tenantId, couponCode) {
  const tenant = await Tenant.findById(tenantId).populate('plan');
  if (!tenant) { const error = new Error('Tenant not found'); error.statusCode = 404; throw error; }
  if (!tenant.plan) { const error = new Error('Tenant has no plan assigned'); error.statusCode = 409; throw error; }
  const quote = await billingCommercial.calculateQuote(tenant, tenant.plan, couponCode);
  return { subtotal: quote.subtotal, discountAmount: quote.discountAmount, taxAmount: quote.taxAmount, taxLines: quote.taxLines, total: quote.total, currency: quote.currency, billingCycle: quote.billingCycle, couponCode: quote.coupon?.code || '', contractNumber: quote.contract?.contractNumber || '' };
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
    $set: withMirroredSubscription({
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
    }),
  });

  return payment;
}

// Applies an already-validated payment to the tenant subscription. Keeping this
// state change separate lets the billing ledger own the approval transition and
// safely return a payment to pending if activation fails.
async function activateApprovedPayment(payment) {
  const tenant = await Tenant.findById(payment.tenant).populate('plan');
  if (!tenant) throw new Error('Tenant not found');

  const updated = await Tenant.findByIdAndUpdate(tenant._id, {
    $set: withMirroredSubscription({
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
      'billing.dunningAttempt': 0,
      'billing.lastDunningAt': null,
    }),
  }, { new: true, runValidators: true });
  if (!updated) throw new Error('Tenant not found');
  return updated;
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
  const tenant = await Tenant.findByIdAndUpdate(tenantId, {
    $set: withMirroredSubscription({
      status: 'suspended',
      'billing.subscriptionStatus': 'cancelled',
      'billing.cancelledAt': new Date(),
      'billing.cancelReason': reason || '',
      'billing.lastDeactivatedBy': by,
    }),
  }, { new: true });
  if (tenant) {
    require('./platformNotificationService').enqueueTenantEvent('tenant_suspended', tenant._id, tenant.billing?.cancelledAt?.toISOString() || String(Date.now()), { reason: reason || 'No reason provided', eventDate: new Date().toISOString().slice(0, 10) }).catch(error => console.error('[TENANT_SUSPENSION_NOTIFICATION_FAILED]', error.message));
  }
  return tenant;
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
    $set: withMirroredSubscription({
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
    }),
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
  await Promise.all(endedTrials.map(tenant => beginDunning(tenant, now, 'Trial ended; subscription payment is due')));

  // 2. Active PAID subscriptions whose period has ended -> past_due, grace period starts
  //    (nextPaymentAmount > 0 excludes free plans, which never expire this way)
  const endedPeriods = await Tenant.find({
    'billing.subscriptionStatus': 'active',
    'billing.currentPeriodEnd': { $ne: null, $lte: now },
    'billing.nextPaymentAmount': { $gt: 0 },
  }).populate('plan');
  await Promise.all(endedPeriods.map(tenant => beginDunning(tenant, now, 'Subscription renewal payment is due')));

  // 3. past_due tenants whose grace period has expired -> auto-suspend
  const expiring = await Tenant.find({ 'billing.subscriptionStatus': 'past_due', 'billing.gracePeriodEndsAt': { $lte: now } });
  await Promise.all(expiring.map(async tenant => {
    await Tenant.findByIdAndUpdate(tenant._id, { $set: withMirroredSubscription({ status: 'suspended', 'billing.subscriptionStatus': 'suspended', 'billing.lastDeactivatedBy': 'system' }) });
    const event = await BillingDunningEvent.create({ tenantId: tenant._id, event: 'suspended', attemptNumber: tenant.billing?.dunningAttempt || 1, message: 'Store suspended after the payment grace period expired' });
    await require('./platformNotificationService').enqueueTenantEvent('tenant_suspended', tenant._id, event._id, { reason: 'Payment grace period expired', eventDate: now.toISOString().slice(0, 10) }).catch(error => console.error('[TENANT_SUSPENSION_NOTIFICATION_FAILED]', error.message));
  }));
  const reminders = await processDunningReminders(now);
  return { processed: endedTrials.length + endedPeriods.length + expiring.length + reminders.queued, failed: reminders.failed, message: `Billing lifecycle: ${endedTrials.length} trials, ${endedPeriods.length} renewals, ${reminders.queued} queued notifications, ${expiring.length} suspensions` };
}

async function processDunningReminders(now = new Date()) {
  try {
    const result = await require('./platformNotificationService').scanLifecycleAutomations(now);
    return { queued: result.queued, failed: 0 };
  } catch (error) {
    console.error('[BILLING_NOTIFICATION_SCAN_FAILED]', error.message);
    return { queued: 0, failed: 1 };
  }
}

async function beginDunning(tenant, now, message) {
  const graceEnd = graceEndsFrom(now, tenant.plan);
  const attempt = Number(tenant.billing?.dunningAttempt || 0) + 1;
  const quote = await billingCommercial.calculateQuote(tenant, tenant.plan, '');
  const invoice = await SubscriptionInvoice.findOneAndUpdate(
    { tenantId: tenant._id, status: { $in: ['open', 'issued', 'past_due'] }, periodEnd: tenant.billing?.currentPeriodEnd || tenant.billing?.trialEndsAt },
    { $set: { status: 'past_due', dueAt: now, amount: quote.total, subtotal: quote.subtotal, discountAmount: quote.discountAmount, taxAmount: quote.taxAmount, taxLines: quote.taxLines }, $setOnInsert: { planId: tenant.plan?._id, invoiceNumber: `SK-DUE-${String(tenant._id).slice(-6).toUpperCase()}-${now.toISOString().slice(0, 10).replace(/-/g, '')}`, currency: quote.currency, billingCycle: quote.billingCycle, periodStart: tenant.billing?.currentPeriodStart, periodEnd: tenant.billing?.currentPeriodEnd || tenant.billing?.trialEndsAt, provider: 'manual' } },
    { upsert: true, new: true, runValidators: true }
  );
  await Tenant.findByIdAndUpdate(tenant._id, { $set: withMirroredSubscription({ 'billing.subscriptionStatus': 'past_due', 'billing.nextPaymentAmount': quote.total, 'billing.gracePeriodEndsAt': graceEnd, 'billing.dunningAttempt': attempt, 'billing.lastDunningAt': now }) });
  await BillingDunningEvent.create({ tenantId: tenant._id, invoiceId: invoice._id, event: 'grace_started', attemptNumber: attempt, scheduledFor: graceEnd, message });
}

module.exports = {
  GRACE_PERIOD_DAYS,
  addCycle,
  activateApprovedPayment,
  startSubscription,
  handlePlanChange,
  syncTenantsForPlanUpdate,
  submitPayment,
  approvePayment,
  rejectPayment,
  quoteSubscription,
  deactivateTenant,
  reactivateTenant,
  getOverview,
  tick,
  processDunningReminders,
  withMirroredSubscription,
};
