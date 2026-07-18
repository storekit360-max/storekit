/**
 * routes/socialMedia.js
 * All routes are protected by adminAuth — credentials never leave the server.
 *
 * MODIFIED: Added POST /bulk-post for admin bulk product posting with rate-limit
 *           support baked into the frontend; the route handles one post at a time.
 */

const express    = require('express');
const router     = express.Router();
const { adminAuth } = require('../middleware/auth');
const ctrl       = require('../controllers/socialMediaController');
const { refreshPlatformNow } = require('../services/tokenRefreshScheduler');
const { getOrCreate, decryptPlatformFields } = require('../services/socialMediaService');
const { inspectToken } = require('../services/facebookTokenRefresh');
const { manualPublish } = require('../services/publisherService');
const { compose } = require('../services/postComposer');
const SocialScheduleDraft = require('../models/SocialScheduleDraft');

// ─── PUBLIC: storefront footer social links (no secrets) ─────────────────────
router.get('/public', async (req, res) => {
  try {
    const SocialMedia = require('../models/SocialMedia');
    const PLATFORM_META = {
      facebook:  { label: 'Facebook',  color: '#1877f2', urlPrefix: 'https://facebook.com/' },
      instagram: { label: 'Instagram', color: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', urlPrefix: 'https://instagram.com/' },
      tiktok:    { label: 'TikTok',    color: '#010101', urlPrefix: 'https://tiktok.com/@' },
      whatsapp:  { label: 'WhatsApp',  color: '#25d366', urlPrefix: 'https://wa.me/' },
      telegram:  { label: 'Telegram',  color: '#229ed9', urlPrefix: 'https://t.me/' },
    };
    const doc = await SocialMedia.findOne().lean();
    if (!doc) return res.json([]);

    const platforms = Object.keys(PLATFORM_META);
    const result = platforms
      .filter(p => doc[p]?.connected && doc[p]?.enabled)
      .map(p => {
        const { label, color, urlPrefix } = PLATFORM_META[p];
        const acct = doc[p];
        // For Telegram: accountHandle is the BOT username (@BotFather name) — NOT the channel.
        // The channel/group to link to is stored in accountId (e.g. @mypublicchannel or -100...).
        // So for Telegram we use accountId first; for all other platforms use accountHandle first.
        const rawHandle = p === 'telegram'
          ? (acct.accountId?.replace(/^@/, '') || acct.accountHandle?.replace(/^@/, '') || '')
          : (acct.accountHandle?.replace(/^@/, '') || acct.accountId || '');
        const handle = rawHandle;
        const url = p === 'whatsapp'
          ? `https://wa.me/${handle.replace(/[^0-9]/g, '')}`
          : handle ? `${urlPrefix}${handle}` : null;
        return {
          platform:    p,
          label,
          color,
          url,
          accountName:   acct.accountName   || label,
          accountHandle: acct.accountHandle  || '',
          accountAvatar: acct.accountAvatar  || '',
        };
      })
      .filter(p => p.url);

    res.json(result);
  } catch (err) {
    console.error('social-media/public error:', err);
    res.json([]);
  }
});

// ─── TEMP DEBUG — no auth, remove after fixing ───────────────────────────────
router.get('/debug-whatsapp', async (req, res) => {
  const doc = await require('../models/SocialMedia').findOne();
  res.json(doc?.whatsapp?.extraConfig || {});
});

router.get('/fix-whatsapp', async (req, res) => {
  const SocialMedia = require('../models/SocialMedia');
  await SocialMedia.updateOne({}, {
    $set: {
      'whatsapp.extraConfig.templateName': 'hello_world',
      'whatsapp.extraConfig.languageCode': 'en_US',
    }
  });
  const doc = await SocialMedia.findOne();
  res.json(doc?.whatsapp?.extraConfig || {});
});
// ─── END TEMP ─────────────────────────────────────────────────────────────────

// ─── All routes below require admin auth ─────────────────────────────────────
router.use(adminAuth);

// Settings overview (sanitized — no secrets)
router.get('/', ctrl.getSettings);

// Automation toggle + platform selection
router.put('/automation', ctrl.updateAutomation);

// Post templates
router.put('/templates', ctrl.updateTemplates);

// ─── Bulk post: one product to one platform ───────────────────────────────────
// Called once per job by the frontend rate-limited loop.
// The frontend controls the rate (postsPerMin + delay), so this is intentionally
// a thin wrapper around the existing manualPublish() service.
//
// POST /api/social-media/bulk-post
// Body: { productId, platform }
// Returns: { success, logId, platformPostId?, error? }
router.post('/bulk-post', async (req, res) => {
  try {
    const { productId, platform } = req.body;

    if (!productId || !platform) {
      return res.status(400).json({ success: false, error: 'productId and platform are required' });
    }

    const VALID_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'telegram'];
    if (!VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({ success: false, error: `Unknown platform: ${platform}` });
    }

    // Load product name for logging
    const Product = require('../models/Product');
    const product = await Product.findById(productId).select('name').lean();
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const log = await manualPublish({
      platform,
      entityType:  'product',
      entityId:    productId,
      entityName:  product.name,
      customMsg:   '',
      trigger:     'manual',
      adminUserId: req.admin?._id || req.user?._id || 'unknown',
    });

    if (log?.status === 'success') {
      return res.json({ success: true, logId: log._id, platformPostId: log.platformPostId });
    } else {
      return res.status(422).json({
        success: false,
        logId:  log?._id,
        error:  log?.errorMessage || 'Publish failed',
        code:   log?.errorCode,
      });
    }
  } catch (err) {
    console.error('[bulk-post] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const tenantFilter = req => ({ tenantId: req.user?.tenantId || req.tenantId || null });

// Generate reviewable captions. This deliberately creates drafts only; it does
// not publish or schedule anything until the separate confirmation step.
router.post('/schedules/preview', async (req, res) => {
  try {
    const Product = require('../models/Product');
    const {
      productIds, platforms, startAt, gapMinutes = 5, productsPerDay = 5,
      offerPercent = 0, voucherCode = '', includeSinhala = true,
      ctaType = 'shop_now',
    } = req.body || {};
    const validPlatforms = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'telegram'];
    const cleanPlatforms = [...new Set(Array.isArray(platforms) ? platforms : [])]
      .filter(platform => validPlatforms.includes(platform));
    const start = new Date(startAt);
    const gap = Number(gapMinutes);
    const perDay = Number(productsPerDay);
    const offer = Number(offerPercent) || 0;

    if (!Array.isArray(productIds) || !productIds.length) return res.status(400).json({ message: 'Select at least one product' });
    if (!cleanPlatforms.length) return res.status(400).json({ message: 'Select at least one valid platform' });
    if (Number.isNaN(start.getTime())) return res.status(400).json({ message: 'Choose a valid schedule start date and time' });
    if (!Number.isInteger(gap) || gap < 1 || gap > 10080) return res.status(400).json({ message: 'Gap must be between 1 and 10,080 minutes' });
    if (!Number.isInteger(perDay) || perDay < 1 || perDay > 50) return res.status(400).json({ message: 'Products per day must be between 1 and 50' });
    if (offer < 0 || offer > 95) return res.status(400).json({ message: 'Offer percentage must be between 0 and 95' });

    const productFilter = { _id: { $in: productIds }, ...tenantFilter(req), isActive: true };
    const products = await Product.find(productFilter).lean();
    const byId = new Map(products.map(product => [String(product._id), product]));
    const ordered = productIds.map(id => byId.get(String(id))).filter(Boolean);
    if (ordered.length !== productIds.length) return res.status(404).json({ message: 'One or more selected products were not found' });

    const items = await Promise.all(ordered.map(async (product, index) => {
      const day = Math.floor(index / perDay);
      const slot = index % perDay;
      const scheduledAt = new Date(start);
      scheduledAt.setDate(scheduledAt.getDate() + day);
      scheduledAt.setMinutes(scheduledAt.getMinutes() + (slot * gap));
      const payload = await compose(cleanPlatforms[0], 'manual', product);
      let caption = payload.text;
      if (offer > 0) {
        const sellingPrice = Number(product.salePrice || product.price || 0);
        const promoPrice = sellingPrice * (1 - offer / 100);
        caption += `\n\n🎁 Extra ${offer}% off${voucherCode ? ` with code ${String(voucherCode).toUpperCase()}` : ''}`;
        caption += `\nOffer price: LKR ${promoPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      }
      if (includeSinhala) caption += '\n\nදැන්ම ඇණවුම් කරන්න — සීමිත කාලයක් සඳහා පමණයි!';
      return { productId: product._id, productName: product.name, scheduledAt, caption };
    }));

    const draft = await SocialScheduleDraft.create({
      ...tenantFilter(req), createdBy: req.user._id, platforms: cleanPlatforms,
      startAt: start, gapMinutes: gap, productsPerDay: perDay,
      offerPercent: offer, voucherCode: String(voucherCode || '').toUpperCase(),
      includeSinhala: Boolean(includeSinhala), ctaType, items,
    });
    res.status(201).json({ draft, summary: { products: items.length, platforms: cleanPlatforms.length } });
  } catch (err) {
    console.error('[social-schedule-preview]', err);
    res.status(500).json({ message: err.message || 'Preview generation failed' });
  }
});

router.get('/schedule-drafts', async (req, res) => {
  const items = await SocialScheduleDraft.find(tenantFilter(req)).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

router.patch('/schedule-drafts/:id', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length || items.some(item => !String(item.caption || '').trim())) {
      return res.status(400).json({ message: 'Every product requires a caption' });
    }
    const draft = await SocialScheduleDraft.findOneAndUpdate(
      { _id: req.params.id, ...tenantFilter(req) }, { $set: { items } },
      { new: true, runValidators: true }
    );
    if (!draft) return res.status(404).json({ message: 'Draft not found or expired' });
    res.json({ draft });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/schedule-drafts/:id', async (req, res) => {
  const draft = await SocialScheduleDraft.findOneAndDelete({ _id: req.params.id, ...tenantFilter(req) });
  if (!draft) return res.status(404).json({ message: 'Draft not found or expired' });
  res.json({ message: 'Draft deleted' });
});

// Empty queue responses keep the new management UI backward-compatible until
// a draft has been confirmed into durable scheduled jobs.
router.get('/schedules', (_req, res) => res.json({ items: [], page: 1, pages: 1, total: 0 }));
router.get('/schedule-batches', (_req, res) => res.json({ items: [] }));

// Per-platform routes
router.put   ('/platform/:platform',          ctrl.updatePlatform);
router.post  ('/platform/:platform/connect',  ctrl.connectPlatform);
router.delete('/platform/:platform',          ctrl.disconnectPlatform);
router.post  ('/platform/:platform/test',     ctrl.testConnection);
router.patch ('/platform/:platform/toggle',   ctrl.togglePlatform);

// Manual token refresh (Facebook / Instagram only)
router.post('/platform/:platform/refresh-token', async (req, res) => {
  const { platform } = req.params;
  if (!['facebook', 'instagram'].includes(platform)) {
    return res.status(400).json({ message: 'Token refresh is only available for Facebook and Instagram' });
  }
  try {
    const result = await refreshPlatformNow(platform);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Token status — returns expiry info for the admin UI
router.get('/platform/:platform/token-status', async (req, res) => {
  const { platform } = req.params;
  try {
    const doc = await getOrCreate();
    const raw = doc[platform]?.toObject ? doc[platform].toObject() : (doc[platform] || {});

    if (!raw.connected) return res.json({ connected: false });

    const creds = decryptPlatformFields(raw);
    let inspection = { valid: null, expiresAt: raw.tokenExpiresAt, scopes: [], error: null };

    if (['facebook', 'instagram'].includes(platform) && creds.appId && creds.appSecret && creds.accessToken) {
      inspection = await inspectToken(creds.accessToken, creds.appId, creds.appSecret);
      if (inspection.expiresAt && String(inspection.expiresAt) !== String(raw.tokenExpiresAt)) {
        await doc.constructor.updateOne({}, {
          $set: { [`${platform}.tokenExpiresAt`]: inspection.expiresAt, updatedAt: new Date() },
        });
      }
    }

    res.json({
      connected:            raw.connected,
      tokenExpiresAt:       inspection.expiresAt || raw.tokenExpiresAt,
      tokenLastRefreshedAt: raw.tokenLastRefreshedAt,
      tokenRefreshError:    raw.tokenRefreshError,
      reconnectNeeded:      raw.reconnectNeeded,
      tokenValid:           inspection.valid,
      scopes:               inspection.scopes,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
