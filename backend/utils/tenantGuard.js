'use strict';

function requiredTenantId(req) {
  const tenantId = req?.tenantId || req?.tenant?._id || null;
  if (!tenantId) {
    const error = new Error('Store not found for this domain');
    error.statusCode = 404;
    error.code = 'STORE_NOT_FOUND';
    throw error;
  }
  return tenantId;
}

// Tenant ID is written last so caller-supplied filters can never replace it.
function tenantFilterForRequest(req, filter = {}) {
  return { ...filter, tenantId: requiredTenantId(req) };
}

function disableSharedTenantCaching(res) {
  res.vary('Host');
  res.vary('X-Tenant-Domain');
  res.vary('X-Forwarded-Host');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
}

function sendTenantResolutionError(res, error) {
  if (error?.code !== 'STORE_NOT_FOUND') return false;
  disableSharedTenantCaching(res);
  res.status(404).json({ code: error.code, message: error.message });
  return true;
}

module.exports = {
  requiredTenantId,
  tenantFilterForRequest,
  disableSharedTenantCaching,
  sendTenantResolutionError,
};
