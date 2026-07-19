'use strict';

const AuditEvent = require('../models/AuditEvent');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = /password|token|secret|credential|authorization|cookie|api[-_]?key/i;

function safeAuditValue(value, depth = 0) {
  if (depth > 5 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => safeAuditValue(item, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 1000) : value;
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
    key,
    SENSITIVE_KEYS.test(key) ? '[REDACTED]' : safeAuditValue(item, depth + 1),
  ]));
}

function inferResource(req) {
  const parts = String(req.originalUrl || req.baseUrl || req.path || '').split('?')[0].split('/').filter(Boolean);
  const platformIndex = parts.indexOf('superadmin');
  return parts[platformIndex + 1] || 'platform';
}

function inferResourceId(req) {
  const explicit = req.params?.id || req.params?.tenantId || req.params?.userId;
  if (explicit) return String(explicit);
  const parts = String(req.originalUrl || '').split('?')[0].split('/').filter(Boolean);
  const platformIndex = parts.indexOf('superadmin');
  const candidate = parts[platformIndex + 2] || '';
  return /^[a-f\d]{24}$/i.test(candidate) ? candidate : '';
}

function platformAudit(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  req.audit = {
    action: `${req.method.toLowerCase()}.${inferResource(req)}`,
    resource: inferResource(req),
    resourceId: inferResourceId(req),
    changes: undefined,
    metadata: {},
    set(details = {}) { Object.assign(this, details); },
  };

  res.on('finish', () => {
    const durationMs = req.requestStartedAt
      ? Number((process.hrtime.bigint() - req.requestStartedAt) / 1000000n)
      : 0;
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const event = {
      correlationId: req.correlationId || 'missing',
      actor: {
        userId: req.user?._id || null,
        email: req.user?.email || '',
        role: req.user?.role || '',
      },
      tenantId: req.tenantId || req.user?.tenantId || null,
      action: req.audit.action,
      resource: req.audit.resource,
      resourceId: req.audit.resourceId || inferResourceId(req),
      request: {
        method: req.method,
        path: String(req.originalUrl || req.path).split('?')[0],
        endpoint: req.route?.path || '',
        ip: forwarded || req.socket?.remoteAddress || '',
        userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
      },
      outcome: {
        status: res.statusCode < 400 ? 'success' : 'failure',
        statusCode: res.statusCode,
        durationMs,
      },
      changes: req.audit.changes ? safeAuditValue(req.audit.changes) : undefined,
      metadata: safeAuditValue(req.audit.metadata || {}),
    };

    AuditEvent.create(event).catch(error => {
      console.error('[PLATFORM_AUDIT_WRITE_FAILED]', { correlationId: event.correlationId, error: error.message });
    });
  });

  next();
}

module.exports = { platformAudit, safeAuditValue };
