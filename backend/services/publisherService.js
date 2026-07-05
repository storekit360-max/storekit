/**
 * services/publisherService.js
 *
 * The single entry point for all social media publishing.
 * No queues, no workers, no Redis — pure MongoDB + HTTP.
 *
 * Future-ready: to add a queue, replace the body of dispatchForTrigger()
 * with an enqueue call. publishNow() and its contract stay unchanged.
 */

const PublishLog      = require('../models/PublishLog');
const AutomationRule  = require('../models/AutomationRule');
const { getOrCreate, decryptPlatformFields, encryptPlatformFields } = require('./socialMediaService');
const { compose }     = require('./postComposer');
const { shouldRefresh, isExpired, refreshPageToken } = require('./facebookTokenRefresh');
const SocialMedia     = require('../models/SocialMedia');

const PUBLISHERS = {
  facebook:  require('./publishers/facebook'),
  instagram: require('./publishers/instagram'),
  tiktok:    require('./publishers/tiktok'),
  whatsapp:  require('./publishers/whatsapp'),
  telegram:  require('./publishers/telegram'),
};

// ── Entity loader ─────────────────────────────────────────────────────────────
async function loadEntity(entityType, entityId) {
  if (!entityId) return null;
  if (entityType === 'product') {
    const Product = require('../models/Product');
    return Product.findById(entityId).lean();
  }
  if (entityType === 'offer') {
    const { SeasonalCampaign } = require('../models/index');
    return SeasonalCampaign.findById(entityId).lean();
  }
  return null;
}

// ── Write a log record ────────────────────────────────────────────────────────
async function writeLog(data) {
  try {
    return await PublishLog.create(data);
  } catch (err) {
    console.error('[Publisher] Failed to write log:', err.message);
    return null;
  }
}

/**
 * publishNow — execute one platform publish attempt synchronously.
 *
 * @param {object} opts
 *   platform      - 'facebook' | 'instagram' | 'tiktok' | 'whatsapp' | 'telegram'
 *   trigger       - 'new_product' | 'product_discount' | 'offer_active' | 'manual'
 *   entityType    - 'product' | 'offer'
 *   entityId      - string ObjectId
 *   entityName    - display name for logs
 *   customMsg     - optional message override
 *   triggeredBy   - 'system' or 'admin:<userId>'
 *   originalLogId - set when retrying a failed log
 *   attemptNumber - 1 on first attempt; 2+ on retries
 * @returns {Promise<PublishLog>}
 */
async function publishNow(opts = {}) {
  const {
    platform,
    trigger       = 'manual',
    entityType    = 'product',
    entityId,
    entityName    = '',
    customMsg     = '',
    triggeredBy   = 'system',
    originalLogId = null,
    attemptNumber = 1,
  } = opts;

  const t0      = Date.now();
  const isRetry = attemptNumber > 1;
  const base    = { platform, trigger, triggeredBy, entityType, entityId, entityName, attemptNumber, isRetry, originalLogId };

  // ── 1. Validate platform ───────────────────────────────────────────────────
  if (!PUBLISHERS[platform]) {
    return writeLog({ ...base, postText: '', imageUrl: '', durationMs: 0, status: 'failed', errorMessage: `Unknown platform: ${platform}`, errorCode: 'UNKNOWN_PLATFORM' });
  }

  // ── 2. Load & decrypt credentials (with auto token refresh) ──────────────
  let creds;
  try {
    const doc  = await getOrCreate();
    // Force full plain-object conversion including Mixed (extraConfig) fields
    const raw  = JSON.parse(JSON.stringify(
      doc[platform]?.toObject?.({ virtuals: false }) ?? doc[platform] ?? {}
    ));
    creds      = decryptPlatformFields(raw);
    if (!creds.connected) throw new Error(`Platform "${platform}" is not connected`);
    if (!creds.enabled)   throw new Error(`Platform "${platform}" is disabled`);

    // ── Proactive token refresh for Facebook / Instagram ──────────────────
    if (platform === 'facebook' || platform === 'instagram') {
      const expiresAt = raw.tokenExpiresAt;

      if (raw.reconnectNeeded) {
        throw new Error(`${platform} requires reconnection — token expired and could not be refreshed automatically. Please reconnect in Social Media settings.`);
      }

      if (isExpired(expiresAt) || shouldRefresh(expiresAt)) {
        try {
          console.log(`[Publisher] ${platform} token expiring/expired — auto-refreshing before publish…`);
          const { accessToken: newToken, expiresAt: newExpiry } = await refreshPageToken(creds);

          // Persist the refreshed token immediately
          const encrypted = encryptPlatformFields({ accessToken: newToken });
          await SocialMedia.updateOne({}, {
            $set: {
              [`${platform}.accessToken`]:          encrypted.accessToken,
              [`${platform}.tokenExpiresAt`]:       newExpiry,
              [`${platform}.tokenLastRefreshedAt`]: new Date(),
              [`${platform}.tokenRefreshError`]:    '',
              [`${platform}.reconnectNeeded`]:      false,
              updatedAt: new Date(),
            },
          });

          // Use fresh token for this publish
          creds.accessToken = newToken;
          console.log(`[Publisher] ${platform} token refreshed successfully. New expiry: ${newExpiry}`);

        } catch (refreshErr) {
          // Refresh failed — mark reconnectNeeded and abort publish
          await SocialMedia.updateOne({}, {
            $set: {
              [`${platform}.tokenRefreshError`]: refreshErr.message,
              [`${platform}.reconnectNeeded`]:   true,
              updatedAt: new Date(),
            },
          });
          throw new Error(`${platform} token refresh failed: ${refreshErr.message}. Please reconnect in Social Media settings.`);
        }
      }
    }
  } catch (err) {
    return writeLog({ ...base, postText: '', imageUrl: '', durationMs: Date.now() - t0, status: 'failed', errorMessage: err.message, errorCode: 'CREDENTIALS_ERROR' });
  }

  // ── 3. Load entity ─────────────────────────────────────────────────────────
  let entity;
  try {
    entity = await loadEntity(entityType, entityId);
    if (!entity) throw new Error(`${entityType} not found: ${entityId}`);
  } catch (err) {
    return writeLog({ ...base, postText: '', imageUrl: '', durationMs: Date.now() - t0, status: 'failed', errorMessage: err.message, errorCode: 'ENTITY_NOT_FOUND' });
  }

  // ── 4. Compose post ────────────────────────────────────────────────────────
  let payload;
  try {
    payload = await compose(platform, trigger, entity, customMsg);
  } catch (err) {
    return writeLog({ ...base, entityName: entity.name || entity.title || entityName, postText: '', imageUrl: '', durationMs: Date.now() - t0, status: 'failed', errorMessage: `Compose error: ${err.message}`, errorCode: 'COMPOSE_ERROR' });
  }

  const resolved = { ...base, entityName: entity.name || entity.title || entityName, postText: payload.text, imageUrl: payload.imageUrl };

  // ── 5. Publish ─────────────────────────────────────────────────────────────
  try {
    const result = await PUBLISHERS[platform].publish(creds, payload);
    const log    = await writeLog({ ...resolved, durationMs: Date.now() - t0, status: 'success', platformPostId: result.platformPostId || '' });
    console.log(`[Publisher] ✅ ${platform} | ${trigger} | "${resolved.entityName}" → ${result.platformPostId}`);
    return log;
  } catch (err) {
    const log = await writeLog({ ...resolved, durationMs: Date.now() - t0, status: 'failed', errorMessage: err.message, errorCode: err.code || 'API_ERROR' });
    console.error(`[Publisher] ❌ ${platform} | ${trigger} | ${err.message}`);
    return log;
  }
}

