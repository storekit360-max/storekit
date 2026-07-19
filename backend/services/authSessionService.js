'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AuthSession = require('../models/AuthSession');
const AuthEvent = require('../models/AuthEvent');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { getSetting } = require('./platformSettingsService');

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function clientContext(req) {
  return {
    ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    correlationId: req.correlationId || '',
  };
}

function deviceLabel(userAgent) {
  const value = String(userAgent || '');
  const browser = /Edg\//.test(value) ? 'Edge' : /Chrome\//.test(value) ? 'Chrome' : /Firefox\//.test(value) ? 'Firefox' : /Safari\//.test(value) ? 'Safari' : 'Unknown browser';
  const system = /Windows/.test(value) ? 'Windows' : /Mac OS|Macintosh/.test(value) ? 'macOS' : /Android/.test(value) ? 'Android' : /iPhone|iPad/.test(value) ? 'iOS' : /Linux/.test(value) ? 'Linux' : 'Unknown device';
  return `${browser} on ${system}`;
}

async function issueSession(user, req, authMethod, { mfaVerified = false } = {}) {
  const sessionId = crypto.randomUUID();
  const storedVersion = user.tokenVersion === undefined
    ? await User.findById(user._id).select('+tokenVersion').lean()
    : user;
  const tokenVersion = Number(storedVersion?.tokenVersion || 0);
  const timeoutMinutes = Math.min(Math.max(Number(await getSetting('security.sessionTimeoutMinutes').catch(() => 43200)) || 43200, 15), 43200);
  const token = generateToken(user, { sessionId, tokenVersion, expiresIn: `${timeoutMinutes}m` });
  const decoded = jwt.decode(token);
  const context = clientContext(req);
  await AuthSession.create({
    sessionId, userId: user._id, tenantId: user.tenantId || null, role: user.role,
    authMethod, tokenVersion, ...context, deviceLabel: deviceLabel(context.userAgent),
    expiresAt: decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + SESSION_MS),
    mfaVerifiedAt: mfaVerified ? new Date() : null,
    lastStepUpAt: mfaVerified ? new Date() : null,
  });
  await recordAuthEvent(req, { user, eventType: 'login', outcome: 'success', authMethod, sessionId });
  return token;
}

async function issueImpersonationSession(user, actor, req, reason) {
  const sessionId = crypto.randomUUID();
  const stored = await User.findById(user._id).select('+tokenVersion').lean();
  const tokenVersion = Number(stored?.tokenVersion || 0);
  const token = generateToken(user, { sessionId, tokenVersion, expiresIn: '15m' });
  const context = clientContext(req);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await AuthSession.create({
    sessionId, userId: user._id, tenantId: user.tenantId, role: user.role,
    authMethod: 'impersonation', tokenVersion, ...context,
    deviceLabel: `Impersonated by ${actor.email}`, expiresAt,
    impersonatedBy: actor._id, impersonationReason: String(reason || '').trim().slice(0, 500),
    mfaVerifiedAt: new Date(), lastStepUpAt: new Date(),
  });
  await recordAuthEvent(req, { user, eventType: 'login', outcome: 'success', authMethod: 'impersonation', sessionId,
    metadata: { impersonatedBy: String(actor._id), actorEmail: actor.email, reason: String(reason || '').trim().slice(0, 500) } });
  return { token, sessionId, expiresAt };
}

async function recordAuthEvent(req, { user = null, email = '', eventType = 'login', outcome, reason = '', authMethod = '', sessionId = '', metadata = {} }) {
  const context = clientContext(req);
  return AuthEvent.create({
    userId: user?._id || null, tenantId: user?.tenantId || null, email: user?.email || String(email).toLowerCase().trim().slice(0, 320),
    role: user?.role || '', eventType, outcome, reason, authMethod, sessionId, ...context, metadata,
  });
}

async function revokeSession(sessionId, actorId, reason) {
  return AuthSession.findOneAndUpdate({ sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: actorId || null, revokeReason: String(reason || '').slice(0, 500) } }, { new: true });
}

async function revokeAllUserSessions(userId, actorId, reason) {
  return AuthSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedBy: actorId || null, revokeReason: String(reason || '').slice(0, 500) } });
}

module.exports = { clientContext, deviceLabel, issueSession, issueImpersonationSession, recordAuthEvent, revokeSession, revokeAllUserSessions };
