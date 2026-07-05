/**
 * services/publishers/facebook.js
 *
 * Posts to a Facebook PAGE via the Graph API.
 *
 * ── HOW FACEBOOK FEED VISIBILITY WORKS ────────────────────────────────────────
 *
 * There are 3 ways to post with an image to a Facebook Page:
 *
 *   A) POST /{pageId}/feed  { link: imageUrl }
 *      → Facebook creates a "link card" preview using the image URL.
 *      → PROBLEM: only appears in Photos tab, NOT in the main All Posts feed.
 *        This was the bug causing posts to be invisible to followers.
 *
 *   B) POST /{pageId}/photos  { url, published: true }
 *      → Creates a native photo post visible in Photos tab.
 *      → PROBLEM: no way to attach a separate product link preview below it.
 *
 *   C) POST /{pageId}/photos  { url, published: false }  (stage)
 *      then POST /{pageId}/feed  { attached_media: [{ media_fbid }], link: productUrl }
 *      → Creates a FEED POST with the image displayed inline + a clickable
 *        product link preview card below it.
 *      → ✅ Appears in ALL Posts feed, Photos tab, and followers' News Feed.
 *      → ✅ Product URL is a real clickable link, not plain text.
 *
 * STRATEGY (fixed):
 *   Single image  → stage image + /feed with attached_media, product URL
 *                    appended as plain text to `message` (NOT `link`)
 *   Multi-image   → stage all images + /feed with attached_media[], product
 *                    URL appended as plain text to `message` (NOT `link`)
 *   No image      → plain /feed with product URL appended to `message`
 *
 * IMPORTANT: Do NOT set `feedBody.link` when `attached_media` is present.
 * Facebook mishandles that combination — the post ends up visible only in
 * the Photos tab and not in "All Posts". Appending the URL to `message`
 * instead (Facebook auto-links plain URLs in text) fixes this.
 *
 * The productUrl comes from payload.productUrl (set by postComposer.js).
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

async function publish(creds, payload) {
  const { accessToken, accountId } = creds;
  if (!accessToken) throw new Error('No Page access token configured');
  if (!accountId)   throw new Error('No Page ID configured');

  // ── Pre-publish: verify this token can reach the Page ─────────────────────
  try {
    const checkRes  = await fetch(`${GRAPH}/${accountId}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
    const checkJson = await checkRes.json();
    if (checkJson.error) {
      if (checkJson.error.code === 190) {
        throw new Error(
          `Facebook token is invalid or expired. Please reconnect your Facebook Page ` +
          `in Social Media settings using a Page Access Token (not a User token).`
        );
      }
      if (checkJson.error.code === 100) {
        throw new Error(
          `Facebook Page ID "${accountId}" not found. ` +
          `Double-check the numeric Page ID in Social Media settings.`
        );
      }
      throw new Error(`Facebook Page check failed: ${checkJson.error.message} (code ${checkJson.error.code})`);
    }
    console.log(`[Facebook] Page verified: ${checkJson.name} (${checkJson.id})`);
  } catch (err) {
    if (err.message.includes('Facebook')) throw err;
    throw new Error(`Facebook pre-publish check failed: ${err.message}`);
  }

  const images = payload.imageUrls?.length ? payload.imageUrls
               : payload.imageUrl          ? [payload.imageUrl]
               : [];

  if (images.length > 1) {
    return postMultipleImages(accountId, accessToken, payload, images);
  } else if (images.length === 1) {
    return postSingleImage(accountId, accessToken, payload, images[0]);
  } else {
    return postTextOnly(accountId, accessToken, payload);
  }
}

/**
 * Stage the image as an unpublished photo, then publish a /feed post that has:
 *   - The image visible inline (via attached_media)
 *   - A clickable product link preview card below (via link param)
 *
 * This is the only approach that makes posts appear in ALL feed sections AND
 * renders the product URL as a real clickable link rather than plain text.
 *
 * Fallback chain:
 *   1. Stage → /feed with attached_media + link  ← correct (primary)
 *   2. /feed with link only (image won't show but link works)
 *   3. /feed text-only (last resort)
 */
