'use strict';

const express = require('express');
const registry = require('../../config/platformSettingsRegistry');
const PlatformSetting = require('../../models/PlatformSetting');
const { getAllSettings, updateSettings } = require('../../services/platformSettingsService');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const { requireRecentStepUp } = require('../../middleware/stepUp');
const User = require('../../models/User');
const MfaFactor = require('../../models/MfaFactor');
const { revokeAllUserSessions } = require('../../services/authSessionService');

const router = express.Router();

router.get('/', requirePlatformPermission('settings.view'), async (_req, res, next) => {
  try {
    const [values, documents] = await Promise.all([getAllSettings({ force: true }), PlatformSetting.find().populate('updatedBy', 'email firstName lastName').lean()]);
    const metadata = Object.fromEntries(documents.map(document => [document.key, { updatedAt: document.updatedAt, updatedBy: document.updatedBy }]));
    res.json({ groups: registry.groups, values, metadata });
  } catch (error) { next(error); }
});

router.put('/', requirePlatformPermission('settings.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const before = await getAllSettings({ force: true });
    if (req.body?.settings?.['security.mfaPolicy'] === 'platform_required' && before['security.mfaPolicy'] !== 'platform_required') {
      const actorFactor = await MfaFactor.findOne({ userId: req.user._id, enabled: true }).lean();
      if (!actorFactor) return res.status(409).json({ message: 'Enroll and verify your own MFA before requiring it for every platform operator' });
    }
    const changed = await updateSettings(req.body?.settings, req.user._id);
    if (changed['security.mfaPolicy'] === 'platform_required') {
      const enabledIds = await MfaFactor.find({ enabled: true }).distinct('userId');
      const affected = await User.find({ role: 'superadmin', tenantId: null, _id: { $nin: enabledIds } }).select('_id');
      if (affected.length) {
        await User.updateMany({ _id: { $in: affected.map(item => item._id) } }, { $set: { mfaEnrollmentRequired: true }, $inc: { tokenVersion: 1 } });
        for (const user of affected) await revokeAllUserSessions(user._id, req.user._id, 'Platform MFA policy enabled');
      }
    }
    const after = Object.fromEntries(Object.keys(changed).map(key => [key, changed[key]]));
    req.audit.set({ action: 'platform.settings.update', resource: 'platform-settings', changes: { oldValue: Object.fromEntries(Object.keys(changed).map(key => [key, before[key]])), newValue: after, changedFields: Object.keys(changed) } });
    res.json({ message: 'Platform settings updated', settings: after });
  } catch (error) { res.status(400).json({ message: error.message }); }
});

module.exports = router;
