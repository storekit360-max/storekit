const fs = require('fs-extra');
const path = require('path');

const REPORT_DIR = path.resolve(__dirname, '..', 'reports');

async function ensureReportDir() {
  await fs.ensureDir(REPORT_DIR);
}

async function attachConsoleAndNetworkWatch(page, testInfo, options = {}) {
  const errors = [];
  const failedRequests = [];
  const badResponses = [];
  const ignoredUrls = options.ignoredUrls || [/favicon\.ico/i, /sockjs-node/i, /hot-update/i];

  const isIgnored = (url) => ignoredUrls.some((rule) => rule.test(url));

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      errors.push({ type: msg.type(), text: msg.text(), url: page.url() });
    }
  });

  page.on('pageerror', (error) => {
    errors.push({ type: 'pageerror', text: error.message, stack: error.stack, url: page.url() });
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!isIgnored(url)) {
      failedRequests.push({ url, method: request.method(), failure: request.failure()?.errorText || 'unknown' });
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    if (!isIgnored(url) && status >= 400) {
      badResponses.push({ url, status, method: response.request().method(), pageUrl: page.url() });
    }
  });

  testInfo.attach('qa-watchers-ready', { body: 'console/network watchers attached', contentType: 'text/plain' });

  return {
    errors,
    failedRequests,
    badResponses,
    async flush(name) {
      const payload = { name, pageUrl: page.url(), errors, failedRequests, badResponses };
      await ensureReportDir();
      await fs.writeJson(path.join(REPORT_DIR, `${safeFileName(name)}-runtime.json`), payload, { spaces: 2 });
      await testInfo.attach(`${name}-runtime`, { body: JSON.stringify(payload, null, 2), contentType: 'application/json' });
      return payload;
    }
  };
}

function safeFileName(input) {
  return String(input).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function login(page, email, password) {
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForLoadState('networkidle').catch(() => null);
}

async function assertNoFatalRuntimeIssues(watcher, softExpect) {
  const fatalConsole = watcher.errors.filter((e) =>
    e.type === 'pageerror' || /TypeError|ReferenceError|Cannot read|is not a function|Failed to load|ChunkLoadError/i.test(e.text)
  );
  const apiFailures = watcher.badResponses.filter((r) => /\/api\//.test(r.url) && ![401, 403, 404].includes(r.status));
  softExpect(fatalConsole, 'Fatal console/page runtime errors').toEqual([]);
  softExpect(apiFailures, 'API 5xx or unexpected hard failures').toEqual([]);
}

module.exports = {
  REPORT_DIR,
  ensureReportDir,
  attachConsoleAndNetworkWatch,
  waitForApp,
  login,
  assertNoFatalRuntimeIssues
};
