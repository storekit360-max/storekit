const express = require('express');
const router = express.Router();
const { Settings } = require('../models/index');
const { adminAuth } = require('../middleware/auth');

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
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        await Settings.findOneAndUpdate(
          { key },
          { key, value: req.body[key], group: 'whatsapp', updatedAt: new Date() },
          { upsert: true }
        );
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
