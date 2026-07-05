/**
 * socialMediaController.js
 * Thin HTTP handler layer — delegates all logic to socialMediaService.
 */

const svc = require('../services/socialMediaService');

// GET /api/social-media
exports.getSettings = async (req, res) => {
  try {
    const settings = await svc.getSettings();
    res.json(settings);
  } catch (err) {
    console.error('[SocialMedia] getSettings error:', err);
    res.status(500).json({ message: err.message || 'Failed to load settings' });
  }
};

// PUT /api/social-media/platform/:platform
exports.updatePlatform = async (req, res) => {
  try {
    const { platform } = req.params;
    const result = await svc.updatePlatform(platform, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SocialMedia] updatePlatform error:', err);
    res.status(400).json({ message: err.message || 'Failed to update platform' });
  }
};

// POST /api/social-media/platform/:platform/connect
exports.connectPlatform = async (req, res) => {
  try {
    const { platform } = req.params;
    const result = await svc.connectPlatform(platform, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SocialMedia] connectPlatform error:', err);
    res.status(400).json({ message: err.message || 'Failed to connect platform' });
  }
};

// DELETE /api/social-media/platform/:platform
exports.disconnectPlatform = async (req, res) => {
  try {
    const { platform } = req.params;
    await svc.disconnectPlatform(platform);
    res.json({ success: true });
  } catch (err) {
    console.error('[SocialMedia] disconnectPlatform error:', err);
    res.status(400).json({ message: err.message || 'Failed to disconnect platform' });
  }
};

// POST /api/social-media/platform/:platform/test
exports.testConnection = async (req, res) => {
  try {
    const { platform } = req.params;
    const result = await svc.testConnection(platform);
    res.json(result);
  } catch (err) {
    console.error('[SocialMedia] testConnection error:', err);
    res.status(500).json({ ok: false, message: err.message || 'Connection test failed' });
  }
};

// PATCH /api/social-media/platform/:platform/toggle
exports.togglePlatform = async (req, res) => {
  try {
    const { platform } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ message: '`enabled` must be boolean' });
    const result = await svc.togglePlatform(platform, enabled);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SocialMedia] togglePlatform error:', err);
    res.status(400).json({ message: err.message || 'Failed to toggle platform' });
  }
};

// PUT /api/social-media/automation
exports.updateAutomation = async (req, res) => {
  try {
    const { automationEnabled, enabledPlatforms } = req.body;
    const result = await svc.updateAutomation({ automationEnabled, enabledPlatforms });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SocialMedia] updateAutomation error:', err);
    res.status(400).json({ message: err.message || 'Failed to update automation settings' });
  }
};

// PUT /api/social-media/templates
exports.updateTemplates = async (req, res) => {
  try {
    const { templates } = req.body;
    if (!Array.isArray(templates)) return res.status(400).json({ message: '`templates` must be an array' });
    const result = await svc.updateTemplates(templates);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[SocialMedia] updateTemplates error:', err);
    res.status(400).json({ message: err.message || 'Failed to update templates' });
  }
};