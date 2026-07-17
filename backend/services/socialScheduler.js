'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Tenant = require('../models/Tenant');
const SocialMedia = require('../models/SocialMedia');
const PublishLog = require('../models/PublishLog');
const SocialSchedule = require('../models/SocialSchedule');
const ScheduledSocialPost = require('../models/ScheduledSocialPost');
const SocialPublishAttempt = require('../models/SocialPublishAttempt');
const { Coupon } = require('../models/index');
const { publishNow } = require('./publisherService');
const { runWithTenant, withoutTenantScope } = require('../middleware/tenantContext');
const { refreshScheduleCounts } = require('./socialSchedulingService');
const {
  isPublicHttpsUrl, selectTenantSiteUrl, extractVerifiedFeatures, couponAppliesToProduct,
  calculatePricing, deriveHashtags, buildDescription, validateDescription,
  productSnapshot, snapshotChanged, staleClaimResolution,
} = require('./socialSchedulingUtils');

const WORKER_ID = `${process.pid}:${crypto.randomUUID()}`;
const LOCK_ID = 'social-post-scheduler';
const DEFAULT_INTERVAL_MS = 15000;
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const BATCH_SIZE = 10;
let timer = null;
let localRunning = false;
const health = { running: false, workerId: WORKER_ID, lastStartedAt: null, lastCompletedAt: null, lastError: '', processed: 0 };
const lastPlatformPublishAt = new Map();

async function acquireGlobalLock() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(30000, Number(process.env.SOCIAL_SCHEDULER_LOCK_MS || 900000)));
  try {
    const result = await mongoose.connection.collection('scheduler_locks').findOneAndUpdate(
      { _id: LOCK_ID, $or: [{ expiresAt: { $lte: now } }, { owner: WORKER_ID }] },
      { $set: { owner: WORKER_ID, acquiredAt: now, expiresAt } },
      { upsert: true, returnDocument: 'after' }
    );
    return result?.owner === WORKER_ID || result?.value?.owner === WORKER_ID;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

async function releaseGlobalLock() {
  await mongoose.connection.collection('scheduler_locks').updateOne(
    { _id: LOCK_ID, owner: WORKER_ID },
    { $set: { expiresAt: new Date(0) } }
  ).catch(() => {});
}

async function renewGlobalLock() {
  const leaseMs = Math.max(30000, Number(process.env.SOCIAL_SCHEDULER_LOCK_MS || 900000));
  await mongoose.connection.collection('scheduler_locks').updateOne(
    { _id: LOCK_ID, owner: WORKER_ID },
    { $set: { expiresAt: new Date(Date.now() + leaseMs) } }
  );
}

function classifyFailure(log) {
  const code = String(log?.errorCode || '').toUpperCase();
  const message = String(log?.errorMessage || '').toLowerCase();
  const permanent = ['CREDENTIALS_ERROR','ENTITY_NOT_FOUND','COMPOSE_ERROR','UNKNOWN_PLATFORM','100','10','190'].includes(code)
    || /permission|invalid token|expired|not connected|disabled|invalid account|page id|requires reconnection/.test(message);
  return { permanent, code: code || 'PUBLISH_ERROR', message: log?.errorMessage || 'Publishing failed' };
}

function retryDelayMs(attempt) {
  return Math.min(6 * 60 * 60 * 1000, 60000 * (2 ** Math.max(0, attempt - 1)));
}

async function respectPlatformRateLimit(platform) {
  const defaults = { facebook: 1000, instagram: 5000 };
  const envKey = `SOCIAL_${String(platform).toUpperCase()}_MIN_INTERVAL_MS`;
  const minimum = Math.max(250, Number(process.env[envKey] || defaults[platform] || 1000));
  const wait = minimum - (Date.now() - Number(lastPlatformPublishAt.get(platform) || 0));
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastPlatformPublishAt.set(platform, Date.now());
}

async function imageAccessible(url) {
  if (!isPublicHttpsUrl(url)) return false;
  if (process.env.SOCIAL_VALIDATE_MEDIA_ACCESS === 'false') return true;
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000), redirect: 'follow' });
    return response.ok || response.status === 405;
  } catch { return false; }
}

