/**
 * services/whatsappOrderNotify.js
 *
 * Sends a WhatsApp message to the shop admin whenever a new order is placed.
 * Uses the Meta WhatsApp Cloud API directly via the env vars already
 * configured in .env — independent of the Social Media → WhatsApp broadcast
 * publisher (services/publishers/whatsapp.js), which is for marketing posts.
 *
 * Required env vars (already set):
 *   WHATSAPP_BOT_ENABLED      — 'true' to enable, anything else disables silently
 *   WHATSAPP_ACCESS_TOKEN     — Meta System User permanent access token
 *   WHATSAPP_PHONE_NUMBER_ID  — numeric Phone Number ID (NOT the phone number)
 *   WHATSAPP_ADMIN_NUMBER     — recipient, E.164 without '+' e.g. 94775474001
 *   SHOP_NAME                 — used in the message header
 *
 * NOTE: WhatsApp Cloud API only allows free-text messages within a 24h
 * window after the recipient has messaged the business number at least
 * once. Send "hi" once from 0775474001 to the WhatsApp Business number to
 * open that window — after that, these alerts will deliver as free text.
 * If the window is closed, Meta returns error 131047 and this just logs a
 * warning — it never throws, so order creation is never affected.
 */

/**
 * services/whatsappOrderNotify.js
 *
 * Sends a WhatsApp message to the shop admin whenever a new order is placed.
 *
 * Credential resolution order:
 *   1. Admin-configured WhatsApp account (Social Media → WhatsApp settings in
 *      the admin panel) — SocialMedia.whatsapp.accessToken (decrypted) +
 *      SocialMedia.whatsapp.accountId (Phone Number ID). This is the same
 *      record used by the WhatsApp broadcast publisher, so the access token
 *      set from the admin UI works here automatically — no .env edits needed.
 *   2. Falls back to WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID in .env
 *      if the admin account isn't connected/enabled yet.
 *
 * Recipient number resolution order:
 *   1. The first number in SocialMedia.whatsapp.extraConfig.broadcastList —
 *      the same "Broadcast List (recipients)" field already in the admin
 *      Social Media → WhatsApp screen, so no new admin UI is required.
 *   2. Falls back to WHATSAPP_ADMIN_NUMBER in .env.
 *
 * Enable/disable: WHATSAPP_BOT_ENABLED in .env still gates this feature.
 *
 * NOTE: WhatsApp Cloud API only allows free-text messages within a 24h
 * window after the recipient has messaged the business number at least
 * once. Send "hi" once from the admin number to the WhatsApp Business
 * number to open that window. If the window is closed, Meta returns error
 * 131047 and this just logs a warning — it never throws, so order creation
 * is never affected.
 */

const GRAPH_VER = 'v23.0';
const GRAPH     = `https://graph.facebook.com/${GRAPH_VER}`;

function isEnabled() {
  return process.env.WHATSAPP_BOT_ENABLED === 'true';
}

// ─── Resolve credentials: admin panel settings first, env vars as fallback ───
async function resolveCredentials() {
  let accessToken   = '';
  let phoneNumberId = '';
  let adminNumber   = '';

  try {
    const { getOrCreate, decryptPlatformFields } = require('./socialMediaService');
    const doc = await getOrCreate();
    const raw = doc?.whatsapp?.toObject ? doc.whatsapp.toObject() : (doc?.whatsapp || {});

    if (raw?.connected) {
      const creds = decryptPlatformFields(raw);
      accessToken   = creds.accessToken || '';
      phoneNumberId = creds.accountId   || '';
      const broadcastList = (creds.extraConfig?.broadcastList || '').toString().trim();
      adminNumber = broadcastList.split(',').map(n => n.trim()).filter(Boolean)[0] || '';
    }
  } catch (err) {
    console.warn('[WhatsApp Order Alert] Could not read admin-configured WhatsApp settings, falling back to .env:', err.message);
  }

  // Fall back to .env for anything not set in the admin panel
  if (!accessToken)   accessToken   = process.env.WHATSAPP_ACCESS_TOKEN || '';
  if (!phoneNumberId) phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  if (!adminNumber)   adminNumber   = process.env.WHATSAPP_ADMIN_NUMBER || '';

  return { accessToken, phoneNumberId, adminNumber };
}

function buildOrderMessage(order) {
  const shopName = process.env.SHOP_NAME || 'StoreKit';
  const b = order.billing || {};
  const customerName = `${b.firstName || ''} ${b.lastName || ''}`.trim() || 'N/A';
  const phone        = b.phone || 'N/A';
  const email        = b.email || 'N/A';
  // Order.billing only has street / city / country — match the actual schema
  // (previous version referenced non-existent address/district fields, which
  // is why the message showed just "Other").
  const address       = [b.street, b.city, b.country].filter(Boolean).join(', ') || 'N/A';

  const itemLines = (order.items || [])
    .map(i => `• ${i.name || 'Item'} x${i.quantity} — Rs. ${Number(i.price || 0).toLocaleString()}`)
    .join('\n');

  return `🛒 *New Order — ${shopName}*

*Order:* ${order.orderNumber}
*Customer:* ${customerName}
*Phone:* ${phone}
*Email:* ${email}
*Address:* ${address}

*Items:*
${itemLines || 'N/A'}

*Payment Method:* ${order.paymentMethod || 'N/A'}
*Payment Status:* ${order.paymentStatus || 'N/A'}
*Total:* Rs. ${Number(order.total || 0).toLocaleString()}

View in admin panel for full details.`;
}

async function sendOrderWhatsAppNotification(order) {
  try {
    if (!isEnabled()) return;

    const { accessToken, phoneNumberId, adminNumber } = await resolveCredentials();

    if (!accessToken || !phoneNumberId || !adminNumber) {
      console.warn('[WhatsApp Order Alert] Missing access token / phone number ID / admin number (checked admin Social Media settings and .env) — skipping.');
      return;
    }

    const body = buildOrderMessage(order);

    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                adminNumber,
        type:              'text',
        text: { preview_url: false, body: body.slice(0, 4096) },
      }),
    });

    const json = await res.json();

    if (json.error) {
      console.error(`[WhatsApp Order Alert] Failed to notify ${adminNumber}: ${json.error.message} (code ${json.error.code})`);
      return;
    }

    console.log(`[WhatsApp Order Alert] ✅ Sent to ${adminNumber} for order ${order.orderNumber} — message ID: ${json.messages?.[0]?.id || ''}`);
  } catch (err) {
    // Never let a notification failure affect order creation.
    console.error('[WhatsApp Order Alert] Unexpected error:', err.message);
  }
}

module.exports = { sendOrderWhatsAppNotification };