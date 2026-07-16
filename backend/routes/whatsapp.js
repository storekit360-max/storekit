const express = require('express');
const router = express.Router();
const { Settings } = require('../models/index');
const Tenant = require('../models/Tenant');
const { adminAuth } = require('../middleware/auth');
const { defaultWhatsappConfig, normalizeWhatsappNumber } = require('../utils/whatsappConfig');

// Public — get WhatsApp config (non-sensitive)
router.get('/config', async (req, res) => {
  try {
    const keys = ['whatsappEnabled','whatsappNumber','whatsappWelcomeMessage',
                  'whatsappButtonPosition','whatsappOnlineHours','whatsappOfflineMessage',
                  'whatsappAgentName','whatsappAgentAvatar','whatsappShowOnMobile',
                  'whatsappShowOnDesktop','whatsappPrefilledMessage'];
    const docs = await Settings.find({ key: { $in: keys }});
    const config = {};
    docs.forEach(d => { config[d.key] = d.value; });
    const tenantId = req.tenantId || req.tenant?._id || null;
    if (tenantId && (!Object.hasOwn(config, 'whatsappNumber') || !Object.hasOwn(config, 'whatsappEnabled'))) {
      const tenant = await Tenant.findById(tenantId).select('storeName settings.whatsapp settings.whatsappNumber settings.country').lean();
      const fallback = defaultWhatsappConfig(
        tenant?.settings?.whatsappNumber || tenant?.settings?.whatsapp,
        tenant?.storeName,
        tenant?.settings?.country
      );
      for (const [key, value] of Object.entries(fallback)) {
        if (!Object.hasOwn(config, key)) config[key] = value;
      }
    }
    res.json(config);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin — save WhatsApp config
router.put('/config', adminAuth, async (req, res) => {
  try {
    const allowed = ['whatsappEnabled','whatsappNumber','whatsappWelcomeMessage',
                     'whatsappButtonPosition','whatsappOnlineHours','whatsappOfflineMessage',
                     'whatsappAgentName','whatsappAgentAvatar','whatsappShowOnMobile',
                     'whatsappShowOnDesktop','whatsappPrefilledMessage'];
    const payload = { ...req.body };
    if (payload.whatsappNumber !== undefined) {
      const tenant = req.user?.tenantId
        ? await Tenant.findById(req.user.tenantId).select('settings.country settings.whatsapp settings.whatsappNumber')
        : null;
      const normalized = normalizeWhatsappNumber(payload.whatsappNumber, tenant?.settings?.country);
      if (String(payload.whatsappNumber || '').trim() && !normalized) {
        return res.status(400).json({ message: 'Enter a valid WhatsApp number including the country code' });
      }
      payload.whatsappNumber = normalized ? `+${normalized}` : '';
      if (normalized && payload.whatsappEnabled === undefined) payload.whatsappEnabled = true;
      if (tenant) {
        tenant.settings.whatsapp = payload.whatsappNumber;
        tenant.settings.whatsappNumber = payload.whatsappNumber;
        await tenant.save();
      }
    }
    for (const key of allowed) {
      if (payload[key] !== undefined) {
        await Settings.findOneAndUpdate(
          { key },
          { key, value: payload[key], group: 'whatsapp', updatedAt: new Date() },
          { upsert: true }
        );
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
