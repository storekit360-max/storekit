'use strict';

const Tenant = require('../models/Tenant');
const TenantPayment = require('../models/TenantPayment');
const BillingRefund = require('../models/BillingRefund');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const AuthEvent = require('../models/AuthEvent');
const FeatureFlagExposure = require('../models/FeatureFlagExposure');
const RuntimeFeatureFlag = require('../models/RuntimeFeatureFlag');
const BehaviorEvent = require('../models/BehaviorEvent');
const AcquisitionCost = require('../models/AcquisitionCost');

const ACTIVE_SUBSCRIPTIONS = ['active', 'past_due', 'grace'];
const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const normalizeCurrency = value => String(value || 'LKR').trim().toUpperCase();
function monthKey(value) { const date = new Date(value); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; }
function monthStart(value = new Date()) { const date = new Date(value); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)); }
function addMonths(value, count) { const date = new Date(value); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1)); }
function monthsBetween(from, to) { return Math.max(1, (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1); }
function recurringMonthlyAmount(tenant) {
  const cycle = tenant.subscription?.billingCycle || tenant.billing?.billingCycle || tenant.plan?.billingCycle || 'monthly';
  const amount = Number(tenant.subscription?.amount || tenant.billing?.nextPaymentAmount || tenant.plan?.price || 0);
  if (cycle === 'yearly') return roundMoney(amount / 12);
  if (cycle === 'once') return 0;
  return roundMoney(amount);
}
function addCurrency(target, currency, value) { const key = normalizeCurrency(currency); target[key] = roundMoney((target[key] || 0) + Number(value || 0)); }
function calculateCac(spend, acquiredTenants) { return Number(acquiredTenants || 0) > 0 ? roundMoney(Number(spend || 0) / Number(acquiredTenants)) : null; }

async function overview({ from, to }) {
  const start = from ? new Date(from) : addMonths(monthStart(), -11); const end = to ? new Date(to) : new Date();
  const tenants = await Tenant.find().populate('plan', 'name price currency billingCycle features').select('createdAt status subscription billing plan settings management').lean();
  const active = tenants.filter(tenant => ACTIVE_SUBSCRIPTIONS.includes(tenant.subscription?.status || tenant.billing?.subscriptionStatus) && tenant.status !== 'suspended' && !tenant.management?.archivedAt);
  const mrr = {}; active.forEach(tenant => addCurrency(mrr, tenant.subscription?.currency || tenant.billing?.currency || tenant.plan?.currency, recurringMonthlyAmount(tenant)));
  const arr = Object.fromEntries(Object.entries(mrr).map(([currency, value]) => [currency, roundMoney(value * 12)]));
  const [payments, refunds, paidTenantIds, productsByTenant, ordersByTenant, users, cancelledInRange, acquisitionCosts, paidInvoices] = await Promise.all([
    TenantPayment.aggregate([{ $match: { status: { $in: ['approved','partially_refunded','refunded'] }, reviewedAt: { $gte: start, $lte: end } } }, { $group: { _id: '$currency', gross: { $sum: '$amount' }, refundedOnPayments: { $sum: '$refundedAmount' }, count: { $sum: 1 } } }]),
    BillingRefund.aggregate([{ $match: { status: 'succeeded', processedAt: { $gte: start, $lte: end } } }, { $group: { _id: '$currency', amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    SubscriptionInvoice.distinct('tenantId', { status: { $in: ['paid','partially_refunded','refunded'] } }),
    Product.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 }, firstAt: { $min: '$createdAt' } } }]),
    Order.aggregate([{ $group: { _id: '$tenantId', count: { $sum: 1 }, firstAt: { $min: '$createdAt' } } }]),
    User.countDocuments(),
    Tenant.countDocuments({ 'billing.cancelledAt': { $gte: start, $lte: end } }),
    AcquisitionCost.aggregate([{ $match: { incurredAt: { $gte: start, $lte: end } } }, { $group: { _id: '$currency', spend: { $sum: '$amount' }, entries: { $sum: 1 } } }]),
    SubscriptionInvoice.find({ status: { $in: ['paid','partially_refunded','refunded'] }, paidAt: { $ne: null } }).select('tenantId currency paidAt').sort({ paidAt: 1 }).lean(),
  ]);
  const cash = {}; payments.forEach(row => { cash[normalizeCurrency(row._id)] = { gross: roundMoney(row.gross), refunds: roundMoney(row.refundedOnPayments), net: roundMoney(row.gross - row.refundedOnPayments), payments: row.count }; }); refunds.forEach(row => { const key = normalizeCurrency(row._id); cash[key] ||= { gross: 0, refunds: 0, net: 0, payments: 0 }; cash[key].refunds = Math.max(cash[key].refunds, roundMoney(row.amount)); cash[key].net = roundMoney(cash[key].gross - cash[key].refunds); });
  const productMap = new Map(productsByTenant.map(row => [String(row._id), row])); const orderMap = new Map(ordersByTenant.map(row => [String(row._id), row]));
  const activated = tenants.filter(tenant => { const product = productMap.get(String(tenant._id)); const order = orderMap.get(String(tenant._id)); const deadline = new Date(tenant.createdAt).getTime() + 14 * 86400000; return product?.count > 0 && order?.count > 0 && new Date(product.firstAt).getTime() <= deadline && new Date(order.firstAt).getTime() <= deadline; }).length;
  const trialTenants = tenants.filter(tenant => tenant.subscription?.status === 'trial' || tenant.billing?.subscriptionStatus === 'trial').length;
  const paidSet = new Set(paidTenantIds.map(String)); const converted = tenants.filter(tenant => paidSet.has(String(tenant._id))).length;
  const eligibleAtStart = tenants.filter(tenant => new Date(tenant.createdAt) < start && (!tenant.billing?.cancelledAt || new Date(tenant.billing.cancelledAt) >= start)).length;
  const churnRate = eligibleAtStart ? cancelledInRange / eligibleAtStart : 0;
  const rangeMonths = monthsBetween(start, end); const monthlyChurnRate = churnRate > 0 ? 1 - (1 - Math.min(churnRate, 1)) ** (1 / rangeMonths) : 0;
  const ltv = {}; Object.entries(mrr).forEach(([currency, value]) => { const arpa = active.length ? value / active.length : 0; ltv[currency] = monthlyChurnRate > 0 ? roundMoney(arpa / monthlyChurnRate) : null; });
  const firstPaid = new Map(); for (const invoice of paidInvoices) if (!firstPaid.has(String(invoice.tenantId))) firstPaid.set(String(invoice.tenantId), invoice);
  const acquiredByCurrency = {}; for (const invoice of firstPaid.values()) if (new Date(invoice.paidAt) >= start && new Date(invoice.paidAt) <= end) acquiredByCurrency[normalizeCurrency(invoice.currency)] = (acquiredByCurrency[normalizeCurrency(invoice.currency)] || 0) + 1;
  const acquisitionSpend = {}; const cac = {}; acquisitionCosts.forEach(row => { const currency = normalizeCurrency(row._id); acquisitionSpend[currency] = { spend: roundMoney(row.spend), entries: row.entries }; cac[currency] = calculateCac(row.spend, acquiredByCurrency[currency]); });
  return { range: { from: start, to: end, months: rangeMonths }, subscriptions: { mrr, arr, active: active.length, trials: trialTenants, cancelledInRange, churnRate: Number((churnRate * 100).toFixed(2)), monthlyChurnRate: Number((monthlyChurnRate * 100).toFixed(2)), converted, conversionRate: tenants.length ? Number((converted / tenants.length * 100).toFixed(2)) : 0 }, platform: { tenants: tenants.length, users, activationCount: activated, activationRate: tenants.length ? Number((activated / tenants.length * 100).toFixed(2)) : 0 }, cash, unitEconomics: { ltv, cac, acquisitionSpend, acquiredTenants: acquiredByCurrency, cacReason: Object.keys(acquisitionSpend).length ? 'CAC is acquisition spend divided by tenants whose first paid invoice occurred in the selected range, separated by currency.' : 'No acquisition costs are recorded for the selected range.' }, methodology: { mrr: 'Current recurring subscription value normalized to monthly; trials and one-time plans excluded.', churn: 'Tenants cancelled in the selected range divided by tenants eligible at range start. LTV uses the equivalent compounded monthly churn rate.', activation: 'Tenant created at least one product and received at least one order within 14 days.', cash: 'Approved SaaS payments less succeeded refunds, grouped by currency.', cac: 'Recorded platform acquisition spend divided by first-time paid tenants in the same currency and date range.' } };
}

