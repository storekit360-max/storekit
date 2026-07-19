'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Tenant = require('../../models/Tenant');
const Product = require('../../models/Product');
const Order = require('../../models/Order');
const User = require('../../models/User');
const TenantPayment = require('../../models/TenantPayment');
const SubscriptionInvoice = require('../../models/SubscriptionInvoice');
const TenantNote = require('../../models/TenantNote');
const AuditEvent = require('../../models/AuditEvent');
const PlatformSavedView = require('../../models/PlatformSavedView');
const { calculateTenantHealth } = require('../../services/tenantHealthService');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const { requireRecentStepUp } = require('../../middleware/stepUp');
const { issueImpersonationSession } = require('../../services/authSessionService');

const router = express.Router();

const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = value => mongoose.isValidObjectId(value);
const cleanTags = values => Array.from(new Set((Array.isArray(values) ? values : []).map(value => String(value).trim().toLowerCase().slice(0, 40)).filter(Boolean))).slice(0, 20);
const SAVED_VIEW_MODULE = 'tenant_workspace';

function normalizeInlineMetadata(body) {
  const changes = {};
  if (Object.hasOwn(body || {}, 'storeName')) {
    const storeName = String(body.storeName || '').trim().replace(/\s+/g, ' ');
    if (storeName.length < 2 || storeName.length > 120) throw Object.assign(new Error('Store name must contain 2 to 120 characters'), { statusCode: 400 });
    changes.storeName = storeName;
  }
  if (Object.hasOwn(body || {}, 'tags')) changes['management.tags'] = cleanTags(body.tags);
  if (!Object.keys(changes).length) throw Object.assign(new Error('Store name or tags are required'), { statusCode: 400 });
  const expectedUpdatedAt = new Date(body?.expectedUpdatedAt);
  if (!body?.expectedUpdatedAt || Number.isNaN(expectedUpdatedAt.getTime())) throw Object.assign(new Error('A valid expectedUpdatedAt value is required'), { statusCode: 400 });
  return { changes, expectedUpdatedAt };
}

function normalizeSavedView(body) {
  const name = String(body?.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw Object.assign(new Error('Saved view name must contain 2 to 80 characters'), { statusCode: 400 });
  const source = body?.state?.filters || {};
  const status = String(source.status || ''); const archived = String(source.archived || 'false');
  if (!['', 'active', 'suspended', 'pending'].includes(status)) throw Object.assign(new Error('Saved view status filter is invalid'), { statusCode: 400 });
  if (!['false', 'true', 'all'].includes(archived)) throw Object.assign(new Error('Saved view archive filter is invalid'), { statusCode: 400 });
  return { name, normalizedName: name.toLocaleLowerCase('en-US'), isDefault: body?.isDefault === true, state: { filters: { search: String(source.search || '').trim().slice(0, 100), status, archived } } };
}

async function usageForTenantIds(ids) {
  if (!ids.length) return new Map();
  const [products, orders, admins] = await Promise.all([
    Product.aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: '$tenantId', products: { $sum: 1 }, activeProducts: { $sum: { $cond: ['$isActive', 1, 0] } }, stockUnits: { $sum: '$stock' }, imageAssets: { $sum: { $add: [{ $size: { $ifNull: ['$images', []] } }, { $cond: [{ $ifNull: ['$thumbnail', false] }, 1, 0] }] } } } }]),
    Order.aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: '$tenantId', orders: { $sum: 1 }, grossSales: { $sum: '$total' }, paidSales: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } }, lastOrderAt: { $max: '$createdAt' } } }]),
    User.aggregate([{ $match: { tenantId: { $in: ids }, role: 'admin' } }, { $group: { _id: '$tenantId', admins: { $sum: 1 }, activeAdmins: { $sum: { $cond: ['$isActive', 1, 0] } }, lastAdminLoginAt: { $max: '$lastLogin' } } }]),
  ]);
  const map = new Map(ids.map(id => [String(id), { products: 0, activeProducts: 0, stockUnits: 0, imageAssets: 0, orders: 0, grossSales: 0, paidSales: 0, admins: 0, activeAdmins: 0, lastOrderAt: null, lastAdminLoginAt: null }]));
  for (const rows of [products, orders, admins]) for (const row of rows) Object.assign(map.get(String(row._id)), row);
  return map;
}

