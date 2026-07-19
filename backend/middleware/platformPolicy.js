'use strict';

const { getAllSettings, publicSettings } = require('../services/platformSettingsService');

function isMaintenanceExempt(pathname) {
  return pathname === '/api/health' || pathname.startsWith('/api/superadmin') || pathname.startsWith('/api/auth/superadmin');
}

async function platformPolicy(req, res, next) {
  try {
    const settings = await getAllSettings();
    req.platformSettings = settings;
    if (settings['maintenance.enabled'] === true && !isMaintenanceExempt(String(req.path || req.originalUrl || '').split('?')[0])) {
      res.setHeader('Retry-After', '300');
      return res.status(503).json({ code: 'PLATFORM_MAINTENANCE', message: settings['maintenance.message'] });
    }
    next();
  } catch (error) {
    // Configuration storage must fail open so a transient database query cannot
    // turn into a platform-wide outage. Health/monitoring surfaces the failure.
    console.error('[PLATFORM_POLICY_READ_FAILED]', { correlationId: req.correlationId, error: error.message });
    next();
  }
}

async function publicPlatformSettings(_req, res, next) {
  try {
    const settings = await getAllSettings();
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json(publicSettings(settings));
  } catch (error) { next(error); }
}

module.exports = { isMaintenanceExempt, platformPolicy, publicPlatformSettings };