async function commerceFunnel({ from, to }) {
  const start = from ? new Date(from) : new Date(Date.now() - 30 * 86400000); const end = to ? new Date(to) : new Date();
  const [viewers, ordered, paid, activity, sources] = await Promise.all([
    BehaviorEvent.aggregate([{ $match: { eventType: 'product_view', createdAt: { $gte: start, $lte: end } } }, { $group: { _id: '$customer', firstAt: { $min: '$createdAt' } } }]),
    Order.aggregate([{ $match: { customer: { $ne: null }, createdAt: { $gte: start, $lte: end } } }, { $group: { _id: '$customer', firstAt: { $min: '$createdAt' } } }]),
    Order.aggregate([{ $match: { customer: { $ne: null }, paymentStatus: 'paid', createdAt: { $gte: start, $lte: end } } }, { $group: { _id: '$customer', firstAt: { $min: '$createdAt' } } }]),
    BehaviorEvent.aggregate([{ $match: { createdAt: { $gte: start, $lte: end } } }, { $group: { _id: { day: { $dayOfWeek: '$createdAt' }, hour: { $hour: '$createdAt' } }, events: { $sum: 1 }, customers: { $addToSet: '$customer' } } }, { $project: { _id: 0, day: '$_id.day', hour: '$_id.hour', events: 1, customers: { $size: '$customers' } } }, { $sort: { day: 1, hour: 1 } }]),
    BehaviorEvent.aggregate([{ $match: { createdAt: { $gte: start, $lte: end } } }, { $group: { _id: { source: '$source', campaign: '$metadata.campaign' }, events: { $sum: 1 }, customers: { $addToSet: '$customer' } } }, { $project: { _id: 0, source: '$_id.source', campaign: '$_id.campaign', events: 1, customers: { $size: '$customers' } } }, { $sort: { events: -1 } }, { $limit: 50 }]),
  ]);
  const viewerMap = new Map(viewers.map(row => [String(row._id), new Date(row.firstAt)]));
  const orderedMap = new Map(ordered.filter(row => viewerMap.has(String(row._id)) && new Date(row.firstAt) >= viewerMap.get(String(row._id))).map(row => [String(row._id), new Date(row.firstAt)]));
  const paidMap = new Map(paid.filter(row => orderedMap.has(String(row._id)) && new Date(row.firstAt) >= orderedMap.get(String(row._id))).map(row => [String(row._id), new Date(row.firstAt)]));
  const counts = [viewerMap.size, orderedMap.size, paidMap.size];
  const steps = [['Product viewers', counts[0]], ['Order creators', counts[1]], ['Paid customers', counts[2]]].map(([name, count], index) => ({ name, count, conversionFromPrevious: index === 0 ? 100 : counts[index - 1] ? Number((count / counts[index - 1] * 100).toFixed(2)) : 0, conversionFromStart: counts[0] ? Number((count / counts[0] * 100).toFixed(2)) : 0 }));
  return { range: { from: start, to: end }, steps, activityHeatmap: { timezone: 'UTC', cells: activity }, sources, methodology: 'Only consented signed-in product viewers can enter the first step. Order and paid steps include identified customers; guest orders are excluded because they cannot be safely joined to consented identities.' };
}