router.get('/', requirePlatformPermission('tenant.view'), async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.plan && validId(req.query.plan)) filter.plan = req.query.plan;
    if (req.query.tag) filter['management.tags'] = String(req.query.tag).toLowerCase().trim();
    if (req.query.archived === 'true') filter['management.archivedAt'] = { $ne: null };
    else if (req.query.archived !== 'all') filter['management.archivedAt'] = null;
    if (req.query.search) {
      const search = escapeRegex(String(req.query.search).trim().slice(0, 100));
      filter.$or = [{ storeName: { $regex: search, $options: 'i' } }, { slug: { $regex: search, $options: 'i' } }, { 'domains.domain': { $regex: search, $options: 'i' } }];
    }
    const [tenants, total] = await Promise.all([
      Tenant.find(filter).populate('plan', 'name slug price currency billingCycle limits features').populate('owner', 'firstName lastName email isActive lastLogin').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Tenant.countDocuments(filter),
    ]);
    const usageMap = await usageForTenantIds(tenants.map(tenant => tenant._id));
    const rows = tenants.map(tenant => {
      const usage = usageMap.get(String(tenant._id));
      return { ...tenant, usage, health: calculateTenantHealth(tenant, usage) };
    });
    res.json({ tenants: rows, page: { number: page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.get('/saved-views/list', requirePlatformPermission('tenant.view'), async (req, res, next) => {
  try { res.json({ views: await PlatformSavedView.find({ ownerId: req.user._id, module: SAVED_VIEW_MODULE }).sort({ isDefault: -1, name: 1 }).lean(), limit: 20 }); }
  catch (error) { next(error); }
});

router.post('/saved-views', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    const input = normalizeSavedView(req.body);
    if (await PlatformSavedView.countDocuments({ ownerId: req.user._id, module: SAVED_VIEW_MODULE }) >= 20) return res.status(409).json({ message: 'A maximum of 20 saved tenant views is allowed per operator' });
    const view = await PlatformSavedView.create({ ownerId: req.user._id, module: SAVED_VIEW_MODULE, ...input, isDefault: false });
    if (input.isDefault) {
      await PlatformSavedView.updateMany({ ownerId: req.user._id, module: SAVED_VIEW_MODULE, _id: { $ne: view._id } }, { $set: { isDefault: false } });
      view.isDefault = true; await view.save();
    }
    req.audit.set({ action: 'tenant.saved-view.create', resource: 'platform-saved-view', resourceId: String(view._id), changes: { newValue: { name: view.name, isDefault: view.isDefault, state: view.state } } });
    res.status(201).json(view);
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: 'A tenant view with this name already exists or another default view won a concurrent update' }); if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.put('/saved-views/:viewId/default', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    if (!validId(req.params.viewId)) return res.status(400).json({ message: 'Invalid saved view identifier' });
    const view = await PlatformSavedView.findOne({ _id: req.params.viewId, ownerId: req.user._id, module: SAVED_VIEW_MODULE });
    if (!view) return res.status(404).json({ message: 'Saved tenant view not found' });
    await PlatformSavedView.updateMany({ ownerId: req.user._id, module: SAVED_VIEW_MODULE, _id: { $ne: view._id } }, { $set: { isDefault: false } });
    view.isDefault = true; await view.save();
    req.audit.set({ action: 'tenant.saved-view.default', resource: 'platform-saved-view', resourceId: String(view._id) });
    res.json(view);
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: 'Another default view won a concurrent update; refresh and retry' }); next(error); }
});

router.delete('/saved-views/:viewId', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    if (!validId(req.params.viewId)) return res.status(400).json({ message: 'Invalid saved view identifier' });
    const view = await PlatformSavedView.findOneAndDelete({ _id: req.params.viewId, ownerId: req.user._id, module: SAVED_VIEW_MODULE });
    if (!view) return res.status(404).json({ message: 'Saved tenant view not found' });
    req.audit.set({ action: 'tenant.saved-view.delete', resource: 'platform-saved-view', resourceId: String(view._id), changes: { oldValue: { name: view.name, state: view.state } } });
    res.json({ message: 'Saved tenant view deleted' });
  } catch (error) { next(error); }
});

