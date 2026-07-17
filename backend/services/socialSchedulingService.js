'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Tenant = require('../models/Tenant');
const SocialMedia = require('../models/SocialMedia');
const SocialSchedule = require('../models/SocialSchedule');
const SocialPostDraft = require('../models/SocialPostDraft');
const ScheduledSocialPost = require('../models/ScheduledSocialPost');
const SocialPublishAttempt = require('../models/SocialPublishAttempt');
const socialMediaService = require('./socialMediaService');
const { Coupon } = require('../models/index');
const {
  VALID_PLATFORMS, VALID_CTAS, cleanText, isPublicHttpsUrl, selectTenantSiteUrl,
  extractVerifiedFeatures, couponAppliesToProduct, calculatePricing, deriveHashtags,
  buildDescription, validateDescription, isValidTimeZone, distributeScheduleTimestamps,
  orderProducts, productSnapshot, snapshotChanged, buildPublishingKey, scheduleTransition,
} = require('./socialSchedulingUtils');

const MAX_SELECTED_PRODUCTS = 1000;

function objectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw Object.assign(new Error(`Invalid ${label}`), { statusCode: 400 });
  return new mongoose.Types.ObjectId(value);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requiredTenantId(req) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) throw Object.assign(new Error('Tenant context is required'), { statusCode: 403 });
  return objectId(tenantId, 'tenant');
}

function normalizeConfig(input = {}, tenant = {}) {
  const platforms = [...new Set((input.platforms || []).filter(value => VALID_PLATFORMS.includes(value)))];
  if (!platforms.length) throw new Error('Select Facebook and/or Instagram');
  const timezone = cleanText(input.timezone || tenant.settings?.timezone || 'Asia/Colombo', 80);
  if (!isValidTimeZone(timezone)) throw new Error('Select a valid timezone');
  const today = new Date().toISOString().slice(0, 10);
  const startDate = String(input.startDate || today);
  const dailyStartTime = String(input.dailyStartTime || '18:30');
  const name = cleanText(input.name, 120);
  if (!name) throw new Error('Schedule name is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Start date is invalid');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyStartTime)) throw new Error('Daily start time is invalid');
  const cta = VALID_CTAS.includes(input.cta) ? input.cta : 'none';
  const postingDays = [...new Set((input.postingDays?.length ? input.postingDays : [0,1,2,3,4,5,6]).map(Number))]
    .filter(value => Number.isInteger(value) && value >= 0 && value <= 6);
  if (!postingDays.length) throw new Error('Select at least one posting day');
  return {
    name, platforms, timezone, startDate, dailyStartTime,
    postGapMinutes: Math.max(1, Math.min(1440, Number(input.postGapMinutes || 5))),
    postsPerDay: Math.max(1, Math.min(500, Number(input.postsPerDay || 5))),
    postingDays,
    languageMode: input.sinhalaEnabled || input.languageMode === 'sinhala_mixed' ? 'sinhala_mixed' : 'english',
    cta,
    productOrder: ['selected','newest','random','price_asc','price_desc'].includes(input.productOrder) ? input.productOrder : 'selected',
    repeat: input.repeat === true,
    changePolicy: input.changePolicy === 'regenerate' ? 'regenerate' : 'needs_review',
    voucherId: input.voucherId || null,
    additionalDiscountPercent: Number(input.additionalDiscountPercent || 0),
    currencyUnit: Math.max(0.01, Number(input.currencyUnit || 1)),
  };
}

async function loadTenant(tenantId) {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw Object.assign(new Error('Store not found'), { statusCode: 404 });
  return tenant;
}

function productQueryFromSelection(tenantId, selection = {}) {
  const filter = { tenantId, isActive: true };
  if (selection.selectAllFiltered) {
    const source = selection.filters || {};
    if (source.search) filter.$or = [
      { name: { $regex: escapeRegex(source.search), $options: 'i' } },
      { brand: { $regex: escapeRegex(source.search), $options: 'i' } },
      { sku: { $regex: escapeRegex(source.search), $options: 'i' } },
    ];
    if (source.brand) filter.brand = { $regex: `^${escapeRegex(source.brand)}$`, $options: 'i' };
    if (source.category) filter.category = objectId(source.category, 'category');
    if (selection.excludedProductIds?.length) filter._id = { $nin: selection.excludedProductIds.map(id => objectId(id, 'product')) };
  } else {
    const ids = [...new Set((selection.productIds || []).map(String))];
    if (!ids.length) throw new Error('Select at least one product');
    if (ids.length > MAX_SELECTED_PRODUCTS) throw new Error(`Select no more than ${MAX_SELECTED_PRODUCTS} products`);
    filter._id = { $in: ids.map(id => objectId(id, 'product')) };
  }
  return filter;
}

