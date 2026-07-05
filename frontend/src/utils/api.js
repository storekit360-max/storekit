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

API.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (typeof window !== 'undefined') {
    config.headers['X-Tenant-Domain'] = window.location.hostname;
  }
  return config;
});

API.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const path = window.location.pathname || '';
      window.location.href = path.startsWith('/superadmin') ? '/superadmin/login' : '/login';
    }
    return Promise.reject(err);
  }
);

export default API;