async function reconcileStaleClaims(tenantId) {
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  const stale = await ScheduledSocialPost.find({ tenantId, status: 'processing', lockedAt: { $lt: staleBefore } }).limit(BATCH_SIZE);
  for (const item of stale) {
    const successLog = await PublishLog.findOne({ tenantId, queueItemId: item._id, status: 'success' }).sort({ createdAt: -1 }).lean();
    const resolution = staleClaimResolution(item.attempts, Boolean(successLog));
    if (resolution === 'published') {
      item.status = 'published';
      item.publishedPostId = successLog.platformPostId;
      item.publishedUrl = successLog.platformPostUrl;
      item.publishedAt = successLog.createdAt;
    } else if (resolution === 'needs_review') {
      item.status = 'needs_review';
      item.lastErrorCode = 'UNKNOWN_PROVIDER_OUTCOME';
      item.lastError = 'The worker restarted after contacting Meta. Reconcile this item with the platform before retrying to avoid a duplicate post.';
    } else {
      item.status = 'pending';
    }
    item.lockedAt = null;
    item.lockedBy = '';
    await item.save();
  }
}

async function revalidateAndMaybeRegenerate(item, schedule, tenantId) {
  const [product, tenant, social] = await Promise.all([
    Product.findOne({ _id: item.product, tenantId }).populate('category', 'name').lean(),
    Tenant.findById(tenantId).lean(),
    SocialMedia.findOne({ tenantId }).lean(),
  ]);
  if (!product || product.isActive === false) return { error: 'Product no longer exists or is inactive', code: 'PRODUCT_INACTIVE', permanent: true };
  if (Number(product.stock) <= 0) return { error: 'Product is out of stock', code: 'OUT_OF_STOCK', permanent: true, skipped: true };
  if (!social?.[item.platform]?.connected || !social?.[item.platform]?.enabled) return { error: `${item.platform} is not connected and enabled`, code: 'PLATFORM_DISCONNECTED', permanent: true };
  const media = item.media.filter(value => value.included !== false).sort((a,b) => a.order - b.order);
  if (!media.length || media.length > 10) return { error: 'Select between 1 and 10 public product images', code: 'MEDIA_COUNT_INVALID', permanent: true, needsReview: true };
  const mediaChecks = await Promise.all(media.map(value => imageAccessible(value.url)));
  if (mediaChecks.some(accessible => !accessible)) return { error: 'One or more selected product images are not publicly accessible', code: 'MEDIA_UNAVAILABLE', permanent: false };
  const currentSiteUrl = selectTenantSiteUrl(tenant);
  if (!currentSiteUrl) return { error: 'Storefront public HTTPS URL is not configured', code: 'INVALID_PUBLIC_URL', permanent: true };

  if (snapshotChanged(item.productSnapshot, product)) {
    if (item.changePolicy !== 'regenerate' || item.content !== item.generatedContent || item.manualOfferPrice != null) {
      return { error: 'Product stock, price, status, name, or URL changed after confirmation', code: 'PRODUCT_CHANGED', permanent: true, needsReview: true };
    }
    const voucher = item.voucherSnapshot?._id
      ? await Coupon.findOne({ _id: item.voucherSnapshot._id, tenantId }).lean()
      : null;
    if (item.voucherSnapshot && !couponAppliesToProduct(voucher, product)) {
      return { error: 'The confirmed voucher is no longer active or applicable', code: 'VOUCHER_CHANGED', permanent: true, needsReview: true };
    }
    const pricing = calculatePricing(product, {
      additionalDiscountPercent: schedule.additionalDiscountPercent,
      voucher,
      currencyUnit: schedule.configSnapshot?.currencyUnit || 1,
    });
    const categoryName = product.category?.name || product.subCategory || '';
    const features = extractVerifiedFeatures(product);
    const hashtags = deriveHashtags({ tenant, product, categoryName });
    const productUrl = `${currentSiteUrl}/product/${encodeURIComponent(product.slug)}`;
    const content = buildDescription({
      platform: item.platform, tenant, product, categoryName, pricing, voucher, features,
      hashtags, productUrl, cta: item.cta, sinhalaEnabled: schedule.languageMode === 'sinhala_mixed',
    });
    const errors = validateDescription(content, item.platform);
    if (errors.length) return { error: errors.join('. '), code: 'REGENERATION_INVALID', permanent: true, needsReview: true };
    item.content = content;
    item.generatedContent = content;
    item.priceSnapshot = pricing;
    item.productSnapshot = productSnapshot(product);
    item.productUrl = productUrl;
    item.verifiedFeatures = features;
    item.hashtags = hashtags;
    await item.save();
  }
  const descriptionErrors = validateDescription(item.content, item.platform);
  if (descriptionErrors.length) return { error: descriptionErrors.join('. '), code: 'DESCRIPTION_INVALID', permanent: true, needsReview: true };
  return { product, media };
}

