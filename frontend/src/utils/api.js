import axios from 'axios';

/**
 * API base URL resolution:
 *  - Production (Vercel): /api is rewritten to Railway via vercel.json rewrites.
 *    REACT_APP_API_URL is no longer needed — all /api/* calls stay on the same
 *    Vercel domain and are proxied server-side, so cookies & CORS are never an issue.
 *  - Local dev: React proxy in package.json forwards /api/* to localhost:5001.
 *
 * We always use /api as the base — Vercel handles the routing in both cases.
 *
 * TIMEOUT NOTE:
 *   Instagram publishing requires polling the container status API until the
 *   media container reaches FINISHED state, which can take 5–12 seconds.
 *   The previous 15s timeout was too close to this limit, causing the frontend
 *   to show "failed" even though the backend successfully published the post.
 *   Increased to 45s to safely cover Instagram (≤12s) and any other slow ops.
 */
const API = axios.create({
  baseURL: (process.env.REACT_APP_API_URL || '/api').replace(/\/$/, ''),
  timeout: 45000,
  withCredentials: true,
});


// ─── Lightweight in-memory GET cache ─────────────────────────────────────────
// Reduces repeated admin/storefront requests in the same browser session.
// It is tenant-aware because the cache key includes window.location.hostname.
const LONG_GET_CACHE_TTL = 5 * 60 * 1000;
const getCache = new Map();

const normalizeUrl = (url = '') => String(url).replace(/\?.*$/, '');
const tenantCacheKey = (config = {}) => {
  let host = 'server';
  try { host = window.location.hostname || 'default'; } catch (_) {}
  const method = (config.method || 'get').toLowerCase();
  const url = config.url || '';
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${host}:${method}:${url}:${params}`;
};

const getCacheTTL = (config = {}) => {
  if (config.cacheTTL === false || config.skipCache) return 0;
  if (typeof config.cacheTTL === 'number') return config.cacheTTL;
  const url = normalizeUrl(config.url);
  if ([
    '/settings',
    '/products',
    '/products/brands',
    '/categories',
    '/banners',
    '/pages',
    '/social-media/public',
    '/whatsapp/config',
    '/seasonal/active',
    '/deals',
  ].includes(url)) return LONG_GET_CACHE_TTL;
  return 0;
};

export function clearApiCache(pattern) {
  if (!pattern) { getCache.clear(); return; }
  for (const key of Array.from(getCache.keys())) {
    if (key.includes(pattern)) getCache.delete(key);
  }
}

API.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (typeof window !== 'undefined') {
    config.headers['X-Tenant-Domain'] = window.location.hostname;
  }

  if ((config.method || 'get').toLowerCase() === 'get') {
    const ttl = getCacheTTL(config);
    if (ttl > 0) {
      const key = tenantCacheKey(config);
      const cached = getCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        config.adapter = async () => ({
          data: cached.data,
          status: 200,
          statusText: 'OK',
          headers: cached.headers || {},
          config,
          request: null,
        });
      }
      config.__cacheKey = key;
      config.__cacheTTL = ttl;
    }
  }

  return config;
});

API.interceptors.response.use(
  res => {
    if (res.config?.__cacheKey && res.config?.__cacheTTL) {
      getCache.set(res.config.__cacheKey, {
        data: res.data,
        headers: res.headers,
        expiresAt: Date.now() + res.config.__cacheTTL,
      });
    }

    const method = (res.config?.method || 'get').toLowerCase();
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      clearApiCache();

      // Keep an already-open storefront in sync with banner changes made in
      // the admin. The custom event updates the current tab; the storage event
      // updates any other storefront tabs on the same domain.
      if (normalizeUrl(res.config?.url).startsWith('/banners')) {
        try {
          const changedAt = String(Date.now());
          localStorage.setItem('storekit:banners-updated', changedAt);
          window.dispatchEvent(new CustomEvent('storekit:banners-updated', {
            detail: { changedAt },
          }));
        } catch (_) {}
      }
    }

    return res;
  },
  err => {
    const currentPath = typeof window !== 'undefined' ? (window.location.pathname || '') : '';
    const protectedPage = /^\/(admin|superadmin|account|my-orders|returns)(\/|$)/.test(currentPath);
    // Public product/category/shop pages can make optional authenticated calls
    // (wishlist, review eligibility, etc.). An expired token must not turn a
    // public product link into a login redirect.
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      try { window.dispatchEvent(new CustomEvent('storekit:auth-expired')); } catch (_) {}
    }
    if (err.response?.status === 401 && !err.config?.suppressAuthRedirect && (err.config?.authRedirect === true || protectedPage)) {
      window.location.href = currentPath.startsWith('/superadmin') ? '/superadmin/login' : '/login';
    }
    return Promise.reject(err);
  }
);

export default API;