/**
 * dispatchForTrigger — fires all enabled platforms for an automation rule.
 * Called fire-and-forget from product/seasonal routes.
 * Future queue upgrade: replace publishNow() call with enqueue() here.
 */
async function dispatchForTrigger(trigger, entity, entityType = 'product') {
  try {
    const rule = await AutomationRule.findOne({ trigger, enabled: true });
    if (!rule) return;

    const platforms = Object.entries(rule.platforms).filter(([, on]) => on).map(([p]) => p);
    if (!platforms.length) return;

    // Discount threshold guard
    if (trigger === 'product_discount' && rule.minDiscountPercent > 0) {
      const disc = entity.price && entity.salePrice
        ? Math.round(((entity.price - entity.salePrice) / entity.price) * 100) : 0;
      if (disc < rule.minDiscountPercent) {
        console.log(`[Publisher] Skipping ${trigger} — discount ${disc}% < threshold ${rule.minDiscountPercent}%`);
        return;
      }
    }

    const results = await Promise.allSettled(
      platforms.map(platform =>
        publishNow({ platform, trigger, entityType, entityId: entity._id?.toString(), entityName: entity.name || entity.title || '', customMsg: rule.customMessage || '', triggeredBy: 'system', attemptNumber: 1 })
      )
    );

    const ok  = results.filter(r => r.value?.status === 'success').length;
    console.log(`[Publisher] Trigger "${trigger}" → ${ok}/${platforms.length} ok`);
  } catch (err) {
    console.error(`[Publisher] dispatchForTrigger error (${trigger}):`, err.message);
  }
}

/**
 * retryLog — retry a failed PublishLog entry.
 * Creates a new log linked to the original via originalLogId.
 */
async function retryLog(logId, adminUserId) {
  const original = await PublishLog.findById(logId);
  if (!original)                    throw new Error('Log entry not found');
  if (original.status !== 'failed') throw new Error('Only failed logs can be retried');

  return publishNow({
    platform:      original.platform,
    trigger:       original.trigger,
    entityType:    original.entityType,
    entityId:      original.entityId?.toString(),
    entityName:    original.entityName,
    customMsg:     '',
    triggeredBy:   `admin:${adminUserId}`,
    originalLogId: original._id,
    attemptNumber: original.attemptNumber + 1,
  });
}

/**
 * manualPublish — admin-initiated publish from the UI.
 */
async function manualPublish({ platform, entityType, entityId, entityName, customMsg, trigger, adminUserId }) {
  return publishNow({
    platform,
    trigger:    trigger || 'manual',
    entityType: entityType || 'product',
    entityId,
    entityName: entityName || '',
    customMsg:  customMsg  || '',
    triggeredBy:`admin:${adminUserId || 'unknown'}`,
    attemptNumber: 1,
  });
}

module.exports = { publishNow, dispatchForTrigger, retryLog, manualPublish };