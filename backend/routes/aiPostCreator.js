/**
 * routes/aiPostCreator.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AI POST CREATOR — standalone marketing module
 * ─────────────────────────────────────────────────────────────────────────────
 * NEW, independent feature. Does not modify any existing route, model,
 * controller, or service. Everything below either:
 *   (a) reads existing data through existing, untouched models (Product,
 *       SocialMedia), or
 *   (b) calls existing, untouched service functions
 *       (services/socialMediaService.js, services/publishers/*) exactly the
 *       way services/publisherService.js already does.
 *
 * Endpoints:
 *   GET  /api/ai-post-creator/products          → product list for the picker
 *                                                  (thin wrapper around the
 *                                                  same query shape already
 *                                                  used by /api/products/admin/lookup)
 *   POST /api/ai-post-creator/generate-copy      → { headline, caption, cta, hashtags[] }
 *                                                  Low-token AI call — only
 *                                                  name/category/brand/price/
 *                                                  discount are sent, reusing
 *                                                  the same OpenRouter→Gemini
 *                                                  caller pattern as routes/ai.js.
 *   POST /api/ai-post-creator/upload-creative    → uploads a generated PNG/JPG/
 *                                                  WEBP (base64 data URL) and
 *                                                  returns a public URL, reusing
 *                                                  the existing local/Cloudinary
 *                                                  storage strategy from
 *                                                  routes/upload.js.
 *   GET  /api/ai-post-creator/connected-platforms → which of the 5 existing
 *                                                  social platforms are
 *                                                  connected + enabled (for
 *                                                  the publish dropdown)
 *   POST /api/ai-post-creator/publish            → publish a generated
 *                                                  creative + caption to one
 *                                                  of the existing connected
 *                                                  platforms, using the same
 *                                                  PUBLISHERS[platform].publish()
 *                                                  call publisherService.js uses
 *                                                  — no new credential storage,
 *                                                  no new OAuth, nothing
 *                                                  duplicated.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPLATE MODE (generationMode: "template") — added without modifying any
 * of the above. Server-side PNG-template compositing via Sharp, fully
 * isolated in services/templateRenderer.js. Background removal happens
 * client-side (@imgly/background-removal, WASM) before the cutout reaches
 * these endpoints.
 * ─────────────────────────────────────────────────────────────────────────────
 *   GET  /api/ai-post-creator/templates           → list available PNG
 *                                                  templates (id, label,
 *                                                  thumbnail URL)
 *   GET  /api/ai-post-creator/templates/:id/thumbnail
 *                                                → raw template PNG
 *   POST /api/ai-post-creator/generate-template   → { dataUrl } final
 *                                                  1080x1080 composited PNG
 *                                                  (template + product
 *                                                  cutout + name/price/
 *                                                  discount/CTA/description)
 *
 * All routes require adminAuth, identical to every other admin-only route file.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const sharp   = require('sharp');

const { adminAuth }  = require('../middleware/auth');
const Product         = require('../models/Product');
const PublishLog       = require('../models/PublishLog');
const { getOrCreate, decryptPlatformFields } = require('../services/socialMediaService');

router.use(adminAuth);

/* ══════════════════════════════════════════════════════════════════════════
   GET /api/ai-post-creator/products
   Thin product list for the picker. Reuses the Product model only —
   no schema changes. Mirrors the field selection already used by
   GET /api/products/admin/lookup so behaviour stays consistent.
══════════════════════════════════════════════════════════════════════════ */
router.get('/products', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 24 } = req.query;
    const filter = { isActive: true };
    if (search.trim()) {
      filter.$or = [
        { name:  new RegExp(search.trim(), 'i') },
        { brand: new RegExp(search.trim(), 'i') },
        { sku:   new RegExp(search.trim(), 'i') },
      ];
    }
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .select('name price salePrice thumbnail images brand subCategory category slug isOnSale')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    res.json({
      products: products.map(p => ({
        _id:        p._id,
        name:       p.name,
        price:      p.price,
        salePrice:  p.salePrice || null,
        discount:   p.salePrice && p.price ? Math.round(((p.price - p.salePrice) / p.price) * 100) : 0,
        thumbnail:  p.thumbnail || p.images?.[0] || '',
        images:     p.images || [],
        brand:      p.brand || '',
        category:   p.category?.name || p.subCategory || '',
        slug:       p.slug,
        isOnSale:   !!p.isOnSale,
      })),
      total,
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   AI CALLERS — copied pattern (not a shared import) from routes/ai.js so
   this module stays fully standalone and a future change to routes/ai.js
   can never break post creation, or vice versa.
══════════════════════════════════════════════════════════════════════════ */
async function callOpenRouter(systemMsg, userMsg, maxTokens) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer':  process.env.FRONTEND_URL || 'https://storekit.local',
      'X-Title':       'StoreKit AI Post Creator',
    },
    body: JSON.stringify({
      model:       'meta-llama/llama-3.1-8b-instruct',
      max_tokens:  maxTokens,
      temperature: 0.6,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userMsg   },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(prompt, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function callAI(systemMsg, userMsg, maxTokens = 220) {
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await callOpenRouter(systemMsg, userMsg, maxTokens);
    } catch (err) {
      console.warn('[AI Post Creator] OpenRouter failed, trying Gemini fallback:', err.message);
      if (process.env.GEMINI_API_KEY) return await callGemini(`${systemMsg}\n\n${userMsg}`, maxTokens);
      throw err;
    }
  }
  if (process.env.GEMINI_API_KEY) return callGemini(`${systemMsg}\n\n${userMsg}`, maxTokens);
  throw new Error('No AI key configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in your .env');
}

function extractJSON(raw, type = 'object') {
  const open  = type === 'array' ? '[' : '{';
  const close = type === 'array' ? ']' : '}';
  const start = raw.indexOf(open);
  const end   = raw.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON in AI response: ' + raw.slice(0, 120));
  return JSON.parse(raw.slice(start, end + 1));
}

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/ai-post-creator/generate-copy
   LOW-TOKEN BY DESIGN:
     - Only 5 scalar fields are ever sent to the model (name, category,
       brand, price, discount) — no description, no specs, no images.
     - max_tokens capped at 220 (vs 500-1200 used elsewhere in routes/ai.js).
     - One AI call generates headline + caption + CTA + hashtags together,
       instead of 4 separate calls.
══════════════════════════════════════════════════════════════════════════ */
router.post('/generate-copy', async (req, res) => {
  const { name, category, brand, price, discount, template } = req.body || {};
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ message: 'Product name is required' });
  }

  // Hard cap on what reaches the model — essential fields only.
  const essential = {
    name:     String(name).trim().slice(0, 120),
    category: category ? String(category).trim().slice(0, 60) : '',
    brand:    brand    ? String(brand).trim().slice(0, 60)    : '',
    price:    Number(price)    || 0,
    discount: Number(discount) || 0,
  };

  const templateTone = {
    sale:        'urgent savings, money-conscious shoppers',
    new_arrival: 'fresh, exciting, "just dropped" energy',
    best_seller: 'social proof, trusted, popular choice',
    flash_sale:  'extreme urgency, countdown, limited time',
  }[template] || 'engaging, professional e-commerce marketing';

  const systemMsg = 'You are a social media marketing copywriter for an e-commerce store. You output ONLY valid JSON. No markdown. No explanation.';
  const userMsg = [
    `Write social media post copy for this product. Tone: ${templateTone}.`,
    `Product: ${essential.name}`,
    essential.brand    ? `Brand: ${essential.brand}` : '',
    essential.category ? `Category: ${essential.category}` : '',
    essential.price    ? `Price: LKR ${essential.price}` : '',
    essential.discount > 0 ? `Discount: ${essential.discount}% off` : '',
    '',
    'Reply ONLY with this JSON:',
    '{"headline":"...","caption":"...","cta":"...","hashtags":["...","..."]}',
    '',
    'Rules:',
    '- headline: max 8 words, punchy, no emoji spam (1 emoji max)',
    '- caption: 1-2 short sentences, max 160 characters, conversational',
    '- cta: 2-4 words, action phrase (e.g. "Shop Now", "Grab the Deal")',
    '- hashtags: exactly 6 lowercase hashtags WITHOUT the # symbol, mix of product/brand/category/generic shopping tags',
    '- No markdown, no asterisks, plain text only',
  ].filter(Boolean).join('\n');

  try {
    const raw = await callAI(systemMsg, userMsg, 220);
    const parsed = extractJSON(raw, 'object');
    res.json({
      headline: (parsed.headline || essential.name).toString().slice(0, 80),
      caption:  (parsed.caption  || '').toString().slice(0, 200),
      cta:      (parsed.cta      || 'Shop Now').toString().slice(0, 30),
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map(t => String(t).replace(/[^a-z0-9]/gi, '').toLowerCase()).filter(Boolean).slice(0, 6)
        : [],
    });
  } catch (err) {
    console.error('[AI Post Creator /generate-copy]', err.message);
    res.status(500).json({ message: 'AI copy generation failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/ai-post-creator/upload-creative
   Accepts a generated creative as a base64 data URL (produced client-side
   by <canvas>.toDataURL()) and stores it using the SAME storage strategy
   routes/upload.js already uses (Cloudinary if configured, else local disk
   under /uploads). No new storage system introduced.
══════════════════════════════════════════════════════════════════════════ */
const USE_CLOUDINARY =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY    &&
  process.env.CLOUDINARY_API_SECRET;

let cloudinary;
if (USE_CLOUDINARY) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

function localUrl(req, filename) {
  if (process.env.BACKEND_URL) {
    let base = process.env.BACKEND_URL.trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
    return `${base}/uploads/${filename}`;
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.get('host');
  return `${proto}://${host}/uploads/${filename}`;
}

router.post('/upload-creative', async (req, res) => {
  try {
    const { dataUrl, format = 'png' } = req.body || {};
    if (!dataUrl || !/^data:image\/(png|jpe?g|webp);base64,/.test(dataUrl)) {
      return res.status(400).json({ message: 'A valid base64 image data URL is required' });
    }
    const safeFormat = ['png', 'jpg', 'jpeg', 'webp'].includes(format) ? format : 'png';
    const base64Data = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    // 10MB ceiling — same limit as routes/upload.js
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ message: 'Creative is too large (max 10MB)' });
    }

    if (USE_CLOUDINARY) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'storekit/ai-post-creator', public_id: `creative-${Date.now()}-${Math.round(Math.random() * 1e9)}`, format: safeFormat },
          (err, r) => (err ? reject(err) : resolve(r))
        );
        const { Readable } = require('stream');
        Readable.from(buffer).pipe(stream);
      });
      return res.json({ url: result.secure_url });
    }

    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `aipc-${Date.now()}-${Math.round(Math.random() * 1e9)}.${safeFormat}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);
    res.json({ url: localUrl(req, filename) });
  } catch (err) {
    console.error('[AI Post Creator /upload-creative]', err.message);
    res.status(500).json({ message: 'Failed to store creative: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/ai-post-creator/generate-photoreal
   "Photoreal" template mode — OPT-IN, separate from the default flat-design
   canvas templates above. Uses image-to-image generation (the real product
   thumbnail is sent as an input image, not regenerated from scratch) via
   OpenRouter's Gemini "Nano Banana" image models, reusing the SAME
   OPENROUTER_API_KEY already configured for text generation. No new
   credential, no new SDK dependency — plain fetch, same as callOpenRouter()
   above.

   This is intentionally a SEPARATE, explicitly-triggered endpoint (not bundled
   into /generate-copy) because image generation has meaningfully higher cost
   and latency than the text endpoints — the frontend only calls this when the
   admin opts into "Photoreal" mode, never automatically.

   Returns a base64 PNG data URL the frontend can preview immediately and
   upload via the existing /upload-creative endpoint if the admin keeps it.
══════════════════════════════════════════════════════════════════════════ */
// Primary + fallback image models. OpenRouter periodically retires/renames
// model slugs (this is exactly what caused the original 404 — the
// "-preview" variant was promoted to GA and the preview slug removed from
// the catalog). If the primary slug ever 404s again, automatically retry
// once against the fallback rather than failing outright.
const PHOTOREAL_IMAGE_MODEL          = 'google/gemini-2.5-flash-image';
const PHOTOREAL_IMAGE_MODEL_FALLBACK = 'google/gemini-3.1-flash-image-preview';

const PHOTOREAL_TEMPLATE_BRIEF = {
  sale:        'a bold seasonal SALE promotion, energetic and value-focused',
  new_arrival: 'a premium NEW ARRIVAL launch moment, fresh and exciting',
  best_seller: 'a trusted BEST SELLER showcase, confident and popular',
  flash_sale:  'an urgent FLASH SALE countdown moment, high energy and time-pressured',
};

async function requestImageFromModel(model, { prompt, productImageUrl }) {
  const content = [{ type: 'text', text: prompt }];
  if (productImageUrl) {
    content.push({ type: 'image_url', image_url: { url: productImageUrl } });
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer':  process.env.FRONTEND_URL || 'https://storekit.local',
      'X-Title':       'StoreKit AI Post Creator - Photoreal',
    },
    body: JSON.stringify({
      model,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content }],
      image_config: { aspect_ratio: '4:5', image_size: '1K' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`Image model error ${res.status}: ${errText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const images = data.choices?.[0]?.message?.images;
  const dataUrl = images?.[0]?.image_url?.url;
  if (!dataUrl) throw new Error('Image model returned no image — try again or adjust the prompt');
  return dataUrl;
}

