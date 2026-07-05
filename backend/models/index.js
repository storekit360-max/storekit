const mongoose = require('mongoose');

// Category
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  description: String,
  image: String,
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
categorySchema.pre('save', function(next) {
  if (!this.slug) this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g,'');
  next();
});
const Category = mongoose.model('Category', categorySchema);

// Coupon
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  description: String,
  type: { type: String, enum: ['percentage', 'fixed'], required: true },
  value: { type: Number, required: true },
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount: { type: Number },
  usageLimit: { type: Number },
  usedCount: { type: Number, default: 0 },
  userLimit: { type: Number, default: 1 },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  isNewUserOnly: { type: Boolean, default: false },
  applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  applicableBrands: [{ type: String }],
  // Products explicitly excluded from this coupon even if they match brand/category scope.
  // Useful when a broad brand/category coupon should skip specific premium or already-
  // discounted products without having to enumerate every applicable product individually.
  excludedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  // If true, this coupon cannot be applied when the cart contains any item
  // that is already on sale (price < salePrice... i.e. hasDiscount === true).
  // Prevents stacking a coupon on top of an existing promotional discount.
  excludeSaleItems: { type: Boolean, default: false },
  // Profit protection: cap the coupon discount so it never eats more than
  // this % of the order's total profit margin (price - costPrice). e.g. 50
  // means the coupon can discount at most 50% of the available margin.
  // Leave unset/0 to disable this check (no profit-based cap).
  maxDiscountPercentOfProfit: { type: Number, default: 0 },
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Track guest usage by normalized email (guests have no userId)
  usedByEmails: [{ type: String, lowercase: true, trim: true }],
  createdAt: { type: Date, default: Date.now }
});
const Coupon = mongoose.model('Coupon', couponSchema);

// Banner - Enhanced with full banner system support
const bannerSchema = new mongoose.Schema({
  title: String,
  subtitle: String,
  image: String,
  link: String,
  buttonText: { type: String, default: 'Shop Now' },
  buttonColor: { type: String, default: '#ffffff' },
  buttonBgColor: { type: String, default: '#3b82f6' },
  position: {
    type: String,
    enum: ['hero', 'promo', 'sidebar', 'running_top', 'popup', 'flash_sale', 'product_page', 'category_page', 'global'],
    default: 'hero'
  },
  runningText: String,
  runningSpeed: { type: Number, default: 30 },
  runningBgColor: { type: String, default: '#1e293b' },
  runningTextColor: { type: String, default: '#ffffff' },
  runningIcon: { type: String, default: '🔥' },
  popupDelay: { type: Number, default: 3 },
  popupFrequency: { type: String, enum: ['always', 'once_per_session', 'once_per_day'], default: 'once_per_session' },
  popupWidth: { type: String, default: 'md' },
  flashSaleEndTime: Date,
  flashSaleText: String,
  targetCategories: [String],
  targetProducts: [String],
  showOnMobile: { type: Boolean, default: true },
  showOnDesktop: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  startDate: Date,
  endDate: Date,
  createdAt: { type: Date, default: Date.now }
});
const Banner = mongoose.model('Banner', bannerSchema);

// Review
const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: String, comment: String,
  isApproved: { type: Boolean, default: false },
  isVerifiedPurchase: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
// One review per product per order — prevents duplicate reviews from the same purchase
reviewSchema.index({ product: 1, user: 1, order: 1 }, { unique: true });
const Review = mongoose.model('Review', reviewSchema);

// Notification
const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'new_order', 'order_status',
      'payment_slip', 'payment_confirmed',
      'cancel_request', 'cancel_approved', 'cancel_rejected', 'cancel_auto_decision',
      'follow_up', 'sla_breach', 'order_stuck', 'followup_reminder',
      'low_stock', 'new_review', 'new_user', 'return_request', 'return_status', 'gift_card', 'system',
    ],
    required: true,
  },
  title: String, message: String, link: String,
  isRead: { type: Boolean, default: false },
  data: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

// Settings
const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: mongoose.Schema.Types.Mixed,
  group: { type: String, default: 'general' },
  updatedAt: { type: Date, default: Date.now }
});
const Settings = mongoose.model('Settings', settingsSchema);

// GiftCard
const giftCardSchema = new mongoose.Schema({
  code: { type: String, unique: true, uppercase: true, required: true },
  initialValue: { type: Number, required: true },
  balance: { type: Number, required: true },
  purchasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  purchaserEmail: String,
  purchaserName: String,
  recipientEmail: String,
  recipientName: String,
  recipientPhone: String,
  message: String,
  design: { type: String, default: 'default' },
  paymentMethod: { type: String, default: 'bank_transfer' },
  paymentStatus: { type: String, enum: ['pending','paid','failed'], default: 'pending' },
  isActive: { type: Boolean, default: false },
  activatedAt: Date,
  expiresAt: Date,
  usageHistory: [{
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: String,
    amount: Number,
    balanceBefore: Number,
    balanceAfter: Number,
    date: { type: Date, default: Date.now }
  }],
  paymentSlip: String,
  paymentSlipUploadedAt: Date,
  slipDeadlineAt: Date,
  paymentExpired: { type: Boolean, default: false },
  adminNote: String,
  rejectionNote: String,
  rejectedAt: Date,
  createdAt: { type: Date, default: Date.now }
});
const GiftCard = mongoose.model('GiftCard', giftCardSchema);

