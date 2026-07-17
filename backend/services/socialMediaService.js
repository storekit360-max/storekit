/**
 * socialMediaService.js
 * Business logic for social media account management.
 * All credential encryption/decryption lives here.
 * Access tokens are NEVER returned to the frontend.
 */

const crypto = require('crypto');
const SocialMedia = require('../models/SocialMedia');
const {
  exchangeForLongLived,
  getLongLivedPageToken,
  inspectToken,
  shouldRefresh,
  isExpired,
} = require('./facebookTokenRefresh');

// ─── Encryption helpers ───────────────────────────────────────────────────────
const ALGO      = 'aes-256-gcm';
const KEY_LEN   = 32;
const IV_LEN    = 16;
const TAG_LEN   = 16;

function getKey() {
  const raw = process.env.SOCIAL_MEDIA_SECRET || process.env.JWT_SECRET || 'storekit-fallback-secret-32chars!!';
  // Derive a 32-byte key from whatever length the env var is
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plaintext) {
  if (!plaintext) return '';
  const iv  = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as: iv(hex):tag(hex):ciphertext(hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(ciphertext) {
  if (!ciphertext) return '';
  try {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    const iv         = Buffer.from(ivHex, 'hex');
    const tag        = Buffer.from(tagHex, 'hex');
    const encrypted  = Buffer.from(encHex, 'hex');
    const decipher   = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return '';
  }
}

// ─── Credential fields that must be encrypted at rest ────────────────────────
const SENSITIVE_FIELDS = ['accessToken', 'accessSecret', 'appSecret'];

// ─── Sanitize a platform doc for the frontend (strip all credentials) ─────────
function sanitizePlatform(platform = {}) {
  const { accessToken, accessSecret, appId, appSecret, extraConfig, ...safe } = platform;
  // extraConfig contains non-secret config (broadcastList, templateName, etc.) — safe to expose
  // accessToken / appSecret / accessSecret are encrypted at rest — never send to frontend
  return {
    ...safe,
    extraConfig: extraConfig || {},   // expose so UI can pre-fill broadcast list / template name
    // expose only whether a secret exists, never the value
    hasAccessToken:  !!accessToken,
    hasAppSecret:    !!appSecret,
    hasAccessSecret: !!accessSecret,
  };
}

// ─── Sanitize the whole document ─────────────────────────────────────────────
function sanitizeDoc(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'telegram'];
  PLATFORMS.forEach(p => {
    if (obj[p]) obj[p] = sanitizePlatform(obj[p]);
  });
  return obj;
}

// ─── Encrypt sensitive fields in a platform object before save ────────────────
function isAlreadyEncrypted(val) {
  // Encrypted format is exactly: iv_hex:tag_hex:ciphertext_hex  (3 colon-separated parts).
  // A Telegram bot token like "123456789:ABCdef..." has only 2 parts — it must NOT be
  // treated as already-encrypted, otherwise decrypt() returns '' and the token is lost.
  if (!val || typeof val !== 'string') return false;
  const parts = val.split(':');
  if (parts.length !== 3) return false;
  // Each part must be a non-empty hex string
  return parts.every(p => p.length > 0 && /^[0-9a-f]+$/i.test(p));
}

function encryptPlatformFields(platformData) {
  const result = { ...platformData };
  SENSITIVE_FIELDS.forEach(field => {
    if (result[field] !== undefined) {
      const val = result[field];
      if (val && !isAlreadyEncrypted(val)) {
        result[field] = encrypt(val);
      } else if (!val) {
        result[field] = '';
      }
    }
  });
  return result;
}

// ─── Decrypt sensitive fields from a platform object ─────────────────────────
function decryptPlatformFields(platformData) {
  const result = { ...platformData };
  SENSITIVE_FIELDS.forEach(field => {
    if (result[field]) result[field] = decrypt(result[field]);
  });
  return result;
}

// ─── Load or create the singleton doc ────────────────────────────────────────
async function getOrCreate() {
  let doc = await SocialMedia.findOne();
  if (!doc) doc = await SocialMedia.create({});
  return doc;
}

// ─── GET settings (sanitized for frontend) ───────────────────────────────────
async function getSettings() {
  const doc = await getOrCreate();
  return sanitizeDoc(doc);
}

// ─── UPDATE platform credentials ─────────────────────────────────────────────
async function updatePlatform(platform, data) {
  const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'telegram'];
  if (!PLATFORMS.includes(platform)) throw new Error('Unknown platform');

  const doc = await getOrCreate();
  const existing = doc[platform]?.toObject ? doc[platform].toObject() : (doc[platform] || {});

  // Merge, then encrypt sensitive fields
  const merged = encryptPlatformFields({ ...existing, ...data });

  doc[platform] = merged;
  doc.updatedAt = new Date();
  await doc.save();
  return sanitizePlatform(doc[platform]);
}

