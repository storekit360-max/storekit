'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Tenant = require('../models/Tenant');
const TenantPayment = require('../models/TenantPayment');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const BillingPaymentAttempt = require('../models/BillingPaymentAttempt');
const BillingRefund = require('../models/BillingRefund');
const BillingDunningEvent = require('../models/BillingDunningEvent');
const BillingCoupon = require('../models/BillingCoupon');
const BillingCouponRedemption = require('../models/BillingCouponRedemption');
const BillingTaxRule = require('../models/BillingTaxRule');
const EnterpriseContract = require('../models/EnterpriseContract');
const { invoiceNumber, stripeStatus } = require('../services/billingLifecycleService');
const { countryCodeForTenant, roundMoney } = require('../services/billingCommercialService');

test('billing lifecycle schemas support provider reconciliation and immutable ledgers', () => {
  assert.ok(Tenant.schema.path('billing.stripeCustomerId'));
  assert.ok(Tenant.schema.path('billing.stripeSubscriptionId'));
  assert.ok(TenantPayment.schema.path('providerPaymentId'));
  assert.ok(TenantPayment.schema.path('invoice'));
  assert.ok(SubscriptionInvoice.schema.path('providerInvoiceId'));
  assert.ok(BillingPaymentAttempt.schema.path('providerAttemptId'));
  assert.ok(BillingRefund.schema.path('idempotencyKey'));
  assert.ok(BillingDunningEvent.schema.path('event'));
  assert.ok(BillingCoupon.schema.path('maxRedemptionsPerTenant'));
  assert.ok(BillingCouponRedemption.schema.path('status'));
  assert.ok(BillingTaxRule.schema.path('inclusive'));
  assert.ok(EnterpriseContract.schema.path('paymentTermsDays'));
  assert.ok(TenantPayment.schema.path('status').enumValues.includes('partially_refunded'));
  assert.ok(SubscriptionInvoice.schema.path('status').enumValues.includes('uncollectible'));
});

test('subscription money rounding and country normalization are deterministic', () => {
  assert.equal(roundMoney(10.005), 10.01);
  assert.equal(countryCodeForTenant({ settings: { merchantCountryCode: 'lk' } }), 'LK');
  assert.equal(countryCodeForTenant({ settings: { country: 'Sri Lanka' } }), 'LK');
  assert.equal(countryCodeForTenant({ settings: { country: 'Unknown' } }), '');
});

test('Stripe subscription states map conservatively into StoreKit lifecycle states', () => {
  assert.equal(stripeStatus('active'), 'active');
  assert.equal(stripeStatus('trialing'), 'trial');
  assert.equal(stripeStatus('unpaid'), 'past_due');
  assert.equal(stripeStatus('canceled'), 'cancelled');
  assert.equal(stripeStatus('unknown_future_status'), 'past_due');
});

test('invoice numbers are non-sequential and tenant traceable', () => {
  const tenantId = '64b111111111111111abcdef';
  const first = invoiceNumber(tenantId); const second = invoiceNumber(tenantId);
  assert.match(first, /^SK-\d{8}-ABCDEF-[A-F0-9]{6}$/);
  assert.notEqual(first, second);
});

test('safe approval owns the payment state before tenant activation and rolls back failures', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/billingLifecycleService.js'), 'utf8');
  const claim = source.indexOf("status: 'processing'");
  const activate = source.indexOf('activateApprovedPayment(payment)');
  const rollback = source.indexOf("payment.status = 'pending'");
  assert.ok(claim > -1 && activate > claim && rollback > activate);
  assert.match(source, /ensureInvoiceForPayment/);
  assert.match(source, /BillingPaymentAttempt\.create/);
});

test('refund API requires billing.refund, recent MFA step-up, audit, and idempotency', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/billingLifecycle.js'), 'utf8');
  const refundRoute = source.split('\n').find(line => line.includes("router.post('/refunds'"));
  assert.match(refundRoute, /requirePlatformPermission\('billing\.refund'\)/);
  assert.match(refundRoute, /requireRecentStepUp\(\)/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /billing\.refund\.request/);
  assert.match(source, /billing\.refund\.confirm/);
});

