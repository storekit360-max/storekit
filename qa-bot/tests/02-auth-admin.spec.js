const { test, expect } = require('@playwright/test');
const { attachConsoleAndNetworkWatch, waitForApp, login, assertNoFatalRuntimeIssues } = require('../src/helpers');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@storekit.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';

const adminRoutes = [
  '/admin',
  '/admin/products',
  '/admin/orders',
  '/admin/categories',
  '/admin/customers',
  '/admin/coupons',
  '/admin/banners',
  '/admin/settings',
  '/admin/theme-builder',
  '/admin/seo',
  '/admin/backup'
];

test.describe('Store admin end-to-end QA', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await waitForApp(page);
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.waitForURL(/\/admin|\/$/, { timeout: 30000 }).catch(() => null);
  });

  for (const route of adminRoutes) {
    test(`admin route ${route} loads`, async ({ page }, testInfo) => {
      const watcher = await attachConsoleAndNetworkWatch(page, testInfo);
      await page.goto(route);
      await waitForApp(page);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/Cannot read properties|Something went wrong|Failed to load/i);
      await assertNoFatalRuntimeIssues(watcher, expect.soft);
      await watcher.flush(`admin-${route}`);
    });
  }
});
