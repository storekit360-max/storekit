# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-auth-admin.spec.js >> Store admin end-to-end QA >> admin route /admin loads
- Location: tests/02-auth-admin.spec.js:30:5

# Error details

```
Error: Fatal console/page runtime errors

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 12

- Array []
+ Array [
+   Object {
+     "text": "Failed to load resource: the server responded with a status of 404 (Not Found)",
+     "type": "error",
+     "url": "http://localhost:3000/admin",
+   },
+   Object {
+     "text": "Failed to load resource: the server responded with a status of 404 (Not Found)",
+     "type": "error",
+     "url": "http://localhost:3000/admin",
+   },
+ ]
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - complementary [ref=e5]:
    - generic [ref=e6]:
      - link "StoreKit Admin Panel v2" [ref=e8] [cursor=pointer]:
        - /url: /
        - img [ref=e10]
        - generic [ref=e12]:
          - paragraph [ref=e13]: StoreKit
          - paragraph [ref=e14]: Admin Panel v2
      - navigation [ref=e15]:
        - link "Dashboard" [ref=e16] [cursor=pointer]:
          - /url: /admin
          - img [ref=e17]
          - generic [ref=e19]: Dashboard
        - link "Products" [ref=e20] [cursor=pointer]:
          - /url: /admin/products
          - img [ref=e21]
          - generic [ref=e23]: Products
        - link "Orders 2" [ref=e24] [cursor=pointer]:
          - /url: /admin/orders
          - img [ref=e25]
          - generic [ref=e27]: Orders
          - generic [ref=e28]: "2"
        - link "Returns" [ref=e29] [cursor=pointer]:
          - /url: /admin/returns
          - img [ref=e30]
          - generic [ref=e32]: Returns
        - link "Categories" [ref=e33] [cursor=pointer]:
          - /url: /admin/categories
          - img [ref=e34]
          - generic [ref=e36]: Categories
        - link "Customers" [ref=e37] [cursor=pointer]:
          - /url: /admin/customers
          - img [ref=e38]
          - generic [ref=e40]: Customers
        - link "Reviews" [ref=e41] [cursor=pointer]:
          - /url: /admin/reviews
          - img [ref=e42]
          - generic [ref=e44]: Reviews
        - link "SEO" [ref=e45] [cursor=pointer]:
          - /url: /admin/seo
          - img [ref=e46]
          - generic [ref=e48]: SEO
        - link "Billing" [ref=e49] [cursor=pointer]:
          - /url: /admin/billing
          - img [ref=e50]
          - generic [ref=e52]: Billing
        - link "Settings" [ref=e53] [cursor=pointer]:
          - /url: /admin/settings
          - img [ref=e54]
          - generic [ref=e56]: Settings
      - generic [ref=e57]:
        - generic [ref=e58]:
          - generic [ref=e59]: S
          - generic [ref=e60]:
            - paragraph [ref=e61]: Store Admin
            - paragraph [ref=e62]: Administrator
        - generic [ref=e63]:
          - link "← Store" [ref=e64] [cursor=pointer]:
            - /url: /
          - button "Logout" [ref=e65] [cursor=pointer]
  - generic [ref=e66]:
    - banner [ref=e67]:
      - heading "Dashboard" [level=1] [ref=e69]
      - generic [ref=e70]:
        - button "🌙" [ref=e71] [cursor=pointer]
        - button "Notifications" [ref=e73] [cursor=pointer]:
          - img [ref=e74]
          - generic [ref=e76]: "3"
        - link "↗ View Store" [ref=e77] [cursor=pointer]:
          - /url: /
    - main [ref=e78]:
      - generic [ref=e79]:
        - generic [ref=e80]:
          - generic [ref=e81]:
            - generic [ref=e82]:
              - generic [ref=e83]:
                - generic [ref=e84]: 🚀
                - heading "Store launch readiness" [level=2] [ref=e85]
              - paragraph [ref=e86]: Complete these items before giving this store to a customer.
            - generic [ref=e87]:
              - generic [ref=e90]: 88%
              - button "Auto prepare" [ref=e91] [cursor=pointer]
          - generic [ref=e92]:
            - link "✓ Domain connected" [ref=e93] [cursor=pointer]:
              - /url: /admin/settings
              - generic [ref=e94]:
                - generic [ref=e95]: ✓
                - paragraph [ref=e97]: Domain connected
            - link "✓ Template/theme selected" [ref=e98] [cursor=pointer]:
              - /url: /admin/theme-builder
              - generic [ref=e99]:
                - generic [ref=e100]: ✓
                - paragraph [ref=e102]: Template/theme selected
            - link "✓ Categories ready" [ref=e103] [cursor=pointer]:
              - /url: /admin/categories
              - generic [ref=e104]:
                - generic [ref=e105]: ✓
                - paragraph [ref=e107]: Categories ready
            - link "! Products added Add your first product" [ref=e108] [cursor=pointer]:
              - /url: /admin/products
              - generic [ref=e109]:
                - generic [ref=e110]: "!"
                - generic [ref=e111]:
                  - paragraph [ref=e112]: Products added
                  - paragraph [ref=e113]: Add your first product
            - link "✓ Homepage banner ready" [ref=e114] [cursor=pointer]:
              - /url: /admin/banners
              - generic [ref=e115]:
                - generic [ref=e116]: ✓
                - paragraph [ref=e118]: Homepage banner ready
            - link "✓ Payment method enabled" [ref=e119] [cursor=pointer]:
              - /url: /admin/settings
              - generic [ref=e120]:
                - generic [ref=e121]: ✓
                - paragraph [ref=e123]: Payment method enabled
            - link "✓ Delivery method enabled" [ref=e124] [cursor=pointer]:
              - /url: /admin/settings
              - generic [ref=e125]:
                - generic [ref=e126]: ✓
                - paragraph [ref=e128]: Delivery method enabled
            - link "✓ Policy/contact pages ready" [ref=e129] [cursor=pointer]:
              - /url: /admin/settings
              - generic [ref=e130]:
                - generic [ref=e131]: ✓
                - paragraph [ref=e133]: Policy/contact pages ready
        - generic [ref=e134]:
          - button "📊 Overview" [ref=e135] [cursor=pointer]
          - button "💰 Financials" [ref=e136] [cursor=pointer]
          - button "🛍️ Products" [ref=e137] [cursor=pointer]
          - button "👥 Customers" [ref=e138] [cursor=pointer]
          - button "🎯 Conversion" [ref=e139] [cursor=pointer]
          - button "🚦 Operations" [ref=e140] [cursor=pointer]
          - button "📡 Monitoring" [ref=e141] [cursor=pointer]
        - generic [ref=e142]:
          - generic [ref=e143] [cursor=pointer]:
            - generic [ref=e144]:
              - generic [ref=e145]:
                - paragraph [ref=e146]: Total Revenue
                - paragraph [ref=e147]: Rs. 0
                - paragraph [ref=e148]: All time · paid orders
              - generic [ref=e150]: 💰
            - generic [ref=e151]:
              - generic [ref=e152]: ↑
              - text: 0% vs last month
            - generic [ref=e153]: View details →
          - generic [ref=e154] [cursor=pointer]:
            - generic [ref=e155]:
              - generic [ref=e156]:
                - paragraph [ref=e157]: This Month
                - paragraph [ref=e158]: Rs. 0
                - paragraph [ref=e159]: "Last: Rs. 0"
              - generic [ref=e161]: 📈
            - generic [ref=e162]: View details →
          - generic [ref=e163] [cursor=pointer]:
            - generic [ref=e164]:
              - generic [ref=e165]:
                - paragraph [ref=e166]: Total Orders
                - paragraph [ref=e167]: "2"
                - paragraph [ref=e168]: 0 placed today
              - generic [ref=e170]: 📦
            - generic [ref=e171]: View details →
          - generic [ref=e172] [cursor=pointer]:
            - generic [ref=e173]:
              - generic [ref=e174]:
                - paragraph [ref=e175]: Avg. Order Value
                - paragraph [ref=e176]: Rs. 0
                - paragraph [ref=e177]: Per transaction
              - generic [ref=e179]: 🧾
            - generic [ref=e180]: View details →
          - generic [ref=e181] [cursor=pointer]:
            - generic [ref=e182]:
              - generic [ref=e183]:
                - paragraph [ref=e184]: Total Customers
                - paragraph [ref=e185]: "1"
                - paragraph [ref=e186]: +1 this month
              - generic [ref=e188]: 👥
            - generic [ref=e189]: View details →
          - generic [ref=e190] [cursor=pointer]:
            - generic [ref=e191]:
              - generic [ref=e192]:
                - paragraph [ref=e193]: Gross Profit
                - paragraph [ref=e194]: Rs. 0
                - paragraph [ref=e195]: ~40% avg margin
              - generic [ref=e197]: 📊
            - generic [ref=e198]: View details →
          - generic [ref=e199] [cursor=pointer]:
            - generic [ref=e200]:
              - generic [ref=e201]:
                - paragraph [ref=e202]: Low Stock Items
                - paragraph [ref=e203]: "0"
                - paragraph [ref=e204]: Needs restocking
              - generic [ref=e206]: ⚠️
            - generic [ref=e207]: View details →
          - generic [ref=e208] [cursor=pointer]:
            - generic [ref=e209]:
              - generic [ref=e210]:
                - paragraph [ref=e211]: Pending Orders
                - paragraph [ref=e212]: "2"
                - paragraph [ref=e213]: Awaiting action
              - generic [ref=e215]: ⏳
            - generic [ref=e216]: View details →
        - generic [ref=e217]:
          - generic [ref=e218]:
            - generic [ref=e223]: Live Now
            - paragraph [ref=e224]: "39"
            - paragraph [ref=e225]: Visitors on site
            - generic [ref=e226]:
              - generic [ref=e227]:
                - paragraph [ref=e228]: "16"
                - paragraph [ref=e229]: Browsing
              - generic [ref=e230]:
                - paragraph [ref=e231]: "5"
                - paragraph [ref=e232]: In Cart
          - generic [ref=e233]:
            - generic [ref=e234]:
              - heading "Revenue — Last 30 Days" [level=2] [ref=e235]
              - generic [ref=e236]:
                - button "7d" [ref=e237] [cursor=pointer]
                - button "30d" [ref=e238] [cursor=pointer]
                - button "90d" [ref=e239] [cursor=pointer]
            - img [ref=e242]
        - generic [ref=e246]:
          - generic [ref=e247]:
            - heading "Orders by Status" [level=2] [ref=e249]
            - img [ref=e252]:
              - img [ref=e255]
            - button "Pending 2" [ref=e257] [cursor=pointer]:
              - generic [ref=e260]: Pending
              - generic [ref=e261]: "2"
          - generic [ref=e262]:
            - generic [ref=e263]:
              - heading "Recent Orders" [level=2] [ref=e264]
              - button "View all →" [ref=e265] [cursor=pointer]
            - generic [ref=e266]:
              - button "ORD-1783328102894-6EUTW Store Admin · 7/6/2026 Rs. 4,890 pending" [ref=e267] [cursor=pointer]:
                - generic [ref=e268]:
                  - paragraph [ref=e269]: ORD-1783328102894-6EUTW
                  - paragraph [ref=e270]: Store Admin · 7/6/2026
                - generic [ref=e271]:
                  - paragraph [ref=e272]: Rs. 4,890
                  - generic [ref=e273]: pending
              - button "ORD-1783252692453-J73DT Store Admin · 7/5/2026 Rs. 18,250 pending" [ref=e274] [cursor=pointer]:
                - generic [ref=e275]:
                  - paragraph [ref=e276]: ORD-1783252692453-J73DT
                  - paragraph [ref=e277]: Store Admin · 7/5/2026
                - generic [ref=e278]:
                  - paragraph [ref=e279]: Rs. 18,250
                  - generic [ref=e280]: pending
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
> 80 |   softExpect(fatalConsole, 'Fatal console/page runtime errors').toEqual([]);
     |                                                                 ^ Error: Fatal console/page runtime errors
  81 |   softExpect(apiFailures, 'API 5xx or unexpected hard failures').toEqual([]);
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