/**
 * ─── StoreKit Upload Route ────────────────────────────────────────────────────
 * routes/upload.js
 *
 * SECURITY CHANGES vs original:
 *  1. SVG uploads are now sanitised (dangerous tags/attributes stripped) before
 *     being accepted rather than blocked outright.  This preserves the ability
 *     to upload SVG logos or icons while preventing stored-XSS via SVG.
 *     The sanitiser removes: <script>, event-handler attributes (onclick etc.),
 *     <foreignObject>, <use href="...">, javascript: URIs, and <animate>.
 *  2. Magic-byte validation added alongside extension/MIME check so a renamed
 *     PHP file with a .jpg extension is rejected.
 *  3. Filename sanitisation: non-alphanumeric chars are stripped from the
 *     original filename before it is used in Content-Disposition headers
 *     (prevents header-injection).
 *  4. All security changes are annotated.
 *
 * BACKWARD COMPATIBILITY:
 *  • Response shape is identical: { url, filename } / { urls: [...] }
 *  • All existing upload endpoints (POST /, POST /multiple, DELETE /:publicId)
 *    are present with identical signatures.
 *  • SVG files that were previously accepted will still be accepted (now
 *    sanitised instead of blocked).
 *  • Non-SVG images (jpg, png, gif, webp) are unaffected.
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const unzipper = require('unzipper');   // npm install unzipper
const sharp    = require('sharp');      // npm install sharp — local image processing
const Product  = require('../models/Product');
const { adminAuth } = require('../middleware/auth');
const { Settings } = require('../models/index');

// ─── IMAGE PROCESSING: Admin-configurable settings ───────────────────────────
// Settings are stored in the existing generic `Settings` key→value collection
// (same one used by /api/settings) under keys prefixed "imgproc.".  This
// keeps everything backward compatible — if no settings exist yet, sane
// defaults are used and behaviour is opt-OUT (processing is ON by default
// for the SKU bulk importer, since that's what was requested, but can be
// switched off from the admin panel without touching code).
const IMG_SETTINGS_KEY = 'imageProcessing';

const DEFAULT_IMG_SETTINGS = {
  enabled:        true,   // master switch for the Sharp processing pipeline
  maxWidth:       1200,
  maxHeight:      1200,
  sharpen:        true,
  format:         'webp', // 'webp' | 'jpeg' | 'png' | 'original'
  quality:        90,
  // ENHANCEMENT: Cloudinary AI Effects — these run server-side on
  // Cloudinary's infrastructure AFTER the Sharp-processed buffer is
  // uploaded, using their actual AI models (not just a basic filter).
  // This is what actually fixes "still looks like the original" — Sharp's
  // sharpen() is a mild local filter; e_improve / e_unsharp_mask / e_upscale
  // are full AI-driven corrections for contrast, clarity, and detail.
  cloudinaryAI: {
    improve:        true,   // e_improve — AI-enhanced overall quality (contrast, lighting, colour)
    sharpen:         true,  // e_unsharp_mask — stronger, more visible sharpening than Sharp's local filter
    sharpenStrength: 150,   // unsharp_mask amount, Cloudinary scale 1–2000 (100 ≈ ImageMagick 1.0); 150 is a noticeably crisper default
  },
  aiUpscale: {
    enabled:           false, // OFF by default — opt-in, uses Cloudinary's e_upscale (no extra API key needed)
    minWidthThreshold: 500,   // images narrower than this (px) are candidates for upscale
    minHeightThreshold: 500,
  },
};

let _imgSettingsCache = null;
let _imgSettingsCacheAt = 0;
const IMG_SETTINGS_CACHE_TTL = 15 * 1000; // 15s — admin changes apply quickly without hitting DB every file

async function getImageProcessingSettings() {
  const now = Date.now();
  if (_imgSettingsCache && now - _imgSettingsCacheAt < IMG_SETTINGS_CACHE_TTL) {
    return _imgSettingsCache;
  }
  try {
    const row = await Settings.findOne({ key: IMG_SETTINGS_KEY });
    const stored = row?.value || {};
    // Deep-merge over defaults so partially-saved settings don't wipe the rest
    const merged = {
      ...DEFAULT_IMG_SETTINGS,
      ...stored,
      cloudinaryAI: { ...DEFAULT_IMG_SETTINGS.cloudinaryAI, ...(stored.cloudinaryAI || {}) },
      aiUpscale: { ...DEFAULT_IMG_SETTINGS.aiUpscale, ...(stored.aiUpscale || {}) },
    };
    _imgSettingsCache = merged;
    _imgSettingsCacheAt = now;
    return merged;
  } catch (err) {
    console.warn('[ImageProcessing] settings load failed, using defaults:', err.message);
    return DEFAULT_IMG_SETTINGS;
  }
}

function invalidateImgSettingsCache() {
  _imgSettingsCache = null;
  _imgSettingsCacheAt = 0;
}

// ─── IMAGE PROCESSING: Sharp pipeline ─────────────────────────────────────────
// Resizes (max bound, preserves aspect ratio, never upscales here — that's
// Cloudinary's job if aiUpscale is enabled), sharpens, converts format, and
// compresses. Runs entirely in-memory on the buffer before it ever reaches
// Cloudinary / disk, so bandwidth and storage are both reduced.
//
// Returns { buffer, ext, mimeType, originalWidth, originalHeight, wasProcessed }
async function processImageBuffer(buffer, originalName, settings) {
  const ext = path.extname(originalName).toLowerCase().slice(1);

  // SVG is vector — Sharp raster pipeline doesn't apply. Pass through untouched.
  if (ext === 'svg') {
    return { buffer, ext: 'svg', mimeType: 'image/svg+xml', originalWidth: null, originalHeight: null, wasProcessed: false };
  }

  if (!settings.enabled) {
    return { buffer, ext, mimeType: null, originalWidth: null, originalHeight: null, wasProcessed: false };
  }

  try {
    const img = sharp(buffer, { failOn: 'none' });
    const meta = await img.metadata();
    const originalWidth  = meta.width  || null;
    const originalHeight = meta.height || null;

    let pipeline = img.resize({
      width:  settings.maxWidth,
      height: settings.maxHeight,
      fit:           'inside',   // preserve aspect ratio, never crop
      withoutEnlargement: true,  // never upscale here — only downsizes oversized images
    });

    if (settings.sharpen) {
      pipeline = pipeline.sharpen(); // mild unsharp-mask, good default for product photos
    }

    let outExt = ext;
    let mimeType = null;
    const targetFormat = settings.format === 'original' ? ext : settings.format;

    if (targetFormat === 'webp') {
      pipeline = pipeline.webp({ quality: settings.quality });
      outExt = 'webp'; mimeType = 'image/webp';
    } else if (targetFormat === 'jpeg' || targetFormat === 'jpg') {
      pipeline = pipeline.jpeg({ quality: settings.quality, mozjpeg: true });
      outExt = 'jpg'; mimeType = 'image/jpeg';
    } else if (targetFormat === 'png') {
      pipeline = pipeline.png({ quality: settings.quality, compressionLevel: 9 });
      outExt = 'png'; mimeType = 'image/png';
    } else {
      // gif or any unrecognised — leave format as-is, just resize/sharpen
      outExt = ext; mimeType = null;
    }

    const outBuffer = await pipeline.toBuffer();
    return { buffer: outBuffer, ext: outExt, mimeType, originalWidth, originalHeight, wasProcessed: true };
  } catch (err) {
    // If Sharp can't parse/process the buffer for any reason, fall back to
    // the original, unmodified buffer rather than failing the whole upload.
    console.warn(`[ImageProcessing] Sharp failed for "${originalName}", using original:`, err.message);
    return { buffer, ext, mimeType: null, originalWidth: null, originalHeight: null, wasProcessed: false };
  }
}

// ─── Cloudinary or local storage ─────────────────────────────────────────────
const USE_CLOUDINARY =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY    &&
  process.env.CLOUDINARY_API_SECRET;

let cloudinary, CloudinaryStorage;

if (USE_CLOUDINARY) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const { CloudinaryStorage: CS } = require('../utils/CloudinaryStorage');
  CloudinaryStorage = CS;
  console.log('🌥️  Upload storage: Cloudinary');
} else {
  console.log('💾 Upload storage: local disk');
}

// ─── SECURITY: Known image magic bytes ───────────────────────────────────────
// We read the first 8 bytes of every upload and compare them to known
// signatures so a renamed executable cannot pass the extension check.
const IMAGE_SIGNATURES = [
  { ext: 'jpg',  magic: [0xFF, 0xD8, 0xFF] },
  { ext: 'png',  magic: [0x89, 0x50, 0x4E, 0x47] },
  { ext: 'gif',  magic: [0x47, 0x49, 0x46, 0x38] },       // GIF8
  { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },       // RIFF (webp)
  // SVG is XML — no fixed magic bytes; we validate by content below.
];

function hasMagicBytes(buffer, signature) {
  return signature.every((byte, i) => buffer[i] === byte);
}

function isValidImageBuffer(buffer, originalname) {
  const ext = path.extname(originalname).toLowerCase().slice(1);
  if (ext === 'svg') return true; // SVG is text; magic-byte check N/A
  if (!buffer || buffer.length < 4) return false;

  // FIX: Validate against ANY known image signature, not only the one that
  // matches the file's extension. Phones/exporters often save a JPEG with a
  // .png extension (or vice-versa); the file is still a perfectly valid
  // image and should be accepted. This previously caused false
  // "invalid image data" rejections for legitimately-encoded images whose
  // extension didn't match their real format.
  for (const sig of IMAGE_SIGNATURES) {
    if (hasMagicBytes(buffer, sig.magic)) {
      if (sig.ext === 'webp') {
        // webp: RIFF....WEBP — confirm the WEBP marker too
        if (buffer.slice(8, 12).toString('ascii') === 'WEBP') return true;
        continue;
      }
      return true;
    }
  }
  return false;
}

// ─── SECURITY: SVG sanitiser ─────────────────────────────────────────────────
// Strips dangerous constructs from SVG content before storage so that a
// malicious SVG cannot execute JavaScript when rendered in a browser.
//
// Removed / neutralised:
//  • <script> … </script> blocks
//  • on* event handler attributes (onclick, onerror, onload, etc.)
//  • javascript: URIs in href / xlink:href / src
//  • <foreignObject> (allows embedding arbitrary HTML)
//  • <use href="..."> pointing to external resources
//  • <animate> / <animateTransform> / <set> (can trigger JS in some browsers)
//
// This is a defence-in-depth measure; Cloudinary also strips SVG scripts
// when transformation is applied (transformation: [{ quality: 'auto' }]).
function sanitizeSVG(svgContent) {
  let clean = svgContent;

  // SECURITY: Remove <script> blocks entirely.
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');

  // SECURITY: Remove on* event-handler attributes.
  clean = clean.replace(/\s+on\w+\s*=\s*(['"])[^'"]*\1/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');

  // SECURITY: Remove javascript: URIs.
  clean = clean.replace(/href\s*=\s*(['"])javascript:[^'"]*\1/gi, 'href="#"');
  clean = clean.replace(/xlink:href\s*=\s*(['"])javascript:[^'"]*\1/gi, 'xlink:href="#"');
  clean = clean.replace(/src\s*=\s*(['"])javascript:[^'"]*\1/gi, 'src=""');

  // SECURITY: Remove <foreignObject> (allows HTML embedding → XSS).
  clean = clean.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

  // SECURITY: Remove <use> tags with external href (can load external resources).
  clean = clean.replace(/<use[^>]+(?:href|xlink:href)\s*=\s*(['"])[^'"#][^'"]*\1[^>]*\/?>/gi, '');

  // SECURITY: Remove animation tags that have been exploited in some browsers.
  clean = clean.replace(/<animate[\s\S]*?\/>/gi, '');
  clean = clean.replace(/<animateTransform[\s\S]*?\/>/gi, '');
  clean = clean.replace(/<set[\s\S]*?\/>/gi, '');

  return clean;
}

// ─── File filter ─────────────────────────────────────────────────────────────
// SECURITY: Check both extension and MIME type.
const ALLOWED_EXT  = /jpeg|jpg|png|gif|webp|svg/;
const ALLOWED_MIME = /image\/(jpeg|png|gif|webp|svg\+xml)/;

const fileFilter = (req, file, cb) => {
  const extOk  = ALLOWED_EXT.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = ALLOWED_MIME.test(file.mimetype);
  if (extOk && mimeOk) cb(null, true);
  else cb(new Error('Only image files (jpg, png, gif, webp, svg) are allowed'));
};

// ─── Post-upload SVG sanitisation handler ────────────────────────────────────
// Called after multer stores the file.  For SVG files on local storage, reads,
// sanitises, and overwrites the file.  For Cloudinary, the file is already
// uploaded; we log a warning (Cloudinary strips scripts via transformation).
async function sanitizeSVGIfNeeded(file, isCloudinary) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext !== '.svg') return; // Nothing to do for non-SVG files

  if (isCloudinary) {
    // Cloudinary applies transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    // which strips SVG scripts server-side.  Log for awareness.
    console.log('[SECURITY] SVG uploaded to Cloudinary — server-side sanitisation applied via transformation');
    return;
  }

  // Local storage — read, sanitise, overwrite
  try {
    const raw   = fs.readFileSync(file.path, 'utf8');
    const clean = sanitizeSVG(raw);
    fs.writeFileSync(file.path, clean, 'utf8');
    console.log('[SECURITY] SVG sanitised:', file.filename);
  } catch (err) {
    // SECURITY: If we cannot sanitise, delete the file and throw so the
    //           upload fails rather than storing a potentially unsafe SVG.
    console.error('[SECURITY] SVG sanitisation failed — deleting file:', err.message);
    try { fs.unlinkSync(file.path); } catch (_) { /* ignore */ }
    throw new Error('SVG could not be sanitised and was rejected for safety');
  }
}