async function listProductOptions(tenantId, query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 30)));
  const filter = productQueryFromSelection(tenantId, { selectAllFiltered: true, filters: query });
  const now = new Date();
  const [products, total, coupons] = await Promise.all([
    Product.find(filter).populate('category', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
    Coupon.find({ tenantId, isActive: true, validFrom: { $lte: now }, validUntil: { $gte: now } })
      .select('code type value maxDiscount minOrderAmount validFrom validUntil isActive isNewUserOnly applicableCategories applicableProducts applicableBrands excludedProducts excludeSaleItems usageLimit usedCount').lean(),
  ]);
  return {
    products: products.map(product => ({
      ...product,
      applicableVouchers: coupons.filter(coupon => couponAppliesToProduct(coupon, product, now)).map(coupon => ({
        _id: coupon._id, code: coupon.code, type: coupon.type, value: coupon.value, validUntil: coupon.validUntil,
      })),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

async function generateDraftBatch(req, input) {
  const tenantId = requiredTenantId(req);
  const [tenant, social] = await Promise.all([
    loadTenant(tenantId),
    SocialMedia.findOne({ tenantId }).lean(),
  ]);
  const config = normalizeConfig(input.config || input, tenant);
  const connectionResults = {};
  for (const platform of config.platforms) {
    connectionResults[platform] = await socialMediaService.testConnection(platform);
  }
  const filter = productQueryFromSelection(tenantId, input.selection || input);
  let products = await Product.find(filter).populate('category', 'name').limit(MAX_SELECTED_PRODUCTS + 1).lean();
  if (!products.length) throw new Error('No active products matched the selection');
  if (products.length > MAX_SELECTED_PRODUCTS) throw new Error(`The filtered selection exceeds ${MAX_SELECTED_PRODUCTS} products; narrow the filters`);
  if (config.productOrder === 'selected' && !input.selection?.selectAllFiltered && !input.selectAllFiltered) {
    const selectedOrder = new Map(((input.selection || input).productIds || []).map((id, index) => [String(id), index]));
    products.sort((a, b) => (selectedOrder.get(String(a._id)) ?? Number.MAX_SAFE_INTEGER) - (selectedOrder.get(String(b._id)) ?? Number.MAX_SAFE_INTEGER));
  } else {
    products = orderProducts(products, config.productOrder);
  }
  const timestamps = distributeScheduleTimestamps(products.length, config);
  const siteUrl = selectTenantSiteUrl(tenant);
  const selectedVoucher = config.voucherId
    ? await Coupon.findOne({ _id: objectId(config.voucherId, 'voucher'), tenantId }).lean()
    : null;
  if (config.voucherId && !selectedVoucher) throw new Error('Selected voucher was not found in this store');

  const draftGroup = crypto.randomUUID();
  const createdBy = objectId(req.user._id, 'administrator');
  const docs = [];
  for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
    const product = products[productIndex];
    const categoryName = cleanText(product.category?.name || product.subCategory, 100);
    const voucher = selectedVoucher && couponAppliesToProduct(selectedVoucher, product) ? selectedVoucher : null;
    const voucherInvalid = Boolean(selectedVoucher && !voucher);
    let pricing;
    try {
      pricing = calculatePricing(product, {
        additionalDiscountPercent: config.additionalDiscountPercent,
        voucher,
        currencyUnit: config.currencyUnit,
      });
    } catch (error) {
      pricing = { regularPrice: Number(product.price) || 0, finalPrice: 0, discountPercent: 0, hasOffer: false, calculationError: error.message };
    }
    const features = extractVerifiedFeatures(product);
    const hashtags = deriveHashtags({ tenant, product, categoryName });
    const productUrl = siteUrl && product.slug ? `${siteUrl}/product/${encodeURIComponent(product.slug)}` : '';
    const mediaUrls = [...new Set([product.thumbnail, ...(product.images || [])].filter(Boolean))];

    for (const platform of config.platforms) {
      const errors = [];
      const warnings = [];
      if (product.isActive === false) errors.push('Product is inactive');
      if (!(Number(product.price) > 0)) errors.push('Product price is invalid');
      if (!productUrl || !isPublicHttpsUrl(productUrl)) errors.push('Configure a public HTTPS storefront URL for this store');
      if (!mediaUrls.some(isPublicHttpsUrl)) errors.push('Product needs at least one public HTTPS image');
      if (mediaUrls.filter(isPublicHttpsUrl).length > 10) errors.push(`${platform} supports at most 10 images; exclude extra images during draft review`);
      if (!social?.[platform]?.connected || !social?.[platform]?.enabled) errors.push(`${platform} is not connected and enabled`);
      if (!connectionResults[platform]?.ok) errors.push(`${platform} connection validation failed: ${connectionResults[platform]?.message || 'reconnect the account'}`);
      if (Number(product.stock) <= 0) warnings.push('Product is out of stock and will be rechecked before publishing');
      if (voucherInvalid) errors.push(`Voucher ${selectedVoucher.code} is not applicable to this product`);
      if (pricing.calculationError) errors.push(pricing.calculationError);
      if (config.cta === 'whatsapp' && !(tenant.settings?.whatsappNumber || tenant.settings?.whatsapp || tenant.settings?.storePhone)) {
        errors.push('Configure the store WhatsApp number before using the WhatsApp CTA');
      }
      if (platform === 'instagram' && config.cta !== 'none') warnings.push('Instagram feed posts do not display native CTA buttons; the destination will remain in the caption');
      if (platform === 'facebook' && config.cta !== 'none' && mediaUrls.length > 1) warnings.push('Facebook multi-image posts preserve all images; a native CTA card is unavailable, so the clickable destination remains in the post text');
      if (platform === 'facebook' && config.cta === 'shop_now' && mediaUrls.length === 1) warnings.push('Facebook will publish a Shop Now link card; its preview image is taken from the product page metadata');
      if (platform === 'facebook' && config.cta === 'whatsapp') warnings.push('Facebook feed publishing may not show a native WhatsApp button; the WhatsApp destination is preserved as a clickable link card or caption link');

      const content = buildDescription({
        platform, tenant, product, categoryName, pricing, voucher, features, hashtags,
        productUrl, cta: config.cta, sinhalaEnabled: config.languageMode === 'sinhala_mixed',
      });
      errors.push(...validateDescription(content, platform));
      docs.push({
        tenantId, scheduleDraftGroup: draftGroup, scheduleName: config.name,
        product: product._id, productName: product.name, platform,
        scheduledFor: timestamps[productIndex], generatedContent: content,
        verifiedFeatures: features, hashtags,
        media: mediaUrls.map((url, order) => ({ url, order, included: true })),
        priceSnapshot: pricing,
        voucherSnapshot: voucher ? { _id: voucher._id, code: voucher.code, type: voucher.type, value: voucher.value, validUntil: voucher.validUntil, maxDiscount: voucher.maxDiscount || null } : null,
        productSnapshot: productSnapshot(product), cta: config.cta, productUrl,
        validation: { valid: errors.length === 0, errors, warnings },
        confirmationStatus: errors.length ? 'invalid' : 'awaiting', configSnapshot: config, createdBy,
      });
    }
  }
  const drafts = await SocialPostDraft.insertMany(docs);
  return { draftGroup, count: drafts.length, valid: drafts.filter(draft => draft.validation.valid).length, drafts };
}

async function listDraftBatches(tenantId, query = {}) {
  const filter = { tenantId };
  if (query.status) filter.confirmationStatus = query.status;
  const groups = await SocialPostDraft.aggregate([
    { $match: filter },
    { $group: {
      _id: '$scheduleDraftGroup', name: { $first: '$scheduleName' }, createdAt: { $min: '$createdAt' },
      total: { $sum: 1 }, confirmed: { $sum: { $cond: [{ $eq: ['$confirmationStatus','confirmed'] }, 1, 0] } },
      valid: { $sum: { $cond: ['$validation.valid', 1, 0] } }, schedule: { $first: '$schedule' },
    } },
    { $sort: { createdAt: -1 } },
  ]);
  return groups;
}

async function listDrafts(tenantId, group) {
  return SocialPostDraft.find({ tenantId, scheduleDraftGroup: group }).sort({ scheduledFor: 1, platform: 1 }).lean();
}

async function updateDraft(tenantId, draftId, input, adminId) {
  if (input.regenerate === true || input.offerPrice !== undefined || input.additionalDiscountPercent !== undefined) {
    return regenerateDraft(tenantId, draftId, input);
  }
  const draft = await SocialPostDraft.findOne({ _id: objectId(draftId, 'draft'), tenantId });
  if (!draft) throw Object.assign(new Error('Draft not found'), { statusCode: 404 });
  if (draft.schedule) throw new Error('Draft is already attached to a schedule');
  if (input.editedContent !== undefined) draft.editedContent = cleanText(input.editedContent, 70000);
  if (Array.isArray(input.verifiedFeatures)) draft.verifiedFeatures = input.verifiedFeatures.map(value => cleanText(value, 240)).filter(Boolean).slice(0, 7);
  if (Array.isArray(input.hashtags)) draft.hashtags = input.hashtags.map(value => cleanText(value, 80)).filter(Boolean).slice(0, 20);
  if (VALID_CTAS.includes(input.cta)) draft.cta = input.cta;
  if (Array.isArray(input.media)) {
    draft.media = input.media.filter(item => isPublicHttpsUrl(item.url)).slice(0, 30).map((item, order) => ({ url: item.url, order, included: item.included !== false }));
  }
  const content = draft.editedContent || draft.generatedContent;
  const errors = validateDescription(content, draft.platform);
  if (!draft.media.some(item => item.included && isPublicHttpsUrl(item.url))) errors.push('At least one public HTTPS image is required');
  if (draft.media.filter(item => item.included).length > 10) errors.push(`${draft.platform} supports at most 10 included images`);
  if (draft.cta === 'shop_now' && !isPublicHttpsUrl(draft.productUrl)) errors.push('Shop Now requires a valid public HTTPS product URL');
  if (draft.cta === 'whatsapp' && !/https:\/\/wa\.me\//i.test(content)) errors.push('WhatsApp CTA requires a valid wa.me destination in the description');
  draft.validation.valid = errors.length === 0;
  draft.validation.errors = errors;
  draft.confirmationStatus = errors.length ? 'invalid' : 'awaiting';
  draft.confirmedAt = null;
  draft.confirmedBy = null;
  await draft.save();
  return draft;
}

async function regenerateDraft(tenantId, draftId, overrides = {}) {
  const draft = await SocialPostDraft.findOne({ _id: objectId(draftId, 'draft'), tenantId });
  if (!draft) throw Object.assign(new Error('Draft not found'), { statusCode: 404 });
  if (draft.schedule) throw new Error('A scheduled draft cannot be regenerated');
  const [product, tenant, social] = await Promise.all([
    Product.findOne({ _id: draft.product, tenantId, isActive: true }).populate('category', 'name').lean(),
    loadTenant(tenantId),
    SocialMedia.findOne({ tenantId }).lean(),
  ]);
  if (!product) throw new Error('Product is no longer active');
  const config = { ...(draft.configSnapshot || {}) };
  if (overrides.additionalDiscountPercent !== undefined) config.additionalDiscountPercent = Number(overrides.additionalDiscountPercent);
  const voucher = draft.voucherSnapshot?._id ? await Coupon.findOne({ _id: draft.voucherSnapshot._id, tenantId }).lean() : null;
  const errors = [];
  const warnings = [];
  if (draft.voucherSnapshot && !couponAppliesToProduct(voucher, product)) errors.push('The selected voucher is no longer applicable');
  const pricing = calculatePricing(product, {
    additionalDiscountPercent: config.additionalDiscountPercent,
    offerPrice: overrides.offerPrice,
    voucher: couponAppliesToProduct(voucher, product) ? voucher : null,
    currencyUnit: config.currencyUnit || 1,
  });
  const siteUrl = selectTenantSiteUrl(tenant);
  const productUrl = siteUrl ? `${siteUrl}/product/${encodeURIComponent(product.slug)}` : '';
  const categoryName = product.category?.name || product.subCategory || '';
  const features = extractVerifiedFeatures(product);
  const hashtags = deriveHashtags({ tenant, product, categoryName });
  const cta = VALID_CTAS.includes(overrides.cta) ? overrides.cta : draft.cta;
  const content = buildDescription({
    platform: draft.platform, tenant, product, categoryName, pricing,
    voucher: couponAppliesToProduct(voucher, product) ? voucher : null,
    features, hashtags, productUrl, cta, sinhalaEnabled: config.languageMode === 'sinhala_mixed',
  });
  errors.push(...validateDescription(content, draft.platform));
  if (!draft.media.some(item => item.included && isPublicHttpsUrl(item.url))) errors.push('At least one public HTTPS image is required');
  if (draft.media.filter(item => item.included).length > 10) errors.push(`${draft.platform} supports at most 10 included images`);
  if (!social?.[draft.platform]?.connected || !social?.[draft.platform]?.enabled) errors.push(`${draft.platform} is not connected and enabled`);
  if (!productUrl) errors.push('Storefront public HTTPS URL is not configured');
  if (Number(product.stock) <= 0) warnings.push('Product is out of stock');
  draft.generatedContent = content; draft.editedContent = ''; draft.verifiedFeatures = features;
  draft.hashtags = hashtags; draft.priceSnapshot = pricing; draft.productSnapshot = productSnapshot(product);
  draft.productUrl = productUrl; draft.cta = cta; draft.configSnapshot = config;
  draft.manualOfferPrice = overrides.offerPrice !== undefined && overrides.offerPrice !== '' ? pricing.finalPrice : null;
  draft.validation = { valid: errors.length === 0, errors, warnings };
  draft.confirmationStatus = errors.length ? 'invalid' : 'awaiting'; draft.confirmedAt = null; draft.confirmedBy = null;
  await draft.save();
  return draft;
}

async function confirmDraft(tenantId, draftId, adminId) {
  const draft = await SocialPostDraft.findOne({ _id: objectId(draftId, 'draft'), tenantId });
  if (!draft) throw Object.assign(new Error('Draft not found'), { statusCode: 404 });
  if (!draft.validation.valid) throw new Error('Resolve draft validation errors before confirming');
  if (draft.scheduledFor <= new Date()) throw new Error('Scheduled time must be in the future');
  const product = await Product.findOne({ _id: draft.product, tenantId, isActive: true }).lean();
  if (!product || snapshotChanged(draft.productSnapshot, product)) throw new Error('Product data changed after draft generation. Regenerate and review this draft before confirming.');
  if (draft.voucherSnapshot?._id) {
    const voucher = await Coupon.findOne({ _id: draft.voucherSnapshot._id, tenantId }).lean();
    if (!couponAppliesToProduct(voucher, product)) throw new Error('The selected voucher changed or expired. Regenerate this draft before confirming.');
  }
  const connection = await socialMediaService.testConnection(draft.platform);
  if (!connection.ok) throw new Error(`${draft.platform} connection validation failed: ${connection.message}`);
  draft.confirmationStatus = 'confirmed';
  draft.confirmedBy = objectId(adminId, 'administrator');
  draft.confirmedAt = new Date();
  await draft.save();
  return draft;
}

async function confirmAll(tenantId, group, adminId) {
  const candidates = await SocialPostDraft.find({ tenantId, scheduleDraftGroup: group, 'validation.valid': true, schedule: null });
  const platforms = [...new Set(candidates.map(draft => draft.platform))];
  for (const platform of platforms) {
    const connection = await socialMediaService.testConnection(platform);
    if (!connection.ok) throw new Error(`${platform} connection validation failed: ${connection.message}`);
  }
  const products = await Product.find({ tenantId, _id: { $in: candidates.map(draft => draft.product) }, isActive: true }).lean();
  const productMap = new Map(products.map(product => [String(product._id), product]));
  const voucherIds = [...new Set(candidates.map(draft => draft.voucherSnapshot?._id).filter(Boolean).map(String))];
  const vouchers = voucherIds.length ? await Coupon.find({ tenantId, _id: { $in: voucherIds } }).lean() : [];
  const voucherMap = new Map(vouchers.map(voucher => [String(voucher._id), voucher]));
  const confirmedAt = new Date();
  let confirmed = 0;
  const operations = candidates.map(draft => {
    const product = productMap.get(String(draft.product));
    const voucher = draft.voucherSnapshot?._id ? voucherMap.get(String(draft.voucherSnapshot._id)) : null;
    const changed = !product || snapshotChanged(draft.productSnapshot, product) || draft.scheduledFor <= confirmedAt
      || (draft.voucherSnapshot && !couponAppliesToProduct(voucher, product));
    if (changed) {
      return { updateOne: { filter: { _id: draft._id, tenantId }, update: { $set: {
        confirmationStatus: 'invalid', 'validation.valid': false,
        'validation.errors': [...new Set([...(draft.validation.errors || []), 'Product data or scheduled time changed; regenerate and review this draft'])],
      } } } };
    }
    confirmed += 1;
    return { updateOne: { filter: { _id: draft._id, tenantId }, update: { $set: { confirmationStatus: 'confirmed', confirmedBy: objectId(adminId, 'administrator'), confirmedAt } } } };
  });
  if (operations.length) await SocialPostDraft.bulkWrite(operations);
  return { confirmed, needsReview: candidates.length - confirmed };
}

async function createSchedule(tenantId, group, adminId) {
  const drafts = await SocialPostDraft.find({ tenantId, scheduleDraftGroup: group, confirmationStatus: 'confirmed', schedule: null }).sort({ scheduledFor: 1 });
  if (!drafts.length) throw new Error('Confirm at least one valid draft before creating the schedule');
  const config = drafts[0].configSnapshot || {};
  let schedule;
  try {
    schedule = await SocialSchedule.create({
      tenantId, draftGroup: group, name: drafts[0].scheduleName, status: 'scheduled',
      platforms: [...new Set(drafts.map(draft => draft.platform))], timezone: config.timezone,
      startDate: config.startDate, dailyStartTime: config.dailyStartTime,
      postGapMinutes: config.postGapMinutes, postsPerDay: config.postsPerDay,
      postingDays: config.postingDays, languageMode: config.languageMode, cta: config.cta,
      productOrder: config.productOrder, repeat: config.repeat, changePolicy: config.changePolicy,
      voucherId: config.voucherId || null, additionalDiscountPercent: config.additionalDiscountPercent || 0,
      configSnapshot: { ...config, draftGroup: group },
      counts: { total: drafts.length, pending: drafts.length },
      createdBy: objectId(adminId, 'administrator'), nextRunAt: drafts[0].scheduledFor,
    });
  } catch (error) {
    if (error.code === 11000) throw Object.assign(new Error('This draft batch already has a schedule'), { statusCode: 409 });
    throw error;
  }

  const queueDocs = drafts.map(draft => ({
    tenantId, schedule: schedule._id, draft: draft._id, product: draft.product,
    productName: draft.productName, platform: draft.platform,
    content: draft.editedContent || draft.generatedContent, generatedContent: draft.generatedContent,
    verifiedFeatures: draft.verifiedFeatures, hashtags: draft.hashtags, media: draft.media,
    cta: draft.cta, productUrl: draft.productUrl, scheduledFor: draft.scheduledFor,
    status: 'pending', idempotencyKey: buildPublishingKey(tenantId, schedule._id, draft._id, draft.platform, 0),
    priceSnapshot: draft.priceSnapshot, manualOfferPrice: draft.manualOfferPrice, voucherSnapshot: draft.voucherSnapshot,
    productSnapshot: draft.productSnapshot, changePolicy: config.changePolicy,
  }));
  try {
    await ScheduledSocialPost.insertMany(queueDocs, { ordered: true });
    await SocialPostDraft.updateMany({ tenantId, _id: { $in: drafts.map(draft => draft._id) } }, { $set: { schedule: schedule._id } });
  } catch (error) {
    await SocialSchedule.deleteOne({ _id: schedule._id, tenantId });
    throw error;
  }
  return schedule;
}

async function refreshScheduleCounts(tenantId, scheduleId) {
  const rows = await ScheduledSocialPost.aggregate([
    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), schedule: new mongoose.Types.ObjectId(scheduleId) } },
    { $group: { _id: '$status', count: { $sum: 1 }, next: { $min: '$scheduledFor' } } },
  ]);
  const counts = { total: 0, published: 0, pending: 0, failed: 0, skipped: 0, needsReview: 0 };
  let nextRunAt = null;
  rows.forEach(row => {
    counts.total += row.count;
    if (row._id === 'published') counts.published = row.count;
    if (['pending','processing'].includes(row._id)) { counts.pending += row.count; if (!nextRunAt || row.next < nextRunAt) nextRunAt = row.next; }
    if (row._id === 'failed') counts.failed = row.count;
    if (['skipped','cancelled'].includes(row._id)) counts.skipped += row.count;
    if (row._id === 'needs_review') counts.needsReview = row.count;
  });
  const schedule = await SocialSchedule.findOne({ _id: scheduleId, tenantId });
  if (!schedule) return null;
  schedule.counts = counts;
  schedule.nextRunAt = nextRunAt;
  if (!nextRunAt && !['paused','stopped','failed'].includes(schedule.status)) {
    if (schedule.repeat && counts.total > 0 && !counts.failed && !counts.needsReview) {
      const claimed = await SocialSchedule.findOneAndUpdate(
        { _id: schedule._id, tenantId, repeatCycle: schedule.repeatCycle, deletedAt: null, status: { $nin: ['paused','stopped','failed'] } },
        { $inc: { repeatCycle: 1 }, $set: { status: 'scheduled' } },
        { new: true }
      );
      if (claimed) {
        const templates = await ScheduledSocialPost.find({ tenantId, schedule: schedule._id, cycle: 0 }).sort({ scheduledFor: 1, platform: 1 }).lean();
        const productIds = [...new Set(templates.map(item => String(item.product)))];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const timestamps = distributeScheduleTimestamps(productIds.length, { ...schedule.configSnapshot, startDate: tomorrow });
        const timeByProduct = new Map(productIds.map((id, index) => [id, timestamps[index]]));
        const cycle = claimed.repeatCycle;
        const repeated = templates.map(template => ({
          tenantId, schedule: schedule._id, draft: template.draft, product: template.product,
          productName: template.productName, platform: template.platform, content: template.content,
          generatedContent: template.generatedContent, verifiedFeatures: template.verifiedFeatures,
          hashtags: template.hashtags, media: template.media.map(media => ({ url: media.url, order: media.order, included: media.included })),
          cta: template.cta, productUrl: template.productUrl, scheduledFor: timeByProduct.get(String(template.product)),
          status: 'pending', attempts: 0, maxAttempts: template.maxAttempts,
          idempotencyKey: buildPublishingKey(tenantId, schedule._id, template.draft, template.platform, cycle),
          cycle, priceSnapshot: template.priceSnapshot, manualOfferPrice: template.manualOfferPrice, voucherSnapshot: template.voucherSnapshot,
          productSnapshot: template.productSnapshot, changePolicy: template.changePolicy,
        }));
        await ScheduledSocialPost.insertMany(repeated);
        counts.total += repeated.length;
        counts.pending = repeated.length;
        nextRunAt = repeated.reduce((next, item) => !next || item.scheduledFor < next ? item.scheduledFor : next, null);
        schedule.repeatCycle = claimed.repeatCycle;
        schedule.status = 'scheduled';
      }
    } else {
      schedule.status = counts.failed || counts.needsReview ? 'failed' : 'completed';
    }
  }
  await schedule.save();
  return schedule;
}

async function listSchedules(tenantId, query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 25)));
  const filter = { tenantId, deletedAt: null };
  if (query.status) filter.status = query.status;
  const [schedules, total] = await Promise.all([
    SocialSchedule.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SocialSchedule.countDocuments(filter),
  ]);
  return { schedules, total, page, pages: Math.ceil(total / limit) };
}

