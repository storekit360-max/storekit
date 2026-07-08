const { test, expect } = require('@playwright/test');
const { attachConsoleAndNetworkWatch, waitForApp, assertNoFatalRuntimeIssues } = require('../src/helpers');

const publicRoutes = [
  '/',
  '/shop',
  '/cart',
  '/login',
  '/register',
  '/forgot-password',
  '/gift-cards'
];

test.describe('Customer public end-to-end QA', () => {
  for (const route of publicRoutes) {
    test(`loads ${route} without fatal errors`, async ({ page }, testInfo) => {
      const watcher = await attachConsoleAndNetworkWatch(page, testInfo);
      await page.goto(route);
      await waitForApp(page);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/Cannot read properties|Something went wrong|Loading chunk failed/i);
      await assertNoFatalRuntimeIssues(watcher, expect.soft);
      await watcher.flush(`public-${route === '/' ? 'home' : route}`);
    });
  }

  test('shop page exposes product/category content or a valid empty state', async ({ page }, testInfo) => {
    const watcher = await attachConsoleAndNetworkWatch(page, testInfo);
    await page.goto('/shop');
    await waitForApp(page);
    const bodyText = await page.locator('body').innerText();
    expect.soft(bodyText.length).toBeGreaterThan(50);
    expect.soft(bodyText).not.toMatch(/Failed to load categories|Failed to load products|Network Error/i);
    await assertNoFatalRuntimeIssues(watcher, expect.soft);
    await watcher.flush('shop-content');
  });
});
