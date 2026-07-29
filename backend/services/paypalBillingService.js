'use strict';

const axios = require('axios');
const Tenant = require('../models/Tenant');
const TenantPayment = require('../models/TenantPayment');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const BillingPaymentAttempt = require('../models/BillingPaymentAttempt');
const { resolvedIntegration, paypalAccessToken } = require('./platformIntegrationService');
const subscriptionService = require('./subscriptionService');

const cfg = async () => {
  const integration = await resolvedIntegration('paypal');
  if (!integration.enabled) throw Object.assign(new Error('PayPal billing is disabled'), { statusCode: 409 });
  if (!integration.secrets.clientId || !integration.secrets.clientSecret) throw Object.assign(new Error('PayPal Client ID and Client Secret are not configured'), { statusCode: 409 });
  const auth = await paypalAccessToken(integration.secrets.clientId, integration.secrets.clientSecret, integration.config.environment);
  return { integration, ...auth };
};

function planIdFor(integration, cycle) {
  const raw = cycle === 'yearly' ? integration.config.yearlyPlanIds : integration.config.monthlyPlanIds;
  return String(raw || '').split(',').map(value => value.trim()).filter(Boolean);
}

async function publicConfig(cycle) {
  const integration = await resolvedIntegration('paypal');
  if (!integration.enabled || !integration.config || !integration.secrets.clientId) return { enabled: false };
  const ids = planIdFor(integration, cycle);
  return { enabled: ids.length > 0, clientId: integration.secrets.clientId, environment: String(integration.config.environment || 'sandbox').toLowerCase(), planId: ids[0] || '', currency: integration.config.currency || 'USD' };
}

async function getSubscription(subscriptionId) {
  const { integration, token, base } = await cfg();
  const response = await axios.get(`${base}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
  return { data: response.data, integration };
}

async function verifyWebhook(headers, event) {
  const { integration, token, base } = await cfg();
  if (!integration.secrets.webhookId) throw Object.assign(new Error('PayPal webhook ID is not configured'), { statusCode: 409 });
  const body = {
    auth_algo: headers['paypal-auth-algo'], cert_url: headers['paypal-cert-url'], transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'], transmission_time: headers['paypal-transmission-time'], webhook_id: integration.secrets.webhookId, webhook_event: event,
  };
  const response = await axios.post(`${base}/v1/notifications/verify-webhook-signature`, body, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 });
  return response.data?.verification_status === 'SUCCESS';
}

function addCycle(date, cycle) { const next = new Date(date); if (cycle === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + 1); else next.setUTCMonth(next.getUTCMonth() + 1); return next; }

async function recordSuccessfulRenewal(tenant, resource, eventId) {
  const subscriptionId = resource.billing_agreement_id || resource.subscription_id || tenant.billing?.paypalSubscriptionId;
  const saleId = resource.id || eventId;
  if (!subscriptionId || !saleId) return null;
  const existing = await TenantPayment.findOne({ provider: 'paypal', providerPaymentId: saleId });
  if (existing) return existing;
  const start = tenant.billing?.currentPeriodEnd ? new Date(tenant.billing.currentPeriodEnd) : new Date();
  const end = addCycle(start, tenant.billing?.billingCycle || 'monthly');
  const amount = Number(resource.amount?.total || tenant.billing?.nextPaymentAmount || tenant.plan?.price || 0);
  const currency = String(resource.amount?.currency || tenant.plan?.currency || 'USD').toUpperCase();
  const payment = await TenantPayment.create({ tenant: tenant._id, plan: tenant.plan?._id, amount, subtotal: amount, currency, billingCycle: tenant.billing?.billingCycle || 'monthly', periodStart: start, periodEnd: end, method: 'paypal', reference: saleId, provider: 'paypal', providerPaymentId: saleId, status: 'approved', reviewedAt: new Date(), quoteSnapshot: { paypalEventId: eventId, subscriptionId } });
  await Tenant.findByIdAndUpdate(tenant._id, { $set: subscriptionService.withMirroredSubscription({ status: 'active', 'billing.subscriptionStatus': 'active', 'billing.paypalSubscriptionId': subscriptionId, 'billing.currentPeriodStart': start, 'billing.currentPeriodEnd': end, 'billing.nextPaymentDate': end, 'billing.lastPaymentDate': new Date(), 'billing.gracePeriodEndsAt': null }) });
  const invoice = await SubscriptionInvoice.create({ tenantId: tenant._id, planId: tenant.plan?._id, invoiceNumber: `PP-${saleId}`, amount, subtotal: amount, currency, billingCycle: tenant.billing?.billingCycle || 'monthly', status: 'paid', paidAt: new Date(), periodStart: start, periodEnd: end, paymentId: payment._id, provider: 'paypal', providerInvoiceId: saleId });
  payment.invoice = invoice._id; await payment.save();
  await BillingPaymentAttempt.create({ tenantId: tenant._id, paymentId: payment._id, invoiceId: invoice._id, provider: 'paypal', providerAttemptId: saleId, amount, currency, status: 'succeeded' }).catch(() => {});
  return payment;
}

async function handleWebhook(event) {
  const resource = event.resource || {};
  const subscriptionId = resource.billing_agreement_id || resource.id;
  if (!subscriptionId) return { ignored: true };
  const tenant = await Tenant.findOne({ 'billing.paypalSubscriptionId': subscriptionId }).populate('plan');
  if (!tenant) return { ignored: true };
  if (event.event_type === 'PAYMENT.SALE.COMPLETED') await recordSuccessfulRenewal(tenant, resource, event.id);
  else if (['BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.EXPIRED'].includes(event.event_type)) await Tenant.findByIdAndUpdate(tenant._id, { $set: subscriptionService.withMirroredSubscription({ status: 'suspended', 'billing.subscriptionStatus': 'cancelled', 'billing.cancelledAt': new Date() }) });
  else if (['BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', 'PAYMENT.SALE.REVERSED', 'PAYMENT.SALE.DENIED'].includes(event.event_type)) await Tenant.findByIdAndUpdate(tenant._id, { $set: subscriptionService.withMirroredSubscription({ status: 'active', 'billing.subscriptionStatus': 'past_due', 'billing.gracePeriodEndsAt': addCycle(new Date(), 'monthly') }) });
  return { handled: true, eventType: event.event_type, tenantId: tenant._id };
}

module.exports = { getSubscription, handleWebhook, planIdFor, publicConfig, verifyWebhook };
