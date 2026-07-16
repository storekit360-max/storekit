'use strict';

const PEXELS_API_URL = 'https://api.pexels.com/v1/search';

function clean(value, max = 120) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/[^a-z0-9\s&-]/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function buildSearchQuery(brief = {}, products = []) {
  const business = clean(brief.businessType || 'retail products', 60);
  const examples = Array.isArray(brief.itemExamples) ? brief.itemExamples.map(item => clean(item, 40)).filter(Boolean).slice(0, 4) : [];
  const productTerms = products.slice(0, 4).map(product => clean(product.name, 45)).filter(Boolean);
  const focusTerms = (examples.length ? examples : productTerms).slice(0, 2);
  return [...new Set([business, ...focusTerms, 'product photography'])].join(' ').slice(0, 240);
}

function safePexelsUrl(value, type = 'image') {
  try {
    const url = new URL(String(value || ''));
    const allowed = type === 'image'
      ? url.protocol === 'https:' && url.hostname === 'images.pexels.com'
      : url.protocol === 'https:' && (url.hostname === 'www.pexels.com' || url.hostname === 'pexels.com');
    return allowed ? url.toString() : '';
  } catch (_) { return ''; }
}

function normalizePexelsPhotos(payload = {}) {
  const photos = Array.isArray(payload.photos) ? payload.photos : [];
  return photos.map(photo => {
    const image = safePexelsUrl(photo?.src?.large || photo?.src?.medium, 'image');
    if (!image) return null;
    return {
      image,
      attribution: {
        provider: 'Pexels',
        photographer: clean(photo.photographer, 100),
        photographerUrl: safePexelsUrl(photo.photographer_url, 'page'),
        sourceUrl: safePexelsUrl(photo.url, 'page'),
      },
    };
  }).filter(Boolean);
}

async function fetchPexelsPhotos(brief, products, count = 12) {
  const apiKey = String(process.env.PEXELS_API_KEY || '').trim();
  if (!apiKey) {
    return {
      images: [],
      provider: '',
      warning: 'PEXELS_API_KEY is not configured, so starter products use the local placeholder image. Add the key in Railway to source attractive product photos automatically.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const params = new URLSearchParams({
      query: buildSearchQuery(brief, products),
      per_page: String(Math.max(1, Math.min(40, count))),
      orientation: 'square',
      size: 'medium',
    });
    const response = await fetch(`${PEXELS_API_URL}?${params}`, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Pexels request failed (${response.status})`);
    const images = normalizePexelsPhotos(await response.json()).slice(0, count);
    return {
      images,
      provider: images.length ? 'Pexels' : '',
      warning: images.length < count
        ? `Pexels returned ${images.length} suitable photos for ${count} starter products; remaining products use the local placeholder.`
        : '',
    };
  } catch (_) {
    return {
      images: [],
      provider: '',
      warning: 'Pexels image search was temporarily unavailable, so starter products use the local placeholder image. Tenant creation continued safely.',
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { buildSearchQuery, fetchPexelsPhotos, normalizePexelsPhotos, safePexelsUrl };