test('Stripe refund is provider-confirmed and manual refunds remain pending until confirmation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/billingLifecycleService.js'), 'utf8');
  assert.match(source, /new Stripe\(integration\.secrets\.secretKey\)\.refunds\.create/);
  assert.match(source, /provider: 'manual', status: 'pending'/);
  assert.match(source, /Pending manual refund not found/);
  assert.match(source, /refund\.status === 'succeeded'/);
  assert.match(source, /status: 'processing'/);
  assert.match(source, /stripe\.invoices\.list/);
  assert.match(source, /Invalid Stripe customer ID/);
  assert.match(source, /billingPortal\.sessions\.create/);
});

test('tenant payment submission derives amount from a server quote, not form amount', () => {
  const service = fs.readFileSync(path.join(__dirname, '../services/subscriptionService.js'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../routes/billing.js'), 'utf8');
  assert.match(service, /calculateQuote\(tenant, plan, couponCode\)/);
  assert.doesNotMatch(service, /amount != null/);
  assert.match(service, /A subscription payment is already awaiting review/);
  assert.match(route, /quote\.total > 0/);
  assert.match(route, /autoApproved: true/);
});

test('customer gateway payment initiation uses revocable database-backed authentication', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/payments.js'), 'utf8');
  assert.match(source, /const \{ auth, adminAuth \} = require\('\.\.\/middleware\/auth'\)/);
  assert.doesNotMatch(source, /function requireAuth/);
  assert.doesNotMatch(source, /jwt\.verify/);
  ['payhere/preflight', 'stripe/create-intent', 'paypal/capture'].forEach(pathname => assert.match(source, new RegExp(`'/${pathname}', auth, paymentInitLimiter`)));
});

test('commercial billing controls use RBAC, audit, and step-up for contracts', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/superadmin/billingLifecycle.js'), 'utf8');
  ['coupons', 'tax-rules', 'contracts'].forEach(resource => assert.match(source, new RegExp(`router\\.(get|post|put)\\('/${resource}`)));
  assert.match(source, /billing\.coupon\.create/);
  assert.match(source, /billing\.tax-rule\.create/);
  assert.match(source, /billing\.contract\.create/);
  const contractCreate = source.split('\n').find(line => line.includes("router.post('/contracts'"));
  assert.match(contractCreate, /requireRecentStepUp\(\)/);
});

test('tenant deletion includes billing attempts and refunds', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/tenantDeletionService.js'), 'utf8');
  assert.match(source, /billingPaymentAttempts/);
  assert.match(source, /billingRefunds/);
  assert.match(source, /billingDunningEvents/);
});

test('subscription scheduler persists past-due invoices and dunning transitions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/subscriptionService.js'), 'utf8');
  assert.match(source, /beginDunning/);
  assert.match(source, /SubscriptionInvoice\.findOneAndUpdate/);
  assert.match(source, /BillingDunningEvent\.create/);
  assert.match(source, /event: 'suspended'/);
  assert.match(source, /processDunningReminders/);
  assert.match(source, /scanLifecycleAutomations/);
  assert.match(source, /enqueueTenantEvent\('tenant_suspended'/);
  assert.doesNotMatch(source, /await sendMail\(/);
});

test('maintenance scripts use the canonical subscription lifecycle engine', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../scripts/billing-migration.js'), 'utf8');
  const maintenance = fs.readFileSync(path.join(__dirname, '../scripts/subscription-maintenance.js'), 'utf8');
  assert.match(migration, /services\/subscriptionService/);
  assert.match(maintenance, /services\/subscriptionService/);
  assert.equal(fs.existsSync(path.join(__dirname, '../services/subscriptionBillingService.js')), false);
  assert.equal(fs.existsSync(path.join(__dirname, '../routes/superadminBilling.js')), false);
});
