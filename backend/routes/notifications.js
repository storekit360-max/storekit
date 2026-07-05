const express = require('express');
const router  = express.Router();
const { Notification, Settings } = require('../models/index');
const { adminAuth } = require('../middleware/auth');

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
];

// ── Helper: get which types are enabled in Settings ───────────────────────────
async function getEnabledTypes() {
  const rows = await Settings.find({
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
    const enabled = await getEnabledTypes();
    const notifications = await Notification.find({ type: { $in: enabled } })
      .sort({ createdAt: -1 })
      .limit(60);
    const unreadCount = await Notification.countDocuments({
      type: { $in: enabled },
      isRead: false,
    });
    res.json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /notifications/read-all ───────────────────────────────────────────────
router.put('/read-all', adminAuth, async (req, res) => {
  try {
    await Notification.updateMany({}, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /notifications/clear-read ─────────────────────────────────────────
router.delete('/clear-read', adminAuth, async (req, res) => {
  try {
    const result = await Notification.deleteMany({ isRead: true });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /notifications/clear-all ──────────────────────────────────────────
router.delete('/clear-all', adminAuth, async (req, res) => {
  try {
    const result = await Notification.deleteMany({});
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /notifications/:id/read ───────────────────────────────────────────────
router.put('/:id/read', adminAuth, async (req, res) => {
  try {
    const notif = await Notification.findByIdAndUpdate(
      req.params.id,
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
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;