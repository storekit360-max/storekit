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

function buildProductSearchQuery(brief = {}, product = {}) {
  const name = clean(product.name, 90);
  const category = clean(product.categorySlug || product.category, 45).replace(/-/g, ' ');
  const description = clean(product.shortDescription, 80);
  const business = clean(brief.businessType, 45);
  return [name, category, description, business, 'isolated product commercial photography']
    .filter(Boolean)
    .join(' ')
    .slice(0, 240);
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
      id: photo?.id || null,
      alt: clean(photo?.alt, 180),
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

async function searchPexels(apiKey, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const params = new URLSearchParams({
      query,
      per_page: '6',
      orientation: 'square',
      size: 'medium',
    });
    const response = await fetch(`${PEXELS_API_URL}?${params}`, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Pexels request failed (${response.status})`);
    return normalizePexelsPhotos(await response.json());
  } finally {
    clearTimeout(timer);
  }
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

  const selectedProducts = (Array.isArray(products) ? products : []).slice(0, count);
  const images = new Array(selectedProducts.length).fill(null);
  const usedSources = new Set();
  let cursor = 0;
  try {
    // Search each item independently. A broad catalogue query can return a
    // beautiful set but associate the wrong object with individual products.
    const worker = async () => {
      while (cursor < selectedProducts.length) {
        const index = cursor;
        cursor += 1;
        const query = buildProductSearchQuery(brief, selectedProducts[index]);
        let candidates = [];
        try {
          // eslint-disable-next-line no-await-in-loop
          candidates = await searchPexels(apiKey, query);
        } catch (_) {
          // One unavailable search should not discard accurate images already
          // resolved for the other products.
        }
        const chosen = candidates.find(candidate => !usedSources.has(candidate.attribution?.sourceUrl)) || candidates[0] || null;
        if (chosen) {
          images[index] = chosen;
          usedSources.add(chosen.attribution?.sourceUrl);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, selectedProducts.length || 1) }, () => worker()));
    const matched = images.filter(Boolean).length;
    return {
      images,
      provider: matched ? 'Pexels' : '',
      warning: matched < selectedProducts.length
        ? `Pexels returned ${matched} item-specific photos for ${selectedProducts.length} starter products; remaining products use the local placeholder.`
        : '',
    };
  } catch (_) {
    return {
      images: [],
      provider: '',
      warning: 'Pexels image search was temporarily unavailable, so starter products use the local placeholder image. Tenant creation continued safely.',
    };
  }
}

module.exports = { buildProductSearchQuery, buildSearchQuery, fetchPexelsPhotos, normalizePexelsPhotos, safePexelsUrl };
