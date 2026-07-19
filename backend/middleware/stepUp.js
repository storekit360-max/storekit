'use strict';

const AuthSession = require('../models/AuthSession');
const MfaFactor = require('../models/MfaFactor');

function requireRecentStepUp(maxAgeMs = 10 * 60 * 1000) {
  return async (req, res, next) => {
    try {
      const factor = await MfaFactor.findOne({ userId: req.user?._id, enabled: true }).select('_id').lean();
      if (!factor) return res.status(428).json({ code: 'MFA_ENROLLMENT_REQUIRED', message: 'Enable multi-factor authentication before performing this sensitive action' });
      if (!req.authSessionId) return res.status(428).json({ code: 'STEP_UP_REQUIRED', message: 'Sign in again with MFA before performing this sensitive action' });
      const session = await AuthSession.findOne({ sessionId: req.authSessionId, userId: req.user._id, revokedAt: null }).select('lastStepUpAt').lean();
      if (!session?.lastStepUpAt || Date.now() - new Date(session.lastStepUpAt).getTime() > maxAgeMs) {
        return res.status(428).json({ code: 'STEP_UP_REQUIRED', message: 'Recent MFA verification is required for this sensitive action', maxAgeSeconds: Math.floor(maxAgeMs / 1000) });
      }
      next();
    } catch (error) { next(error); }
  };
}

module.exports = { requireRecentStepUp };