async function callOpenRouterImage({ prompt, productImageUrl }) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('Photoreal generation requires OPENROUTER_API_KEY to be set in your .env');
  }
  try {
    return await requestImageFromModel(PHOTOREAL_IMAGE_MODEL, { prompt, productImageUrl });
  } catch (err) {
    // Only fall back on "model unavailable"-type errors (404), not on
    // content/validation errors (4xx from a bad prompt) or auth errors.
    if (err.status === 404) {
      console.warn(`[AI Post Creator] "${PHOTOREAL_IMAGE_MODEL}" unavailable, retrying with fallback model`);
      return await requestImageFromModel(PHOTOREAL_IMAGE_MODEL_FALLBACK, { prompt, productImageUrl });
    }
    throw err;
  }
}

router.post('/generate-photoreal', async (req, res) => {
  const { name, category, brand, price, discount, template, badgeLabel, headline, productImageUrl, storeName } = req.body || {};

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ message: 'Product name is required' });
  }
  if (!productImageUrl) {
    return res.status(400).json({ message: 'A product image is required for photoreal generation' });
  }

  const brief = PHOTOREAL_TEMPLATE_BRIEF[template] || 'a clean, professional e-commerce promotion';
  const discountLine = Number(discount) > 0 ? `Show a discount callout of "${Number(discount)}% OFF" as a bold tag/sticker in the scene.` : '';
  const priceLine = price ? `The product price (Rs. ${Number(price).toLocaleString()}) may appear as small text near the product, styled like premium packaging signage.` : '';

  const prompt = [
    `Create a professional, photorealistic e-commerce social media advertisement for this exact product (use the attached product photo as the real product — keep it recognizable and unaltered in shape/branding, only change the surrounding scene, lighting and composition).`,
    `Scene: ${brief}.`,
    `Style: realistic studio product photography, dramatic soft lighting, dark moody background with subtle depth-of-field bokeh, the product placed on a pedestal or clean surface, premium and modern, similar to a high-end e-commerce marketing banner.`,
    `Include bold, legible display typography for the headline "${headline || name}" integrated tastefully into the composition (not overlapping the product), and a small badge/sticker reading "${(badgeLabel || template || 'OFFER').toString().toUpperCase()}".`,
    discountLine,
    priceLine,
    `Include the store name "${storeName || 'StoreKit'}" somewhere subtle in the composition, styled like a logo wordmark.`,
    `Product: ${name}. ${brand ? `Brand: ${brand}.` : ''} ${category ? `Category: ${category}.` : ''}`,
    `Do not distort, mislabel, or alter the actual product packaging text — only the surrounding scene and added marketing text should be generated.`,
    `Vertical social-media-ready composition, high resolution, no watermarks.`,
  ].filter(Boolean).join(' ');

  try {
    const dataUrl = await callOpenRouterImage({ prompt, productImageUrl });
    res.json({ dataUrl });
  } catch (err) {
    console.error('[AI Post Creator /generate-photoreal]', err.message);
    res.status(500).json({ message: 'Photoreal generation failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   ████████████████████████████████████████████████████████████████████████
   TEMPLATE MODE — standalone, server-side PNG-template generation flow
   ████████████████████████████████████████████████████████████████████████

   generationMode: "template" (vs the existing "ai" flow above, which is
   left completely untouched). This section:
     - never imports from, calls, or mutates anything in the AI flow above
       (callAI / callOpenRouter / callGemini / generate-photoreal / etc.)
     - uses its own isolated rendering engine: services/templateRenderer.js
       (Sharp-based compositing, no node-canvas dependency)
     - background removal happens CLIENT-SIDE in the browser via
       @imgly/background-removal (WASM) — the frontend sends the already
       background-removed PNG cutout here as a base64 data URL; this
       endpoint never calls any background-removal library itself
     - template backgrounds + position configs live in
       backend/templates/assets/*.png and backend/templates/configs/*.json,
       loaded via templateRenderer.listTemplates()/getTemplateConfig()

   Endpoints:
     GET  /api/ai-post-creator/templates              → list available
                                                          templates (id,
                                                          label, thumbnail)
     GET  /api/ai-post-creator/templates/:id/thumbnail → serves the raw
                                                          template PNG so
                                                          the picker UI can
                                                          show real previews
     POST /api/ai-post-creator/generate-template       → { dataUrl } a
                                                          rendered 1080x1080
                                                          PNG composited from
                                                          the chosen template
                                                          + product cutout +
                                                          form data
══════════════════════════════════════════════════════════════════════════ */
const {
  renderTemplate: renderTemplateMode,
  listTemplates: listTemplateModeTemplates,
  getTemplateAssetPath: getTemplateModeAssetPath,
} = require('../services/templateRenderer');

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/ai-post-creator/remove-background
   Server-side background removal using sharp — no external API needed.
   Accepts: { imageUrl } — relative (/uploads/...) or absolute Cloudinary URL.
   Returns: { dataUrl } — PNG with transparent background as base64 data URL.

   Algorithm: corner-colour flood-fill masking
     1. Sample the 4 corner pixels → determine background colour.
     2. Walk every pixel; those within TOLERANCE of the bg colour get their
        alpha reduced (smooth fade at edge of tolerance = anti-alias).
     3. Re-encode as PNG with alpha.
══════════════════════════════════════════════════════════════════════════ */
router.post('/remove-background', async (req, res) => {
  try {
    const { imageUrl } = req.body || {};
    if (!imageUrl) return res.status(400).json({ message: 'imageUrl is required' });

    let inputBuffer;

    // Detect URLs that point back at OUR OWN server (e.g.
    // https://<this-backend>.up.railway.app/uploads/xyz.jpg). In production
    // these used to be re-fetched over the public internet, which can come
    // back as "HTTP 403 fetching image" depending on the platform's edge/
    // proxy behaviour. Since these files live on our own disk, read them
    // directly — same as the existing local /uploads/... branch — and skip
    // the network round-trip entirely. Only genuinely external URLs (e.g.
    // Cloudinary) go over HTTP.
    const path = require('path');
    const fs = require('fs');
    const uploadsDir = path.join(__dirname, '../uploads');

    function localUploadsPathFor(url) {
      try {
        const u = new URL(url, 'http://placeholder.local');
        if (!u.pathname.startsWith('/uploads/')) return null;
        const filename = u.pathname.replace(/^\/uploads\//, '');
        return path.join(uploadsDir, filename);
      } catch {
        return null;
      }
    }

    const isAbsoluteUrl = imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
    const ownServerPath = isAbsoluteUrl ? localUploadsPathFor(imageUrl) : null;

    // TEMP DIAGNOSTIC LOGGING — remove once the 403 cause is confirmed.
    console.log(`[remove-background] imageUrl received: ${imageUrl}`);
    console.log(`[remove-background] branch: ${ownServerPath ? 'own-server-disk' : isAbsoluteUrl ? 'external-http' : 'relative-disk'}`);

    if (ownServerPath) {
      // Absolute URL, but it's our own /uploads/... file — read from disk.
      if (!fs.existsSync(ownServerPath)) {
        return res.status(404).json({ message: `Image file not found: ${path.basename(ownServerPath)}` });
      }
      inputBuffer = fs.readFileSync(ownServerPath);
    } else if (isAbsoluteUrl) {
      // Genuinely external URL (e.g. Cloudinary) — fetch with Node built-in
      // https, following redirects (Cloudinary can redirect between hosts).
      inputBuffer = await new Promise((resolve, reject) => {
        function doFetch(url, redirectsLeft) {
          const mod = url.startsWith('https') ? require('https') : require('http');
          const req = mod.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; ShopzenBot/1.0; +backend-image-fetch)',
              'Accept': 'image/*'
            }
          }, resp => {
            console.log(`[remove-background] fetch status ${resp.statusCode} for ${url}`);
            if ([301, 302, 303, 307, 308].includes(resp.statusCode) && resp.headers.location && redirectsLeft > 0) {
              resp.resume(); // discard body
              const nextUrl = new URL(resp.headers.location, url).toString();
              console.log(`[remove-background] following redirect to ${nextUrl}`);
              return doFetch(nextUrl, redirectsLeft - 1);
            }
            if (resp.statusCode !== 200) {
              console.log(`[remove-background] non-200 response headers:`, resp.headers);
              return reject(new Error(`HTTP ${resp.statusCode} fetching image`));
            }
            const chunks = [];
            resp.on('data', c => chunks.push(c));
            resp.on('end', () => resolve(Buffer.concat(chunks)));
            resp.on('error', reject);
          });
          req.on('error', err => {
            console.log(`[remove-background] request error:`, err.message);
            reject(err);
          });
        }
        doFetch(imageUrl, 5);
      });
    } else {
      // Relative /uploads/... — read directly from disk, no HTTP round-trip
      const rel = imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl;
      const filename = rel.replace(/^\/uploads\//, '');
      const localPath = path.join(uploadsDir, filename);
      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ message: `Image file not found: ${filename}` });
      }
      inputBuffer = fs.readFileSync(localPath);
    }

    // Decode to raw RGBA
    const pipeline = sharp(inputBuffer).ensureAlpha();
    const { width, height } = await pipeline.clone().metadata();
    const rawBuf = await pipeline.raw().toBuffer();

    const stride = 4; // RGBA bytes per pixel
    const out = Buffer.from(rawBuf);

    // ── Helpers ────────────────────────────────────────────────────────────
    function getPixel(x, y) {
      const o = (y * width + x) * stride;
      return { r: out[o], g: out[o + 1], b: out[o + 2], a: out[o + 3] };
    }
    function colorDist(a, b) {
      return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
    }

    // ── Step 1: determine background colour from ALL border pixels (median) ─
    // Sampling the entire border (not just 4 corners) gives a much more
    // reliable background estimate, especially when a product touches a corner.
    const borderSamples = [];
    for (let x = 0; x < width; x++) {
      borderSamples.push(getPixel(x, 0));
      borderSamples.push(getPixel(x, height - 1));
    }
    for (let y = 1; y < height - 1; y++) {
      borderSamples.push(getPixel(0, y));
      borderSamples.push(getPixel(width - 1, y));
    }
    const sortedR = borderSamples.map(p => p.r).sort((a, b) => a - b);
    const sortedG = borderSamples.map(p => p.g).sort((a, b) => a - b);
    const sortedB = borderSamples.map(p => p.b).sort((a, b) => a - b);
    const mid = Math.floor(borderSamples.length / 2);
    const bg = { r: sortedR[mid], g: sortedG[mid], b: sortedB[mid] };

    // ── Step 2: BFS flood-fill from ALL border pixels ─────────────────────
    // Only pixels reachable FROM THE BORDER that are within TOLERANCE of the
    // bg colour are marked as background. This is the critical difference vs
    // the old per-pixel scan:
    //   • Product text/labels in the centre of the image: NOT reached by the
    //     flood-fill → preserved, even if they happen to be a similar colour.
    //   • Text printed on the background region (e.g. captions around the
    //     product): IS reached because BFS walks through surrounding bg pixels
    //     and text pixels close to bg colour are included in the removal zone.
    const TOLERANCE = 55; // colour distance 0–441; handles anti-aliased edges
    const visited = new Uint8Array(width * height); // 1 = background pixel
    const queue   = [];

    function tryEnqueue(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const idx = y * width + x;
      if (visited[idx]) return;
      const p = getPixel(x, y);
      if (colorDist(p, bg) < TOLERANCE) {
        visited[idx] = 1;
        queue.push(idx);
      }
    }

    for (let x = 0; x < width; x++) { tryEnqueue(x, 0); tryEnqueue(x, height - 1); }
    for (let y = 1; y < height - 1; y++) { tryEnqueue(0, y); tryEnqueue(width - 1, y); }

    // BFS — 4-connected neighbours
    let qi = 0;
    while (qi < queue.length) {
      const idx = queue[qi++];
      const x = idx % width;
      const y = (idx / width) | 0;
      tryEnqueue(x - 1, y); tryEnqueue(x + 1, y);
      tryEnqueue(x, y - 1); tryEnqueue(x, y + 1);
    }

    // ── Step 3: apply transparency to flood-filled (background) pixels ─────
    // Smooth alpha fade at the colour-distance boundary = anti-aliased edges.
    for (let i = 0; i < width * height; i++) {
      if (!visited[i]) continue;
      const o = i * stride;
      const p = { r: out[o], g: out[o + 1], b: out[o + 2] };
      const d = colorDist(p, bg);
      const alpha = Math.round((d / TOLERANCE) * 255);
      out[o + 3] = Math.min(out[o + 3], alpha);
    }

    // ── Step 4: keep ONLY the largest opaque blob (main product) ──────────
    // After flood-fill, badges, logos, and other elements that were enclosed
    // by background pixels remain as isolated opaque islands (e.g. a Qi2
    // badge, a brand badge, shadow ellipses). We find every connected
    // component of still-opaque pixels, identify the LARGEST one (which is
    // always the main product silhouette), and erase everything else.
    // No arbitrary size threshold needed — largest-wins is reliable.

    const labeled = new Int32Array(width * height).fill(-1);
    let   label   = 0;
    const compPixels = []; // compPixels[label] = array of pixel indices in that component

    for (let start = 0; start < width * height; start++) {
      const so = start * stride;
      if (out[so + 3] < 20)       continue; // already transparent — skip
      if (labeled[start] !== -1) continue; // already part of a component

      // BFS for this opaque component
      const comp = [start];
      labeled[start] = label;
      let ci = 0;
      while (ci < comp.length) {
        const idx = comp[ci++];
        const cx  = idx % width;
        const cy  = (idx / width) | 0;
        const neighbours = [cx - 1, cy, cx + 1, cy, cx, cy - 1, cx, cy + 1];
        for (let ni = 0; ni < neighbours.length; ni += 2) {
          const nx = neighbours[ni], ny = neighbours[ni + 1];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nidx = ny * width + nx;
          if (labeled[nidx] !== -1) continue;
          const no = nidx * stride;
          if (out[no + 3] < 20) continue; // transparent — not in this component
          labeled[nidx] = label;
          comp.push(nidx);
        }
      }
      compPixels[label] = comp;
      label++;
    }

    // Find the label with the most pixels = main product
    let largestLabel = -1;
    let largestSize  = 0;
    for (let l = 0; l < label; l++) {
      if (compPixels[l].length > largestSize) {
        largestSize  = compPixels[l].length;
        largestLabel = l;
      }
    }

    // Erase every component that is NOT the main product (badges, logos, shadows)
    for (let i = 0; i < width * height; i++) {
      const lbl = labeled[i];
      if (lbl === -1) continue;           // already transparent
      if (lbl === largestLabel) continue; // main product — keep
      const o = i * stride;
      out[o + 3] = 0;
    }

    // ── Step 5: encode and return ──────────────────────────────────────────
    const resultBuf = await sharp(out, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 6 })
      .toBuffer();

    res.json({ dataUrl: `data:image/png;base64,${resultBuf.toString('base64')}` });

  } catch (err) {
    console.error('[remove-background]', err.message, '| imageUrl:', req.body?.imageUrl);
    res.status(500).json({ message: err.message });
  }
});

