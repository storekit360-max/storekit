/**
 * services/tokenRefreshScheduler.js
 *
 * Proactive daily token refresh job.
 *
 * Checks every 24 hours whether any Facebook / Instagram token is within
 * REFRESH_THRESHOLD_DAYS of expiry, and refreshes it automatically.
 * If refresh fails, sets reconnectNeeded = true so the admin UI shows
 * a reconnect banner.
 *
 * Usage — call startTokenRefreshScheduler() once from server.js after
 * MongoDB connects:
 *
 *   const { startTokenRefreshScheduler } = require('./services/tokenRefreshScheduler');
 *   startTokenRefreshScheduler();
 */

const SocialMedia = require('../models/SocialMedia');
const { refreshPageToken, shouldRefresh, isExpired } = require('./facebookTokenRefresh');
const { encryptPlatformFields, decryptPlatformFields } = require('./socialMediaService');

// Platforms that use the Facebook token refresh flow
const FB_PLATFORMS = ['facebook', 'instagram'];

// Run every 24 hours (in ms)
const INTERVAL_MS = 24 * 60 * 60 * 1000;

let schedulerTimer = null;

/**
 * runRefreshCycle
 * Single refresh pass — called on startup and every 24h thereafter.
 */
async function runRefreshCycle() {
  console.log('[TokenScheduler] Starting token refresh cycle…');

  let doc;
  try {
    doc = await SocialMedia.findOne();
    if (!doc) {
      console.log('[TokenScheduler] No SocialMedia document found — skipping.');
      return;
    }
  } catch (err) {
    console.error('[TokenScheduler] DB read failed:', err.message);
    return;
  }

  let changed = false;

  for (const platform of FB_PLATFORMS) {
    const raw = doc[platform]?.toObject ? doc[platform].toObject() : (doc[platform] || {});

    // Skip platforms that aren't connected or have no token
    if (!raw.connected || !raw.accessToken) continue;

    const creds      = decryptPlatformFields(raw);
    const expiresAt  = raw.tokenExpiresAt;
    const platformLabel = `[TokenScheduler][${platform}]`;

    // ── Already expired ───────────────────────────────────────────────────────
    if (isExpired(expiresAt)) {
      console.warn(`${platformLabel} Token EXPIRED (${expiresAt}). Attempting emergency refresh…`);
    } else if (!shouldRefresh(expiresAt)) {
      const daysLeft = expiresAt
        ? Math.round((new Date(expiresAt) - Date.now()) / 86400000)
        : 'unknown';
      console.log(`${platformLabel} Token OK — ${daysLeft} days remaining. No refresh needed.`);
      continue;
    } else {
      const daysLeft = Math.round((new Date(expiresAt) - Date.now()) / 86400000);
      console.log(`${platformLabel} Token expiring in ${daysLeft} days. Refreshing proactively…`);
    }

    // ── Attempt refresh ───────────────────────────────────────────────────────
    try {
      const { accessToken: newToken, expiresAt: newExpiry } = await refreshPageToken(creds);

      const encrypted = encryptPlatformFields({ accessToken: newToken });

      doc[platform].accessToken          = encrypted.accessToken;
      doc[platform].tokenExpiresAt       = newExpiry;
      doc[platform].tokenLastRefreshedAt = new Date();
      doc[platform].tokenRefreshError    = '';
      doc[platform].reconnectNeeded      = false;

      changed = true;
      console.log(`${platformLabel} ✅ Token refreshed. New expiry: ${newExpiry}`);

    } catch (err) {
      console.error(`${platformLabel} ❌ Refresh failed: ${err.message}`);

      // If hard-expired and unrecoverable, flag for admin reconnect
      const needsReconnect = isExpired(expiresAt) || err.code === 'TOKEN_EXPIRED';

      doc[platform].tokenRefreshError = err.message;
      doc[platform].reconnectNeeded   = needsReconnect;

      changed = true;

      if (needsReconnect) {
        console.warn(`${platformLabel} ⚠️  Reconnect required — token cannot be refreshed automatically.`);
      }
    }
  }

  if (changed) {
    try {
      doc.updatedAt = new Date();
      await doc.save();
      console.log('[TokenScheduler] Changes saved to DB.');
    } catch (err) {
      console.error('[TokenScheduler] Failed to save refresh results:', err.message);
    }
  }

  console.log('[TokenScheduler] Refresh cycle complete.');
}

/**
 * startTokenRefreshScheduler
 * Call once after MongoDB connects in server.js
 */
function startTokenRefreshScheduler() {
  if (schedulerTimer) return; // already running

  // Run immediately on startup (with a 10s delay to let DB settle)
  setTimeout(runRefreshCycle, 10_000);

  // Then every 24 hours
  schedulerTimer = setInterval(runRefreshCycle, INTERVAL_MS);

  console.log('[TokenScheduler] Started — proactive token refresh every 24h.');
}

/**
 * stopTokenRefreshScheduler
 * Useful for clean shutdown / tests.
 */
function stopTokenRefreshScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('[TokenScheduler] Stopped.');
  }
}

/**
 * refreshPlatformNow
 * Manually trigger a refresh for one specific platform.
 * Called from the admin API route: POST /api/social-media/platform/:platform/refresh-token
 */
async function refreshPlatformNow(platform) {
  const doc = await SocialMedia.findOne();
  if (!doc) throw new Error('No SocialMedia configuration found');

  const raw   = doc[platform]?.toObject ? doc[platform].toObject() : (doc[platform] || {});
  if (!raw.connected || !raw.accessToken) {
    throw new Error(`${platform} is not connected`);
  }

  const creds = decryptPlatformFields(raw);
  const { accessToken: newToken, expiresAt: newExpiry } = await refreshPageToken(creds);

  const encrypted = encryptPlatformFields({ accessToken: newToken });

  doc[platform].accessToken          = encrypted.accessToken;
  doc[platform].tokenExpiresAt       = newExpiry;
  doc[platform].tokenLastRefreshedAt = new Date();
  doc[platform].tokenRefreshError    = '';
  doc[platform].reconnectNeeded      = false;
  doc.updatedAt = new Date();

  await doc.save();

  return { expiresAt: newExpiry, refreshedAt: new Date() };
}

module.exports = {
  startTokenRefreshScheduler,
  stopTokenRefreshScheduler,
  runRefreshCycle,
  refreshPlatformNow,
};