async function scheduleAction(tenantId, scheduleId, action) {
  const schedule = await SocialSchedule.findOne({ _id: objectId(scheduleId, 'schedule'), tenantId, deletedAt: null });
  if (!schedule) throw Object.assign(new Error('Schedule not found'), { statusCode: 404 });
  const now = new Date();
  if (action === 'pause') {
    schedule.status = scheduleTransition(schedule.status, action); schedule.pausedAt = now;
  } else if (action === 'resume') {
    schedule.status = scheduleTransition(schedule.status, action);
    const pausedForMs = schedule.pausedAt ? Math.max(0, now - schedule.pausedAt) : 0;
    if (pausedForMs > 0) {
      const pending = await ScheduledSocialPost.find({ tenantId, schedule: schedule._id, status: 'pending' }).select('_id scheduledFor');
      if (pending.length) await ScheduledSocialPost.bulkWrite(pending.map(item => ({ updateOne: { filter: { _id: item._id, tenantId, status: 'pending' }, update: { $set: { scheduledFor: new Date(item.scheduledFor.getTime() + pausedForMs), nextAttemptAt: null } } } })));
    }
    schedule.resumedAt = now; schedule.pausedAt = null;
  } else if (action === 'stop') {
    schedule.status = scheduleTransition(schedule.status, action); schedule.stoppedAt = now; schedule.nextRunAt = null;
    await ScheduledSocialPost.updateMany({ tenantId, schedule: schedule._id, status: { $in: ['pending','processing','failed','needs_review'] } }, { $set: { status: 'cancelled', cancelledAt: now, lockedAt: null, lockedBy: '' } });
  } else throw new Error('Unknown schedule action');
  await schedule.save();
  return refreshScheduleCounts(tenantId, schedule._id);
}

