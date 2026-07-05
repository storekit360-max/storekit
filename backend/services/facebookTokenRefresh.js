/**
 * services/facebookTokenRefresh.js
 *
 * Handles the full Facebook / Instagram long-lived token lifecycle:
 *
 *   Short-lived token (1–2 hrs)
 *     → exchangeForLongLived()     → Long-lived user token (~60 days)
 *     → getLongLivedPageToken()    → Long-lived PAGE token (~60 days, auto-renews on use)
 *
 *   Long-lived page token approaching expiry
 *     → refreshPageToken()         → Fresh long-lived page token
 *
 *   Token completely expired
 *     → sets reconnectNeeded = true, admin must reconnect via UI
 *
 * Called from:
 *   - socialMediaService.connectPlatform()   (on first connect / credential update)
 *   - publisherService.publishNow()          (before every publish attempt)
 *   - tokenRefreshScheduler.js               (daily proactive cron job)
 *
 * Meta Graph API reference:
 *   https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
 *   https://developers.facebook.com/docs/facebook-login/guides/access-tokens/refreshing
 */

const GRAPH_VER = 'v21.0';
const GRAPH     = `https://graph.facebook.com/${GRAPH_VER}`;

// ─── How many days before expiry we proactively refresh ──────────────────────
const REFRESH_THRESHOLD_DAYS = 10;

/**
 * exchangeForLongLived
 * Exchanges a short-lived user token for a 60-day user token.
 * Used ONCE during the initial connect flow.
 *
 * @param {string} shortLivedToken  – the token the admin pastes in
 * @param {string} appId
 * @param {string} appSecret
 * @returns {{ accessToken, expiresAt }}
 */
async function exchangeForLongLived(shortLivedToken, appId, appSecret) {
  const url = `${GRAPH}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${appId}` +
    `&client_secret=${appSecret}` +
    `&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;

  const res  = await fetch(url);
  const json = await res.json();

  if (json.error) {
    throw new Error(`Meta token exchange failed: ${json.error.message} (code ${json.error.code})`);
  }

  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000)
    : null; // null = server treats as ~60 days

  return { accessToken: json.access_token, expiresAt };
}

/**
 * getLongLivedPageToken
 * From a long-lived USER token, retrieve a never-expiring* PAGE access token.
 * (*Page tokens don't have a fixed expiry but must be refreshed when the user token renews.)
 *
 * @param {string} userToken  – long-lived user token
 * @param {string} pageId
 * @returns {{ accessToken, expiresAt }}
 */
async function getLongLivedPageToken(userToken, pageId) {
  const url = `${GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`;

  const res  = await fetch(url);
  const json = await res.json();

  if (json.error) {
    throw new Error(`Failed to get Page token: ${json.error.message} (code ${json.error.code})`);
  }
  if (!json.access_token) {
    throw new Error('Meta returned no access_token for the Page. Check the Page ID and permissions.');
  }

  // Page tokens are technically long-lived but we proactively refresh them
  // 50 days from now — before the underlying user token's 60-day window closes
  const expiresAt = new Date(Date.now() + 50 * 24 * 60 * 60 * 1000);

  return { accessToken: json.access_token, expiresAt };
}

/**
 * refreshPageToken
 * Refreshes an existing long-lived page token using the stored App credentials.
 * This is the AUTO-REFRESH path called by the scheduler and before publish.
 *
 * Strategy:
 *   1. Use the page token itself + app credentials to get a fresh long-lived user token
 *   2. From that user token, fetch a fresh page token
 *
 * @param {object} creds  – decrypted platform credentials
 *   { accessToken, accountId, appId, appSecret }
 * @returns {{ accessToken, expiresAt }}
 */
async function refreshPageToken(creds) {
  const { accessToken, accountId, appId, appSecret } = creds;

  if (!appId || !appSecret) {
    throw new Error('App ID and App Secret are required for automatic token refresh. Please reconnect Facebook.');
  }
  if (!accountId) {
    throw new Error('Page ID is required for token refresh.');
  }

  // Step 1: Exchange current token for a fresh long-lived user token
  let longLivedUserToken, userExpiresAt;
  try {
    ({ accessToken: longLivedUserToken, expiresAt: userExpiresAt } =
      await exchangeForLongLived(accessToken, appId, appSecret));
  } catch (err) {
    // If exchange fails, the token is truly expired — admin must reconnect
    const expiredErr = new Error(`Token expired and cannot be refreshed automatically. Please reconnect Facebook. (${err.message})`);
    expiredErr.code  = 'TOKEN_EXPIRED';
    throw expiredErr;
  }

  // Step 2: Get a fresh page token from the renewed user token
  const { accessToken: pageToken, expiresAt } =
    await getLongLivedPageToken(longLivedUserToken, accountId);

  return { accessToken: pageToken, expiresAt };
}

/**
 * inspectToken
 * Calls the Meta debug_token endpoint to check if a token is still valid
 * and how long it has left. Useful for test-connection and scheduler checks.
 *
 * @param {string} tokenToInspect
 * @param {string} appId
 * @param {string} appSecret
 * @returns {{ valid, expiresAt, scopes, error }}
 */
async function inspectToken(tokenToInspect, appId, appSecret) {
  if (!appId || !appSecret) {
    return { valid: null, expiresAt: null, scopes: [], error: 'App ID / Secret not configured — cannot inspect token' };
  }

  const appToken = `${appId}|${appSecret}`;
  const url = `${GRAPH}/debug_token?input_token=${encodeURIComponent(tokenToInspect)}&access_token=${encodeURIComponent(appToken)}`;

  try {
    const res  = await fetch(url);
    const json = await res.json();

    if (json.error) return { valid: false, expiresAt: null, scopes: [], error: json.error.message };

    const data      = json.data || {};
    const expiresAt = data.expires_at
      ? new Date(data.expires_at * 1000)  // Meta returns Unix seconds
      : null;

    return {
      valid:     !!data.is_valid,
      expiresAt,
      scopes:    data.scopes || [],
      error:     data.is_valid ? null : (data.error?.message || 'Token is invalid'),
    };
  } catch (err) {
    return { valid: null, expiresAt: null, scopes: [], error: `Network error: ${err.message}` };
  }
}

/**
 * shouldRefresh
 * Returns true if the token should be proactively refreshed right now.
 *
 * @param {Date|null} expiresAt
 * @returns {boolean}
 */
function shouldRefresh(expiresAt) {
  if (!expiresAt) return false; // unknown expiry — don't auto-refresh
  const msUntilExpiry = new Date(expiresAt).getTime() - Date.now();
  const daysLeft      = msUntilExpiry / (1000 * 60 * 60 * 24);
  return daysLeft <= REFRESH_THRESHOLD_DAYS;
}

/**
 * isExpired
 * Returns true if the stored expiry date is already in the past.
 *
 * @param {Date|null} expiresAt
 * @returns {boolean}
 */
function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

module.exports = {
  exchangeForLongLived,
  getLongLivedPageToken,
  refreshPageToken,
  inspectToken,
  shouldRefresh,
  isExpired,
  REFRESH_THRESHOLD_DAYS,
};