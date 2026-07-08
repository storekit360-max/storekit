const { test, expect, request } = require('@playwright/test');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@storekit.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@storekit.local';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@123456';

const publicApiRoutes = [
  '/api/settings',
  '/api/categories',
  '/api/products',
  '/api/banners',
  '/api/deals',
  '/api/pages'
];

test.describe('Backend API smoke QA', () => {
  test('public API routes do not return server errors', async () => {
    const api = await request.newContext({ baseURL: BACKEND_URL, extraHTTPHeaders: { 'X-Tenant-Domain': 'localhost', Origin: FRONTEND_URL } });
    for (const route of publicApiRoutes) {
      const response = await api.get(route);
      expect.soft(response.status(), `${route} status`).toBeLessThan(500);
    }
    await api.dispose();
  });

  test('admin and superadmin login APIs work', async () => {
    const api = await request.newContext({ baseURL: BACKEND_URL, extraHTTPHeaders: { 'X-Tenant-Domain': 'localhost', Origin: FRONTEND_URL } });
    const admin = await api.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    expect.soft(admin.status(), 'admin login status').toBeLessThan(400);
    const superAdmin = await api.post('/api/auth/login', { data: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD } });
    expect.soft(superAdmin.status(), 'superadmin login status').toBeLessThan(400);
    await api.dispose();
  });
});
