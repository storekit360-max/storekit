'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Backup = require('../../models/Backup');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const { requireRecentStepUp } = require('../../middleware/stepUp');
const { createBackup, verifyBackup, restoreBackup, getHealth, getSettings, getDriveClient } = require('../../services/backupService');
const User = require('../../models/User');
const AuthSession = require('../../models/AuthSession');

const router = express.Router();
const platformScope = { tenantId: null, $or: [{ scope: 'platform' }, { scope: { $exists: false } }] };

router.get('/', requirePlatformPermission('infrastructure.view'), async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const filter = { ...platformScope };
    if (req.query.status) filter.status = String(req.query.status);
    const [backups, total, health, settings] = await Promise.all([
      Backup.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Backup.countDocuments(filter), getHealth(), getSettings(),
    ]);
    res.json({ backups, health, storage: { configured: Boolean(settings.oauthRefreshToken) && health.encryptionConfigured, driveConfigured: Boolean(settings.oauthRefreshToken), encryptionConfigured: health.encryptionConfigured, provider: 'google_drive', account: settings.oauthEmail || null }, page: { number: page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.post('/', requirePlatformPermission('infrastructure.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const health = await getHealth();
    if (!health.driveConnected || !health.encryptionConfigured) return res.status(503).json({ message: 'Encrypted platform backup storage is not configured' });
    const label = String(req.body?.label || 'Manual platform backup').trim().slice(0, 200);
    const backup = await createBackup({ type: 'manual', label, triggeredBy: req.user.email });
    req.audit.set({ action: 'platform-backup.create', resource: 'backup', resourceId: String(backup._id), metadata: { label, checksum: backup.checksum, docCount: backup.docCount } });
    res.status(201).json(backup);
  } catch (error) { next(error); }
});

router.post('/:id/verify', requirePlatformPermission('infrastructure.manage'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !(await Backup.exists({ _id: req.params.id, ...platformScope }))) return res.status(404).json({ message: 'Platform backup not found' });
    const result = await verifyBackup(req.params.id);
    req.audit.set({ action: 'platform-backup.verify', resource: 'backup', resourceId: req.params.id, metadata: { verified: result.ok } });
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/:id/restore', requirePlatformPermission('infrastructure.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !(await Backup.exists({ _id: req.params.id, ...platformScope }))) return res.status(404).json({ message: 'Platform backup not found' });
    const expected = `RESTORE PLATFORM ${req.params.id}`;
    if (String(req.body?.confirmation || '').trim() !== expected) return res.status(400).json({ message: `Type ${expected} to confirm the destructive platform restore` });
    const emergency = await createBackup({ type: 'manual', label: `Emergency pre-restore ${req.params.id}`, triggeredBy: req.user.email });
    const result = await restoreBackup(req.params.id);
    await Promise.all([
      User.updateMany({}, { $inc: { tokenVersion: 1 } }),
      AuthSession.updateMany({ revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: req.user._id, revokeReason: 'All sessions revoked after platform recovery' } }),
    ]);
    req.audit.set({ action: 'platform-backup.restore', resource: 'backup', resourceId: req.params.id, metadata: { emergencyBackupId: String(emergency._id), collections: result.collections } });
    res.json({ message: 'Platform restore completed', emergencyBackupId: emergency._id, ...result });
  } catch (error) { next(error); }
});

router.delete('/:id', requirePlatformPermission('infrastructure.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const record = await Backup.findOne({ _id: req.params.id, ...platformScope });
    if (!record) return res.status(404).json({ message: 'Platform backup not found' });
    if (record.status === 'running') return res.status(409).json({ message: 'A running backup cannot be deleted' });
    if (record.driveFileId) { const drive = await getDriveClient(); await drive.files.delete({ fileId: record.driveFileId }).catch(error => { throw Object.assign(new Error(`Storage deletion failed: ${error.message}`), { statusCode: 502 }); }); }
    await Backup.deleteOne({ _id: record._id });
    req.audit.set({ action: 'platform-backup.delete', resource: 'backup', resourceId: String(record._id), metadata: { checksum: record.checksum } });
    res.json({ message: 'Platform backup deleted from storage and registry' });
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

module.exports = router;