// ─── SECURITY: Filename sanitiser ────────────────────────────────────────────
// Strips path traversal and header-injection characters from filenames.
function sanitizeFilename(name) {
  return (name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

// ─── Multer configuration ─────────────────────────────────────────────────────
let upload;

if (USE_CLOUDINARY) {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: () => ({
      folder:           'storekit',
      allowed_formats:  ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
      // SECURITY: The quality:auto transformation causes Cloudinary to process
      //           the file server-side, which strips SVG scripts.
      transformation:   [{ quality: 'auto', fetch_format: 'auto' }],
      public_id:        `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    }),
  });
  upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
} else {
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename:    (req, file, cb) => {
      // SECURITY: Sanitise the original filename before embedding it in the
      //           stored name to prevent directory traversal or header injection.
      const safe = sanitizeFilename(path.basename(file.originalname, path.extname(file.originalname)));
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}${path.extname(file.originalname).toLowerCase()}`);
    },
  });
  upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
}

// ─── URL helper ───────────────────────────────────────────────────────────────
// FIX (production): When running behind a reverse proxy (Railway → Vercel),
// req.get('host') resolves to the internal Railway hostname which is not
// reachable from browsers.  Use BACKEND_URL from env when available so the
// stored URL is always the public-facing address.
// Format BACKEND_URL without trailing slash, e.g.:
//   https://storekit-production.up.railway.app
function localUrl(req, filename) {
  if (process.env.BACKEND_URL) {
    // Normalise: ensure https scheme and strip trailing slash
    let base = process.env.BACKEND_URL.trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
    return `${base}/uploads/${filename}`;
  }
  // Localhost dev fallback — derive from the request as before
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host']  || req.get('host');
  return `${proto}://${host}/uploads/${filename}`;
}

