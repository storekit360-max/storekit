'use strict';

const express = require('express');
const { Notification } = require('../../models/index');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');

const router = express.Router();

// ── GET /superadmin/notifications — platform-level notifications (tenantId: null) ──
router.get('/', requirePlatformPermission('notifications.view'), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ tenantId: null })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Notification.countDocuments({ tenantId: null, isRead: false }),
    ]);
    res.json({ notifications, unreadCount });
  } catch (error) { next(error); }
});

// ── PUT /superadmin/notifications/read-all ──
router.put('/read-all', requirePlatformPermission('notifications.view'), async (req, res, next) => {
  try {
    await Notification.updateMany({ tenantId: null }, { isRead: true });
    res.json({ success: true });
  } catch (error) { next(error); }
});

// ── PUT /superadmin/notifications/:id/read ──
router.put('/:id/read', requirePlatformPermission('notifications.view'), async (req, res, next) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, tenantId: null },
      { isRead: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: 'Notification not found' });
    res.json(notif);
  } catch (error) { next(error); }
});

// ── DELETE /superadmin/notifications/clear-read ──
router.delete('/clear-read', requirePlatformPermission('notifications.view'), async (req, res, next) => {
  try {
    const result = await Notification.deleteMany({ tenantId: null, isRead: true });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) { next(error); }
});

// ── DELETE /superadmin/notifications/clear-all ──
router.delete('/clear-all', requirePlatformPermission('notifications.view'), async (req, res, next) => {
  try {
    const result = await Notification.deleteMany({ tenantId: null });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) { next(error); }
});

module.exports = router;