async function recordAttempt(item, result, requestMetadata) {
  try {
    await SocialPublishAttempt.create({
      tenantId: item.tenantId, queueItem: item._id, schedule: item.schedule,
      platform: item.platform, attempt: item.attempts, requestMetadata,
      responseMetadata: result.success ? { platformPostId: result.log?.platformPostId || '', publishedUrl: result.log?.platformPostUrl || '' } : {},
      status: result.success ? 'success' : result.permanent ? 'permanent_failure' : 'temporary_failure',
      error: result.error || '', errorCode: result.code || '',
    });
  } catch (error) {
    console.error(`[SocialScheduler] Attempt log failed tenant=${String(item.tenantId).slice(-6)} item=${String(item._id).slice(-6)}: ${error.message}`);
  }
}

async function processClaimedItem(item, tenantId) {
  const schedule = await SocialSchedule.findOne({ _id: item.schedule, tenantId, deletedAt: null });
  if (schedule?.status === 'paused') {
    item.status = 'pending'; item.nextAttemptAt = new Date(Date.now() + 60000);
    item.lockedAt = null; item.lockedBy = '';
    await item.save();
    return;
  }
  if (!schedule || !['scheduled','running'].includes(schedule.status)) {
    item.status = 'cancelled'; item.cancelledAt = new Date(); item.lockedAt = null; item.lockedBy = '';
    await item.save();
    return;
  }
  if (schedule.status === 'scheduled') {
    schedule.status = 'running';
    await schedule.save();
  }
  const validation = await revalidateAndMaybeRegenerate(item, schedule, tenantId);
  if (validation.error) {
    item.attempts += 1;
    const exhausted = item.attempts >= item.maxAttempts;
    item.status = validation.needsReview ? 'needs_review' : validation.skipped ? 'skipped' : validation.permanent || exhausted ? 'failed' : 'pending';
    item.lastError = validation.error; item.lastErrorCode = validation.code;
    item.nextAttemptAt = validation.permanent ? null : new Date(Date.now() + retryDelayMs(item.attempts));
    item.lockedAt = null; item.lockedBy = '';
    await item.save();
    await recordAttempt(item, { success: false, ...validation }, { phase: 'validation' });
    return;
  }

  // Re-read the parent immediately before the external mutation. This prevents
  // a stopped/deleted activity from publishing after a worker claimed it.
  const activeParent = await SocialSchedule.exists({ _id: schedule._id, tenantId, status: { $in: ['scheduled','running'] }, deletedAt: null });
  if (!activeParent) {
    item.status = 'cancelled'; item.cancelledAt = new Date(); item.lockedAt = null; item.lockedBy = '';
    await item.save();
    return;
  }

  item.attempts += 1;
  await item.save();
  const imageUrls = validation.media.map(value => value.url);
  await respectPlatformRateLimit(item.platform);
  const log = await publishNow({
    tenantId, platform: item.platform, trigger: 'scheduled', entityType: 'product',
    entityId: item.product, entityName: item.productName, triggeredBy: 'social-scheduler',
    attemptNumber: item.attempts, scheduleId: item.schedule, queueItemId: item._id,
    payloadOverride: { text: item.content, imageUrl: imageUrls[0] || '', imageUrls, productUrl: item.productUrl, cta: item.cta, ctaUrl: String(item.content).match(/https:\/\/wa\.me\/[^\s]+/i)?.[0] || item.productUrl },
  });
  if (log?.status === 'success') {
    item.status = 'published'; item.publishedPostId = log.platformPostId || '';
    item.publishedUrl = log.platformPostUrl || ''; item.publishedAt = new Date();
    item.lastError = ''; item.lastErrorCode = ''; item.nextAttemptAt = null;
    const mediaIds = log.publisherResult?.platformMediaIds || [];
    item.media.forEach((media, index) => { if (mediaIds[index]) media.platformMediaId = mediaIds[index]; });
    await recordAttempt(item, { success: true, log }, { contentLength: item.content.length, mediaCount: imageUrls.length, cta: item.cta });
  } else {
    const failure = classifyFailure(log);
    const exhausted = item.attempts >= item.maxAttempts;
    item.status = failure.permanent || exhausted ? 'failed' : 'pending';
    item.lastError = failure.message; item.lastErrorCode = failure.code;
    item.nextAttemptAt = item.status === 'pending' ? new Date(Date.now() + retryDelayMs(item.attempts)) : null;
    await recordAttempt(item, { success: false, ...failure }, { contentLength: item.content.length, mediaCount: imageUrls.length, cta: item.cta });
  }
  item.lockedAt = null; item.lockedBy = '';
  await item.save();
  schedule.lastExecutionAt = new Date();
  await schedule.save();
}

