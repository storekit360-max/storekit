'use strict';

/**
 * Public API cache headers. Safe for tenant-scoped public storefront reads.
 * Never use on auth, cart, orders, admin, or superadmin routes.
 */
function publicCache(seconds = 60, staleSeconds = 300) {
  return function publicCacheMiddleware(req, res, next) {
    if (req.method !== 'GET') return next();
    res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${staleSeconds}`);
    res.set('Vary', 'Origin, X-Tenant-Domain, X-Forwarded-Host, Host');
    next();
  };
}

module.exports = publicCache;
