'use strict';

const Tenant = require('../models/Tenant');

function normalizeDomain(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .trim();
}

async function resolveTenant(req, res, next) {
  try {
    const domain = normalizeDomain(
      req.headers['x-tenant-domain'] ||
      req.headers['x-forwarded-host'] ||
      req.headers.host
    );

    const lookupDomains = Array.from(new Set([domain, domain === 'localhost' ? '127.0.0.1' : 'localhost']));

    const tenant = await Tenant.findOne({
      status: 'active',
      domains: { $elemMatch: { domain: { $in: lookupDomains }, active: true } },
    }).populate('plan');

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

function optionalTenant(req, _res, next) {
  resolveTenant(req, { status: () => ({ json: () => next() }) }, next).catch(() => next());
}

function requireFeature(featureName) {
  return (req, res, next) => {
    if (!req.plan?.features?.[featureName]) {
      return res.status(403).json({ message: `Feature '${featureName}' is not enabled for this plan` });
    }
    next();
  };
}

module.exports = { resolveTenant, optionalTenant, requireFeature, normalizeDomain };
