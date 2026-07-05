// ─── GET /api/monitoring ──────────────────────────────────────────────────────
// Admin-only endpoint that returns the current monitoring snapshot.
// Protect with your existing auth + isAdmin middleware.

const express = require('express');
const router  = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const { getSnapshot, resetStats } = require('../middleware/monitoring');

// GET /api/monitoring  — full metrics snapshot
router.get('/', auth, adminAuth, (req, res) => {
  res.json(getSnapshot());
});

// DELETE /api/monitoring/reset  — reset all counters
router.delete('/reset', auth, adminAuth, (req, res) => {
  resetStats();
  res.json({ ok: true, message: 'Monitoring stats reset.' });
});

module.exports = router;