async function timeSeries({ months = 12 }) {
  const count = Math.min(Math.max(Number(months) || 12, 3), 36); const start = addMonths(monthStart(), -(count - 1)); const end = addMonths(monthStart(), 1);
  const [payments, refunds, signups, cancellations, orders] = await Promise.all([
    TenantPayment.aggregate([{ $match: { status: { $in: ['approved','partially_refunded','refunded'] }, reviewedAt: { $gte: start, $lt: end } } }, { $group: { _id: { month: { $dateToString: { date: '$reviewedAt', format: '%Y-%m' } }, currency: '$currency' }, gross: { $sum: '$amount' }, paymentRefunds: { $sum: '$refundedAmount' } } }]),
    BillingRefund.aggregate([{ $match: { status: 'succeeded', processedAt: { $gte: start, $lt: end } } }, { $group: { _id: { month: { $dateToString: { date: '$processedAt', format: '%Y-%m' } }, currency: '$currency' }, amount: { $sum: '$amount' } } }]),
    Tenant.aggregate([{ $match: { createdAt: { $gte: start, $lt: end } } }, { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m' } }, count: { $sum: 1 } } }]),
    Tenant.aggregate([{ $match: { 'billing.cancelledAt': { $gte: start, $lt: end } } }, { $group: { _id: { $dateToString: { date: '$billing.cancelledAt', format: '%Y-%m' } }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { createdAt: { $gte: start, $lt: end }, paymentStatus: 'paid', orderStatus: { $nin: ['cancelled','refunded'] } } }, { $lookup: { from: 'tenants', localField: 'tenantId', foreignField: '_id', as: 'tenant' } }, { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: true } }, { $group: { _id: { month: { $dateToString: { date: '$createdAt', format: '%Y-%m' } }, currency: { $ifNull: ['$tenant.settings.currency', 'LKR'] } }, gmv: { $sum: '$total' }, orders: { $sum: 1 } } }]),
  ]);
  const rows = Array.from({ length: count }, (_, index) => ({ month: monthKey(addMonths(start, index)), signups: 0, cancellations: 0, collections: {}, refunds: {}, netCollections: {}, storefrontGmv: {}, storefrontOrders: 0 })); const map = new Map(rows.map(row => [row.month, row]));
  signups.forEach(item => { if (map.has(item._id)) map.get(item._id).signups = item.count; }); cancellations.forEach(item => { if (map.has(item._id)) map.get(item._id).cancellations = item.count; });
  payments.forEach(item => { const row = map.get(item._id.month); if (!row) return; const currency = normalizeCurrency(item._id.currency); row.collections[currency] = roundMoney(item.gross); row.refunds[currency] = roundMoney(item.paymentRefunds); });
  refunds.forEach(item => { const row = map.get(item._id.month); if (!row) return; const currency = normalizeCurrency(item._id.currency); row.refunds[currency] = Math.max(row.refunds[currency] || 0, roundMoney(item.amount)); });
  orders.forEach(item => { const row = map.get(item._id.month); if (!row) return; addCurrency(row.storefrontGmv, item._id.currency, item.gmv); row.storefrontOrders += item.orders; });
  rows.forEach(row => { for (const currency of new Set([...Object.keys(row.collections), ...Object.keys(row.refunds)])) row.netCollections[currency] = roundMoney((row.collections[currency] || 0) - (row.refunds[currency] || 0)); });
  return { from: start, to: end, rows };
}

async function retention({ cohorts = 6 }) {
  const count = Math.min(Math.max(Number(cohorts) || 6, 3), 12); const start = addMonths(monthStart(), -(count - 1)); const tenants = await Tenant.find({ createdAt: { $gte: start } }).select('createdAt owner').lean(); const tenantIds = tenants.map(item => item._id); const userIds = tenants.map(item => item.owner).filter(Boolean);
  const [orderActivity, loginActivity] = await Promise.all([
    Order.aggregate([{ $match: { tenantId: { $in: tenantIds }, createdAt: { $gte: start } } }, { $group: { _id: { tenant: '$tenantId', month: { $dateToString: { date: '$createdAt', format: '%Y-%m' } } } } }]),
    AuthEvent.aggregate([{ $match: { userId: { $in: userIds }, eventType: 'login', outcome: 'success', occurredAt: { $gte: start } } }, { $group: { _id: { user: '$userId', month: { $dateToString: { date: '$occurredAt', format: '%Y-%m' } } } } }]),
  ]);
  const tenantActivity = new Map(); const ownerToTenant = new Map(tenants.filter(t => t.owner).map(t => [String(t.owner), String(t._id)])); const add = (tenant, month) => { const key = String(tenant); if (!tenantActivity.has(key)) tenantActivity.set(key, new Set()); tenantActivity.get(key).add(month); }; orderActivity.forEach(row => add(row._id.tenant, row._id.month)); loginActivity.forEach(row => { const tenant = ownerToTenant.get(String(row._id.user)); if (tenant) add(tenant, row._id.month); });
  const groups = new Map(); tenants.forEach(tenant => { const cohort = monthKey(tenant.createdAt); if (!groups.has(cohort)) groups.set(cohort, []); groups.get(cohort).push(tenant); });
  const rows = Array.from(groups.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([cohort, members]) => { const cohortDate = new Date(`${cohort}-01T00:00:00Z`); const periods = Array.from({ length: Math.min(count, monthsBetween(cohortDate, monthStart())) }, (_, index) => { const month = monthKey(addMonths(cohortDate, index)); const retained = members.filter(member => index === 0 || tenantActivity.get(String(member._id))?.has(month)).length; return { month, period: index, retained, rate: members.length ? Number((retained / members.length * 100).toFixed(2)) : 0 }; }); return { cohort, size: members.length, periods }; });
  return { definition: 'A tenant is retained in a month when its owner signs in successfully or its storefront receives an order. Month 0 is acquisition.', rows };
}

async function featureAdoption({ days = 30 }) {
  const since = new Date(Date.now() - Math.min(Math.max(Number(days) || 30, 1), 180) * 86400000);
  const [flags, exposures] = await Promise.all([RuntimeFeatureFlag.find().select('key name enabled entitlementKey').lean(), FeatureFlagExposure.aggregate([{ $match: { occurredAt: { $gte: since }, enabled: true } }, { $group: { _id: '$flagKey', exposures: { $sum: 1 }, tenants: { $addToSet: '$tenantId' }, subjects: { $addToSet: '$subjectKeyHash' } } }])]); const map = new Map(exposures.map(row => [row._id, row]));
  return { since, rows: flags.map(flag => { const row = map.get(flag.key); return { key: flag.key, name: flag.name, enabled: flag.enabled, entitlementKey: flag.entitlementKey, exposures: row?.exposures || 0, uniqueTenants: (row?.tenants || []).filter(Boolean).length, uniqueSubjects: row?.subjects?.length || 0 }; }).sort((a,b) => b.exposures - a.exposures) };
}

async function clickHeatmap({ days = 30, page = '', tenantId = null } = {}) {
  const boundedDays = Math.min(Math.max(Number(days) || 30, 1), 90); const from = new Date(Date.now() - boundedDays * 86400000); const to = new Date();
  const match = { eventType: 'storefront_click', createdAt: { $gte: from, $lte: to }, 'interaction.normalizedX': { $gte: 0, $lt: 1 }, 'interaction.normalizedY': { $gte: 0, $lt: 1 } };
  if (page) match['interaction.page'] = page;
  if (tenantId) match.tenantId = tenantId;
  const cells = await BehaviorEvent.aggregate([
    { $match: match },
    { $group: { _id: { page: '$interaction.page', x: { $floor: { $multiply: ['$interaction.normalizedX', 20] } }, y: { $floor: { $multiply: ['$interaction.normalizedY', 20] } } }, events: { $sum: 1 }, customers: { $addToSet: '$customer' }, tenants: { $addToSet: '$tenantId' } } },
    { $project: { _id: 0, page: '$_id.page', x: '$_id.x', y: '$_id.y', events: 1, customers: { $size: '$customers' }, tenants: { $size: '$tenants' } } },
    { $match: { customers: { $gte: 3 } } },
    { $sort: { page: 1, events: -1 } },
    { $limit: 2000 },
  ]);
  return { range: { from, to, days: boundedDays }, grid: { columns: 20, rows: 20 }, page: page || 'all', tenantId: tenantId ? String(tenantId) : null, cells, methodology: 'Only signed-in customers with active marketing consent contribute normalized interactive-element clicks. No DOM text, selector, query string, raw URL or pixel coordinate is stored. Cells require at least three distinct customers and events expire after 180 days.' };
}

module.exports = { ACTIVE_SUBSCRIPTIONS, roundMoney, normalizeCurrency, monthKey, monthsBetween, recurringMonthlyAmount, calculateCac, overview, timeSeries, retention, featureAdoption, commerceFunnel, clickHeatmap };
