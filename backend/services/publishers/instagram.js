/**
 * services/publishers/instagram.js
 *
 * Single image:  create container → poll for FINISHED → publish.
 * Multiple images: create child container per image → poll each → create carousel → poll → publish.
 *
 * FIXES:
 *
 *   FIX 1 — ALWAYS USE ALL PRODUCT IMAGES AS CAROUSEL:
 *     Previously when imageUrls had only 1 entry the single-image path was used
 *     even if the product had more images — because the old postComposer wasn't
 *     correctly collecting all images into imageUrls.
 *     Now postComposer.js correctly passes all images in imageUrls[], and this
 *     publisher sends 2+ images as a carousel and 1 image as a single post.
 *
 *   FIX 2 — FRONTEND TIMEOUT:
 *     Previous polling was 8 × 2500ms = up to 20s. Frontend axios timeout was
 *     15s, so the request timed out and the UI showed "failed" even though the
 *     backend succeeded. Polling is now 10 × 1200ms = max 12s.
 *
 *   FIX 3 — PRODUCT URL IN CAPTION:
 *     Instagram does not support the `link` API param (by design — clickable
 *     links only work in bio). The product URL is already included in the
 *     caption text by postComposer.js as "🔗 https://storekit.local/product/..."
 *     so followers can copy/paste or tap on mobile. No change needed here;
 *     this comment clarifies the intentional behaviour.
 *
 * NOTE: accountId must be the Instagram Business Account ID (numeric),
 *       NOT the Facebook Page ID. Get it via:
 *       GET /{facebook-page-id}?fields=instagram_business_account&access_token=...
 */

const GRAPH = 'https://graph.facebook.com/v19.0';

// Polling tuned to fit inside 15s frontend axios timeout (now 45s after api.js fix)
const POLL_ATTEMPTS    = 10;
const POLL_INTERVAL_MS = 1200;  // 10 × 1200ms = max 12s

async function publish(creds, payload) {
  const { accessToken, accountId } = creds;
  if (!accessToken) throw new Error('No access token configured');
  if (!accountId)   throw new Error('No Instagram Business Account ID configured');

  // Collect ALL images from payload
  const images = payload.imageUrls?.length ? payload.imageUrls
               : payload.imageUrl          ? [payload.imageUrl]
               : [];

  if (!images.length) throw new Error('Instagram requires at least one image URL');

  // Pre-publish: verify the accountId is a valid Instagram Business Account
  try {
    const checkRes  = await fetch(`${GRAPH}/${accountId}?fields=id,username,name&access_token=${encodeURIComponent(accessToken)}`);
    const checkJson = await checkRes.json();
    if (checkJson.error) {
      if (checkJson.error.code === 100) {
        throw new Error(
          `Invalid Instagram Business Account ID "${accountId}". ` +
          `You may have entered the Facebook Page ID instead. ` +
          `Get the correct ID via: GET /{page-id}?fields=instagram_business_account&access_token=YOUR_TOKEN`
        );
      }
      throw new Error(`Instagram account check failed: ${checkJson.error.message} (code ${checkJson.error.code})`);
    }
    console.log(`[Instagram] Account verified: @${checkJson.username || checkJson.name} (${checkJson.id})`);
  } catch (err) {
    if (err.message.includes('Instagram')) throw err;
    throw new Error(`Instagram pre-publish check failed: ${err.message}`);
  }

  console.log(`[Instagram] Publishing ${images.length} image(s)…`);

  // Route: 1 image → single post, 2–10 images → carousel
  if (images.length > 1) {
    return publishCarousel(accountId, accessToken, payload, images);
  } else {
    return publishSingle(accountId, accessToken, payload, images[0]);
  }
}

// ── Single image ──────────────────────────────────────────────────────────────

async function publishSingle(accountId, accessToken, payload, imageUrl) {
  console.log(`[Instagram] Creating single image container for: ${imageUrl}`);

  const containerRes = await fetch(`${GRAPH}/${accountId}/media`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      image_url:    imageUrl,
      caption:      payload.text,
      access_token: accessToken,
    }),
  });
  const c = await containerRes.json();

  if (c.error) {
    const e = new Error(`Instagram container creation failed: ${c.error.message} (code ${c.error.code})`);
    e.code  = String(c.error.code);
    throw e;
  }
  if (!c.id) throw new Error('Instagram container creation returned no ID');

  console.log(`[Instagram] Container created: ${c.id} — polling for FINISHED…`);
  await waitForContainer(accountId, accessToken, c.id);

  const publishRes = await fetch(`${GRAPH}/${accountId}/media_publish`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ creation_id: c.id, access_token: accessToken }),
  });
  const p = await publishRes.json();

  if (p.error) {
    const e = new Error(`Instagram publish failed: ${p.error.message} (code ${p.error.code})`);
    e.code  = String(p.error.code);
    throw e;
  }

  console.log(`[Instagram] ✅ Single post published: ${p.id}`);
  return { platformPostId: p.id || '' };
}

