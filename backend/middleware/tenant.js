'use strict';

const Tenant = require('../models/Tenant');

function normalizeDomain(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .trim();
}

function getRequestDomain(req) {
  const explicit = req.headers['x-tenant-domain'] || req.headers['x-store-domain'];
  if (explicit) return normalizeDomain(explicit);

  // Railway receives host=storekit1-production.up.railway.app. The real store
  // domain is usually in Origin/Referer from the Vercel storefront.
  const origin = req.headers.origin || req.headers.referer;
  if (origin) return normalizeDomain(origin);

  return normalizeDomain(req.headers['x-forwarded-host'] || req.headers.host);
}

async function findTenantForRequest(req) {
  const domain = getRequestDomain(req);
  if (!domain) return { tenant: null, domain };

  const candidates = new Set([domain]);
  if (domain === 'localhost') candidates.add('127.0.0.1');
  if (domain === '127.0.0.1') candidates.add('localhost');

  // Some old tenant rows were saved with trailing slash. Match both normalized
  // and legacy forms so existing tenants keep working.
  candidates.add(`${domain}/`);

  const tenant = await Tenant.findOne({
    status: { $ne: 'deleted' },
    domains: {
      $elemMatch: {
        active: true,
        domain: { $in: Array.from(candidates) },
      },
    },
  }).populate('plan');

  return { tenant, domain };
}

async function attachTenant(req, _res, next) {
  try {
    const { tenant } = await findTenantForRequest(req);
    if (tenant) {
      req.tenant = tenant;
      req.tenantId = tenant._id;
      req.plan = tenant.plan;
    }
    next();
  } catch (err) {
    next(err);
  }
}

async function resolveTenant(req, res, next) {
  try {
    const { tenant, domain } = await findTenantForRequest(req);
    if (!tenant) return res.status(404).json({ message: 'Store not found for this domain', domain });
    req.tenant = tenant;
    req.tenantId = tenant._id;
    req.plan = tenant.plan;
    next();
  } catch (err) {
    next(err);
  }
}

async function optionalTenant(req, _res, next) {
  try {
    const { tenant } = await findTenantForRequest(req);
    if (tenant) {
      req.tenant = tenant;
      req.tenantId = tenant._id;
      req.plan = tenant.plan;
    }
  } catch (_) {
    // Optional tenant resolution must never block auth/superadmin/health routes.
  }
  next();
}

function requireFeature(featureName) {
  return (req, res, next) => {
    if (!req.plan?.features?.[featureName]) {
      return res.status(403).json({ message: `Feature '${featureName}' is not enabled for this plan` });
    }
    next();
  };
}

module.exports = { resolveTenant, optionalTenant, attachTenant, requireFeature, normalizeDomain, getRequestDomain };
