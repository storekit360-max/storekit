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
    const health = await getHealth({ tenantId: req.user.tenantId });
    res.json(health);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── OAuth: get auth URL ──────────────────────────────────────────────────────
router.get('/oauth/url', adminAuth, async (req, res) => {
  res.status(403).json({ message: 'Backup storage credentials are managed by platform security administrators' });
});

// ─── OAuth: callback (Google redirects here) ──────────────────────────────────
// No adminAuth — Google redirects the browser here after consent
router.get('/oauth/callback', async (req, res) => {
  res.status(404).send('<html><body><h2>Backup authorization flow unavailable</h2></body></html>');
});

// ─── OAuth: disconnect ────────────────────────────────────────────────────────
router.delete('/oauth/disconnect', adminAuth, async (req, res) => {
  res.status(403).json({ message: 'Backup storage credentials are managed by platform security administrators' });
});

// ─── Drive storage ────────────────────────────────────────────────────────────
router.get('/drive-storage', adminAuth, async (req, res) => {
  try {
    const rows = await Backup.aggregate([{ $match: { tenantId: req.user.tenantId, scope: 'tenant', status: { $in: ['completed', 'verified'] } } }, { $group: { _id: null, backupBytes: { $sum: '$sizeBytes' }, fileCount: { $sum: 1 } } }]);
    res.json({ configured: Boolean((await getSettings()).oauthRefreshToken), managedByPlatform: true, backupBytes: rows[0]?.backupBytes || 0, fileCount: rows[0]?.fileCount || 0 });
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
    res.json({ enabled: Boolean(s.enabled && s.oauthRefreshToken), managedByPlatform: true, driveFolder: 'Managed StoreKit recovery storage', retainDaily: s.retainDaily, retainWeekly: s.retainWeekly, retainMonthly: s.retainMonthly });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/settings', adminAuth, async (req, res) => {
  res.status(403).json({ message: 'Backup schedules and storage are managed by platform administrators' });
});

// ─── List backups ─────────────────────────────────────────────────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const filter = { scope: 'tenant', tenantId: req.user.tenantId };
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
  const health = await getHealth({ tenantId: req.user.tenantId }).catch(() => ({}));
  if (!health.encryptionConfigured) return res.status(503).json({ message: 'Encrypted backup storage is not configured by the platform operator' });
  res.status(202).json({ message: 'Backup started', status: 'running' });
  const label = req.body.label || 'Manual backup';
  createBackup({ type: 'manual', label, triggeredBy: req.user?.email || 'admin', tenantId: req.user.tenantId })
    .catch(e => console.error('[Backup Route] Manual backup error:', e.message));
});

// ─── Verify backup ────────────────────────────────────────────────────────────
router.post('/:id/verify', adminAuth, async (req, res) => {
  try {
    if (!(await Backup.exists({ _id: req.params.id, scope: 'tenant', tenantId: req.user.tenantId }))) return res.status(404).json({ message: 'Backup not found' });
    const result = await verifyBackup(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Restore ──────────────────────────────────────────────────────────────────
router.post('/:id/restore', adminAuth, async (req, res) => {
  try {
    if (!(await Backup.exists({ _id: req.params.id, scope: 'tenant', tenantId: req.user.tenantId }))) return res.status(404).json({ message: 'Backup not found' });
    const expected = `RESTORE TENANT ${req.params.id}`;
    if (String(req.body?.confirmation || '').trim() !== expected) return res.status(400).json({ message: `Type ${expected} to confirm this tenant restore` });
    console.log('[Backup] Creating emergency tenant backup before restore…');
    await createBackup({ type: 'manual', label: 'Emergency pre-restore backup', triggeredBy: req.user?.email || 'admin', tenantId: req.user.tenantId });

    const result = await restoreBackup(req.params.id, { tenantId: req.user.tenantId });
    res.json({ message: 'Restore completed', ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Delete backup ────────────────────────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const record = await Backup.findOne({ _id: req.params.id, scope: 'tenant', tenantId: req.user.tenantId });
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