router.get('/templates', (req, res) => {
  try {
    res.json({ templates: listTemplateModeTemplates() });
  } catch (err) {
    console.error('[AI Post Creator /templates]', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/templates/:id/thumbnail', (req, res) => {
  try {
    const assetPath = getTemplateModeAssetPath(req.params.id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    require('fs').createReadStream(assetPath).pipe(res);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

router.post('/generate-template', async (req, res) => {
  try {
    const {
      templateId,
      productImageDataUrl, // background-removed cutout, produced client-side by @imgly/background-removal
      name, price, originalPrice, discount, cta, description,
    } = req.body || {};

    if (!templateId) {
      return res.status(400).json({ message: 'templateId is required' });
    }
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ message: 'Product name is required' });
    }
    if (!productImageDataUrl || !/^data:image\/png;base64,/.test(productImageDataUrl)) {
      return res.status(400).json({ message: 'A background-removed product image (PNG data URL) is required' });
    }

    const base64Data = productImageDataUrl.split(',')[1];
    const productImageBuffer = Buffer.from(base64Data, 'base64');

    // 10MB ceiling — consistent with /upload-creative below
    if (productImageBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ message: 'Product image is too large (max 10MB)' });
    }

    const pngBuffer = await renderTemplateMode(templateId, {
      productImageBuffer,
      name: String(name).trim().slice(0, 120),
      price: Number(price) || 0,
      originalPrice: Number(originalPrice) || 0,
      discount: Number(discount) || 0,
      cta: cta ? String(cta).trim().slice(0, 30) : 'Shop Now',
      description: description ? String(description).trim().slice(0, 140) : '',
    });

    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    res.json({ dataUrl });
  } catch (err) {
    console.error('[AI Post Creator /generate-template]', err.message);
    res.status(500).json({ message: 'Template generation failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   GET /api/ai-post-creator/connected-platforms
   Reads the EXISTING SocialMedia settings document (no new collection) and
   returns only which of the 5 already-integrated platforms are connected +
   enabled, so the publish dropdown only ever shows real, usable options.
   Shared by BOTH AI Mode and Template Mode — read-only, no mode-specific
   logic, so isolation between the two flows is unaffected.
══════════════════════════════════════════════════════════════════════════ */
const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'telegram'];

router.get('/connected-platforms', async (req, res) => {
  try {
    const doc = await getOrCreate();
    const plain = doc.toObject ? doc.toObject() : doc;
    const platforms = SUPPORTED_PLATFORMS
      .map(p => ({
        platform:    p,
        connected:   !!plain[p]?.connected,
        enabled:     !!plain[p]?.enabled,
        accountName: plain[p]?.accountName || '',
      }))
      .filter(p => p.connected && p.enabled);
    res.json({ platforms });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/ai-post-creator/publish
   Publishes a generated creative directly, using the SAME platform
   publisher modules (services/publishers/*) that services/publisherService.js
   already uses for every other publish flow. Bypasses postComposer.js on
   purpose — the creative + caption are already fully composed client-side
   by the AI Post Creator UI, so we hand the publisher exactly the payload
   shape it already expects: { text, imageUrl, imageUrls, productUrl }.
   Every publish attempt is logged into the SAME PublishLog collection used
   elsewhere, with entityType 'custom' so it's clearly distinguishable in
   existing publish-history views without altering their query logic.
══════════════════════════════════════════════════════════════════════════ */
const PUBLISHERS = {
  facebook:  require('../services/publishers/facebook'),
  instagram: require('../services/publishers/instagram'),
  tiktok:    require('../services/publishers/tiktok'),
  whatsapp:  require('../services/publishers/whatsapp'),
  telegram:  require('../services/publishers/telegram'),
};

router.post('/publish', async (req, res) => {
  const { platform, imageUrl, caption, productUrl, productName } = req.body || {};
  const t0 = Date.now();

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return res.status(400).json({ message: `Unsupported platform: ${platform}` });
  }
  if (!imageUrl) {
    return res.status(400).json({ message: 'imageUrl is required — generate and upload the creative first' });
  }

  const base = {
    trigger:     'manual',
    triggeredBy: `admin:${req.user?._id || req.user?.id || 'unknown'}`,
    platform,
    entityType:  'custom',
    entityId:    null,
    entityName:  productName || 'AI Post Creator creative',
    attemptNumber: 1,
    isRetry: false,
  };

  try {
    const doc = await getOrCreate();
    const raw = JSON.parse(JSON.stringify(doc[platform]?.toObject?.({ virtuals: false }) ?? doc[platform] ?? {}));
    const creds = decryptPlatformFields(raw);
    if (!creds.connected) throw new Error(`${platform} is not connected. Connect it in Social Media settings first.`);
    if (!creds.enabled)   throw new Error(`${platform} is currently disabled in Social Media settings.`);

    const payload = {
      text:       caption || '',
      imageUrl,
      imageUrls:  [imageUrl],
      productUrl: productUrl || '',
    };

    const result = await PUBLISHERS[platform].publish(creds, payload);

    const log = await PublishLog.create({
      ...base,
      postText:       payload.text,
      imageUrl:       payload.imageUrl,
      status:         'success',
      platformPostId: result.platformPostId || '',
      durationMs:     Date.now() - t0,
    });

    res.json({ success: true, platformPostId: result.platformPostId || '', logId: log._id });
  } catch (err) {
    console.error(`[AI Post Creator /publish] ${platform} error:`, err.message);
    await PublishLog.create({
      ...base,
      postText:     caption || '',
      imageUrl:     imageUrl || '',
      status:       'failed',
      errorMessage: err.message,
      errorCode:    'AI_POST_CREATOR_ERROR',
      durationMs:   Date.now() - t0,
    });
    res.status(500).json({ success: false, message: err.message });
  }
});


/* ══════════════════════════════════════════════════════════════════════════
   SAVED PRESETS — localStorage-synced on the client, but also stored
   server-side (in memory / optionally persisted) so presets survive
   browser clears and work across devices for the same admin.
   Uses a simple in-memory Map per admin user (keyed by req.user._id).
   Production: swap the Map for a MongoDB collection or Settings subdoc.
══════════════════════════════════════════════════════════════════════════ */
const _presetsStore = new Map(); // userId → [{ id, name, data }]

function getPresetsForUser(userId) {
  return _presetsStore.get(String(userId)) || [];
}
function setPresetsForUser(userId, list) {
  _presetsStore.set(String(userId), list);
}

/**
 * GET /api/ai-post-creator/presets
 * Returns all saved presets for the current admin.
 */
router.get('/presets', (req, res) => {
  try {
    const userId  = req.user?._id || req.user?.id || 'default';
    const presets = getPresetsForUser(userId);
    res.json({ presets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/ai-post-creator/presets
 * Body: { name: string, data: object }
 * Saves a new named preset. Returns the full updated list.
 */
router.post('/presets', (req, res) => {
  try {
    const userId  = req.user?._id || req.user?.id || 'default';
    const { name, data } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Preset name is required' });
    }
    const newPreset = { id: Date.now(), name: String(name).trim().slice(0, 60), data: data || {} };
    const existing  = getPresetsForUser(userId);
    // Replace if same name exists
    const filtered  = existing.filter(p => p.name !== newPreset.name);
    const updated   = [newPreset, ...filtered].slice(0, 30); // max 30 presets
    setPresetsForUser(userId, updated);
    res.json({ preset: newPreset, presets: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/ai-post-creator/presets/:id
 * Deletes a preset by its numeric id.
 */
router.delete('/presets/:id', (req, res) => {
  try {
    const userId  = req.user?._id || req.user?.id || 'default';
    const id      = Number(req.params.id);
    const existing = getPresetsForUser(userId);
    const updated  = existing.filter(p => p.id !== id);
    setPresetsForUser(userId, updated);
    res.json({ deleted: true, presets: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;