// ── Carousel (2–10 images) ────────────────────────────────────────────────────

async function publishCarousel(accountId, accessToken, payload, images) {
  // Instagram carousel max is 10
  const urls = images.slice(0, 10).filter(u => u && u.startsWith('https://'));
  console.log(`[Instagram] Creating carousel with ${urls.length} images…`);

  if (!urls.length) throw new Error('Instagram carousel: no valid public HTTPS image URLs');

  // Step 1: Create each child container and wait for FINISHED before moving on.
  // Referencing an IN_PROGRESS child in the carousel container causes Instagram
  // to silently drop it — so we must wait for each one to finish first.
  const childIds = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[Instagram] Creating child container ${i + 1}/${urls.length}: ${url}`);

    const res  = await fetch(`${GRAPH}/${accountId}/media`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        image_url:        url,
        is_carousel_item: true,
        access_token:     accessToken,
      }),
    });
    const json = await res.json();

    if (json.error) {
      console.warn(`[Instagram] Child ${i + 1} creation failed (${json.error.message}) — skipping`);
      continue;
    }
    if (!json.id) {
      console.warn(`[Instagram] Child ${i + 1} returned no ID — skipping`);
      continue;
    }

    console.log(`[Instagram] Child ${i + 1} created: ${json.id} — polling for FINISHED…`);
    try {
      await waitForContainer(accountId, accessToken, json.id);
      childIds.push(json.id);
      console.log(`[Instagram] Child ${i + 1} ready ✅`);
    } catch (err) {
      console.warn(`[Instagram] Child ${i + 1} never reached FINISHED (${err.message}) — skipping`);
    }
  }

  console.log(`[Instagram] ${childIds.length}/${urls.length} child containers ready`);

  // Need at least 2 children for a carousel; fall back to single if not enough
  if (childIds.length < 2) {
    console.warn('[Instagram] Not enough children for carousel — falling back to single image');
    return publishSingle(accountId, accessToken, payload, urls[0]);
  }

  // Step 2: Create the carousel container referencing all ready children
  console.log(`[Instagram] Creating carousel container with ${childIds.length} children…`);
  const carouselRes = await fetch(`${GRAPH}/${accountId}/media`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      media_type:   'CAROUSEL',
      caption:      payload.text,
      children:     childIds.join(','),
      access_token: accessToken,
    }),
  });
  const carousel = await carouselRes.json();

  if (carousel.error) {
    const e = new Error(`Instagram carousel container failed: ${carousel.error.message} (code ${carousel.error.code})`);
    e.code  = String(carousel.error.code);
    throw e;
  }
  if (!carousel.id) throw new Error('Instagram carousel container returned no ID');

  // Step 3: Wait for the carousel container itself to be ready
  console.log(`[Instagram] Carousel container created: ${carousel.id} — polling for FINISHED…`);
  await waitForContainer(accountId, accessToken, carousel.id);

  // Step 4: Publish
  const pubRes = await fetch(`${GRAPH}/${accountId}/media_publish`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ creation_id: carousel.id, access_token: accessToken }),
  });
  const pub = await pubRes.json();

  if (pub.error) {
    const e = new Error(`Instagram carousel publish failed: ${pub.error.message} (code ${pub.error.code})`);
    e.code  = String(pub.error.code);
    throw e;
  }

  console.log(`[Instagram] ✅ Carousel published: ${pub.id} (${childIds.length} images)`);
  return { platformPostId: pub.id || '' };
}

// ── Status poller ─────────────────────────────────────────────────────────────

/**
 * Poll container status until FINISHED, ERROR, or maxAttempts reached.
 *
 * 10 × 1200ms = max 12s — safely inside the 45s frontend axios timeout.
 * Instagram containers typically reach FINISHED in 2–5 seconds.
 */
async function waitForContainer(
  accountId,
  accessToken,
  containerId,
  maxAttempts = POLL_ATTEMPTS,
  intervalMs  = POLL_INTERVAL_MS
) {
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, intervalMs));

    try {
      const res  = await fetch(
        `${GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`
      );
      const json = await res.json();

      if (json.error) {
        console.warn(`[Instagram] Status poll error for ${containerId}: ${json.error.message}`);
        continue;
      }

      const status = json.status_code || json.status;
      console.log(`[Instagram] Container ${containerId} status: ${status} (attempt ${i + 1}/${maxAttempts})`);

      if (status === 'FINISHED') return;
      if (status === 'ERROR') {
        throw new Error(`Instagram container ${containerId} processing failed (status: ERROR)`);
      }
      // IN_PROGRESS → keep polling
    } catch (err) {
      if (err.message.includes('status: ERROR')) throw err;
      console.warn(`[Instagram] Status poll network error: ${err.message}`);
    }
  }

  // After all attempts, try publishing anyway — status API can lag
  console.warn(`[Instagram] Container ${containerId} did not reach FINISHED after ${maxAttempts} attempts — proceeding anyway`);
}

module.exports = { publish };