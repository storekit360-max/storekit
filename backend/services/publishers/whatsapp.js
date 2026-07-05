/**
 * services/publishers/whatsapp.js
 *
 * Publishes product posts to WhatsApp Business via Meta Cloud API v23.0.
 *
 * SEND STRATEGY (in priority order):
 *
 *  1. TEMPLATE mode  — DEFAULT and always safe. Used for all broadcast sends.
 *     Requires a Meta-approved template. Use 'hello_world' for testing (it
 *     sends "Hello World" with no body params — good for a smoke test).
 *     For real product posts, create a Marketing template with a {{1}} body
 *     variable and set extraConfig.templateName to its name.
 *
 *     IMPORTANT: hello_world has NO variables — don't pass body components to it.
 *     Custom templates WITH {{1}} in the body DO accept a body component.
 *
 *  2. FREE-TEXT mode — opt-in via extraConfig.freeText = true.
 *     Only works within the 24h customer service window (after recipient replies).
 *     Outside that window Meta returns error 131047 and the message is dropped.
 *     Use this only if you are sure the window is open.
 *
 * Recipients: extraConfig.broadcastList — comma-separated E.164 numbers.
 *   e.g.  +94771234567,+94779876543
 *
 * Required credentials:
 *   accessToken  — Permanent System User token (whatsapp_business_messaging perm)
 *   accountId    — Phone Number ID (the numeric ID from Meta API Setup, NOT the
 *                  phone number itself and NOT the WABA ID)
 */

const GRAPH_VER = 'v23.0';
const GRAPH     = `https://graph.facebook.com/${GRAPH_VER}`;

// ─── Send one message to one recipient ──────────────────────────────────────
async function sendToOne({ accessToken, phoneNumberId, recipient, payload, extraConfig }) {
  const templateName  = (extraConfig.templateName  || 'hello_world').trim();
  const languageCode  = (extraConfig.languageCode  || 'en_US').trim();
  const useFreeText   = extraConfig.freeText === true || extraConfig.freeText === 'true';
  // hello_world is a fixed template — it has NO variable slots
  const isHelloWorld  = templateName === 'hello_world';

  let messageBody;

  if (useFreeText && payload.text) {
    // ── Free-text mode (only works inside 24h customer service window) ──────
    messageBody = {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                recipient,
      type:              'text',
      text: {
        preview_url: false,
        body:        payload.text.slice(0, 4096),
      },
    };
  } else {
    // ── Template mode (default — works for all outbound / broadcast) ────────
    const components = [];

    if (!isHelloWorld) {
      // Only add body component for custom templates that have {{1}} variable
      if (payload.text) {
        components.push({
          type: 'body',
          parameters: [{ type: 'text', text: payload.text.slice(0, 1024) }],
        });
      }
      // Header image — only if template has an IMAGE header component
      if (payload.imageUrl && extraConfig.templateHasImageHeader) {
        components.unshift({
          type: 'header',
          parameters: [{ type: 'image', image: { link: payload.imageUrl } }],
        });
      }
    }
    // hello_world: components stays [] — Meta rejects any params for this template

    messageBody = {
      messaging_product: 'whatsapp',
      to:       recipient,
      type:     'template',
      template: {
        name:     templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    };
  }

  console.log(`[WhatsApp] Sending to ${recipient} via ${useFreeText ? 'free-text' : `template:${templateName}`} | isHelloWorld:${isHelloWorld}`);

  const res  = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(messageBody),
  });

  const json = await res.json();

  if (json.error) {
    const err     = new Error(buildErrorMessage(json.error));
    err.code      = String(json.error.code);
    err.fbType    = json.error.type;
    err.fbSubcode = json.error.error_subcode;
    throw err;
  }

  return json.messages?.[0]?.id || '';
}

// ─── Build human-readable error messages for common Meta error codes ─────────
function buildErrorMessage(error) {
  const { code, error_subcode, message } = error;
  if (code === 131047) return `Message not sent: recipient hasn't messaged you in the last 24 hours. Use a pre-approved template instead of free-text, or ask them to send you a message first. (Meta error ${code})`;
  if (code === 132000) return `Template "${error.error_data?.details || ''}" not found or not approved. Check the template name and language code in Meta Business Manager. (Meta error ${code})`;
  if (code === 132001) return `Template body parameters mismatch. If using hello_world, make sure extraConfig.templateName is exactly "hello_world". If using a custom template, check it has a {{1}} variable. (Meta error ${code})`;
  if (code === 130429) return `Rate limit hit — too many messages sent. Wait and retry. (Meta error ${code})`;
  if (code === 131026) return `Recipient phone number is not a valid WhatsApp number: check your broadcast list format (must be E.164, e.g. +94771234567). (Meta error ${code})`;
  if (code === 100 && error_subcode === 2388023) return `Phone Number ID is invalid. Use the numeric ID from Meta → WhatsApp → API Setup, not the phone number itself. (Meta error ${code})`;
  if (code === 190) return `Access token is invalid or expired. Reconnect WhatsApp in Social Media settings. (Meta error ${code})`;
  if (code === 200) return `Permission denied. Make sure the System User token has 'whatsapp_business_messaging' permission. (Meta error ${code})`;
  return `${message} (Meta error ${code}${error_subcode ? `:${error_subcode}` : ''})`;
}

// ─── Main publish function ───────────────────────────────────────────────────
async function publish(creds, payload) {
  const { accessToken, accountId, extraConfig = {} } = creds;

  if (!accessToken) throw new Error('No System User Access Token configured. Add it in Social Media → WhatsApp settings.');
  if (!accountId)   throw new Error('No Phone Number ID configured. Use the numeric Phone Number ID from Meta → WhatsApp → API Setup (not the phone number itself).');

  // Parse broadcast list — comma-separated E.164 numbers
  const rawList    = (extraConfig.broadcastList || '').toString().trim();
  const recipients = rawList
    .split(',')
    .map(n => n.trim().replace(/\s+/g, ''))
    .filter(Boolean);

  if (!recipients.length) {
    throw new Error('No recipients in Broadcast List. Add phone numbers in Social Media → WhatsApp → Broadcast List (E.164 format, e.g. +94771234567,+94779876543).');
  }

  // Send to each recipient individually (WhatsApp Cloud API has no bulk endpoint)
  const results = await Promise.allSettled(
    recipients.map(recipient =>
      sendToOne({ accessToken, phoneNumberId: accountId, recipient, payload, extraConfig })
    )
  );

  const succeeded = results.filter(r => r.status === 'fulfilled');
  const failed    = results.filter(r => r.status === 'rejected');

  // Log per-recipient results
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[WhatsApp] ✅ Sent to ${recipients[i]} — message ID: ${r.value}`);
    } else {
      console.error(`[WhatsApp] ❌ Failed to send to ${recipients[i]}: ${r.reason?.message}`);
    }
  });

  if (succeeded.length === 0) {
    // All failed — throw the first error so PublishLog shows a meaningful message
    throw failed[0].reason;
  }

  if (failed.length > 0) {
    console.warn(`[WhatsApp] Partial send: ${succeeded.length}/${recipients.length} succeeded.`);
  }

  return {
    platformPostId: succeeded[0]?.value || '',
    recipientCount: succeeded.length,
    failedCount:    failed.length,
  };
}

module.exports = { publish };