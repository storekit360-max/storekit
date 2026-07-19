'use strict';

const crypto = require('crypto');
const Stripe = require('stripe');
const Tenant = require('../models/Tenant');
const TenantPayment = require('../models/TenantPayment');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const BillingPaymentAttempt = require('../models/BillingPaymentAttempt');
const BillingRefund = require('../models/BillingRefund');
const BillingDunningEvent = require('../models/BillingDunningEvent');
const subscriptionService = require('./subscriptionService');
const { resolvedIntegration } = require('./platformIntegrationService');
const billingCommercial = require('./billingCommercialService');

function invoiceNumber(tenantId) {
  return `SK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(tenantId).slice(-6).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function normalizeCurrency(value) { return String(value || 'LKR').trim().toUpperCase().slice(0, 3); }

async function ensureInvoiceForPayment(payment) {
  if (payment.invoice) return SubscriptionInvoice.findById(payment.invoice);
  const invoice = await SubscriptionInvoice.create({
    tenantId: payment.tenant, planId: payment.plan, invoiceNumber: invoiceNumber(payment.tenant),
    amount: payment.amount, subtotal: payment.subtotal, discountAmount: payment.discountAmount, taxAmount: payment.taxAmount,
    taxLines: payment.quoteSnapshot?.taxLines || [], couponCode: payment.couponCode,
    currency: normalizeCurrency(payment.currency), billingCycle: payment.billingCycle,
    status: payment.status === 'approved' ? 'paid' : 'issued', dueAt: payment.periodStart,
    paidAt: payment.status === 'approved' ? payment.reviewedAt || new Date() : null,
    periodStart: payment.periodStart, periodEnd: payment.periodEnd, paymentId: payment._id,
    provider: payment.provider || 'manual',
  });
  payment.invoice = invoice._id; await payment.save();
  return invoice;
}

async function approveManualPayment(paymentId, reviewerId) {
  const payment = await TenantPayment.findOneAndUpdate(
    { _id: paymentId, status: 'pending' },
    { $set: { status: 'processing', reviewedBy: reviewerId, reviewedAt: new Date() } },
    { new: true }
  );
  if (!payment) {
    const exists = await TenantPayment.exists({ _id: paymentId });
    const error = new Error(exists ? 'Payment already reviewed' : 'Payment not found'); error.statusCode = exists ? 409 : 404; throw error;
  }
  const attempt = await BillingPaymentAttempt.create({ tenantId: payment.tenant, paymentId: payment._id, provider: payment.provider || 'manual', amount: payment.amount, currency: normalizeCurrency(payment.currency), status: 'processing' });
  try {
    await subscriptionService.activateApprovedPayment(payment);
    payment.status = 'approved'; await payment.save();
    const invoice = await ensureInvoiceForPayment(payment);
    invoice.status = 'paid'; invoice.paidAt = payment.reviewedAt; await invoice.save();
    await billingCommercial.finalizeCoupon(payment._id).catch(error => console.error('[BILLING_COUPON_FINALIZE_FAILED]', payment._id, error.message));
    attempt.status = 'succeeded'; await attempt.save();
    return { payment, invoice, attempt };
  } catch (error) {
    payment.status = 'pending'; payment.reviewedBy = null; payment.reviewedAt = null; await payment.save().catch(() => {});
    attempt.status = 'failed'; attempt.failureMessage = String(error.message || 'Approval failed').slice(0, 500); await attempt.save().catch(() => {});
    throw error;
  }
}

async function rejectManualPayment(paymentId, reviewerId, reason) {
  const payment = await TenantPayment.findOneAndUpdate({ _id: paymentId, status: 'pending' }, { $set: { status: 'rejected', reviewedBy: reviewerId, reviewedAt: new Date(), rejectionReason: String(reason || '').trim().slice(0, 1000) } }, { new: true });
  if (!payment) { const exists = await TenantPayment.exists({ _id: paymentId }); const error = new Error(exists ? 'Payment already reviewed' : 'Payment not found'); error.statusCode = exists ? 409 : 404; throw error; }
  const invoice = await ensureInvoiceForPayment(payment); invoice.status = 'void'; await invoice.save();
  await billingCommercial.releaseCoupon(payment._id).catch(error => console.error('[BILLING_COUPON_RELEASE_FAILED]', payment._id, error.message));
  return { payment, invoice };
}

async function requestRefund({ paymentId, amount, reason, note, actorId, idempotencyKey }) {
  const payment = await TenantPayment.findById(paymentId);
  if (!payment || !['approved', 'partially_refunded'].includes(payment.status)) { const error = new Error('Only successful payments can be refunded'); error.statusCode = 409; throw error; }
  const refundAmount = Number(amount);
  const remaining = Number(payment.amount) - Number(payment.refundedAmount || 0);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > remaining) { const error = new Error(`Refund amount must be between 0.01 and ${remaining.toFixed(2)}`); error.statusCode = 400; throw error; }
  const key = String(idempotencyKey || crypto.randomUUID()).slice(0, 200);
  const existing = await BillingRefund.findOne({ idempotencyKey: key }); if (existing) return existing;
  const safeReason = ['duplicate', 'fraudulent', 'requested_by_customer', 'other'].includes(reason) ? reason : 'requested_by_customer';
  let refund;
  try { refund = await BillingRefund.create({ tenantId: payment.tenant, paymentId: payment._id, invoiceId: payment.invoice, provider: payment.provider || 'manual', amount: refundAmount, currency: normalizeCurrency(payment.currency), status: 'pending', reason: safeReason, note: String(note || '').trim().slice(0, 1000), requestedBy: actorId, idempotencyKey: key }); }
  catch (error) { if (error.code === 11000) return BillingRefund.findOne({ idempotencyKey: key }); throw error; }
  try {
    if (payment.provider === 'stripe') {
      if (!payment.providerPaymentId) throw new Error('Stripe payment reference is missing');
      const integration = await resolvedIntegration('stripe'); if (!integration.enabled || !integration.secrets.secretKey) throw new Error('Stripe billing integration is not configured');
      const result = await new Stripe(integration.secrets.secretKey).refunds.create({ payment_intent: payment.providerPaymentId, amount: Math.round(refundAmount * 100), reason: safeReason === 'other' ? undefined : safeReason, metadata: { tenantId: String(payment.tenant), storekitPaymentId: String(payment._id) } }, { idempotencyKey: key });
      refund.providerRefundId = result.id; refund.status = result.status === 'succeeded' ? 'succeeded' : 'pending';
    } else {
      // A manual refund is a ledger record; the operator confirms after making the external transfer.
      refund.status = 'pending';
    }
    if (refund.status === 'succeeded') await applySuccessfulRefund(refund, payment);
    await refund.save(); return refund;
  } catch (error) { refund.status = 'failed'; refund.failureMessage = String(error.message || 'Refund failed').slice(0, 500); await refund.save(); throw error; }
}

async function applySuccessfulRefund(refund, suppliedPayment) {
  if (refund.status === 'succeeded' && refund.processedAt) return refund;
  const payment = suppliedPayment || await TenantPayment.findById(refund.paymentId);
  const total = Number(payment.refundedAmount || 0) + Number(refund.amount);
  payment.refundedAmount = total; payment.status = total >= Number(payment.amount) ? 'refunded' : 'partially_refunded'; await payment.save();
  if (payment.invoice) await SubscriptionInvoice.findByIdAndUpdate(payment.invoice, { $set: { refundedAmount: total, status: payment.status } });
  refund.status = 'succeeded'; refund.processedAt = new Date(); await refund.save(); return refund;
}

async function confirmManualRefund(refundId) {
  const refund = await BillingRefund.findOneAndUpdate({ _id: refundId, provider: 'manual', status: 'pending' }, { $set: { status: 'processing' } }, { new: true });
  if (!refund) { const error = new Error('Pending manual refund not found'); error.statusCode = 404; throw error; }
  try { return await applySuccessfulRefund(refund); }
  catch (error) { refund.status = 'pending'; await refund.save().catch(() => {}); throw error; }
}

async function lifecycleOverview() {
  const [invoiceCounts, refundCounts, attemptCounts, recentInvoices, recentRefunds, recentAttempts, dunningEvents] = await Promise.all([
    SubscriptionInvoice.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    BillingRefund.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    BillingPaymentAttempt.aggregate([{ $match: { occurredAt: { $gte: new Date(Date.now() - 30 * 86400000) } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    SubscriptionInvoice.find().sort({ createdAt: -1 }).limit(100).populate('tenantId', 'storeName slug').lean(),
    BillingRefund.find().sort({ createdAt: -1 }).limit(100).populate('tenantId', 'storeName slug').populate('requestedBy', 'email firstName lastName').lean(),
    BillingPaymentAttempt.find().sort({ occurredAt: -1 }).limit(100).populate('tenantId', 'storeName slug').lean(),
    BillingDunningEvent.find().sort({ occurredAt: -1 }).limit(100).populate('tenantId', 'storeName slug').lean(),
  ]);
  return { metrics: { invoices: invoiceCounts, refunds: refundCounts, attempts: attemptCounts }, invoices: recentInvoices, refunds: recentRefunds, attempts: recentAttempts, dunningEvents };
}

function stripeStatus(value) {
  return ({ trialing: 'trial', active: 'active', past_due: 'past_due', unpaid: 'past_due', canceled: 'cancelled', incomplete: 'past_due', incomplete_expired: 'cancelled', paused: 'suspended' })[value] || 'past_due';
}

async function configureStripeTenant(tenantId, { customerId, subscriptionId }) {
  const customer = String(customerId || '').trim(); const subscription = String(subscriptionId || '').trim();
  if (customer && !/^cus_[A-Za-z0-9]+$/.test(customer)) { const error = new Error('Invalid Stripe customer ID'); error.statusCode = 400; throw error; }
  if (subscription && !/^sub_[A-Za-z0-9]+$/.test(subscription)) { const error = new Error('Invalid Stripe subscription ID'); error.statusCode = 400; throw error; }
  const tenant = await Tenant.findByIdAndUpdate(tenantId, { $set: { 'billing.stripeCustomerId': customer, 'billing.stripeSubscriptionId': subscription } }, { new: true, runValidators: true });
  if (!tenant) { const error = new Error('Tenant not found'); error.statusCode = 404; throw error; }
  return tenant;
}

async function syncStripeTenant(tenantId) {
  const tenant = await Tenant.findById(tenantId).populate('plan');
  if (!tenant) { const error = new Error('Tenant not found'); error.statusCode = 404; throw error; }
  if (!tenant.billing?.stripeCustomerId) { const error = new Error('Stripe customer ID is not configured for this tenant'); error.statusCode = 409; throw error; }
  const integration = await resolvedIntegration('stripe');
  if (!integration.enabled || !integration.secrets.secretKey) { const error = new Error('Stripe billing integration is not configured'); error.statusCode = 409; throw error; }
  const stripe = new Stripe(integration.secrets.secretKey);
  let subscription = null;
  if (tenant.billing.stripeSubscriptionId) subscription = await stripe.subscriptions.retrieve(tenant.billing.stripeSubscriptionId);
  const stripeInvoices = await stripe.invoices.list({ customer: tenant.billing.stripeCustomerId, limit: 100 });
  if (subscription) {
    const status = stripeStatus(subscription.status);
    const periodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null;
    const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
    await Tenant.findByIdAndUpdate(tenant._id, { $set: subscriptionService.withMirroredSubscription({ status: ['cancelled', 'suspended'].includes(status) ? 'suspended' : 'active', 'billing.subscriptionStatus': status, 'billing.currentPeriodStart': periodStart, 'billing.currentPeriodEnd': periodEnd, 'billing.nextPaymentDate': status === 'active' ? periodEnd : tenant.billing.nextPaymentDate, 'billing.lastPaymentDate': subscription.status === 'active' ? tenant.billing.lastPaymentDate : tenant.billing.lastPaymentDate }) }, { runValidators: true });
  }
  let imported = 0;
  for (const item of stripeInvoices.data) {
    const status = item.status === 'open' && item.due_date && item.due_date * 1000 < Date.now() ? 'past_due' : (item.status || 'draft');
    const period = item.lines?.data?.[0]?.period || {};
    // eslint-disable-next-line no-await-in-loop
    await SubscriptionInvoice.findOneAndUpdate({ provider: 'stripe', providerInvoiceId: item.id }, { $set: { tenantId: tenant._id, planId: tenant.plan?._id, invoiceNumber: item.number || item.id, amount: Number(item.amount_due || item.total || 0) / 100, currency: normalizeCurrency(item.currency), billingCycle: tenant.billing?.billingCycle || 'monthly', status, dueAt: item.due_date ? new Date(item.due_date * 1000) : null, paidAt: item.status_transitions?.paid_at ? new Date(item.status_transitions.paid_at * 1000) : null, periodStart: period.start ? new Date(period.start * 1000) : null, periodEnd: period.end ? new Date(period.end * 1000) : null, provider: 'stripe', hostedInvoiceUrl: item.hosted_invoice_url || '' } }, { upsert: true, new: true, runValidators: true });
    imported += 1;
  }
  return { tenantId: tenant._id, subscriptionStatus: subscription?.status || null, invoicesImported: imported, syncedAt: new Date() };
}

async function createBillingPortalSession(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) { const error = new Error('Tenant not found'); error.statusCode = 404; throw error; }
  if (!tenant.billing?.stripeCustomerId) { const error = new Error('Stripe customer ID is not configured for this tenant'); error.statusCode = 409; throw error; }
  const integration = await resolvedIntegration('stripe');
  const returnUrl = String(integration.config?.portalReturnUrl || '').trim();
  if (!integration.enabled || !integration.secrets.secretKey) { const error = new Error('Stripe billing integration is not configured'); error.statusCode = 409; throw error; }
  if (!/^https:\/\//i.test(returnUrl)) { const error = new Error('A secure Stripe portal return URL must be configured'); error.statusCode = 409; throw error; }
  const session = await new Stripe(integration.secrets.secretKey).billingPortal.sessions.create({ customer: tenant.billing.stripeCustomerId, return_url: returnUrl });
  return { url: session.url, createdAt: new Date(), tenantId: tenant._id };
}

module.exports = { approveManualPayment, configureStripeTenant, confirmManualRefund, createBillingPortalSession, ensureInvoiceForPayment, invoiceNumber, lifecycleOverview, rejectManualPayment, requestRefund, stripeStatus, syncStripeTenant };
