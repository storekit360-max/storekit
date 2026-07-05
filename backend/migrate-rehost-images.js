/**
 * migrate-rehost-images.js
 *
 * One-off migration: finds products whose thumbnail/images are external
 * URLs that are NOT Cloudinary and NOT this server's own /uploads/ path
 * (e.g. raw hotlinked URLs like https://ugreen.lk/wp-content/...), downloads
 * them, and re-uploads them to Cloudinary — same as the (now-fixed) scraper
 * does for new imports going forward.
 *
 * This fixes products that were scraped BEFORE the scraper fix, where the
 * Cloudinary re-host attempt silently failed (e.g. due to hotlink/referer
 * protection on the source site) and the broken external URL was saved
 * as-is.
 *
 * USAGE (run once from the backend folder, locally or via Railway shell):
 *   node migrate-rehost-images.js          # dry run — lists what WOULD change
 *   node migrate-rehost-images.js --apply  # actually updates the database
 *
 * Safe to run multiple times — already-Cloudinary or already-own-server
 * images are left untouched.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const https = require('https');

const APPLY = process.argv.includes('--apply');

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not set. Run this with the same environment as your backend (e.g. `railway run node migrate-rehost-images.js`).');
  process.exit(1);
}

const USE_CLOUDINARY = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (!USE_CLOUDINARY) {
  console.error('Cloudinary env vars not set. This migration needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.');
  process.exit(1);
}

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Same byte-sniffing approach as routes/scrape.js — some CDNs (observed on
// Azure CDN) serve real images with content-type: application/octet-stream,
// so we don't trust the header alone.
const IMAGE_MAGIC_BYTES = [
  { type: 'image/jpeg', magic: [0xFF, 0xD8, 0xFF] },
  { type: 'image/png',  magic: [0x89, 0x50, 0x4E, 0x47] },
  { type: 'image/gif',  magic: [0x47, 0x49, 0x46, 0x38] },
  { type: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] },
];

function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  for (const sig of IMAGE_MAGIC_BYTES) {
    const matches = sig.magic.every((byte, i) => buffer[i] === byte);
    if (!matches) continue;
    if (sig.type === 'image/webp') {
      if (buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
      continue;
    }
    return sig.type;
  }
  return null;
}

function guessImageTypeFromUrl(url) {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  return map[ext] || null;
}

function isAlreadyHosted(url, ownHosts) {
  if (!url || typeof url !== 'string') return true; // nothing to do
  if (!url.startsWith('http://') && !url.startsWith('https://')) return true; // relative/local path, leave as-is
  if (url.includes('res.cloudinary.com')) return true; // already on Cloudinary
  try {
    const host = new URL(url).host;
    if (ownHosts.includes(host)) return true; // already our own server
  } catch {
    return true; // unparsable, don't touch
  }
  return false;
}

async function reuploadOne(imageUrl) {
  const referer = (() => {
    try { return new URL(imageUrl).origin + '/'; } catch { return imageUrl; }
  })();

  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: {
      'User-Agent': UA,
      'Referer':    referer,
      'Accept':     'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    decompress: true,
  });

  const buffer = Buffer.from(response.data);
  const sniffedType = detectImageType(buffer);
  const headerType  = response.headers['content-type'];
  const extType      = guessImageTypeFromUrl(imageUrl);
  const contentType  = sniffedType || (headerType && headerType.startsWith('image/') ? headerType : null) || extType;

  if (!contentType) {
    throw new Error(`Not an image (header: ${headerType}, byte-sniff: ${sniffedType}, ext: ${extType})`);
  }

  const b64     = buffer.toString('base64');
  const dataUri = `data:${contentType};base64,${b64}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder:        'storekit/scraped',
    resource_type: 'image',
  });

  return result.secure_url;
}

async function reuploadWithRetry(url, retries = 1) {
  try {
    return await reuploadOne(url);
  } catch (err) {
    const isRetryable = err.code === 'ECONNABORTED' || /timeout/i.test(err.message) || err.code === 'ECONNRESET';
    if (isRetryable && retries > 0) {
      console.log(`   ↻ retrying after timeout: ${url}`);
      return reuploadWithRetry(url, retries - 1);
    }
    throw err;
  }
}

async function main() {
  console.log(APPLY ? '⚠️  APPLY MODE — database WILL be updated.' : 'ℹ️  DRY RUN — no changes will be saved. Re-run with --apply to actually update.');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Build the list of hosts that count as "our own server" so we don't
  // try to re-fetch/re-upload images that are already correctly hosted.
  const ownHosts = [];
  if (process.env.FRONTEND_URL) {
    try { ownHosts.push(new URL(process.env.FRONTEND_URL).host); } catch {}
  }
  if (process.env.API_URL) {
    try { ownHosts.push(new URL(process.env.API_URL).host); } catch {}
  }

  const Product = require('./models/Product');

  const products = await Product.find({}).select('_id name thumbnail images');
  console.log(`🔍 Scanning ${products.length} products...`);

  let toFix = [];
  for (const p of products) {
    const badThumbnail = !isAlreadyHosted(p.thumbnail, ownHosts) ? p.thumbnail : null;
    const badImages = (p.images || []).filter(img => !isAlreadyHosted(img, ownHosts));
    if (badThumbnail || badImages.length > 0) {
      toFix.push({ product: p, badThumbnail, badImages });
    }
  }

  console.log(`📦 Found ${toFix.length} product(s) with external (un-rehosted) images.`);
  if (toFix.length === 0) {
    console.log('Nothing to do. ✅');
    await mongoose.disconnect();
    return;
  }

  let fixedCount = 0;
  let failCount  = 0;

  for (const { product, badThumbnail, badImages } of toFix) {
    console.log(`\n— ${product.name} (${product._id})`);

    let newThumbnail = product.thumbnail;
    if (badThumbnail) {
      try {
        newThumbnail = await reuploadWithRetry(badThumbnail);
        console.log(`   ✅ thumbnail re-hosted: ${badThumbnail} → ${newThumbnail}`);
      } catch (err) {
        console.warn(`   ❌ thumbnail FAILED (${badThumbnail}): ${err.message}`);
        failCount++;
      }
    }

    const newImages = [];
    for (const img of (product.images || [])) {
      if (!badImages.includes(img)) { newImages.push(img); continue; }
      try {
        const rehosted = await reuploadWithRetry(img);
        console.log(`   ✅ image re-hosted: ${img} → ${rehosted}`);
        newImages.push(rehosted);
      } catch (err) {
        console.warn(`   ❌ image FAILED (${img}): ${err.message}`);
        newImages.push(img); // keep original on failure
        failCount++;
      }
    }

    if (APPLY) {
      try {
        // Update ONLY the two image fields directly, skipping full-document
        // schema validation (product.save() would re-validate every field,
        // including the unique `slug` index — which can fail here if a
        // duplicate-slug product already exists in the database from an
        // earlier double-scrape, unrelated to anything this script does).
        await Product.updateOne(
          { _id: product._id },
          { $set: { thumbnail: newThumbnail, images: newImages } }
        );
        console.log('   💾 saved');
      } catch (err) {
        console.error(`   ❌ SAVE FAILED for this product — skipping, continuing with the rest: ${err.message}`);
        failCount++;
      }
    }
    fixedCount++;
  }

  console.log(`\n────────────────────────────────────`);
  console.log(`Products processed: ${fixedCount}`);
  console.log(`Individual image failures: ${failCount}`);
  console.log(APPLY ? 'Changes applied to database.' : 'DRY RUN ONLY — re-run with --apply to save these changes.');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});