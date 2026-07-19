'use strict';

const express = require('express');
const mongoose = require('mongoose');
const AuditEvent = require('../../models/AuditEvent');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');

const router = express.Router();
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10000;

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function validDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildFilter(query) {
  const filter = {};
  const from = validDate(query.from);
  const to = validDate(query.to);
  if (query.from && !from) return { error: 'Invalid from date' };
  if (query.to && !to) return { error: 'Invalid to date' };
  if (from || to) filter.occurredAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (query.action) filter.action = String(query.action).trim().slice(0, 100);
  if (query.resource) filter.resource = String(query.resource).trim().slice(0, 100);
  if (query.resourceId) filter.resourceId = String(query.resourceId).trim().slice(0, 200);
  if (query.status && ['success', 'failure'].includes(query.status)) filter['outcome.status'] = query.status;
  if (query.actorId) {
    if (!mongoose.isValidObjectId(query.actorId)) return { error: 'Invalid actor identifier' };
    filter['actor.userId'] = query.actorId;
  }
  if (query.tenantId) {
    if (!mongoose.isValidObjectId(query.tenantId)) return { error: 'Invalid tenant identifier' };
    filter.tenantId = query.tenantId;
  }
  if (query.cursor) {
    if (!mongoose.isValidObjectId(query.cursor)) return { error: 'Invalid cursor' };
    filter._id = { $lt: query.cursor };
  }
  if (query.search) {
    const escaped = String(query.search).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escaped) filter.$or = [
      { 'actor.email': { $regex: escaped, $options: 'i' } },
      { correlationId: { $regex: escaped, $options: 'i' } },
      { resourceId: { $regex: escaped, $options: 'i' } },
    ];
  }
  return { filter };
}

function csvCell(value) {
  const normalized = value == null ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

router.get('/', requirePlatformPermission('audit.view'), async (req, res, next) => {
  try {
    const result = buildFilter(req.query);
    if (result.error) return res.status(400).json({ message: result.error });
    const limit = positiveInteger(req.query.limit, 50, MAX_PAGE_SIZE);
    const rows = await AuditEvent.find(result.filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;
    res.json({ events, page: { limit, hasMore, nextCursor: hasMore ? String(events.at(-1)._id) : null } });
  } catch (error) { next(error); }
});

router.get('/facets', requirePlatformPermission('audit.view'), async (_req, res, next) => {
  try {
    const [actions, resources] = await Promise.all([
      AuditEvent.distinct('action'),
      AuditEvent.distinct('resource'),
    ]);
    res.json({ actions: actions.sort(), resources: resources.sort(), statuses: ['success', 'failure'] });
  } catch (error) { next(error); }
});

router.get('/export.csv', requirePlatformPermission('audit.export'), async (req, res, next) => {
  try {
    const result = buildFilter(req.query);
    if (result.error) return res.status(400).json({ message: result.error });
    delete result.filter._id;
    const rows = await AuditEvent.find(result.filter).sort({ _id: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const header = ['occurredAt', 'correlationId', 'actorEmail', 'actorRole', 'tenantId', 'action', 'resource', 'resourceId', 'method', 'path', 'ip', 'status', 'statusCode', 'durationMs'];
    const output = [header.map(csvCell).join(',')];
    for (const event of rows) {
      output.push([
        event.occurredAt?.toISOString?.() || event.occurredAt, event.correlationId, event.actor?.email,
        event.actor?.role, event.tenantId, event.action, event.resource, event.resourceId,
        event.request?.method, event.request?.path, event.request?.ip, event.outcome?.status,
        event.outcome?.statusCode, event.outcome?.durationMs,
      ].map(csvCell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="storekit-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${output.join('\n')}`);
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.buildFilter = buildFilter;
module.exports.csvCell = csvCell;
