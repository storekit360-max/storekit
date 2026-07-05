/**
 * services/publishers/telegram.js
 *
 * Publishes a post to a Telegram channel or group.
 *
 * creds fields (from SocialMedia doc, decrypted):
 *   accessToken  — Bot Token from @BotFather  e.g. "123456789:ABCdef..."
 *   accountId    — Channel/group chat_id:
 *                    public channel  → "@channelname"
 *                    private channel → "-1001234567890"  (note the -100 prefix)
 *                    group           → "-123456789"
 *
 * payload fields (from postComposer):
 *   text      — caption / message text (HTML)
 *   imageUrl  — optional single image URL
 *   imageUrls — optional array of image URLs (for media group)
 */

const MAX_CAPTION_LEN = 1024;   // Telegram hard limit for photo captions
const MAX_MESSAGE_LEN = 4096;   // Telegram hard limit for text messages

function truncate(str, max) {
  if (!str) return '';
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

/**
 * Normalise the chat_id:
 *  - If it looks like a plain positive integer (no leading -), it might be
 *    a supergroup/channel stored without the required "-100" prefix.
 *    Telegram channel IDs from getUpdates/forwardFrom arrive as -100XXXXXXXXXX.
 *    We leave negative values and @-handles untouched.
 */
function normaliseChatId(raw) {
  if (!raw) return raw;
  const s = String(raw).trim();
  // Already negative (group / channel numeric id) or @handle → use as-is
  if (s.startsWith('-') || s.startsWith('@')) return s;
  // Pure digits — could be a channel ID missing the "-100" prefix
  // We leave it as-is: if it fails, the error message will guide the user.
  return s;
}

async function tgPost(BASE, method, body) {
  const res  = await fetch(`${BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) {
    const e   = new Error(json.description || 'Telegram API error');
    e.code    = String(json.error_code || 'TG_ERROR');
    e.tgDesc  = json.description || '';
    throw e;
  }
  return json.result;
}

async function publish(creds, payload) {
  const { accessToken, accountId } = creds;

  if (!accessToken) throw new Error('No Bot Token configured. Re-enter credentials in Social Media settings.');
  if (!accountId)   throw new Error('No Channel / Chat ID configured. Enter your channel @handle or numeric ID.');

  const chat_id = normaliseChatId(accountId);
  const BASE    = `https://api.telegram.org/bot${accessToken}`;

  // ── Collect images ─────────────────────────────────────────────────────────
  let images = [];
  if (Array.isArray(payload.imageUrls) && payload.imageUrls.length > 0) {
    images = payload.imageUrls.filter(Boolean);
  } else if (payload.imageUrl) {
    images = [payload.imageUrl];
  }

  const text = payload.text || '';

  // ── Case 1: Multiple images → sendMediaGroup ───────────────────────────────
  if (images.length > 1) {
    const media = images.slice(0, 10).map((url, i) => ({
      type:       'photo',
      media:      url,
      // Only first item carries the caption
      ...(i === 0 ? { caption: truncate(text, MAX_CAPTION_LEN), parse_mode: 'HTML' } : {}),
    }));
    try {
      const result = await tgPost(BASE, 'sendMediaGroup', { chat_id, media });
      const msgId  = Array.isArray(result) ? result[0]?.message_id : result?.message_id;
      return { platformPostId: String(msgId || '') };
    } catch (err) {
      // sendMediaGroup fails on some URL types (e.g. Cloudinary signed URLs);
      // fall back to single photo with caption
      console.warn(`[Telegram] sendMediaGroup failed, falling back to single photo: ${err.tgDesc || err.message}`);
      // fall through to Case 2
      images = [images[0]];
    }
  }

  // ── Case 2: Single image → sendPhoto ──────────────────────────────────────
  if (images.length === 1) {
    try {
      const result = await tgPost(BASE, 'sendPhoto', {
        chat_id,
        photo:      images[0],
        caption:    truncate(text, MAX_CAPTION_LEN),
        parse_mode: 'HTML',
      });
      return { platformPostId: String(result?.message_id || '') };
    } catch (err) {
      // If the image URL is invalid/inaccessible, fall back to text-only
      if (err.tgDesc && err.tgDesc.toLowerCase().includes('wrong file identifier')) {
        console.warn(`[Telegram] sendPhoto failed (bad URL), sending text-only: ${err.tgDesc}`);
        // fall through to Case 3
      } else {
        // Re-throw real errors (chat not found, bot not admin, etc.)
        throw enrichError(err, chat_id);
      }
    }
  }

  // ── Case 3: Text only → sendMessage ───────────────────────────────────────
  const result = await tgPost(BASE, 'sendMessage', {
    chat_id,
    text:       truncate(text, MAX_MESSAGE_LEN),
    parse_mode: 'HTML',
  }).catch(err => { throw enrichError(err, chat_id); });

  return { platformPostId: String(result?.message_id || '') };
}

/**
 * Enrich Telegram API errors with actionable guidance so the publish log
 * shows something useful instead of a bare API code.
 */
function enrichError(err, chat_id) {
  const desc = (err.tgDesc || err.message || '').toLowerCase();
  if (desc.includes('chat not found')) {
    err.message =
      `Bad Request: chat not found — chat_id used: "${chat_id}". ` +
      `Check: (1) Bot is added as an Admin to the channel, ` +
      `(2) Channel ID is correct — private channels need the "-100" prefix (e.g. -1001234567890), ` +
      `(3) Public channels use the @handle format (e.g. @mystore).`;
  } else if (desc.includes('bot is not a member') || desc.includes('kicked')) {
    err.message = `Bot is not a member of the channel. Add the bot as Admin in your Telegram channel settings.`;
  } else if (desc.includes('not enough rights')) {
    err.message = `Bot does not have permission to post. Make sure the bot is an Admin with "Post Messages" permission.`;
  }
  return err;
}

module.exports = { publish };