'use strict';

const express = require('express');
const mongoose = require('mongoose');
const AuthSession = require('../../models/AuthSession');
const AuthEvent = require('../../models/AuthEvent');
const User = require('../../models/User');
const MfaFactor = require('../../models/MfaFactor');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const { revokeSession, revokeAllUserSessions, recordAuthEvent } = require('../../services/authSessionService');
const { requireRecentStepUp } = require('../../middleware/stepUp');
const PlatformSecurityRule = require('../../models/PlatformSecurityRule');
const firewall = require('../../services/platformFirewallService');
const jwtKeyring = require('../../utils/jwtKeyring');
const cryptographicKeys = require('../../services/cryptographicKeyService');

const router = express.Router();
const validId = value => mongoose.isValidObjectId(value);

router.get('/key-lifecycle', requirePlatformPermission('security.view'), async (_req, res, next) => {
  try { res.json({ generatedAt: new Date(), purposes: await cryptographicKeys.inventory() }); }
  catch (error) { next(error); }
});

router.post('/key-lifecycle/attest', requirePlatformPermission('security.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const purpose = String(req.body?.purpose || ''); const keyId = String(req.body?.keyId || ''); const action = String(req.body?.action || '');
    if (action === 'retired' && req.body?.confirmation !== `RETIRE ${purpose.toUpperCase()} ${keyId}`) return res.status(400).json({ message: `Type RETIRE ${purpose.toUpperCase()} ${keyId} to attest retirement` });
    const record = await cryptographicKeys.attest({ purpose, keyId, action, notes: req.body?.notes, deploymentId: req.body?.deploymentId, actorId: req.user._id });
    req.audit.set({ action: `security.key.${action}`, resource: 'cryptographic-key', resourceId: `${purpose}:${keyId}`, metadata: { purpose, keyId, deploymentId: record.deploymentId } });
    res.status(201).json(record);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.post('/key-lifecycle/platform-secrets/migrate', requirePlatformPermission('security.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const fromKeyId = String(req.body?.fromKeyId || '').trim();
    if (req.body?.confirmation !== `MIGRATE PLATFORM SECRETS ${fromKeyId}`) return res.status(400).json({ message: `Type MIGRATE PLATFORM SECRETS ${fromKeyId} to confirm re-encryption` });
    const result = await cryptographicKeys.migratePlatformSecrets(fromKeyId);
    req.audit.set({ action: 'security.key.migrate', resource: 'cryptographic-key', resourceId: `platform_secret_encryption:${fromKeyId}`, metadata: result });
    res.json(result);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.get('/overview', requirePlatformPermission('security.view'), async (_req, res, next) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 86400000);
    const [activeSessions, failed24h, blocked24h, lockedUsers, platformUsers, explicitlyAssigned, mfaEnabledOperators, activeNetworkRules] = await Promise.all([
      AuthSession.countDocuments({ revokedAt: null, expiresAt: { $gt: now } }),
      AuthEvent.countDocuments({ occurredAt: { $gte: last24h }, outcome: 'failure' }),
      AuthEvent.countDocuments({ occurredAt: { $gte: last24h }, outcome: 'blocked' }),
      User.countDocuments({ lockUntil: { $gt: now } }),
      User.countDocuments({ role: 'superadmin', tenantId: null, isActive: true }),
      User.countDocuments({ role: 'superadmin', tenantId: null, isActive: true, 'platformRoleIds.0': { $exists: true } }),
      MfaFactor.countDocuments({ enabled: true, userId: { $in: await User.find({ role: 'superadmin', tenantId: null, isActive: true }).distinct('_id') } }),
      PlatformSecurityRule.countDocuments({ active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }),
    ]);
    const checks = [
      { key: 'jwt_issuer', label: 'JWT issuer restriction', passed: Boolean(process.env.JWT_ISSUER), weight: 10 },
      { key: 'jwt_audience', label: 'JWT audience restriction', passed: Boolean(process.env.JWT_AUDIENCE), weight: 10 },
      { key: 'explicit_roles', label: 'All platform operators have explicit roles', passed: platformUsers > 0 && explicitlyAssigned === platformUsers, weight: 15 },
      { key: 'google_allowlist', label: 'Super Admin Google allowlist configured', passed: Boolean(process.env.SUPERADMIN_GOOGLE_EMAILS), weight: 10 },
      { key: 'session_registry', label: 'Revocable session registry enabled', passed: true, weight: 15 },
      { key: 'persistent_auth_events', label: 'Persistent authentication events enabled', passed: true, weight: 15 },
      { key: 'account_lockout', label: 'Account lockout enabled', passed: true, weight: 10 },
      { key: 'mfa', label: 'All platform operators use multi-factor authentication', passed: platformUsers > 0 && mfaEnabledOperators === platformUsers, weight: 15 },
      { key: 'network_policy', label: 'Network policy engine enabled', passed: true, weight: 0 },
      { key: 'jwt_rotation', label: 'Versioned JWT signing-key rotation ready', passed: jwtKeyring.status().rotationReady, weight: 0 },
    ];
    const score = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
    res.json({ generatedAt: now, score, grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F', checks, jwtSigning: jwtKeyring.status(), metrics: { activeSessions, failed24h, blocked24h, lockedUsers, platformUsers, explicitlyAssigned, mfaEnabledOperators, activeNetworkRules } });
  } catch (error) { next(error); }
});

router.get('/sessions', requirePlatformPermission('security.view'), async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const filter = {};
    if (req.query.active === 'true') Object.assign(filter, { revokedAt: null, expiresAt: { $gt: new Date() } });
    if (req.query.role) filter.role = String(req.query.role);
    if (req.query.userId) {
      if (!validId(req.query.userId)) return res.status(400).json({ message: 'Invalid user identifier' });
      filter.userId = req.query.userId;
    }
    const [sessions, total] = await Promise.all([
      AuthSession.find(filter).populate('userId', 'firstName lastName email isActive').sort({ lastSeenAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuthSession.countDocuments(filter),
    ]);
    res.json({ sessions, page: { number: page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.get('/auth-events', requirePlatformPermission('security.view'), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const filter = {};
    if (req.query.outcome) filter.outcome = req.query.outcome;
    if (req.query.eventType) filter.eventType = req.query.eventType;
    if (req.query.cursor) {
      if (!validId(req.query.cursor)) return res.status(400).json({ message: 'Invalid cursor' });
      filter._id = { $lt: req.query.cursor };
    }
    const rows = await AuthEvent.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit; const events = hasMore ? rows.slice(0, limit) : rows;
    res.json({ events, page: { limit, hasMore, nextCursor: hasMore ? String(events.at(-1)._id) : null } });
  } catch (error) { next(error); }
});

router.get('/network-rules', requirePlatformPermission('security.view'), async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const filter = req.query.active === 'false' ? { active: false } : req.query.active === 'all' ? {} : { active: true };
    const [rules, total] = await Promise.all([
      PlatformSecurityRule.find(filter).populate('createdBy disabledBy', 'email firstName lastName').sort({ active: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PlatformSecurityRule.countDocuments(filter),
    ]);
    const geo = firewall.geoContext(req);
    res.json({ rules, geo: { configured: geo.configured, trustedRequest: geo.trusted, detectedCountry: geo.country, header: geo.configured ? geo.header : '' }, page: { number: page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.post('/network-rules', requirePlatformPermission('security.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const kind = ['country_block', 'route_block'].includes(req.body?.kind) ? req.body.kind : 'ip_block';
    const geo = firewall.geoContext(req);
    if (kind === 'country_block' && (!geo.configured || !geo.trusted || !geo.country)) return res.status(409).json({ message: 'Geo blocking requires a configured and attested edge request with a detected country' });
    const value = kind === 'country_block' ? firewall.normalizeCountry(req.body?.value) : kind === 'route_block' ? firewall.normalizeRouteRule(req.body?.method, req.body?.path) : firewall.normalizeRule(req.body?.value);
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 10) return res.status(400).json({ message: 'Provide a security reason of at least 10 characters' });
    if (kind === 'ip_block' && firewall.matches(value, req.ip || req.socket?.remoteAddress)) return res.status(409).json({ message: 'This rule includes your current IP and would lock you out' });
    if (kind === 'country_block' && value === geo.country) return res.status(409).json({ message: 'This rule includes your currently detected country and would lock you out' });
    let expiresAt = null;
    if (req.body?.expiresAt) {
      expiresAt = new Date(req.body.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt > new Date(Date.now() + 366 * 86400000)) return res.status(400).json({ message: 'Expiration must be in the future and within one year' });
    }
    if (await PlatformSecurityRule.exists({ kind, value, active: true })) return res.status(409).json({ message: 'An active rule already blocks this source or route' });
    const rule = await PlatformSecurityRule.create({ kind, value, reason, expiresAt, createdBy: req.user._id });
    firewall.invalidateFirewallCache();
    req.audit.set({ action: 'security.network-rule.create', resource: 'platform-security-rule', resourceId: String(rule._id), changes: { newValue: { kind: rule.kind, value, reason, expiresAt } } });
    res.status(201).json(rule);
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.delete('/network-rules/:id', requirePlatformPermission('security.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid rule identifier' });
    const rule = await PlatformSecurityRule.findOneAndUpdate({ _id: req.params.id, active: true }, { $set: { active: false, disabledAt: new Date(), disabledBy: req.user._id } }, { new: true });
    if (!rule) return res.status(404).json({ message: 'Active network rule not found' });
    firewall.invalidateFirewallCache();
    req.audit.set({ action: 'security.network-rule.disable', resource: 'platform-security-rule', resourceId: String(rule._id), changes: { oldValue: { active: true }, newValue: { active: false } } });
    res.json({ message: 'Network rule disabled', rule });
  } catch (error) { next(error); }
});

router.post('/sessions/:sessionId/revoke', requirePlatformPermission('security.manage'), async (req, res, next) => {
  try {
    const session = await revokeSession(req.params.sessionId, req.user._id, req.body?.reason || 'Revoked by platform operator');
    if (!session) return res.status(404).json({ message: 'Active session not found' });
    await recordAuthEvent(req, { user: { _id: session.userId, tenantId: session.tenantId, role: session.role }, eventType: 'session_revoked', outcome: 'success', sessionId: session.sessionId, reason: session.revokeReason });
    req.audit.set({ action: 'security.session.revoke', resource: 'session', resourceId: session.sessionId, metadata: { targetUserId: String(session.userId), reason: session.revokeReason } });
    res.json({ message: 'Session revoked' });
  } catch (error) { next(error); }
});

router.post('/users/:id/force-logout', requirePlatformPermission('security.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid user identifier' });
    const reason = String(req.body?.reason || 'Force logout by platform operator').slice(0, 500);
    const user = await User.findByIdAndUpdate(req.params.id, { $inc: { tokenVersion: 1 } }, { new: true }).select('+tokenVersion email role tenantId');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const result = await revokeAllUserSessions(user._id, req.user._id, reason);
    await recordAuthEvent(req, { user, eventType: 'session_revoked', outcome: 'success', reason, metadata: { sessionCount: result.modifiedCount } });
    req.audit.set({ action: 'security.user.force-logout', resource: 'user', resourceId: String(user._id), metadata: { reason, revokedSessions: result.modifiedCount } });
    res.json({ message: 'All user sessions revoked', revokedSessions: result.modifiedCount });
  } catch (error) { next(error); }
});

router.post('/users/:id/unlock', requirePlatformPermission('security.manage'), async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { $set: { loginAttempts: 0, lockUntil: null } }, { new: true }).select('email role');
    if (!user) return res.status(404).json({ message: 'User not found' });
    req.audit.set({ action: 'security.user.unlock', resource: 'user', resourceId: String(user._id) });
    res.json({ message: 'Account lock cleared' });
  } catch (error) { next(error); }
});

module.exports = router;