async function postSingleImage(pageId, accessToken, payload, imageUrl) {
  const isPublicUrl = imageUrl &&
    imageUrl.startsWith('https://') &&
    !imageUrl.includes('localhost') &&
    !imageUrl.includes('127.0.0.1');

  // The product page URL — used as `link` param for a clickable link preview
  const productUrl = getProductUrl(payload);

  if (isPublicUrl) {
    // Step 1: Stage image as unpublished photo
    console.log(`[Facebook] Staging image for feed post…`);
    const stageRes  = await fetch(`${GRAPH}/${pageId}/photos`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        url:          imageUrl,
        published:    false,
        access_token: accessToken,
      }),
    });
    const stageJson = await stageRes.json();

    if (stageJson.id) {
      // Step 2: Publish feed post with image attached.
      // NOTE: Facebook mishandles `attached_media` combined with `link` —
      // the resulting post often only appears in the Photos tab, not in
      // "All Posts". FIX: do NOT set `link`. Instead append the product
      // URL as plain text to `message` (Facebook auto-links URLs in text).
      let message = payload.text || '';
      if (productUrl && !message.includes(productUrl)) {
        message = message ? `${message}\n\n${productUrl}` : productUrl;
      }

      const feedBody = {
        message:        message,
        attached_media: [{ media_fbid: stageJson.id }],
        access_token:   accessToken,
      };

      const feedRes  = await fetch(`${GRAPH}/${pageId}/feed`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(feedBody),
      });
      const feedJson = await feedRes.json();

      if (!feedJson.error) {
        console.log(`[Facebook] ✅ Feed post with image + product link: ${feedJson.id}`);
        return { platformPostId: feedJson.id || '' };
      }
      console.warn(`[Facebook] Feed post with attached_media failed: ${feedJson.error.message}`);
    } else {
      console.warn(`[Facebook] Image staging failed: ${stageJson.error?.message || 'no id returned'} — falling back to link-only post`);
    }
  }

  // Fallback: text post with product URL as link (image won't show inline)
  console.warn('[Facebook] Falling back to feed post with product link only (no image)');
  return postTextOnly(pageId, accessToken, payload);
}

/**
 * Stage all images, then post a feed carousel with all images + product link.
 */
async function postMultipleImages(pageId, accessToken, payload, images) {
  const productUrl = getProductUrl(payload);
  const photoIds   = [];

  let message = payload.text || '';
  if (productUrl && !message.includes(productUrl)) {
    message = message ? `${message}\n\n${productUrl}` : productUrl;
  }

  for (const url of images) {
    if (!url.startsWith('https://')) continue;
    try {
      const res  = await fetch(`${GRAPH}/${pageId}/photos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url, access_token: accessToken, published: false }),
      });
      const json = await res.json();
      if (json.id) {
        photoIds.push(json.id);
        console.log(`[Facebook] Staged photo ${photoIds.length}: ${json.id}`);
      } else {
        console.warn('[Facebook] Failed to stage photo:', url, json.error?.message);
      }
    } catch (err) {
      console.warn('[Facebook] Photo staging error:', err.message);
    }
  }

  if (!photoIds.length) {
    console.warn('[Facebook] No photos staged — falling back to single image post');
    return postSingleImage(pageId, accessToken, payload, images[0]);
  }

  // Single staged photo → feed + attached_media, URL appended to message (no `link` param)
  if (photoIds.length === 1) {
    const feedBody = {
      message:        message,
      attached_media: [{ media_fbid: photoIds[0] }],
      access_token:   accessToken,
    };

    const res  = await fetch(`${GRAPH}/${pageId}/feed`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(feedBody),
    });
    const json = await res.json();
    if (!json.error) {
      console.log(`[Facebook] ✅ Feed post (1 image): ${json.id}`);
      return { platformPostId: json.id || '' };
    }
    return postSingleImage(pageId, accessToken, payload, images[0]);
  }

  // Multiple staged photos → carousel feed post, URL appended to message (no `link` param)
  const feedBody = {
    message:        message,
    attached_media: photoIds.map(id => ({ media_fbid: id })),
    access_token:   accessToken,
  };

  const res  = await fetch(`${GRAPH}/${pageId}/feed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(feedBody),
  });
  const json = await res.json();

  if (!json.error) {
    console.log(`[Facebook] ✅ Carousel feed post (${photoIds.length} images): ${json.id}`);
    return { platformPostId: json.id || '' };
  }

  console.warn(`[Facebook] Multi-image feed failed (${json.error.message}) — falling back to single image`);
  return postSingleImage(pageId, accessToken, payload, images[0]);
}

/**
 * Text-only post.  Uses productUrl as the `link` param so Facebook renders
 * a proper clickable link preview card rather than plain text.
 */
async function postTextOnly(pageId, accessToken, payload) {
  const productUrl = getProductUrl(payload);

  const body = {
    message:      payload.text,
    access_token: accessToken,
  };

  if (productUrl) {
    body.link = productUrl;
  }

  const res  = await fetch(`${GRAPH}/${pageId}/feed`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const json = await res.json();

  if (json.error) {
    const err  = new Error(`Facebook post failed: ${json.error.message} (code ${json.error.code})`);
    err.code   = String(json.error.code || 'FB_ERROR');
    throw err;
  }

  console.log(`[Facebook] ✅ Text post with link: ${json.id}`);
  return { platformPostId: json.id || '' };
}

/**
 * Extract the product/offer page URL from the payload.
 * Falls back to parsing the text if productUrl field isn't set
 * (for backward compat with any older code paths).
 * Only returns public HTTPS URLs — never localhost.
 */
function getProductUrl(payload) {
  // Primary: dedicated productUrl field from postComposer
  if (payload.productUrl &&
      payload.productUrl.startsWith('https://') &&
      !payload.productUrl.includes('localhost')) {
    return payload.productUrl;
  }
  // Fallback: extract first https URL from post text
  const match = payload.text && payload.text.match(/https:\/\/[^\s]+/);
  if (match && !match[0].includes('localhost') && !match[0].includes('127.0.0.1')) {
    return match[0];
  }
  return null;
}

module.exports = { publish };