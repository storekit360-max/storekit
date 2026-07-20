const express = require('express');
const router  = express.Router();
const { Notification, Settings } = require('../models/index');
const { adminAuth } = require('../middleware/auth');

const PLATFORM_NOTIFICATION_LINK = /^\/superadmin(?:[/?#]|$)/i;

function tenantNotificationFilter(req, extra = {}) {
  return {
    ...extra,
    tenantId: req.user.tenantId,
    $nor: [{ link: PLATFORM_NOTIFICATION_LINK }],
  };
}

// ── The 6 core notification types shown in the panel ─────────────────────────
// Each maps to a Settings key: panelNotif_<type> (boolean, default true)
const PANEL_TYPES = [
  'new_order',
  'new_user',
  'payment_slip',
  'payment_confirmed',
  'cancel_request',
  'return_request',
  'gift_card',   // gift card purchases, slip uploads, activations, rejections
  'system',      // platform announcements and maintenance notices
  'support_ticket',  // Added support ticket notifications
  'support_reply'    // Added support reply notifications
];

// ── Helper: get which types are enabled in Settings ───────────────────────────
async function getEnabledTypes(tenantId) {
  const rows = await Settings.find({
    tenantId,
    key: { $in: PANEL_TYPES.map(t => `panelNotif_${t}`) },
  });
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  // Default to true for any key not yet saved
  return PANEL_TYPES.filter(t => map[`panelNotif_${t}`] !== false && map[`panelNotif_${t}`] !== 'false');
}

// ── GET /notifications — only return enabled types, max 60 ───────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const enabled = await getEnabledTypes(req.user.tenantId);
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(tenantNotificationFilter(req, { type: { $in: enabled } }))
        .sort({ createdAt: -1 })
        .limit(60)
        .lean(),
      Notification.countDocuments(tenantNotificationFilter(req, {
        type: { $in: enabled },
        isRead: false,
      })),
    ]);
    res.set('Cache-Control', 'private, no-store');
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /notifications/read-all ───────────────────────────────────────────────
router.put('/read-all', adminAuth, async (req, res) => {
  try {
    await Notification.updateMany(tenantNotificationFilter(req), { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /notifications/clear-read ─────────────────────────────────────────
router.delete('/clear-read', adminAuth, async (req, res) => {
  try {
    const result = await Notification.deleteMany(tenantNotificationFilter(req, { isRead: true }));
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /notifications/clear-all ──────────────────────────────────────────
router.delete('/clear-all', adminAuth, async (req, res) => {
  try {
    const result = await Notification.deleteMany(tenantNotificationFilter(req));
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /notifications/:id/read ───────────────────────────────────────────────
router.put('/:id/read', adminAuth, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      tenantNotificationFilter(req, { _id: req.params.id }),
      { isRead: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: 'Notification not found' });
    res.json(notif);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /notifications/:id ─────────────────────────────────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const notif = await Notification.findOneAndDelete(tenantNotificationFilter(req, { _id: req.params.id }));
    if (!notif) return res.status(404).json({ message: 'Notification not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
