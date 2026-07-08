# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-auth-admin.spec.js >> Store admin end-to-end QA >> admin route /admin/orders loads
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
+     "url": "http://localhost:3000/admin/orders",
+   },
+   Object {
+     "text": "Failed to load resource: the server responded with a status of 404 (Not Found)",
+     "type": "error",
+     "url": "http://localhost:3000/admin/orders",
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
      - heading "Orders" [level=1] [ref=e69]
      - generic [ref=e70]:
        - button "🌙" [ref=e71] [cursor=pointer]
        - button "Notifications" [ref=e73] [cursor=pointer]:
          - img [ref=e74]
          - generic [ref=e76]: "3"
        - link "↗ View Store" [ref=e77] [cursor=pointer]:
          - /url: /
    - main [ref=e78]:
      - generic [ref=e79]:
        - generic [ref=e81]:
          - heading "Orders" [level=2] [ref=e82]
          - paragraph [ref=e83]: 2 total orders
        - generic [ref=e84]:
          - generic [ref=e85]:
            - textbox "Search by order number, email, name…" [ref=e86]
            - combobox [ref=e87]:
              - option "All Priority" [selected]
              - option "🚨 Urgent"
              - option "🔶 High"
              - option "Normal"
          - generic [ref=e88]:
            - button "All" [ref=e89] [cursor=pointer]
            - button "pending" [ref=e90] [cursor=pointer]
            - button "confirmed" [ref=e91] [cursor=pointer]
            - button "processing" [ref=e92] [cursor=pointer]
            - button "shipped" [ref=e93] [cursor=pointer]
            - button "out for delivery" [ref=e94] [cursor=pointer]
            - button "delivered" [ref=e95] [cursor=pointer]
            - button "cancelled" [ref=e96] [cursor=pointer]
        - table [ref=e99]:
          - rowgroup [ref=e100]:
            - row "Order Customer Items Total Payment Status SLA Date Actions" [ref=e101]:
              - columnheader "Order" [ref=e102]
              - columnheader "Customer" [ref=e103]
              - columnheader "Items" [ref=e104]
              - columnheader "Total" [ref=e105]
              - columnheader "Payment" [ref=e106]
              - columnheader "Status" [ref=e107]
              - columnheader "SLA" [ref=e108]
              - columnheader "Date" [ref=e109]
              - columnheader "Actions" [ref=e110]
          - rowgroup [ref=e111]:
            - row "🏦 ORD-1783328102894-6EUTW Store Admin lilyfashion@gmail.com 1 item Rs. 4,890 pending Bank pending 7/6/2026 🔔 — Bill Waybill Confirm" [ref=e112]:
              - cell "🏦 ORD-1783328102894-6EUTW" [ref=e113]:
                - generic [ref=e114]:
                  - generic "Awaiting payment slip" [ref=e116]: 🏦
                  - link "ORD-1783328102894-6EUTW" [ref=e117] [cursor=pointer]:
                    - /url: /admin/orders/6a4b6d66d47c0c1cda140a6e
              - cell "Store Admin lilyfashion@gmail.com" [ref=e118]:
                - paragraph [ref=e119]: Store Admin
                - paragraph [ref=e120]: lilyfashion@gmail.com
              - cell "1 item" [ref=e121]:
                - generic [ref=e122]: 1 item
              - cell "Rs. 4,890" [ref=e123]:
                - generic [ref=e124]: Rs. 4,890
              - cell "pending Bank" [ref=e125]:
                - generic [ref=e126]:
                  - generic [ref=e127]: pending
                  - paragraph [ref=e128]: Bank
              - cell "pending" [ref=e129]:
                - generic [ref=e130]: pending
              - cell [ref=e131]
              - cell "7/6/2026" [ref=e132]
              - cell "🔔 — Bill Waybill Confirm" [ref=e133]:
                - generic [ref=e134]:
                  - button "🔔" [ref=e135] [cursor=pointer]
                  - combobox "Set priority" [ref=e136]:
                    - option "—" [selected]
                    - option "🔶 High"
                    - option "🚨 Urgent"
                  - link [ref=e137] [cursor=pointer]:
                    - /url: /admin/orders/6a4b6d66d47c0c1cda140a6e
                    - img [ref=e138]
                  - button "Bill" [ref=e140] [cursor=pointer]:
                    - img [ref=e141]
                    - text: Bill
                  - button "Waybill" [ref=e143] [cursor=pointer]:
                    - img [ref=e144]
                    - text: Waybill
                  - button "Confirm" [ref=e146] [cursor=pointer]
            - row "ORD-1783252692453-J73DT Store Admin lilyfashion@gmail.com 1 item Rs. 18,250 pending COD pending 7/5/2026 🔔 — Bill Waybill Confirm" [ref=e147]:
              - cell "ORD-1783252692453-J73DT" [ref=e148]:
                - link "ORD-1783252692453-J73DT" [ref=e151] [cursor=pointer]:
                  - /url: /admin/orders/6a4a46d4cbc1f4c5b64c909f
              - cell "Store Admin lilyfashion@gmail.com" [ref=e152]:
                - paragraph [ref=e153]: Store Admin
                - paragraph [ref=e154]: lilyfashion@gmail.com
              - cell "1 item" [ref=e155]:
                - generic [ref=e156]: 1 item
              - cell "Rs. 18,250" [ref=e157]:
                - generic [ref=e158]: Rs. 18,250
              - cell "pending COD" [ref=e159]:
                - generic [ref=e160]:
                  - generic [ref=e161]: pending
                  - paragraph [ref=e162]: COD
              - cell "pending" [ref=e163]:
                - generic [ref=e164]: pending
              - cell [ref=e165]
              - cell "7/5/2026" [ref=e166]
              - cell "🔔 — Bill Waybill Confirm" [ref=e167]:
                - generic [ref=e168]:
                  - button "🔔" [ref=e169] [cursor=pointer]
                  - combobox "Set priority" [ref=e170]:
                    - option "—" [selected]
                    - option "🔶 High"
                    - option "🚨 Urgent"
                  - link [ref=e171] [cursor=pointer]:
                    - /url: /admin/orders/6a4a46d4cbc1f4c5b64c909f
                    - img [ref=e172]
                  - button "Bill" [ref=e174] [cursor=pointer]:
                    - img [ref=e175]
                    - text: Bill
                  - button "Waybill" [ref=e177] [cursor=pointer]:
                    - img [ref=e178]
                    - text: Waybill
                  - button "Confirm" [ref=e180] [cursor=pointer]
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