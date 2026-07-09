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

function getHeaderDomainCandidates(req) {
  const values = [
    req.headers['x-tenant-domain'],
    req.headers['x-forwarded-host'],
    req.headers.origin,
    req.headers.referer,
    req.headers.host,
  ];

  const domains = values
    .flatMap(value => String(value || '').split(','))
    .map(normalizeDomain)
    .filter(Boolean);

  return Array.from(new Set(domains.flatMap(domain => [
    domain,
    domain === 'localhost' ? '127.0.0.1' : null,
    domain === '127.0.0.1' ? 'localhost' : null,
  ].filter(Boolean))));
}

async function findTenantByDomain(req) {
  const lookupDomains = getHeaderDomainCandidates(req);
  if (!lookupDomains.length) return null;

  return Tenant.findOne({
    status: 'active',
    domains: { $elemMatch: { domain: { $in: lookupDomains }, active: true } },
  }).populate('plan');
}

async function resolveTenant(req, res, next) {
  try {
    const tenant = await findTenantByDomain(req);

    if (!tenant) {
      const domain = getHeaderDomainCandidates(req)[0] || '';
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
    const tenant = await findTenantByDomain(req);
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

module.exports = { resolveTenant, optionalTenant, requireFeature, normalizeDomain, getHeaderDomainCandidates };