// ─── CONNECT a platform (mark connected, store credentials) ──────────────────
async function connectPlatform(platform, credentials) {
  const doc      = await getOrCreate();
  const existing = JSON.parse(JSON.stringify(
    doc[platform]?.toObject?.({ virtuals: false }) ?? doc[platform] ?? {}
  ));

  let finalCreds = { ...credentials };
  let tokenExpiresAt       = existing.tokenExpiresAt       || null;
  let tokenLastRefreshedAt = existing.tokenLastRefreshedAt || null;
  let reconnectNeeded      = false;

  // ── Facebook / Instagram: auto-upgrade token to long-lived page token ──────
  if ((platform === 'facebook' || platform === 'instagram') && finalCreds.accessToken) {
    const appId     = finalCreds.appId     || existing.appId     || '';
    const appSecret = finalCreds.appSecret || existing.appSecret || '';
    const pageId    = finalCreds.accountId || existing.accountId || '';

    if (appId && appSecret) {
      try {
        // Step 1: Exchange for a long-lived user token (handles short-lived tokens)
        const { accessToken: longLivedUserToken } =
          await exchangeForLongLived(finalCreds.accessToken, appId, appSecret)
            .catch(() => ({ accessToken: finalCreds.accessToken })); // if already long-lived, keep as-is

        // Step 2: Get page token (if pageId available)
        if (pageId) {
          try {
            const { accessToken: pageToken, expiresAt } =
              await getLongLivedPageToken(longLivedUserToken, pageId);
            finalCreds.accessToken = pageToken;
            tokenExpiresAt         = expiresAt;
            tokenLastRefreshedAt   = new Date();
            console.log(`[SocialMedia] ${platform}: got long-lived page token, expires ${expiresAt}`);
          } catch (pageErr) {
            // Page token fetch failed — store user token instead, inspect expiry
            finalCreds.accessToken = longLivedUserToken;
            const inspection = await inspectToken(longLivedUserToken, appId, appSecret);
            tokenExpiresAt   = inspection.expiresAt;
            tokenLastRefreshedAt = new Date();
            console.warn(`[SocialMedia] ${platform}: page token fetch failed, stored user token. ${pageErr.message}`);
          }
        } else {
          // No pageId yet — store user token, inspect its expiry
          finalCreds.accessToken = longLivedUserToken;
          const inspection = await inspectToken(longLivedUserToken, appId, appSecret);
          tokenExpiresAt   = inspection.expiresAt;
          tokenLastRefreshedAt = new Date();
        }
      } catch (err) {
        // Token exchange failed entirely — store as-is, flag for reconnect check
        console.error(`[SocialMedia] ${platform} token upgrade failed:`, err.message);
      }
    } else {
      // No App credentials — try to inspect the token to at least record expiry
      const mergedAppId     = finalCreds.appId     || existing.appId     || '';
      const mergedAppSecret = finalCreds.appSecret || existing.appSecret || '';
      if (mergedAppId && mergedAppSecret) {
        const inspection = await inspectToken(finalCreds.accessToken, mergedAppId, mergedAppSecret);
        tokenExpiresAt = inspection.expiresAt;
      }
    }
  }

  // Deep-merge extraConfig so individual keys (broadcastList, templateName, etc.)
  // are preserved even if the admin only updates one of them at a time
  const mergedExtraConfig = {
    ...(existing.extraConfig || {}),
    ...(finalCreds.extraConfig || {}),
  };

  const updated = encryptPlatformFields({
    ...existing,
    ...finalCreds,
    extraConfig:          mergedExtraConfig,
    connected:            true,
    connectedAt:          new Date(),
    tokenExpiresAt,
    tokenLastRefreshedAt,
    tokenRefreshError:    '',
    reconnectNeeded,
    // Always clear stale test result when credentials are (re)connected
    lastTested:           null,
    lastTestStatus:       '',
    lastTestMessage:      '',
  });

  doc[platform] = updated;
  doc.updatedAt = new Date();
  await doc.save();
  return sanitizePlatform(doc[platform]);
}

