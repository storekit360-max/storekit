'use strict';

const express = require('express');
const BillingRefund = require('../../models/BillingRefund');
const BillingCoupon = require('../../models/BillingCoupon');
const BillingTaxRule = require('../../models/BillingTaxRule');
const EnterpriseContract = require('../../models/EnterpriseContract');
const { requireRecentStepUp } = require('../../middleware/stepUp');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const billing = require('../../services/billingLifecycleService');

const router = express.Router();

router.get('/lifecycle', requirePlatformPermission('billing.view'), async (_req, res, next) => {
  try { res.json(await billing.lifecycleOverview()); } catch (error) { next(error); }
});

router.post('/payments/:id/approve-safe', requirePlatformPermission('billing.update'), async (req, res, next) => {
  try {
    const result = await billing.approveManualPayment(req.params.id, req.user._id);
    req.audit.set({ action: 'billing.payment.approve', resource: 'tenant-payment', resourceId: req.params.id, changes: { newValue: { status: result.payment.status, invoiceId: result.invoice._id } } });
    res.json(result);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.post('/payments/:id/reject-safe', requirePlatformPermission('billing.update'), async (req, res, next) => {
  try {
    const result = await billing.rejectManualPayment(req.params.id, req.user._id, req.body?.reason);
    req.audit.set({ action: 'billing.payment.reject', resource: 'tenant-payment', resourceId: req.params.id, changes: { newValue: { status: result.payment.status } } });
    res.json(result);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.post('/refunds', requirePlatformPermission('billing.refund'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const refund = await billing.requestRefund({ paymentId: req.body?.paymentId, amount: req.body?.amount, reason: req.body?.reason, note: req.body?.note, idempotencyKey: req.get('Idempotency-Key'), actorId: req.user._id });
    req.audit.set({ action: 'billing.refund.request', resource: 'billing-refund', resourceId: String(refund._id), changes: { newValue: { paymentId: refund.paymentId, amount: refund.amount, currency: refund.currency, provider: refund.provider, status: refund.status } } });
    res.status(refund.status === 'succeeded' ? 201 : 202).json(refund);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.post('/refunds/:id/confirm-manual', requirePlatformPermission('billing.refund'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const refund = await billing.confirmManualRefund(req.params.id);
    req.audit.set({ action: 'billing.refund.confirm', resource: 'billing-refund', resourceId: req.params.id, changes: { newValue: { status: refund.status, processedAt: refund.processedAt } } });
    res.json(refund);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.get('/refunds/:id', requirePlatformPermission('billing.view'), async (req, res, next) => {
  try { const refund = await BillingRefund.findById(req.params.id).populate('tenantId', 'storeName slug').lean(); if (!refund) return res.status(404).json({ message: 'Refund not found' }); res.json(refund); }
  catch (error) { next(error); }
});

router.put('/stripe/tenants/:id', requirePlatformPermission('billing.update'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const tenant = await billing.configureStripeTenant(req.params.id, { customerId: req.body?.customerId, subscriptionId: req.body?.subscriptionId });
    req.audit.set({ action: 'billing.stripe.configure', resource: 'tenant', resourceId: req.params.id, changes: { newValue: { stripeCustomerId: tenant.billing?.stripeCustomerId, stripeSubscriptionId: tenant.billing?.stripeSubscriptionId } } });
    res.json({ tenantId: tenant._id, stripeCustomerId: tenant.billing?.stripeCustomerId, stripeSubscriptionId: tenant.billing?.stripeSubscriptionId });
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.post('/stripe/tenants/:id/sync', requirePlatformPermission('billing.update'), async (req, res, next) => {
  try {
    const result = await billing.syncStripeTenant(req.params.id);
    req.audit.set({ action: 'billing.stripe.sync', resource: 'tenant', resourceId: req.params.id, changes: { newValue: result } });
    res.json(result);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.post('/stripe/tenants/:id/portal', requirePlatformPermission('billing.update'), async (req, res, next) => {
  try { const result = await billing.createBillingPortalSession(req.params.id); req.audit.set({ action: 'billing.portal.create', resource: 'tenant', resourceId: req.params.id }); res.status(201).json(result); }
  catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.get('/coupons', requirePlatformPermission('billing.view'), async (_req, res, next) => {
  try { res.json(await BillingCoupon.find().sort({ createdAt: -1 }).populate('applicablePlanIds', 'name slug').lean()); } catch (error) { next(error); }
});

router.post('/coupons', requirePlatformPermission('billing.update'), async (req, res, next) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code || !req.body?.name) return res.status(400).json({ message: 'Coupon code and name are required' });
    if (!['percent', 'fixed'].includes(req.body?.type) || !Number.isFinite(Number(req.body?.value)) || Number(req.body.value) <= 0) return res.status(400).json({ message: 'Coupon type and positive value are required' });
    if (req.body.type === 'percent' && Number(req.body.value) > 100) return res.status(400).json({ message: 'Percentage coupon cannot exceed 100' });
    const coupon = await BillingCoupon.create({ code, name: String(req.body.name).trim(), type: req.body.type, value: Number(req.body.value), currency: req.body.currency || 'LKR', applicablePlanIds: req.body.applicablePlanIds || [], startsAt: req.body.startsAt || null, endsAt: req.body.endsAt || null, maxRedemptions: Number(req.body.maxRedemptions || 0), maxRedemptionsPerTenant: Number(req.body.maxRedemptionsPerTenant || 1), active: req.body.active !== false, createdBy: req.user._id });
    req.audit.set({ action: 'billing.coupon.create', resource: 'billing-coupon', resourceId: String(coupon._id), changes: { newValue: coupon.toObject() } }); res.status(201).json(coupon);
  } catch (error) { if (error.code === 11000) return res.status(409).json({ message: 'Coupon code already exists' }); next(error); }
});

router.put('/coupons/:id', requirePlatformPermission('billing.update'), async (req, res, next) => {
  try { const allowed = ['name', 'startsAt', 'endsAt', 'maxRedemptions', 'maxRedemptionsPerTenant', 'active', 'applicablePlanIds']; const update = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))); const coupon = await BillingCoupon.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true }); if (!coupon) return res.status(404).json({ message: 'Coupon not found' }); req.audit.set({ action: 'billing.coupon.update', resource: 'billing-coupon', resourceId: req.params.id, changes: { newValue: coupon.toObject() } }); res.json(coupon); }
  catch (error) { next(error); }
});

router.get('/tax-rules', requirePlatformPermission('billing.view'), async (_req, res, next) => {
  try { res.json(await BillingTaxRule.find().sort({ countryCode: 1, priority: 1 }).lean()); } catch (error) { next(error); }
});

router.post('/tax-rules', requirePlatformPermission('billing.update'), async (req, res, next) => {
  try { const countryCode = String(req.body?.countryCode || '').trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(countryCode) || !req.body?.name || !Number.isFinite(Number(req.body?.rate))) return res.status(400).json({ message: 'Valid tax name, two-letter country, and rate are required' }); const rule = await BillingTaxRule.create({ name: String(req.body.name).trim(), countryCode, regionCode: req.body.regionCode || '*', rate: Number(req.body.rate), inclusive: req.body.inclusive === true, priority: Number(req.body.priority || 100), startsAt: req.body.startsAt || null, endsAt: req.body.endsAt || null, active: req.body.active !== false, createdBy: req.user._id }); req.audit.set({ action: 'billing.tax-rule.create', resource: 'billing-tax-rule', resourceId: String(rule._id), changes: { newValue: rule.toObject() } }); res.status(201).json(rule); }
  catch (error) { next(error); }
});

router.put('/tax-rules/:id', requirePlatformPermission('billing.update'), async (req, res, next) => {
  try { const allowed = ['name', 'regionCode', 'rate', 'inclusive', 'priority', 'startsAt', 'endsAt', 'active']; const update = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))); const rule = await BillingTaxRule.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true }); if (!rule) return res.status(404).json({ message: 'Tax rule not found' }); req.audit.set({ action: 'billing.tax-rule.update', resource: 'billing-tax-rule', resourceId: req.params.id, changes: { newValue: rule.toObject() } }); res.json(rule); }
  catch (error) { next(error); }
});

router.get('/contracts', requirePlatformPermission('billing.view'), async (_req, res, next) => {
  try { res.json(await EnterpriseContract.find().sort({ createdAt: -1 }).populate('tenantId', 'storeName slug').lean()); } catch (error) { next(error); }
});

router.post('/contracts', requirePlatformPermission('billing.update'), requireRecentStepUp(), async (req, res, next) => {
  try { const body = req.body || {}; if (!body.tenantId || !body.contractNumber || !Number.isFinite(Number(body.amount)) || !body.startsAt) return res.status(400).json({ message: 'Tenant, contract number, amount, and start date are required' }); const contract = await EnterpriseContract.create({ tenantId: body.tenantId, contractNumber: String(body.contractNumber).trim().toUpperCase(), status: body.status || 'draft', amount: Number(body.amount), currency: body.currency || 'LKR', billingCycle: body.billingCycle || 'monthly', paymentTermsDays: Number(body.paymentTermsDays || 30), startsAt: body.startsAt, endsAt: body.endsAt || null, autoRenew: body.autoRenew === true, purchaseOrder: body.purchaseOrder || '', notes: body.notes || '', createdBy: req.user._id, updatedBy: req.user._id }); req.audit.set({ action: 'billing.contract.create', resource: 'enterprise-contract', resourceId: String(contract._id), changes: { newValue: contract.toObject() } }); res.status(201).json(contract); }
  catch (error) { if (error.code === 11000) return res.status(409).json({ message: 'Contract number already exists' }); next(error); }
});

router.put('/contracts/:id', requirePlatformPermission('billing.update'), requireRecentStepUp(), async (req, res, next) => {
  try { const allowed = ['status', 'amount', 'currency', 'billingCycle', 'paymentTermsDays', 'startsAt', 'endsAt', 'autoRenew', 'purchaseOrder', 'notes']; const update = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))); update.updatedBy = req.user._id; const contract = await EnterpriseContract.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true }); if (!contract) return res.status(404).json({ message: 'Contract not found' }); req.audit.set({ action: 'billing.contract.update', resource: 'enterprise-contract', resourceId: req.params.id, changes: { newValue: contract.toObject() } }); res.json(contract); }
  catch (error) { next(error); }
});

module.exports = router;