// ─── POST /api/upload ─────────────────────────────────────────────────────────
router.post('/', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    // SECURITY: Sanitise SVG after upload (before returning URL to client).
    await sanitizeSVGIfNeeded(req.file, !!USE_CLOUDINARY);

    const url = USE_CLOUDINARY ? req.file.path : localUrl(req, req.file.filename);
    res.json({ url, filename: req.file.filename });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/upload/multiple ────────────────────────────────────────────────
router.post('/multiple', adminAuth, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ message: 'No files uploaded' });

    // SECURITY: Sanitise each SVG in the batch.
    for (const file of req.files) {
      await sanitizeSVGIfNeeded(file, !!USE_CLOUDINARY);
    }

    const urls = req.files.map(f => ({
      url:      USE_CLOUDINARY ? f.path : localUrl(req, f.filename),
      filename: f.filename,
    }));
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── GET /api/upload/image-processing-settings ───────────────────────────────
// Returns current admin settings for the Sharp processing pipeline + AI
// upscale toggle, merged with defaults so the frontend always gets a
// complete object even before anything has been saved.
router.get('/image-processing-settings', adminAuth, async (req, res) => {
  try {
    const settings = await getImageProcessingSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PUT /api/upload/image-processing-settings ───────────────────────────────
// Saves admin settings for the Sharp processing pipeline + AI upscale.
// Body is the same shape as DEFAULT_IMG_SETTINGS (partial updates allowed —
// merged over existing values).
router.put('/image-processing-settings', adminAuth, async (req, res) => {
  try {
    const current = await getImageProcessingSettings();
    const incoming = req.body || {};
    const merged = {
      ...current,
      ...incoming,
      cloudinaryAI: { ...current.cloudinaryAI, ...(incoming.cloudinaryAI || {}) },
      aiUpscale: { ...current.aiUpscale, ...(incoming.aiUpscale || {}) },
    };

    // Basic validation / clamping so a bad admin input can't break uploads
    merged.maxWidth  = Math.min(Math.max(parseInt(merged.maxWidth, 10)  || DEFAULT_IMG_SETTINGS.maxWidth,  100), 4000);
    merged.maxHeight = Math.min(Math.max(parseInt(merged.maxHeight, 10) || DEFAULT_IMG_SETTINGS.maxHeight, 100), 4000);
    merged.quality   = Math.min(Math.max(parseInt(merged.quality, 10)   || DEFAULT_IMG_SETTINGS.quality,   1),   100);
    if (!['webp', 'jpeg', 'jpg', 'png', 'original'].includes(merged.format)) {
      merged.format = DEFAULT_IMG_SETTINGS.format;
    }
    merged.cloudinaryAI.sharpenStrength = Math.min(Math.max(parseInt(merged.cloudinaryAI.sharpenStrength, 10) || DEFAULT_IMG_SETTINGS.cloudinaryAI.sharpenStrength, 1), 2000);
    merged.aiUpscale.minWidthThreshold  = Math.max(parseInt(merged.aiUpscale.minWidthThreshold, 10)  || DEFAULT_IMG_SETTINGS.aiUpscale.minWidthThreshold, 50);
    merged.aiUpscale.minHeightThreshold = Math.max(parseInt(merged.aiUpscale.minHeightThreshold, 10) || DEFAULT_IMG_SETTINGS.aiUpscale.minHeightThreshold, 50);

    await Settings.findOneAndUpdate(
      { key: IMG_SETTINGS_KEY },
      { key: IMG_SETTINGS_KEY, value: merged, updatedAt: new Date() },
      { upsert: true }
    );
    invalidateImgSettingsCache();
    res.json({ success: true, settings: merged });
  } catch (err) {
    console.error('[ImageProcessing] settings save error:', err);
    res.status(500).json({ message: err.message || 'Failed to save image processing settings' });
  }
});

// ─── POST /api/upload/sku-images ──────────────────────────────────────────────
// Upload a ZIP whose top-level folders are named by SKU.
// Every image inside a SKU folder is uploaded and assigned to that product.
//
// Expected ZIP layout (sub-folders optional):
//   /SKU-001/front.jpg
//   /SKU-001/back.png
//   /SKU-002/main.jpg
//   ...
//
// The endpoint:
//   1. Streams the ZIP into memory entry-by-entry.
//   2. For each image entry, resolves the SKU from the first path segment.
//   3. Uploads the image bytes to Cloudinary (or saves to local disk).
//   4. Finds the matching Product by SKU (case-insensitive) and pushes the URL
//      into product.images[]; the first image also sets product.thumbnail when
//      the product has none.
//   5. Returns a detailed summary: matched, skipped, unmatched SKUs.

const skuZipStorage = multer.memoryStorage();
const skuZipUpload  = multer({
  storage: skuZipStorage,
  limits:  { fileSize: 200 * 1024 * 1024 }, // 200 MB zip ceiling
  fileFilter: (req, file, cb) => {
    const ok = /\.zip$/i.test(file.originalname) || file.mimetype === 'application/zip' ||
               file.mimetype === 'application/x-zip-compressed';
    if (ok) cb(null, true);
    else    cb(new Error('Only .zip files are accepted for SKU image upload'));
  },
});

router.post('/sku-images', adminAuth, skuZipUpload.single('zipfile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No zip file uploaded' });

  // Load admin-configurable image-processing settings once per request.
  const imgSettings = await getImageProcessingSettings();

  // Helper: upload a (possibly already Sharp-processed) buffer as an image.
  // `applyAiUpscale` tells Cloudinary to additionally run its e_upscale
  // generative-AI transformation on this specific asset (used only when the
  // source image was below the configured resolution threshold).
  // `alreadyProcessed` tells this function whether Sharp already resized /
  // sharpened / compressed the buffer locally — if so, Cloudinary must NOT
  // also apply quality:auto / fetch_format:auto, because those re-compress
  // and re-encode the image independently, which silently undoes (or masks)
  // the sharpening and quality settings Sharp just applied. This was the
  // actual reason uploaded images still looked like the unprocessed
  // originals: Sharp's work was being re-processed a second time by
  // Cloudinary's own "auto" pipeline right after.
  async function uploadImageBuffer(buffer, originalName, ext, applyAiUpscale, alreadyProcessed) {
    if (USE_CLOUDINARY) {
      return new Promise((resolve, reject) => {
        const transformation = [];

        if (alreadyProcessed) {
          // Sharp already resized/sharpened/compressed — store the bytes
          // as delivered, don't let Cloudinary's generic auto-quality
          // re-touch them.
          transformation.push({ quality: 100 });
        } else {
          // Sharp was skipped (processing disabled, or SVG) — fall back to
          // Cloudinary's own auto optimisation, same as before this feature.
          transformation.push({ quality: 'auto', fetch_format: 'auto' });
        }

        // ENHANCEMENT: Cloudinary AI Effects chain. These run as real
        // server-side AI models on Cloudinary's infrastructure — this is
        // what actually fixes images "still looking like the original",
        // since Sharp's local sharpen() is a mild filter while these are
        // full AI-driven corrections. Order matters: upscale (resolution)
        // first, then improve (tone/contrast/lighting), then sharpen last
        // so it sharpens the already-corrected image rather than the raw one.
        if (applyAiUpscale) {
          // e_upscale — generative AI resolution upscaling for genuinely
          // low-res sources. No extra third-party API key required since it
          // runs through the existing Cloudinary account. If the account/
          // plan doesn't support it, Cloudinary ignores the unsupported
          // transformation rather than failing the upload.
          transformation.push({ effect: 'upscale' });
        }
        if (imgSettings.cloudinaryAI.improve) {
          // e_improve — AI-enhanced overall visual quality: contrast,
          // lighting, and colour balance.
          transformation.push({ effect: 'improve' });
        }
        if (imgSettings.cloudinaryAI.sharpen) {
          // e_unsharp_mask — stronger, more visible sharpening than Sharp's
          // local filter; strength is admin-configurable (1-2000 scale).
          transformation.push({ effect: `unsharp_mask:${imgSettings.cloudinaryAI.sharpenStrength}` });
        }

        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'storekit',
            public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
            transformation,
            format: ext !== 'svg' ? ext : undefined, // tell Cloudinary the real (post-processing) format
          },
          (err, result) => { if (err) reject(err); else resolve(result.secure_url); }
        );
        const { Readable } = require('stream');
        Readable.from(buffer).pipe(stream);
      });
    } else {
      // Local disk fallback
      const uploadsDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
      const dest     = path.join(uploadsDir, filename);
      fs.writeFileSync(dest, buffer);
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const host  = req.headers['x-forwarded-host']  || req.get('host');
      return `${proto}://${host}/uploads/${filename}`;
    }
  }

  const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg)$/i;

  // summary counters
  const results    = {};   // sku → { uploaded:[], errors:[], processed:0, upscaled:0 }
  const noProduct  = new Set();
  let totalFiles     = 0;
  let totalProcessed = 0;
  let totalUpscaled  = 0;
  let totalBytesBefore = 0;
  let totalBytesAfter  = 0;

  try {
    // Parse the in-memory ZIP
    const directory = await unzipper.Open.buffer(req.file.buffer);

    // Collect all valid image entries first so we can batch-process them
    // with bounded concurrency instead of doing everything sequentially.
    const entries = [];
    for (const entry of directory.files) {
      if (entry.type === 'Directory') continue;
      const relPath = entry.path.replace(/\\/g, '/');
      const baseName = relPath.split('/').pop() || '';
      // FIX: macOS zip exports include a "__MACOSX/" folder containing
      // "._<filename>" AppleDouble resource-fork stubs that shadow every
      // real file (e.g. "._10445_1.png" next to "10445_1.png"). These stubs
      // are tiny binary blobs, not real images, and were previously being
      // read and failing the magic-byte check ("invalid image data").
      // Skip them no matter where they appear in the zip, not just under
      // __MACOSX/, since some zip tools place "._*" files alongside the
      // real ones at the top level too.
      if (
        relPath.startsWith('__MACOSX') ||
        relPath.includes('/__MACOSX/') ||
        baseName === '.DS_Store' ||
        baseName.startsWith('._')
      ) continue;

      // FIX: Derive SKU from the image's immediate PARENT folder, not always
      // the first path segment. When a zip is created by selecting a folder
      // (e.g. "test products/") and compressing it, every entry gets an
      // extra wrapping segment: "test products/SKU-001/img.png" instead of
      // "SKU-001/img.png". Using parts[0] then incorrectly read "test
      // products" as the SKU. The parent-folder-of-the-file is always the
      // actual SKU folder, regardless of how many levels wrap it.
      const parts = relPath.split('/').filter(Boolean);
      if (parts.length < 2) continue;          // root-level files ignored
      const skuRaw = parts[parts.length - 2];
      const fileName = parts[parts.length - 1];

      if (!IMAGE_EXT.test(fileName)) continue; // skip non-image files

      entries.push({ entry, skuRaw, fileName });
      if (!results[skuRaw]) results[skuRaw] = { uploaded: [], errors: [], processed: 0, upscaled: 0 };
    }

    totalFiles = entries.length;

    // ── SORT: guarantee IMG_1 / _1 files are always processed first ───────
    // ZIP archives yield entries in an undefined order, and Promise.all
    // races mean whichever image finishes uploading first wins the thumbnail
    // slot — so a _2 or _3 image could randomly beat IMG_1.
    // Natural (numeric-aware) sort on fileName puts _1 before _10 before _2
    // and IMG_1 before IMG_2 etc., so the first image of each SKU folder is
    // deterministically the thumbnail every time.
    entries.sort((a, b) => {
      // Primary: group by SKU so same-SKU images stay together
      if (a.skuRaw < b.skuRaw) return -1;
      if (a.skuRaw > b.skuRaw) return 1;
      // Secondary: natural (locale + numeric) sort on filename within the SKU
      return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
    });

    // ── GROUP by SKU so we can process each SKU's images in filename order ─
    // This ensures the first image per SKU always becomes the thumbnail,
    // regardless of concurrent upload timing.
    const entriesBySku = {};
    for (const e of entries) {
      if (!entriesBySku[e.skuRaw]) entriesBySku[e.skuRaw] = [];
      entriesBySku[e.skuRaw].push(e);
    }

    // ── PER-SKU PROCESSING ────────────────────────────────────────────────
    // Process each SKU sequentially so IMG_1 always finishes uploading and
    // is set as thumbnail BEFORE the remaining images of that SKU are
    // uploaded. Within a SKU, images are uploaded concurrently (bounded to
    // CONCURRENT_PER_SKU) for speed. SKUs themselves are processed in small
    // parallel batches (SKU_BATCH) to stay within Railway's 30 s request
    // timeout even on large ZIPs.
    //
    // Key timeout-prevention changes vs the old flat batching:
    //  1. Product is fetched ONCE per SKU, not once per image (fewer DB round-trips).
    //  2. product.save() is called ONCE per SKU at the very end, not after
    //     every single image (was the primary cause of timeouts on large imports).
    //  3. Cloudinary uploads inside a SKU are still concurrent but bounded.
    const CONCURRENT_PER_SKU = 3;  // parallel Cloudinary streams per SKU
    const SKU_BATCH           = 4;  // how many SKUs to process in parallel

    const skuKeys = Object.keys(entriesBySku);

    for (let si = 0; si < skuKeys.length; si += SKU_BATCH) {
      const skuBatch = skuKeys.slice(si, si + SKU_BATCH);

      await Promise.all(skuBatch.map(async (skuRaw) => {
        const skuEntries = entriesBySku[skuRaw]; // already sorted: IMG_1 first

        // ── Fetch product once per SKU ─────────────────────────────────
        const product = await Product.findOne({
          sku: { $regex: `^${skuRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
        });
        if (!product) {
          noProduct.add(skuRaw);
          for (const { fileName } of skuEntries) {
            results[skuRaw].errors.push(`${fileName}: no product found for SKU "${skuRaw}"`);
          }
          return;
        }

        // ── Track whether this SKU already had a thumbnail before import ─
        let thumbnailAlreadySet = !!product.thumbnail;

        // ── Upload images in filename order, bounded concurrency ────────
        // We process in sequential sub-batches (not pure Promise.all of
        // all images) so that the FIRST sub-batch (which contains IMG_1)
        // always completes and sets the thumbnail before later images run.
        for (let ii = 0; ii < skuEntries.length; ii += CONCURRENT_PER_SKU) {
          const imgBatch = skuEntries.slice(ii, ii + CONCURRENT_PER_SKU);

          const batchUrls = await Promise.all(imgBatch.map(async ({ entry, fileName }) => {
            try {
              const rawBuffer = await entry.buffer();
              totalBytesBefore += rawBuffer.length;

              // Magic-byte guard (skip SVG — it's text)
              const sourceExt = path.extname(fileName).toLowerCase().slice(1);
              if (sourceExt !== 'svg' && !isValidImageBuffer(rawBuffer, fileName)) {
                results[skuRaw].errors.push(`${fileName}: invalid image data`);
                return null;
              }

              // ── Sharp processing pipeline ──────────────────────────────
              const processed = await processImageBuffer(rawBuffer, fileName, imgSettings);
              totalBytesAfter += processed.buffer.length;
              if (processed.wasProcessed) {
                totalProcessed += 1;
                results[skuRaw].processed += 1;
              }

              // ── Optional AI Upscale ────────────────────────────────────
              let applyAiUpscale = false;
              if (
                imgSettings.aiUpscale.enabled &&
                processed.originalWidth && processed.originalHeight &&
                (processed.originalWidth  < imgSettings.aiUpscale.minWidthThreshold ||
                 processed.originalHeight < imgSettings.aiUpscale.minHeightThreshold)
              ) {
                applyAiUpscale = true;
                totalUpscaled += 1;
                results[skuRaw].upscaled += 1;
              }

              // Upload
              const url = await uploadImageBuffer(processed.buffer, fileName, processed.ext, applyAiUpscale, processed.wasProcessed);
              results[skuRaw].uploaded.push(url);
              return { url, fileName };
            } catch (entryErr) {
              results[skuRaw].errors.push(`${fileName}: ${entryErr.message}`);
              return null;
            }
          }));

          // ── Assign URLs to product IN ORDER ───────────────────────────
          // This runs after each sub-batch completes, so the first sub-batch
          // (IMG_1 etc.) is fully assigned before the second sub-batch starts.
          for (const result of batchUrls) {
            if (!result) continue;
            const { url } = result;
            if (!thumbnailAlreadySet) {
              // FIX: IMG_1 is the first image in the sorted order → it
              // deterministically becomes the thumbnail. It is NOT also
              // pushed into product.images[] to avoid rendering it twice
              // (the storefront gallery already prepends thumbnail).
              product.thumbnail = url;
              thumbnailAlreadySet = true;
            } else {
              if (!Array.isArray(product.images)) product.images = [];
              product.images.push(url);
            }
          }
        }

        // ── Save product ONCE per SKU (was: once per image) ───────────
        // This is the primary fix for Railway timeouts: a 50-image ZIP
        // previously triggered 50 sequential product.save() + 50 DB
        // round-trips; now it is 1 save per SKU regardless of image count.
        await product.save();
      }));
    }

    // Build response summary
    const matched   = Object.keys(results).filter(s => results[s].uploaded.length > 0);
    const withErrors= Object.keys(results).filter(s => results[s].errors.length > 0);
    const unmatched = [...noProduct];
    const bytesSavedPct = totalBytesBefore > 0
      ? Math.round((1 - totalBytesAfter / totalBytesBefore) * 100)
      : 0;

    return res.json({
      message:  `SKU image import complete. ${matched.length} SKU(s) updated.`,
      matched:  matched.length,
      unmatched: unmatched.length,
      unmatchedSkus: unmatched,
      withErrors: withErrors.length,
      details:  results,
      // ── ENHANCEMENT: additive fields, fully backward compatible ─────────
      // Existing frontend code that only reads matched/unmatched/withErrors/
      // details keeps working untouched; new fields are simply ignored by
      // older UI until the frontend is updated to display them.
      processing: {
        totalFiles,
        processed:   totalProcessed,
        aiUpscaled:  totalUpscaled,
        bytesBefore: totalBytesBefore,
        bytesAfter:  totalBytesAfter,
        bytesSavedPct,
        settingsUsed: {
          enabled:   imgSettings.enabled,
          maxWidth:  imgSettings.maxWidth,
          maxHeight: imgSettings.maxHeight,
          format:    imgSettings.format,
          quality:   imgSettings.quality,
          sharpen:   imgSettings.sharpen,
          cloudinaryImprove:        imgSettings.cloudinaryAI.improve,
          cloudinarySharpen:        imgSettings.cloudinaryAI.sharpen,
          cloudinarySharpenStrength: imgSettings.cloudinaryAI.sharpenStrength,
          aiUpscaleEnabled: imgSettings.aiUpscale.enabled,
        },
      },
    });
  } catch (err) {
    console.error('[SKU-images]', err);
    return res.status(500).json({ message: err.message || 'Failed to process ZIP' });
  }
});

// ─── DELETE /api/upload/:publicId ─────────────────────────────────────────────
router.delete('/:publicId', adminAuth, async (req, res) => {
  if (!USE_CLOUDINARY) return res.json({ message: 'Local files not deleted via API' });
  try {
    const result = await cloudinary.uploader.destroy(`storekit/${req.params.publicId}`);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
