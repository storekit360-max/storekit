/**
 * routes/automation.js
 */
const express = require('express');
const router  = express.Router();
const { adminAuth } = require('../middleware/auth');
const ctrl = require('../controllers/automationController');

router.use(adminAuth);

router.get   ('/rules',           ctrl.getRules);
router.put   ('/rules/:trigger',  ctrl.updateRule);
router.post  ('/manual',          ctrl.manualTrigger);
router.post  ('/retry/:logId',    ctrl.retryLog);
router.get   ('/stats',           ctrl.getStats);
router.get   ('/logs',            ctrl.getLogs);
router.get   ('/logs/:id',        ctrl.getLog);
router.delete('/logs',            ctrl.clearLogs);      // ?status=failed
router.delete('/logs/:id',        ctrl.deleteLog);

module.exports = router;