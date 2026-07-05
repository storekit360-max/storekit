'use strict';

/**
 * routes/backup.js
 * All routes require admin auth except the OAuth callback.
 *
 * GET    /api/backup/health              → health summary
 * GET    /api/backup/oauth/url           → get Google consent URL
 * GET    /api/backup/oauth/callback      → Google redirects here with ?code=
 * DELETE /api/backup/oauth/disconnect    → remove stored tokens
 * GET    /api/backup                     → paginated history
 * GET    /api/backup/settings            → current settings
 * PUT    /api/backup/settings            → update settings
 * POST   /api/backup                     → trigger manual backup
 * POST   /api/backup/:id/verify          → verify backup checksum
 * POST   /api/backup/:id/restore         → restore
 * DELETE /api/backup/:id                 → delete backup record + drive file
 * GET    /api/backup/drive-storage       → Drive quota info
 */

const express = require('express');
const router  = express.Router();
const { adminAuth } = require('../middleware/auth');
const Backup         = require('../models/Backup');
const BackupSettings = require('../models/BackupSettings');
const {
  createBackup,
  verifyBackup,
  restoreBackup,
  driveStorageInfo,
  getSettings,
  getHealth,
  getDriveClient,
  getAuthUrl,
  handleOAuthCallback,
} = require('../services/backupService');

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/health', adminAuth, async (req, res) => {
  try {
    const health = await getHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── OAuth: get auth URL ──────────────────────────────────────────────────────
router.get('/oauth/url', adminAuth, async (req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── OAuth: callback (Google redirects here) ──────────────────────────────────
// No adminAuth — Google redirects the browser here after consent
router.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.send(`<html><body><h2>❌ Google auth denied: ${error}</h2><p>Close this tab and try again.</p></body></html>`);
  }
  if (!code) {
    return res.status(400).send('<html><body><h2>Missing auth code</h2></body></html>');
  }
  try {
    const tokens = await handleOAuthCallback(code);
    // Re-fetch email from settings to show in success page
    const settings = await getSettings();
    const email = settings.oauthEmail || 'your Google account';
    res.send(`
      <html>
        <body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center">
          <h2 style="color:#22c55e">✅ Google Drive Connected!</h2>
          <p>Signed in as <b>${email}</b></p>
          <p>Backups will now be saved to your Google Drive.</p>
          <p style="color:#6b7280;font-size:13px">You can close this tab and return to StoreKit.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[Backup OAuth] Callback error:', err.message);
    res.status(500).send(`<html><body><h2>❌ Error: ${err.message}</h2><p>Close this tab and try again.</p></body></html>`);
  }
});

// ─── OAuth: disconnect ────────────────────────────────────────────────────────
router.delete('/oauth/disconnect', adminAuth, async (req, res) => {
  try {
    await BackupSettings.findByIdAndUpdate('backup_settings', {
      $unset: {
        oauthRefreshToken: '',
        oauthAccessToken:  '',
        oauthTokenExpiry:  '',
        oauthEmail:        '',
        oauthConnectedAt:  '',
        driveFolderId:     '',
      },
    });
    res.json({ message: 'Google Drive disconnected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Drive storage ────────────────────────────────────────────────────────────
router.get('/drive-storage', adminAuth, async (req, res) => {
  try {
    const info = await driveStorageInfo();
    res.json(info);
  } catch (err) {
    const settings = await getSettings().catch(() => ({}));
    if (!settings.oauthRefreshToken) {
      return res.status(503).json({
        configured: false,
        message: 'Google Drive not connected. Click "Connect Google Drive" in Settings.',
      });
    }
    res.status(500).json({ message: err.message });
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', adminAuth, async (req, res) => {
  try {
    const s = await getSettings();
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/settings', adminAuth, async (req, res) => {
  try {
    const allowed = [
      'enabled', 'dailyHour', 'weeklyDay', 'weeklyHour',
      'monthlyDay', 'monthlyHour', 'retainDaily', 'retainWeekly',
      'retainMonthly', 'driveFolder', 'alertOnFailure', 'alertEmail',
    ];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const s = await BackupSettings.findByIdAndUpdate(
      'backup_settings',
      update,
      { upsert: true, new: true }
    );
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── List backups ─────────────────────────────────────────────────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (type)   filter.type   = type;
    if (status) filter.status = status;

    const [backups, total] = await Promise.all([
      Backup.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit),
      Backup.countDocuments(filter),
    ]);
    res.json({ backups, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Trigger manual backup ────────────────────────────────────────────────────
router.post('/', adminAuth, async (req, res) => {
  const settings = await getSettings().catch(() => ({}));
  if (!settings.oauthRefreshToken) {
    return res.status(503).json({
      message: 'Google Drive not connected. Go to Backup Center → Settings → Connect Google Drive.',
    });
  }
  res.status(202).json({ message: 'Backup started', status: 'running' });
  const label = req.body.label || 'Manual backup';
  createBackup({ type: 'manual', label, triggeredBy: req.user?.email || 'admin' })
    .catch(e => console.error('[Backup Route] Manual backup error:', e.message));
});

// ─── Verify backup ────────────────────────────────────────────────────────────
router.post('/:id/verify', adminAuth, async (req, res) => {
  try {
    const result = await verifyBackup(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Restore ──────────────────────────────────────────────────────────────────
router.post('/:id/restore', adminAuth, async (req, res) => {
  try {
    console.log('[Backup] Creating emergency backup before restore…');
    createBackup({ type: 'manual', label: 'Emergency pre-restore backup', triggeredBy: req.user?.email || 'admin' })
      .catch(e => console.error('[Backup] Emergency backup failed:', e.message));

    const result = await restoreBackup(req.params.id);
    res.json({ message: 'Restore completed', ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Delete backup ────────────────────────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const record = await Backup.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Backup not found' });

    if (record.driveFileId) {
      try {
        const drive = await getDriveClient();
        await drive.files.delete({ fileId: record.driveFileId });
      } catch {}
    }

    await Backup.findByIdAndDelete(req.params.id);
    res.json({ message: 'Backup deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;