async function deleteSchedule(tenantId, scheduleId) {
  const schedule = await SocialSchedule.findOneAndUpdate(
    { _id: objectId(scheduleId, 'schedule'), tenantId, deletedAt: null },
    { $set: { status: 'stopped', stoppedAt: new Date(), deletedAt: new Date(), nextRunAt: null } },
    { new: true }
  );
  if (!schedule) throw Object.assign(new Error('Schedule not found'), { statusCode: 404 });
  await ScheduledSocialPost.updateMany(
    { tenantId, schedule: schedule._id, status: { $in: ['pending','processing','failed','needs_review'] } },
    { $set: { status: 'cancelled', cancelledAt: new Date(), lockedAt: null, lockedBy: '' } }
  );
  return { deleted: true };
}

async function listQueue(tenantId, query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 25)));
  const filter = { tenantId };
  if (query.schedule) filter.schedule = objectId(query.schedule, 'schedule');
  if (query.status) filter.status = query.status;
  if (query.platform) filter.platform = query.platform;
  if (query.date) {
    const start = new Date(`${query.date}T00:00:00.000Z`);
    filter.scheduledFor = { $gte: start, $lt: new Date(start.getTime() + 86400000) };
  }
  const [items, total] = await Promise.all([
    ScheduledSocialPost.find(filter).populate('schedule', 'name status deletedAt').sort({ scheduledFor: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ScheduledSocialPost.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) };
}

async function updateQueueItem(tenantId, itemId, input) {
  const item = await ScheduledSocialPost.findOne({ _id: objectId(itemId, 'queue item'), tenantId });
  if (!item) throw Object.assign(new Error('Queue item not found'), { statusCode: 404 });
  if (!['pending','failed','needs_review'].includes(item.status)) throw new Error('Only pending, failed, or needs-review items can be edited');
  if (input.content !== undefined) item.content = cleanText(input.content, 70000);
  if (input.scheduledFor !== undefined) {
    const scheduled = new Date(input.scheduledFor);
    if (!Number.isFinite(scheduled.getTime()) || scheduled <= new Date()) throw new Error('Scheduled time must be in the future');
    item.scheduledFor = scheduled;
  }
  if (VALID_CTAS.includes(input.cta)) item.cta = input.cta;
  if (Array.isArray(input.media)) item.media = input.media.filter(media => isPublicHttpsUrl(media.url)).slice(0, 30).map((media, order) => ({ url: media.url, order, included: media.included !== false }));
  const errors = validateDescription(item.content, item.platform);
  if (!item.media.some(media => media.included)) errors.push('At least one image is required');
  if (item.media.filter(media => media.included).length > 10) errors.push(`${item.platform} supports at most 10 included images`);
  if (item.cta === 'shop_now' && !isPublicHttpsUrl(item.productUrl)) errors.push('Shop Now requires a public HTTPS product URL');
  if (item.cta === 'whatsapp' && !/https:\/\/wa\.me\//i.test(item.content)) errors.push('WhatsApp CTA requires a wa.me destination in the content');
  if (errors.length) throw new Error(errors.join('. '));
  item.status = 'pending'; item.lastError = ''; item.lastErrorCode = ''; item.nextAttemptAt = null;
  await item.save();
  await refreshScheduleCounts(tenantId, item.schedule);
  return item;
}

async function cancelQueueItem(tenantId, itemId) {
  const item = await ScheduledSocialPost.findOneAndUpdate(
    { _id: objectId(itemId, 'queue item'), tenantId, status: { $in: ['pending','failed','needs_review'] } },
    { $set: { status: 'cancelled', cancelledAt: new Date(), lockedAt: null, lockedBy: '' } },
    { new: true }
  );
  if (!item) throw new Error('Only unpublished queue items can be cancelled');
  await refreshScheduleCounts(tenantId, item.schedule);
  return item;
}

async function retryQueueItem(tenantId, itemId) {
  const existing = await ScheduledSocialPost.findOne({ _id: objectId(itemId, 'queue item'), tenantId, status: 'failed' });
  if (!existing) throw new Error('Only failed queue items can be retried');
  const schedule = await SocialSchedule.findOne({ _id: existing.schedule, tenantId });
  if (!schedule || !['scheduled','running'].includes(schedule.status)) throw new Error('Resume the parent schedule before retrying this item');
  const item = await ScheduledSocialPost.findOneAndUpdate(
    { _id: existing._id, tenantId, status: 'failed' },
    { $set: { status: 'pending', scheduledFor: new Date(Date.now() + 5000), nextAttemptAt: null, lastError: '', lastErrorCode: '' } },
    { new: true }
  );
  if (!item) throw new Error('Queue item changed while retrying; refresh and try again');
  await refreshScheduleCounts(tenantId, item.schedule);
  return item;
}

async function getPublishLogs(tenantId, query = {}) {
  const filter = { tenantId };
  if (query.queueItem) filter.queueItem = objectId(query.queueItem, 'queue item');
  if (query.schedule) filter.schedule = objectId(query.schedule, 'schedule');
  return SocialPublishAttempt.find(filter).sort({ createdAt: -1 }).limit(250).lean();
}

async function deleteDraft(tenantId, draftId) {
  const result = await SocialPostDraft.deleteOne({ _id: objectId(draftId, 'draft'), tenantId, schedule: null });
  if (!result.deletedCount) throw new Error('Only unscheduled drafts can be deleted');
  return { deleted: true };
}

async function deleteDraftBatch(tenantId, group) {
  const scheduled = await SocialPostDraft.exists({ tenantId, scheduleDraftGroup: group, schedule: { $ne: null } });
  if (scheduled) throw new Error('A created schedule owns this batch; stop or delete the activity instead');
  const result = await SocialPostDraft.deleteMany({ tenantId, scheduleDraftGroup: group, schedule: null });
  return { deleted: result.deletedCount };
}

module.exports = {
  requiredTenantId, listProductOptions, generateDraftBatch, listDraftBatches, listDrafts,
  updateDraft, regenerateDraft, confirmDraft, confirmAll, createSchedule, refreshScheduleCounts,
  listSchedules, scheduleAction, deleteSchedule, listQueue, updateQueueItem,
  cancelQueueItem, retryQueueItem, getPublishLogs, deleteDraft, deleteDraftBatch,
};
