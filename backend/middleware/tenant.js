'use strict';

const Tenant = require('../models/Tenant');

function normalizeDomain(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
}

function firstHeaderValue(value) {
  return String(value || '').split(',')[0].trim();
}

function getTenantDomainFromRequest(req) {
  const explicit = firstHeaderValue(req.headers['x-tenant-domain']);
  if (explicit) return normalizeDomain(explicit);

  // Browser requests hit the Railway API domain, so req.host can be the backend
  // domain. In that case the storefront domain is only available in Origin or
  // Referer. Prefer those before falling back to host.
  const origin = firstHeaderValue(req.headers.origin);
  if (origin) return normalizeDomain(origin);

  const referer = firstHeaderValue(req.headers.referer || req.headers.referrer);
  if (referer) return normalizeDomain(referer);

  const forwardedHost = firstHeaderValue(req.headers['x-forwarded-host']);
  if (forwardedHost) return normalizeDomain(forwardedHost);

  return normalizeDomain(req.headers.host);
}

function domainCandidates(domain) {
  const normalized = normalizeDomain(domain);
  const candidates = new Set();
  if (normalized) candidates.add(normalized);
  if (normalized === 'localhost') candidates.add('127.0.0.1');
  if (normalized === '127.0.0.1') candidates.add('localhost');
  return Array.from(candidates);
}

async function findTenantByDomain(domain) {
  const candidates = domainCandidates(domain);
  if (!candidates.length) return null;

  return Tenant.findOne({
    status: 'active',
    domains: { $elemMatch: { domain: { $in: candidates }, active: true } },
  }).populate('plan');
}

async function resolveTenant(req, res, next) {
  try {
    const domain = getTenantDomainFromRequest(req);
    const tenant = await findTenantByDomain(domain);

    if (!tenant) {
      return res.status(404).json({ message: 'Store not found for this domain', domain });
    }

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
    const domain = getTenantDomainFromRequest(req);
    const tenant = await findTenantByDomain(domain);
    if (tenant) {
      req.tenant = tenant;
      req.tenantId = tenant._id;
      req.plan = tenant.plan;
    }
  } catch (_) {
    // Optional tenant resolution must never block auth/superadmin/system routes.
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

module.exports = {
  resolveTenant,
  optionalTenant,
  requireFeature,
  normalizeDomain,
  getTenantDomainFromRequest,
};