router.put('/:id/metadata', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid tenant identifier' });
    const { changes, expectedUpdatedAt } = normalizeInlineMetadata(req.body);
    const tenant = await Tenant.findOne({ _id: req.params.id, updatedAt: expectedUpdatedAt }).select('storeName management.tags updatedAt').lean();
    if (!tenant) {
      if (!(await Tenant.exists({ _id: req.params.id }))) return res.status(404).json({ message: 'Tenant not found' });
      return res.status(409).json({ message: 'This tenant changed after you loaded it. Refresh and retry your edit.' });
    }
    const result = await Tenant.updateOne({ _id: req.params.id, updatedAt: expectedUpdatedAt }, { $set: changes, $currentDate: { updatedAt: true } }, { runValidators: true });
    if (result.modifiedCount !== 1) return res.status(409).json({ message: 'This tenant changed while you were saving. Refresh and retry your edit.' });
    const updated = await Tenant.findById(req.params.id).select('storeName management.tags updatedAt').lean();
    req.audit.set({ action: 'tenant.metadata.update', resource: 'tenant', resourceId: req.params.id, changes: { oldValue: { storeName: tenant.storeName, tags: tenant.management?.tags || [] }, newValue: { storeName: updated.storeName, tags: updated.management?.tags || [] }, changedFields: Object.keys(changes) } });
    res.json({ tenant: updated });
  } catch (error) { if (error.statusCode) return res.status(error.statusCode).json({ message: error.message }); next(error); }
});

router.get('/:id', requirePlatformPermission('tenant.view'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid tenant identifier' });
    const tenant = await Tenant.findById(req.params.id).populate('plan').populate('owner', 'firstName lastName email username isActive lastLogin createdAt').lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const usage = (await usageForTenantIds([tenant._id])).get(String(tenant._id));
    const [payments, invoices, noteCount] = await Promise.all([
      TenantPayment.find({ tenant: tenant._id }).sort({ createdAt: -1 }).limit(20).lean(),
      SubscriptionInvoice.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(20).lean(),
      TenantNote.countDocuments({ tenantId: tenant._id }),
    ]);
    res.json({ tenant, usage, health: calculateTenantHealth(tenant, usage), billing: { payments, invoices }, noteCount, storage: { status: 'not_metered', measuredBytes: null, message: 'Storage is not reported until provider-backed tenant metering is available.' } });
  } catch (error) { next(error); }
});

router.get('/:id/activity', requirePlatformPermission('tenant.view'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid tenant identifier' });
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const events = await AuditEvent.find({ $or: [{ tenantId: req.params.id }, { resourceId: req.params.id }] }).sort({ _id: -1 }).limit(limit).lean();
    res.json({ events });
  } catch (error) { next(error); }
});

router.get('/:id/notes', requirePlatformPermission('tenant.view'), async (req, res, next) => {
  try { res.json(await TenantNote.find({ tenantId: req.params.id }).populate('authorId', 'firstName lastName email').sort({ pinned: -1, createdAt: -1 }).lean()); }
  catch (error) { next(error); }
});

router.post('/:id/notes', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    if (!validId(req.params.id) || !(await Tenant.exists({ _id: req.params.id }))) return res.status(404).json({ message: 'Tenant not found' });
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Note body is required' });
    const note = await TenantNote.create({ tenantId: req.params.id, authorId: req.user._id, body, pinned: req.body?.pinned === true });
    req.audit.set({ action: 'tenant.note.create', resource: 'tenant', resourceId: req.params.id, metadata: { noteId: String(note._id) } });
    res.status(201).json(await note.populate('authorId', 'firstName lastName email'));
  } catch (error) { next(error); }
});

router.put('/:id/notes/:noteId', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Note body is required' });
    const note = await TenantNote.findOneAndUpdate(
      { _id: req.params.noteId, tenantId: req.params.id },
      { $set: { body, pinned: req.body?.pinned === true, editedAt: new Date() } },
      { new: true, runValidators: true }
    ).populate('authorId', 'firstName lastName email');
    if (!note) return res.status(404).json({ message: 'Tenant note not found' });
    req.audit.set({ action: 'tenant.note.update', resource: 'tenant', resourceId: req.params.id, metadata: { noteId: String(note._id) } });
    res.json(note);
  } catch (error) { next(error); }
});

router.delete('/:id/notes/:noteId', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    const note = await TenantNote.findOneAndDelete({ _id: req.params.noteId, tenantId: req.params.id });
    if (!note) return res.status(404).json({ message: 'Tenant note not found' });
    req.audit.set({ action: 'tenant.note.delete', resource: 'tenant', resourceId: req.params.id, metadata: { noteId: String(note._id) } });
    res.json({ message: 'Tenant note deleted' });
  } catch (error) { next(error); }
});