// ─── DISCONNECT a platform (wipe credentials, mark disconnected) ──────────────
async function disconnectPlatform(platform) {
  const doc = await getOrCreate();
  doc[platform] = {
    connected: false,
    enabled: false,
    accountId: '',
    accountName: '',
    accountHandle: '',
    accountAvatar: '',
    accessToken: '',
    accessSecret: '',
    appId: '',
    appSecret: '',
    extraConfig: {},
    lastTested: null,
    lastTestStatus: '',
    lastTestMessage: '',
    connectedAt: null,
  };
  doc.updatedAt = new Date();
  await doc.save();
  return { disconnected: true };
}

// ─── TEST connection ──────────────────────────────────────────────────────────
async function testConnection(platform) {
  const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'telegram'];
  if (!PLATFORMS.includes(platform)) throw new Error('Unknown platform');

  const doc = await getOrCreate();
  const raw  = JSON.parse(JSON.stringify(
    doc[platform]?.toObject?.({ virtuals: false }) ?? doc[platform] ?? {}
  ));
  let data   = decryptPlatformFields(raw);

  if (!data.connected) {
    return { ok: false, message: 'Account is not connected' };
  }

  // ── Auto-refresh expired/expiring token before testing (FB / Instagram) ──
  if (platform === 'facebook' || platform === 'instagram') {
    const expiresAt = raw.tokenExpiresAt;
    if ((isExpired(expiresAt) || shouldRefresh(expiresAt)) && data.appId && data.appSecret) {
      try {
        console.log(`[SocialMedia] testConnection: refreshing ${platform} token before test…`);
        const { refreshPageToken } = require('./facebookTokenRefresh');
        const { accessToken: newToken, expiresAt: newExpiry } = await refreshPageToken(data);
        const encrypted = encryptPlatformFields({ accessToken: newToken });
        doc[platform].accessToken          = encrypted.accessToken;
        doc[platform].tokenExpiresAt       = newExpiry;
        doc[platform].tokenLastRefreshedAt = new Date();
        doc[platform].tokenRefreshError    = '';
        doc[platform].reconnectNeeded      = false;
        await doc.save();
        // Use fresh token for the test
        data = { ...data, accessToken: newToken };
        console.log(`[SocialMedia] ${platform} token refreshed before test. New expiry: ${newExpiry}`);
      } catch (refreshErr) {
        // Refresh failed — mark reconnect needed, return clear error
        doc[platform].tokenRefreshError = refreshErr.message;
        doc[platform].reconnectNeeded   = true;
        doc[platform].lastTested        = new Date();
        doc[platform].lastTestStatus    = 'error';
        doc[platform].lastTestMessage   = `Token expired. Auto-refresh failed: ${refreshErr.message}. Please reconnect your account.`;
        doc.updatedAt = new Date();
        await doc.save();
        return { ok: false, message: doc[platform].lastTestMessage };
      }
    } else if (isExpired(expiresAt) && (!data.appId || !data.appSecret)) {
      // Expired but no App credentials to refresh — must reconnect
      doc[platform].reconnectNeeded   = true;
      doc[platform].lastTested        = new Date();
      doc[platform].lastTestStatus    = 'error';
      doc[platform].lastTestMessage   = 'Token expired. Add your App ID and App Secret to enable auto-refresh, or reconnect your account.';
      doc.updatedAt = new Date();
      await doc.save();
      return { ok: false, message: doc[platform].lastTestMessage };
    }
  }

  let result = { ok: false, message: 'Unknown error' };

  try {
    result = await runPlatformTest(platform, data);
  } catch (err) {
    result = { ok: false, message: err.message || 'Connection test failed' };
  }

  // Persist last test result
  doc[platform].lastTested     = new Date();
  doc[platform].lastTestStatus  = result.ok ? 'ok' : 'error';
  doc[platform].lastTestMessage = result.message;
  doc.updatedAt = new Date();
  await doc.save();

  return result;
}

// ─── Platform-specific test implementations ───────────────────────────────────
async function runPlatformTest(platform, data) {
  switch (platform) {
    case 'facebook':
      return testFacebook(data);
    case 'instagram':
      return testInstagram(data);
    case 'tiktok':
      return testTikTok(data);
    case 'whatsapp':
      return testWhatsApp(data);
    case 'telegram':
      return testTelegram(data);
    default:
      return { ok: false, message: 'Unsupported platform' };
  }
}

