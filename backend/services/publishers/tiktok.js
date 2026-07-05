/**
 * services/publishers/tiktok.js
 *
 * Publishes a photo or video to TikTok via Content Posting API v2.
 * Requires imageUrl or videoUrl — text-only is not supported by TikTok.
 *
 * FIX: Multi-image support — all images from imageUrls[] are passed to
 *      photo_images[] so TikTok posts them as a slideshow/carousel.
 */

const API = 'https://open.tiktokapis.com/v2';

async function publish(creds, payload) {
  const { accessToken } = creds;
  if (!accessToken) throw new Error('No access token configured');

  const images = payload.imageUrls?.length ? payload.imageUrls
               : payload.imageUrl          ? [payload.imageUrl]
               : [];

  if (!images.length && !payload.videoUrl) {
    throw new Error('TikTok requires an image or video URL');
  }

  const isVideo  = !!payload.videoUrl;
  const endpoint = isVideo
    ? `${API}/post/publish/video/init/`
    : `${API}/post/publish/content/init/`;

  let body;
  if (isVideo) {
    body = {
      post_info: {
        title:         (payload.text || '').slice(0, 2200),
        privacy_level: 'SELF_ONLY',
      },
      source_info: {
        source:    'PULL_FROM_URL',
        video_url: payload.videoUrl,
      },
    };
  } else {
    // Pass ALL images to photo_images[] for a multi-image slideshow
    // TikTok supports up to 35 images in a photo post
    body = {
      post_info: {
        title:         (payload.text || '').slice(0, 2200),
        privacy_level: 'SELF_ONLY',
      },
      source_info: {
        source:             'PULL_FROM_URL',
        photo_images:       images.slice(0, 35),   // TikTok max 35 images
        photo_cover_index:  0,
      },
      media_type: 'PHOTO',
    };
  }

  const json = await fetch(endpoint, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Authorization:  `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  }).then(r => r.json());

  if (json.error?.code && json.error.code !== 'ok') {
    const e = new Error(json.error.message || 'TikTok API error');
    e.code  = String(json.error.code);
    throw e;
  }

  return { platformPostId: json.data?.publish_id || '' };
}

module.exports = { publish };