router.put('/:id/tags', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id).select('management');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const oldValue = { tags: tenant.management?.tags || [] };
    tenant.management.tags = cleanTags(req.body?.tags);
    await tenant.save();
    req.audit.set({ action: 'tenant.tags.update', resource: 'tenant', resourceId: req.params.id, changes: { oldValue, newValue: { tags: tenant.management.tags } } });
    res.json({ tags: tenant.management.tags });
  } catch (error) { next(error); }
});

router.post('/:id/archive', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id).select('management storeName');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (tenant.management?.archivedAt) return res.status(409).json({ message: 'Tenant is already archived' });
    tenant.management.archivedAt = new Date(); tenant.management.archivedBy = req.user._id; tenant.management.archiveReason = String(req.body?.reason || '').trim().slice(0, 500);
    await tenant.save();
    req.audit.set({ action: 'tenant.archive', resource: 'tenant', resourceId: req.params.id, metadata: { reason: tenant.management.archiveReason } });
    res.json({ message: `${tenant.storeName} archived`, management: tenant.management });
  } catch (error) { next(error); }
});

router.post('/:id/restore', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    const tenant = await Tenant.findByIdAndUpdate(req.params.id, { $set: { 'management.archivedAt': null, 'management.archivedBy': null, 'management.archiveReason': '' } }, { new: true, runValidators: true }).select('storeName management');
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    req.audit.set({ action: 'tenant.restore', resource: 'tenant', resourceId: req.params.id });
    res.json({ message: `${tenant.storeName} restored`, management: tenant.management });
  } catch (error) { next(error); }
});

router.put('/:id/owner', requirePlatformPermission('tenant.edit'), async (req, res, next) => {
  try {
    if (!validId(req.body?.userId)) return res.status(400).json({ message: 'A valid owner user identifier is required' });
    const [tenant, owner] = await Promise.all([
      Tenant.findById(req.params.id).select('owner storeName'),
      User.findOne({ _id: req.body.userId, tenantId: req.params.id, role: 'admin', isActive: true }).select('_id email'),
    ]);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!owner) return res.status(400).json({ message: 'New owner must be an active administrator of this tenant' });
    const oldOwner = tenant.owner;
    tenant.owner = owner._id;
    await tenant.save();
    req.audit.set({ action: 'tenant.owner.transfer', resource: 'tenant', resourceId: req.params.id, changes: { oldValue: { owner: oldOwner }, newValue: { owner: owner._id } }, metadata: { newOwnerEmail: owner.email } });
    res.json({ message: `Ownership of ${tenant.storeName} transferred`, owner });
  } catch (error) { next(error); }
});

router.post('/:id/impersonate', requirePlatformPermission('tenant.impersonate'), requireRecentStepUp(), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid tenant identifier' });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 10) return res.status(400).json({ message: 'Provide an impersonation reason of at least 10 characters' });
    const tenant = await Tenant.findOne({ _id: req.params.id, status: 'active', 'management.archivedAt': null }).select('storeName owner billing.subscriptionStatus');
    if (!tenant) return res.status(409).json({ message: 'Only active, non-archived tenants can be impersonated' });
    if (['suspended', 'cancelled'].includes(tenant.billing?.subscriptionStatus)) return res.status(409).json({ message: 'This tenant subscription does not permit administrator access' });
    const admin = await User.findOne({ _id: tenant.owner, tenantId: tenant._id, role: 'admin', isActive: true }).select('+tokenVersion firstName lastName email role tenantId avatar');
    if (!admin) return res.status(409).json({ message: 'The tenant has no active owner administrator to impersonate' });
    const session = await issueImpersonationSession(admin, req.user, req, reason);
    req.audit.set({ action: 'tenant.impersonation.start', resource: 'tenant', resourceId: String(tenant._id), metadata: { targetUserId: String(admin._id), targetEmail: admin.email, reason, impersonationSessionId: session.sessionId, expiresAt: session.expiresAt } });
    res.status(201).json({ token: session.token, expiresAt: session.expiresAt,
      user: { _id: admin._id, firstName: admin.firstName, lastName: admin.lastName, email: admin.email, role: admin.role, tenantId: admin.tenantId, avatar: admin.avatar },
      tenant: { _id: tenant._id, storeName: tenant.storeName },
      warning: 'You are acting as this tenant administrator. Every action is attributed to the impersonation session.' });
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.cleanTags = cleanTags;
module.exports.normalizeSavedView = normalizeSavedView;
module.exports.normalizeInlineMetadata = normalizeInlineMetadata;
module.exports.usageForTenantIds = usageForTenantIds;