async function processTenant(tenantId) {
  await reconcileStaleClaims(tenantId);
  const schedulesTouched = new Set();
  for (let index = 0; index < BATCH_SIZE; index += 1) {
    await renewGlobalLock();
    const now = new Date();
    const item = await ScheduledSocialPost.findOneAndUpdate(
      {
        tenantId, status: 'pending', scheduledFor: { $lte: now },
        $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
      },
      { $set: { status: 'processing', lockedAt: now, lockedBy: WORKER_ID } },
      { new: true, sort: { scheduledFor: 1 } }
    );
    if (!item) break;
    schedulesTouched.add(String(item.schedule));
    try { await processClaimedItem(item, tenantId); }
    catch (error) {
      item.status = 'needs_review'; item.lastError = 'Unexpected worker interruption: ' + error.message;
      item.lastErrorCode = 'WORKER_ERROR'; item.lockedAt = null; item.lockedBy = '';
      await item.save().catch(() => {});
      console.error(`[SocialScheduler] tenant=${String(tenantId).slice(-6)} item=${String(item._id).slice(-6)} error=${error.message}`);
    }
    health.processed += 1;
  }
  for (const scheduleId of schedulesTouched) await refreshScheduleCounts(tenantId, scheduleId);
}

async function runSocialSchedulerOnce() {
  if (localRunning || mongoose.connection.readyState !== 1) return false;
  localRunning = true;
  health.running = true;
  health.lastStartedAt = new Date();
  try {
    if (!(await acquireGlobalLock())) return false;
    const now = new Date();
    const tenantIds = await withoutTenantScope(() => ScheduledSocialPost.distinct('tenantId', {
      status: { $in: ['pending','processing'] },
      $or: [{ scheduledFor: { $lte: now } }, { lockedAt: { $lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } }],
    }));
    for (const tenantId of tenantIds) {
      await runWithTenant(tenantId, () => processTenant(new mongoose.Types.ObjectId(tenantId)));
    }
    health.lastCompletedAt = new Date(); health.lastError = '';
    return true;
  } catch (error) {
    health.lastError = error.message;
    console.error('[SocialScheduler]', error.message);
    return false;
  } finally {
    await releaseGlobalLock();
    localRunning = false;
    health.running = false;
  }
}

function startSocialScheduler() {
  if (timer) return timer;
  if (process.env.SOCIAL_SCHEDULER_ENABLED === 'false') return null;
  if (process.env.APP_ENV === 'staging' && process.env.SOCIAL_SCHEDULER_ENABLED !== 'true') return null;
  const interval = Math.max(5000, Number(process.env.SOCIAL_SCHEDULER_INTERVAL_MS || DEFAULT_INTERVAL_MS));
  setTimeout(runSocialSchedulerOnce, 3000).unref?.();
  timer = setInterval(runSocialSchedulerOnce, interval);
  timer.unref?.();
  console.log(`[SocialScheduler] Started every ${interval}ms`);
  return timer;
}

function stopSocialScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

function getSocialSchedulerHealth() { return { ...health }; }

module.exports = {
  startSocialScheduler, stopSocialScheduler, runSocialSchedulerOnce, getSocialSchedulerHealth,
  retryDelayMs, classifyFailure,
};
