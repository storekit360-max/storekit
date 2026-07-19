'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Tenant = require('../../models/Tenant');
const Plan = require('../../models/Plan');
const User = require('../../models/User');
const SupportTicket = require('../../models/SupportTicket');
const RuntimeFeatureFlag = require('../../models/RuntimeFeatureFlag');
const AuditEvent = require('../../models/AuditEvent');

const router = express.Router();
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const allowed = (req, permission) => req.platformPermissions?.has(permission);
const item = (type, id, title, subtitle, tab, query = {}) => ({ type, id: String(id), title, subtitle, tab, query });

router.get('/', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim().replace(/\s+/g, ' ');
    if (query.length < 2) return res.json({ query, groups: [], total: 0 });
    if (query.length > 80) return res.status(400).json({ message: 'Search query must be 80 characters or fewer' });
    const regex = new RegExp(escapeRegex(query), 'i');
    const objectId = mongoose.isValidObjectId(query) ? query : null;
    const jobs = [];
    const add = (type, permission, run, map) => {
      if (!allowed(req, permission)) return;
      jobs.push(run().then(rows => ({ type, items: rows.map(map) })));
    };

    add('Tenants', 'tenant.view', () => Tenant.find({ $or: [
      ...(objectId ? [{ _id: objectId }] : []), { storeName: regex }, { slug: regex }, { 'domains.domain': regex }, { 'settings.storeEmail': regex },
    ] }).select('storeName slug status domains settings.storeEmail').limit(8).maxTimeMS(1500).lean(), row => item('tenant', row._id, row.storeName, `${row.slug} · ${row.status}`, 'tenant-workspace', { tenant: String(row._id) }));
    add('Plans', 'billing.view', () => Plan.find({ $or: [{ name: regex }, { slug: regex }] }).select('name slug price currency active').limit(6).maxTimeMS(1500).lean(), row => item('plan', row._id, row.name, `${row.currency} ${row.price} · ${row.active ? 'active' : 'inactive'}`, 'plans', { plan: String(row._id) }));
    add('Platform users', 'users.view', () => User.find({ role: 'superadmin', tenantId: null, $or: [
      ...(objectId ? [{ _id: objectId }] : []), { email: regex }, { firstName: regex }, { lastName: regex }, { username: regex },
    ] }).select('email firstName lastName isActive').limit(8).maxTimeMS(1500).lean(), row => item('platform-user', row._id, `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.email, `${row.email} · ${row.isActive ? 'active' : 'suspended'}`, 'access', { user: String(row._id) }));
    add('Support tickets', 'support.view', () => SupportTicket.find({ $or: [
      ...(objectId ? [{ _id: objectId }] : []), { number: regex }, { subject: regex }, { tags: regex },
    ] }).populate('tenant', 'storeName').select('number subject status priority tenant').limit(8).maxTimeMS(1500).lean(), row => item('support-ticket', row._id, `${row.number} · ${row.subject}`, `${row.tenant?.storeName || 'Unknown tenant'} · ${row.priority} · ${row.status}`, 'support-center', { ticket: String(row._id) }));
    add('Runtime flags', 'featureflags.view', () => RuntimeFeatureFlag.find({ $or: [{ key: regex }, { name: regex }, { description: regex }] }).select('key name enabled killSwitch').limit(6).maxTimeMS(1500).lean(), row => item('runtime-flag', row._id, row.name, `${row.key} · ${row.killSwitch ? 'killed' : row.enabled ? 'enabled' : 'disabled'}`, 'runtime-flags', { flag: String(row._id) }));
    add('Audit events', 'audit.view', () => AuditEvent.find({ $or: [
      ...(objectId ? [{ _id: objectId }] : []), { correlationId: regex }, { action: regex }, { resource: regex }, { resourceId: regex }, { 'actor.email': regex },
    ] }).select('action resource resourceId actor.email outcome.status occurredAt correlationId').sort({ occurredAt: -1 }).limit(8).maxTimeMS(1500).lean(), row => item('audit-event', row._id, row.action, `${row.actor?.email || 'System'} · ${row.resource} · ${row.outcome?.status}`, 'audit', { correlationId: row.correlationId }));

    const groups = (await Promise.all(jobs)).filter(group => group.items.length);
    res.set('Cache-Control', 'no-store');
    res.json({ query, groups, total: groups.reduce((sum, group) => sum + group.items.length, 0) });
  } catch (error) { next(error); }
});

module.exports = router;