async function testFacebook(data) {
  if (!data.accessToken) return { ok: false, message: 'No access token configured' };
  try {
    const res = await fetch(
      `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v21.0'}/me?access_token=${data.accessToken}&fields=id,name`
    );
    const json = await res.json();
    if (json.error) return { ok: false, message: json.error.message };
    return { ok: true, message: `Connected as: ${json.name} (${json.id})` };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}

async function testInstagram(data) {
  if (!data.accessToken) return { ok: false, message: 'No access token configured' };
  try {
    const res = await fetch(
      `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v21.0'}/me?access_token=${data.accessToken}&fields=id,name,username`
    );
    const json = await res.json();
    if (json.error) return { ok: false, message: json.error.message };
    return { ok: true, message: `Connected as: ${json.username || json.name} (${json.id})` };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}

async function testTikTok(data) {
  if (!data.accessToken) return { ok: false, message: 'No access token configured' };
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    const json = await res.json();
    if (json.error?.code && json.error.code !== 'ok') {
      return { ok: false, message: json.error.message || 'TikTok API error' };
    }
    const user = json.data?.user;
    return { ok: true, message: `Connected as: ${user?.display_name || 'TikTok user'} (${user?.open_id || '—'})` };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}

async function testWhatsApp(data) {
  if (!data.accessToken) return { ok: false, message: 'No System User Access Token configured' };
  if (!data.accountId)   return { ok: false, message: 'No Phone Number ID configured. Use the numeric ID from Meta → WhatsApp → API Setup, not the phone number.' };

  const extra = data.extraConfig || {};
  const rawList = (extra.broadcastList || '').toString().trim();
  const recipients = rawList.split(',').map(n => n.trim()).filter(Boolean);
  if (!recipients.length) {
    return { ok: false, message: 'No Broadcast List configured. Add at least one recipient phone number in E.164 format (e.g. +94771234567).' };
  }

  try {
    // Verify the Phone Number ID is valid and token has permission
    const res = await fetch(
      `https://graph.facebook.com/v23.0/${data.accountId}?access_token=${encodeURIComponent(data.accessToken)}&fields=id,display_phone_number,verified_name,quality_rating`
    );
    const json = await res.json();
    if (json.error) {
      // Give actionable error messages for common error codes
      if (json.error.code === 190)  return { ok: false, message: `Token invalid or expired: ${json.error.message}` };
      if (json.error.code === 100)  return { ok: false, message: `Phone Number ID not found. Double-check the ID in Meta → WhatsApp → API Setup.` };
      if (json.error.code === 200)  return { ok: false, message: `Permission denied. Make sure your System User token has 'whatsapp_business_messaging' permission.` };
      return { ok: false, message: json.error.message };
    }
    const quality = json.quality_rating ? ` · Quality: ${json.quality_rating}` : '';
    return {
      ok: true,
      message: `✅ Connected: ${json.verified_name} (${json.display_phone_number})${quality} · ${recipients.length} recipient(s) configured`,
    };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}

async function testTelegram(data) {
  if (!data.accessToken) return { ok: false, message: 'No Bot Token configured' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${data.accessToken}/getMe`);
    const json = await res.json();
    if (!json.ok) return { ok: false, message: json.description || 'Telegram API error' };
    const bot = json.result;
    return { ok: true, message: `Connected: @${bot.username} — ${bot.first_name}` };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}

// ─── UPDATE global automation settings ───────────────────────────────────────
async function updateAutomation({ automationEnabled, enabledPlatforms }) {
  const doc = await getOrCreate();
  if (automationEnabled !== undefined) doc.automationEnabled = automationEnabled;
  if (enabledPlatforms  !== undefined) doc.enabledPlatforms  = enabledPlatforms;
  doc.updatedAt = new Date();
  await doc.save();
  return { automationEnabled: doc.automationEnabled, enabledPlatforms: doc.enabledPlatforms };
}

// ─── UPDATE post templates ────────────────────────────────────────────────────
async function updateTemplates(templates) {
  const doc = await getOrCreate();
  doc.templates = templates;
  doc.updatedAt = new Date();
  await doc.save();
  return doc.templates;
}

// ─── TOGGLE platform enabled/disabled ────────────────────────────────────────
async function togglePlatform(platform, enabled) {
  const doc = await getOrCreate();
  if (!doc[platform]) throw new Error('Unknown platform');
  doc[platform].enabled = enabled;
  doc.updatedAt = new Date();
  await doc.save();
  return { platform, enabled };
}

module.exports = {
  getSettings,
  updatePlatform,
  connectPlatform,
  disconnectPlatform,
  testConnection,
  updateAutomation,
  updateTemplates,
  togglePlatform,
  // expose for internal use by other services
  getOrCreate,
  decryptPlatformFields,
  encryptPlatformFields,
};
