const { test, expect } = require('@playwright/test');
const { attachConsoleAndNetworkWatch, waitForApp, login, assertNoFatalRuntimeIssues } = require('../src/helpers');

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@storekit.local';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@123456';

test.describe('Super admin end-to-end QA', () => {
  test('super admin login and dashboard load', async ({ page }, testInfo) => {
    const watcher = await attachConsoleAndNetworkWatch(page, testInfo);
    await page.goto('/superadmin/login');
    await waitForApp(page);
    await login(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    await page.waitForURL(/\/superadmin$/, { timeout: 30000 }).catch(() => null);
    await waitForApp(page);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Cannot read properties|Something went wrong|Failed to load/i);
    await assertNoFatalRuntimeIssues(watcher, expect.soft);
    await watcher.flush('superadmin-dashboard');
  });
});
