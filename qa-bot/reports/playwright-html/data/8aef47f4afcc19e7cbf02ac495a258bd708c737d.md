# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-superadmin.spec.js >> Super admin end-to-end QA >> super admin login and dashboard load
- Location: tests/03-superadmin.spec.js:8:3

# Error details

```
Error: Fatal console/page runtime errors

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 7

- Array []
+ Array [
+   Object {
+     "text": "Failed to load resource: the server responded with a status of 429 (Too Many Requests)",
+     "type": "error",
+     "url": "http://localhost:3000/superadmin/login",
+   },
+ ]
```

```
Error: API 5xx or unexpected hard failures

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 8

- Array []
+ Array [
+   Object {
+     "method": "POST",
+     "pageUrl": "http://localhost:3000/superadmin/login",
+     "status": 429,
+     "url": "http://localhost:3000/api/auth/login",
+   },
+ ]
```

# Page snapshot

```yaml
- generic [ref=e5]:
  - img [ref=e7]
  - heading "Super Admin Login" [level=1] [ref=e9]
  - paragraph [ref=e10]: Manage tenants, plans, features, and custom domains.
  - generic [ref=e11]:
    - generic [ref=e12]:
      - text: Email
      - textbox "Email" [ref=e13]: superadmin@storekit.local
    - generic [ref=e14]:
      - text: Password
      - textbox "Password" [ref=e15]: SuperAdmin@123456
    - generic [ref=e16]: Too many login attempts. Please wait 15 minutes and try again.
    - button "Sign in" [ref=e17] [cursor=pointer]
  - generic [ref=e18]:
    - strong [ref=e19]: "Default:"
    - text: superadmin@storekit.local
    - text: SuperAdmin@123456
```

# Test source

```ts
  1  | const fs = require('fs-extra');
  2  | const path = require('path');
  3  | 
  4  | const REPORT_DIR = path.resolve(__dirname, '..', 'reports');
  5  | 
  6  | async function ensureReportDir() {
  7  |   await fs.ensureDir(REPORT_DIR);
  8  | }
  9  | 
  10 | async function attachConsoleAndNetworkWatch(page, testInfo, options = {}) {
  11 |   const errors = [];
  12 |   const failedRequests = [];
  13 |   const badResponses = [];
  14 |   const ignoredUrls = options.ignoredUrls || [/favicon\.ico/i, /sockjs-node/i, /hot-update/i];
  15 | 
  16 |   const isIgnored = (url) => ignoredUrls.some((rule) => rule.test(url));
  17 | 
  18 |   page.on('console', (msg) => {
  19 |     if (['error', 'warning'].includes(msg.type())) {
  20 |       errors.push({ type: msg.type(), text: msg.text(), url: page.url() });
  21 |     }
  22 |   });
  23 | 
  24 |   page.on('pageerror', (error) => {
  25 |     errors.push({ type: 'pageerror', text: error.message, stack: error.stack, url: page.url() });
  26 |   });
  27 | 
  28 |   page.on('requestfailed', (request) => {
  29 |     const url = request.url();
  30 |     if (!isIgnored(url)) {
  31 |       failedRequests.push({ url, method: request.method(), failure: request.failure()?.errorText || 'unknown' });
  32 |     }
  33 |   });
  34 | 
  35 |   page.on('response', async (response) => {
  36 |     const url = response.url();
  37 |     const status = response.status();
  38 |     if (!isIgnored(url) && status >= 400) {
  39 |       badResponses.push({ url, status, method: response.request().method(), pageUrl: page.url() });
  40 |     }
  41 |   });
  42 | 
  43 |   testInfo.attach('qa-watchers-ready', { body: 'console/network watchers attached', contentType: 'text/plain' });
  44 | 
  45 |   return {
  46 |     errors,
  47 |     failedRequests,
  48 |     badResponses,
  49 |     async flush(name) {
  50 |       const payload = { name, pageUrl: page.url(), errors, failedRequests, badResponses };
  51 |       await ensureReportDir();
  52 |       await fs.writeJson(path.join(REPORT_DIR, `${safeFileName(name)}-runtime.json`), payload, { spaces: 2 });
  53 |       await testInfo.attach(`${name}-runtime`, { body: JSON.stringify(payload, null, 2), contentType: 'application/json' });
  54 |       return payload;
  55 |     }
  56 |   };
  57 | }
  58 | 
  59 | function safeFileName(input) {
  60 |   return String(input).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  61 | }
  62 | 
  63 | async function waitForApp(page) {
  64 |   await page.waitForLoadState('domcontentloaded');
  65 |   await page.waitForLoadState('networkidle').catch(() => null);
  66 | }
  67 | 
  68 | async function login(page, email, password) {
  69 |   await page.locator('input[type="email"]').first().fill(email);
  70 |   await page.locator('input[type="password"]').first().fill(password);
  71 |   await page.locator('button[type="submit"]').first().click();
  72 |   await page.waitForLoadState('networkidle').catch(() => null);
  73 | }
  74 | 
  75 | async function assertNoFatalRuntimeIssues(watcher, softExpect) {
  76 |   const fatalConsole = watcher.errors.filter((e) =>
  77 |     e.type === 'pageerror' || /TypeError|ReferenceError|Cannot read|is not a function|Failed to load|ChunkLoadError/i.test(e.text)
  78 |   );
  79 |   const apiFailures = watcher.badResponses.filter((r) => /\/api\//.test(r.url) && ![401, 403, 404].includes(r.status));
  80 |   softExpect(fatalConsole, 'Fatal console/page runtime errors').toEqual([]);
> 81 |   softExpect(apiFailures, 'API 5xx or unexpected hard failures').toEqual([]);
     |                                                                  ^ Error: API 5xx or unexpected hard failures
  82 | }
  83 | 
  84 | module.exports = {
  85 |   REPORT_DIR,
  86 |   ensureReportDir,
  87 |   attachConsoleAndNetworkWatch,
  88 |   waitForApp,
  89 |   login,
  90 |   assertNoFatalRuntimeIssues
  91 | };
  92 | 
```