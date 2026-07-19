'use strict';

const BillingCoupon = require('../models/BillingCoupon');
const BillingCouponRedemption = require('../models/BillingCouponRedemption');
const BillingTaxRule = require('../models/BillingTaxRule');
const EnterpriseContract = require('../models/EnterpriseContract');

function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

function countryCodeForTenant(tenant) {
  const explicit = String(tenant.settings?.merchantCountryCode || '').toUpperCase();
  if (/^[A-Z]{2}$/.test(explicit)) return explicit;
  const names = { 'sri lanka': 'LK', india: 'IN', 'united states': 'US', 'united kingdom': 'GB', australia: 'AU', canada: 'CA' };
  return names[String(tenant.settings?.country || '').trim().toLowerCase()] || '';
}

async function activeContract(tenantId, at = new Date()) {
  return EnterpriseContract.findOne({ tenantId, status: 'active', startsAt: { $lte: at }, $or: [{ endsAt: null }, { endsAt: { $gte: at } }] }).sort({ startsAt: -1 });
}

async function validateCoupon(code, tenant, plan, subtotal, at = new Date()) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  const coupon = await BillingCoupon.findOne({ code: normalized, active: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: at } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: at } }] }] });
  if (!coupon) { const error = new Error('Coupon is invalid or expired'); error.statusCode = 400; throw error; }
  if (coupon.applicablePlanIds.length && !coupon.applicablePlanIds.some(id => String(id) === String(plan._id))) { const error = new Error('Coupon does not apply to this plan'); error.statusCode = 400; throw error; }
  if (coupon.type === 'percent' && coupon.value > 100) { const error = new Error('Coupon percentage is invalid'); error.statusCode = 409; throw error; }
  if (coupon.type === 'fixed' && coupon.currency !== String(plan.currency || 'LKR').toUpperCase()) { const error = new Error('Coupon currency does not match the subscription'); error.statusCode = 400; throw error; }
  if (coupon.maxRedemptions > 0 && coupon.redemptionCount >= coupon.maxRedemptions) { const error = new Error('Coupon redemption limit reached'); error.statusCode = 409; throw error; }
  const tenantUses = await BillingCouponRedemption.countDocuments({ couponId: coupon._id, tenantId: tenant._id, status: { $in: ['reserved', 'redeemed'] } });
  if (tenantUses >= coupon.maxRedemptionsPerTenant) { const error = new Error('Coupon was already used by this tenant'); error.statusCode = 409; throw error; }
  const discount = coupon.type === 'percent' ? subtotal * coupon.value / 100 : coupon.value;
  return { coupon, discountAmount: roundMoney(Math.min(subtotal, discount)) };
}

async function taxForTenant(tenant, taxable, at = new Date()) {
  const countryCode = countryCodeForTenant(tenant);
  if (!countryCode || taxable <= 0) return { taxAmount: 0, taxLines: [] };
  const regionCode = String(tenant.settings?.state || tenant.settings?.regionCode || '').trim().toUpperCase();
  const regionFilter = regionCode ? { regionCode: { $in: [regionCode, '*'] } } : { regionCode: '*' };
  const rule = await BillingTaxRule.findOne({ countryCode, ...regionFilter, active: true, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: at } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: at } }] }] }).sort({ priority: 1, regionCode: 1 });
  if (!rule) return { taxAmount: 0, taxLines: [] };
  const amount = roundMoney(rule.inclusive ? taxable * rule.rate / (100 + rule.rate) : taxable * rule.rate / 100);
  return { taxAmount: amount, taxLines: [{ name: rule.name, rate: rule.rate, amount, inclusive: rule.inclusive }], inclusive: rule.inclusive };
}

async function calculateQuote(tenant, plan, couponCode) {
  const contract = await activeContract(tenant._id);
  const subtotal = roundMoney(contract ? contract.amount : Number(plan.price || 0));
  const currency = String(contract?.currency || plan.currency || 'LKR').toUpperCase();
  const billingCycle = contract?.billingCycle || tenant.billing?.billingCycle || plan.billingCycle || 'monthly';
  const couponResult = await validateCoupon(couponCode, tenant, plan, subtotal);
  const discountAmount = couponResult?.discountAmount || 0;
  const taxable = roundMoney(Math.max(0, subtotal - discountAmount));
  const tax = await taxForTenant(tenant, taxable);
  const total = roundMoney(tax.inclusive ? taxable : taxable + tax.taxAmount);
  return { subtotal, discountAmount, taxAmount: tax.taxAmount, taxLines: tax.taxLines, total, currency, billingCycle, coupon: couponResult?.coupon || null, contract: contract || null };
}

async function reserveCoupon(quote, tenantId, paymentId) {
  if (!quote.coupon) return null;
  const filter = { _id: quote.coupon._id, active: true };
  if (quote.coupon.maxRedemptions > 0) filter.redemptionCount = { $lt: quote.coupon.maxRedemptions };
  const claimed = await BillingCoupon.findOneAndUpdate(filter, { $inc: { redemptionCount: 1 } }, { new: true });
  if (!claimed) { const error = new Error('Coupon redemption limit reached'); error.statusCode = 409; throw error; }
  try { return await BillingCouponRedemption.create({ couponId: claimed._id, tenantId, paymentId, discountAmount: quote.discountAmount, status: 'reserved' }); }
  catch (error) { await BillingCoupon.updateOne({ _id: claimed._id, redemptionCount: { $gt: 0 } }, { $inc: { redemptionCount: -1 } }).catch(() => {}); throw error; }
}

async function finalizeCoupon(paymentId) {
  return BillingCouponRedemption.findOneAndUpdate({ paymentId, status: 'reserved' }, { $set: { status: 'redeemed', redeemedAt: new Date() } }, { new: true });
}

async function releaseCoupon(paymentId) {
  const redemption = await BillingCouponRedemption.findOneAndUpdate({ paymentId, status: 'reserved' }, { $set: { status: 'released', releasedAt: new Date() } }, { new: true });
  if (redemption) await BillingCoupon.updateOne({ _id: redemption.couponId, redemptionCount: { $gt: 0 } }, { $inc: { redemptionCount: -1 } });
  return redemption;
}

module.exports = { activeContract, calculateQuote, countryCodeForTenant, finalizeCoupon, releaseCoupon, reserveCoupon, roundMoney, taxForTenant, validateCoupon };
