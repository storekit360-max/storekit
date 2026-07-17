'use strict';

const AutomationRule = require('../models/AutomationRule');
const BehaviorEvent = require('../models/BehaviorEvent');
const CourierIntegration = require('../models/CourierIntegration');
const CourierSubmission = require('../models/CourierSubmission');
const Deal = require('../models/Deal');
const Order = require('../models/Order');
const Product = require('../models/Product');
const PublishLog = require('../models/PublishLog');
const SocialMedia = require('../models/SocialMedia');
const SocialSchedule = require('../models/SocialSchedule');
const SocialPostDraft = require('../models/SocialPostDraft');
const ScheduledSocialPost = require('../models/ScheduledSocialPost');
const SocialPublishAttempt = require('../models/SocialPublishAttempt');
const SubscriptionInvoice = require('../models/SubscriptionInvoice');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const TenantPayment = require('../models/TenantPayment');
const User = require('../models/User');
const {
  Category,
  Coupon,
  Banner,
  Review,
  Notification,
  Settings,
  GiftCard,
  ReturnRequest,
  OTP,
  SeasonalCampaign,
  PaymentGateway,
  DeliveryService,
  BusinessPage,
  Subscriber,
} = require('../models/index');
const curfoxClient = require('./curfoxClient');

// Keep this registry explicit. Tenant deletion is intentionally limited to
// models whose ownership field has been audited; global plans, platform
// coupons, backups and super-admin records must never be removed here.
const TENANT_DATA_SPECS = Object.freeze([
  { key: 'automationRules', model: AutomationRule, field: 'tenantId' },
  { key: 'behaviorEvents', model: BehaviorEvent, field: 'tenantId' },
  { key: 'courierIntegrations', model: CourierIntegration, field: 'tenantId' },
  { key: 'courierSubmissions', model: CourierSubmission, field: 'tenantId' },
  { key: 'deals', model: Deal, field: 'tenantId' },
  { key: 'orders', model: Order, field: 'tenantId' },
  { key: 'products', model: Product, field: 'tenantId' },
  { key: 'publishLogs', model: PublishLog, field: 'tenantId' },
  { key: 'socialMedia', model: SocialMedia, field: 'tenantId' },
  { key: 'socialSchedules', model: SocialSchedule, field: 'tenantId' },
  { key: 'socialPostDrafts', model: SocialPostDraft, field: 'tenantId' },
  { key: 'scheduledSocialPosts', model: ScheduledSocialPost, field: 'tenantId' },
  { key: 'socialPublishAttempts', model: SocialPublishAttempt, field: 'tenantId' },
  { key: 'subscriptionInvoices', model: SubscriptionInvoice, field: 'tenantId' },
  { key: 'subscriptionPayments', model: SubscriptionPayment, field: 'tenantId' },
  { key: 'tenantPayments', model: TenantPayment, field: 'tenant' },
  { key: 'categories', model: Category, field: 'tenantId' },
  { key: 'coupons', model: Coupon, field: 'tenantId' },
  { key: 'banners', model: Banner, field: 'tenantId' },
  { key: 'reviews', model: Review, field: 'tenantId' },
  { key: 'notifications', model: Notification, field: 'tenantId' },
  { key: 'settings', model: Settings, field: 'tenantId' },
  { key: 'giftCards', model: GiftCard, field: 'tenantId' },
  { key: 'returnRequests', model: ReturnRequest, field: 'tenantId' },
  { key: 'otps', model: OTP, field: 'tenantId' },
  { key: 'seasonalCampaigns', model: SeasonalCampaign, field: 'tenantId' },
  { key: 'paymentGateways', model: PaymentGateway, field: 'tenantId' },
  { key: 'deliveryServices', model: DeliveryService, field: 'tenantId' },
  { key: 'businessPages', model: BusinessPage, field: 'tenantId' },
  { key: 'subscribers', model: Subscriber, field: 'tenantId' },
]);

function tenantFilter(spec, tenantId) {
  return { [spec.field]: tenantId };
}

function expectedDeletionConfirmation(slug) {
  return `DELETE ${String(slug || '').trim()}`;
}

function validateTenantDeletionConfirmation(tenant, confirmationText) {
  if (!tenant?._id || !tenant?.slug) throw new Error('Tenant not found');
  if (String(confirmationText || '').trim() !== expectedDeletionConfirmation(tenant.slug)) {
    const error = new Error(`Type ${expectedDeletionConfirmation(tenant.slug)} to verify permanent deletion`);
    error.statusCode = 400;
    throw error;
  }
  return true;
}

async function getTenantDataCounts(tenantId) {
  const rows = await Promise.all(TENANT_DATA_SPECS.map(async spec => [
    spec.key,
    await spec.model.countDocuments(tenantFilter(spec, tenantId)),
  ]));
  const tenantUsers = await User.countDocuments({ tenantId, role: { $ne: 'superadmin' } });
  const counts = Object.fromEntries([...rows, ['users', tenantUsers]]);
  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  return { counts, total };
}

async function deleteTenantData(tenantId) {
  if (!tenantId) throw new Error('Tenant ID is required');

  // A deleted tenant must never retain a usable provider token in this process.
  curfoxClient.clearTenantToken(tenantId);

  const deleted = {};
  // Sequential deletion makes failures deterministic. The Tenant document is
  // removed by the caller only after every owned collection succeeds, so an
  // interrupted cleanup can be safely retried without touching another tenant.
  for (const spec of TENANT_DATA_SPECS) {
    // eslint-disable-next-line no-await-in-loop
    const result = await spec.model.deleteMany(tenantFilter(spec, tenantId));
    deleted[spec.key] = result.deletedCount || 0;
  }

  const users = await User.deleteMany({ tenantId, role: { $ne: 'superadmin' } });
  deleted.users = users.deletedCount || 0;

  // Platform super-admin identities are global. If legacy data accidentally
  // attached one to this tenant, preserve the account and remove only the link.
  await User.updateMany({ tenantId, role: 'superadmin' }, { $set: { tenantId: null } });

  return {
    deleted,
    total: Object.values(deleted).reduce((sum, value) => sum + Number(value || 0), 0),
  };
}

module.exports = {
  TENANT_DATA_SPECS,
  deleteTenantData,
  expectedDeletionConfirmation,
  getTenantDataCounts,
  validateTenantDeletionConfirmation,
};
