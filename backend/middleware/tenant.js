'use strict';

const Tenant = require('../models/Tenant');

function normalizeDomain(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .trim();
}

function getHeaderDomainCandidates(req) {
  const headers = req.headers || {};
  const rawValues = [
    headers['x-tenant-domain'],
    headers['x-forwarded-host'],
    headers.origin,
    headers.referer,
    headers.host,
  ];

  const domains = [];
  for (const raw of rawValues) {
    if (!raw) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const domain = normalizeDomain(value);
    if (!domain) continue;
    domains.push(domain);
    if (domain === 'localhost') domains.push('127.0.0.1');
    if (domain === '127.0.0.1') domains.push('localhost');
  }

  return Array.from(new Set(domains));
}

async function findTenantFromRequest(req) {
  const lookupDomains = getHeaderDomainCandidates(req);
  if (!lookupDomains.length) return { tenant: null, lookupDomains };

  const tenant = await Tenant.findOne({
    status: 'active',
    domains: { $elemMatch: { domain: { $in: lookupDomains }, active: true } },
  }).populate('plan');

  return { tenant, lookupDomains };
}

async function resolveTenant(req, res, next) {
  try {
    const { tenant, lookupDomains } = await findTenantFromRequest(req);

    if (!tenant) {
      return res.status(404).json({
        message: 'Store not found for this domain',
        domainsChecked: lookupDomains,
      });
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
    const { tenant } = await findTenantFromRequest(req);
    if (tenant) {
      req.tenant = tenant;
      req.tenantId = tenant._id;
      req.plan = tenant.plan;
    }
  } catch (_) {
    // Optional tenant resolution must never block auth/superadmin flows.
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
  getHeaderDomainCandidates,
};