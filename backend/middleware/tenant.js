'use strict';

const Tenant = require('../models/Tenant');

let refreshTenantLifecycle = async () => {};
try {
  ({ refreshTenantLifecycle } = require('../services/subscriptionBillingService'));
} catch (_) {
  // Billing module may not be loaded during isolated scripts/tests.
}

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
    domains.push(`${domain}/`); // backward compatibility for old saved domains with trailing slash
    if (domain === 'localhost') domains.push('127.0.0.1');
    if (domain === '127.0.0.1') domains.push('localhost');
  }

  return Array.from(new Set(domains.filter(Boolean)));
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

async function attachTenant(req, tenant) {
  if (!tenant) return;

  try {
    await refreshTenantLifecycle(tenant, tenant.plan);
  } catch (_) {
    // Tenant resolution must not crash public/superadmin requests if billing lifecycle fails.
  }

  req.tenant = tenant;
  req.tenantId = tenant._id;
  req.plan = tenant.plan;
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

    await attachTenant(req, tenant);

    if (tenant.status !== 'active') {
      return res.status(402).json({
        message: 'Store subscription is not active',
        status: tenant.status,
        subscriptionStatus: tenant.subscription?.status,
        reason: tenant.subscription?.suspendedReason || 'Subscription inactive',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

async function optionalTenant(req, _res, next) {
  try {
    const { tenant } = await findTenantFromRequest(req);
    if (tenant && tenant.status === 'active') await attachTenant(req, tenant);
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
  findTenantFromRequest,
};