// ── ReturnRequest ─────────────────────────────────────────────────────────────
// ENHANCED: item condition tracking, courier charge deduction, order integration
const returnRequestSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customerEmail: String,

  items: [{
    product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name:      String,
    quantity:  Number,
    price:     Number,     // unit price at time of order (for refund calculation)
    reason:    String,
    condition: { type: String, enum: ['unopened','opened','damaged'], default: 'opened' },

    // ── Admin sets this when item is physically received ──
    // Drives stock adjustment logic:
    //   restockable  → add qty back to product.stock
    //   refurbishable → do NOT touch stock (will be refurbished before relisting)
    //   damaged       → do NOT touch stock (written off)
    itemConditionOnReturn: {
      type: String,
      enum: ['restockable', 'refurbishable', 'damaged'],
      default: undefined,
    },
    stockAdjusted: { type: Boolean, default: false }, // prevent double-adjustment
  }],

  reason:      { type: String, required: true },
  description: String,
  images:      [String],

  status: {
    type: String,
    enum: ['pending','approved','rejected','received','refunded'],
    default: 'pending',
  },
  adminNote:    String,

  // ── Refund financials ────────────────────────────────────────────────────
  refundAmount:   Number,   // gross refund (usually order total or partial)
  courierCharge:  { type: Number, default: 0 }, // amount admin deducts for return courier
  netRefundAmount: Number,  // refundAmount - courierCharge  (what customer actually receives)
  refundMethod:   { type: String, enum: ['original','store_credit','gift_card'] },

  // ── Order integration flags ──────────────────────────────────────────────
  orderStatusUpdated: { type: Boolean, default: false }, // did we flip the order to refunded?
  stockProcessed:     { type: Boolean, default: false }, // did we run stock adjustment?

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);

// OTP
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const OTP = mongoose.model('OTP', otpSchema);

// SeasonalCampaign
const seasonalCampaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['new_year','christmas','black_friday','valentines','easter','halloween','eid','flash_sale','coupon','custom'], default: 'custom' },
  isActive: { type: Boolean, default: false },
  startDate: Date, endDate: Date,
  pageSlug: String,
  pageTitle: String,
  pageDescription: String,
  pageBannerImage: String,
  pageContent: String,
  theme: {
    primaryColor: { type: String, default: '#15803d' },
    secondaryColor: { type: String, default: '#84cc16' },
    accentColor: { type: String, default: '#ffffff' },
    bgColor: { type: String, default: '#0f172a' },
    fontStyle: { type: String, default: 'default' },
    bannerImage: String, logoOverlay: String,
    snowEffect: { type: Boolean, default: false },
    confettiEffect: { type: Boolean, default: false },
    customCSS: String
  },
  announcement: String,
  announcementBg: { type: String, default: '#15803d' },
  announcementEnabled: { type: Boolean, default: true },
  discountPercent: { type: Number, default: 0 },
  couponCode: String,
  isFlashSale: { type: Boolean, default: false },
  flashSaleEndTime: Date,
  flashSaleTitle: String,
  flashSaleSubtitle: String,
  isCouponCampaign: { type: Boolean, default: false },
  couponDescription: String,
  couponMinOrder: { type: Number, default: 0 },
  couponType: { type: String, enum: ['percentage','fixed'], default: 'percentage' },
  couponValue: { type: Number, default: 0 },
  couponAutoCreate: { type: Boolean, default: false },
  isScheduled: { type: Boolean, default: false },
  featuredBannerTitle: String,
  featuredBannerSubtitle: String,
  createdAt: { type: Date, default: Date.now }
});
const SeasonalCampaign = mongoose.model('SeasonalCampaign', seasonalCampaignSchema);

// PaymentGateway config
const paymentGatewaySchema = new mongoose.Schema({
  gateway: { type: String, required: true, unique: true },
  isEnabled: { type: Boolean, default: false },
  isLive: { type: Boolean, default: false },
  displayName: String,
  description: String,
  logo: String,
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
  supportedCurrencies: [String],
  updatedAt: { type: Date, default: Date.now }
});
const PaymentGateway = mongoose.model('PaymentGateway', paymentGatewaySchema);

// DeliveryService
const deliveryServiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  isEnabled: { type: Boolean, default: false },
  codAllowed: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  logo: String,
  description: String,
  trackingUrl: String,
  estimatedDays: String,
  rates: [{ name: String, price: Number, freeAbove: Number, estimatedDays: String }],
  zoneRates: [{ zoneName: String, zones: [String], price: Number, freeAbove: Number, estimatedDays: String }],
  shippingRules: [{
    name: String,
    condition: { type: String, enum: ['weight_above','order_below','order_above','always'] },
    conditionValue: Number,
    adjustment: Number,
    adjustmentType: { type: String, enum: ['fixed','percentage'], default: 'fixed' }
  }],
  freeShippingThreshold: Number,
  deliveryNote: String,
  coverageAreas: String,
  areas: [String],
  apiKey: String,
  apiSecret: String,
  updatedAt: Date,
  createdAt: { type: Date, default: Date.now }
});
const DeliveryService = mongoose.model('DeliveryService', deliveryServiceSchema);

// BusinessPage
const businessPageSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: String,
  metaTitle: String,
  metaDescription: String,
  isActive: { type: Boolean, default: true },
  showInFooter: { type: Boolean, default: true },
  showInNav: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});
const BusinessPage = mongoose.model('BusinessPage', businessPageSchema);

// Newsletter subscriber
const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  isActive: { type: Boolean, default: true },
  source: { type: String, default: 'website' },
  createdAt: { type: Date, default: Date.now }
});
const Subscriber = mongoose.model('Subscriber', subscriberSchema);

module.exports = {
  Category, Coupon, Banner, Review, Notification, Settings, GiftCard,
  ReturnRequest, OTP, SeasonalCampaign, PaymentGateway, DeliveryService,
  BusinessPage, Subscriber
};