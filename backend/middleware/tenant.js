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

function isLocalDomain(domain) {
  return ['localhost', '127.0.0.1'].includes(normalizeDomain(domain));
}

// Platform domains that should NOT be resolved to any tenant.
// These are reserved for platform/superadmin operations and support.
// Configure via PLATFORM_DOMAINS env var (comma-separated), e.g.:
// PLATFORM_DOMAINS=storekit-ecru.vercel.app,storekit.lk
function getPlatformDomains() {
  const fromEnv = String(process.env.PLATFORM_DOMAINS || '').split(',').map(normalizeDomain).filter(Boolean);
  // Default platform domains (can be extended in future backend deployments)
  const defaults = ['storekit-ecru.vercel.app'];
  return Array.from(new Set([...defaults, ...fromEnv]));
}

function isPlatformDomain(domain) {
  const normalized = normalizeDomain(domain);
  return getPlatformDomains().includes(normalized);
}

function isTenantAvailable(tenant) {
  if (!tenant) return false;
  const subscriptionStatus = tenant.subscription?.status || tenant.billing?.subscriptionStatus;
  return tenant.status === 'active' && !['suspended', 'cancelled'].includes(subscriptionStatus);
}

async function findTenantByDomain(req, { includeInactive = false } = {}) {
  const lookupDomains = getHeaderDomainCandidates(req);
  if (!lookupDomains.length) return null;

  const filter = {
    domains: { $elemMatch: { domain: { $in: lookupDomains }, active: true } },
  };
  if (!includeInactive) filter.status = 'active';

  // The onboarding brief is operational context for the tenant/super-admin;
  // it must not be included in the public tenant-resolution response.
  return Tenant.findOne(filter).select('-onboarding').populate('plan');
}

async function resolveTenant(req, res, next) {
  try {
    const tenant = await findTenantByDomain(req, { includeInactive: true });

    if (!tenant) {
      const domain = getHeaderDomainCandidates(req)[0] || '';
      return res.status(404).json({ message: 'Store not found for this domain', domain });
    }
    if (!isTenantAvailable(tenant)) {
      const domain = getHeaderDomainCandidates(req)[0] || '';
      return res.status(503).json({
        code: 'STORE_UNAVAILABLE',
        message: 'This store is currently unavailable.',
        domain,
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
    // Platform domains should NOT resolve to any tenant - they are for superadmin operations.
    // Skip tenant resolution for auth and superadmin routes on platform domains.
    const path = req.originalUrl || req.path || '';
    const isAuthRoute = path.startsWith('/api/auth');
    const isSuperadminRoute = path.startsWith('/api/superadmin');
    const firstDomain = getHeaderDomainCandidates(req)[0];

    if (isAuthRoute || isSuperadminRoute) {
      if (firstDomain && isPlatformDomain(firstDomain)) {
        // This is a platform domain accessing auth/superadmin - skip tenant resolution entirely
        return next();
      }
    }

    const tenant = await findTenantByDomain(req, { includeInactive: true });
    if (tenant && isTenantAvailable(tenant)) {
      req.tenant = tenant;
      req.tenantId = tenant._id;
      req.plan = tenant.plan;
    } else if (tenant) {
      req.storeUnavailable = {
        code: 'STORE_UNAVAILABLE',
        message: 'This store is currently unavailable.',
        tenantId: tenant._id,
        status: tenant.status,
        subscriptionStatus: tenant.subscription?.status || tenant.billing?.subscriptionStatus,
      };
    }
  } catch (_) {
    // Optional tenant resolution must never block auth/superadmin/system routes.
  }
  next();
}

function blockUnavailableStore(req, res, next) {
  const path = req.originalUrl || req.path || '';
  const isAdminOrBilling =
    path.startsWith('/api/admin') ||
    path.startsWith('/api/billing') ||
    path.startsWith('/api/superadmin');

  // Platform domains should never be blocked for accessing their platform routes
  const firstDomain = getHeaderDomainCandidates(req)[0];
  const isPlatformDomainRequest = firstDomain && isPlatformDomain(firstDomain);

  if (isAdminOrBilling) return next();

  if (isPlatformDomainRequest) return next();

  if (req.storeUnavailable) {
    return res.status(503).json({
      code: 'STORE_UNAVAILABLE',
      message: 'This store is currently unavailable.',
    });
  }

  if (!req.tenantId) {
    const domain = getHeaderDomainCandidates(req)[0] || '';
    if (domain && !isLocalDomain(domain)) {
      return res.status(404).json({
        code: 'STORE_NOT_FOUND',
        message: 'Store not found for this domain.',
        domain,
      });
    }
  }

  next();
}

function requireFeature(featureName, runtimeFlagKey = featureName) {
  return async (req, res, next) => {
    if (!req.plan?.features?.[featureName]) {
      return res.status(403).json({ message: `Feature '${featureName}' is not enabled for this plan` });
    }
    try {
      const { evaluateFlags } = require('../services/runtimeFeatureFlagService');
      const results = await evaluateFlags([runtimeFlagKey], { tenantId: req.tenantId, userId: req.user?._id, anonymousId: req.get('X-Anonymous-ID'), country: req.tenant?.settings?.merchantCountryCode, role: req.user?.role || 'customer', planFeatures: req.plan?.features || {} });
      if (results[runtimeFlagKey] && !results[runtimeFlagKey].enabled) return res.status(403).json({ code: 'FEATURE_DISABLED', message: `Feature '${featureName}' is temporarily unavailable` });
      next();
    } catch (error) { next(error); }
  };
}

module.exports = {
  resolveTenant,
  optionalTenant,
  blockUnavailableStore,
  requireFeature,
  normalizeDomain,
  getHeaderDomainCandidates,
  isTenantAvailable,
  isPlatformDomain,
  getPlatformDomains,
  isLocalDomain,
};
