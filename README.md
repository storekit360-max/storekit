# StoreKit SaaS — Complete Setup, Deployment, and Operations Guide

StoreKit is a multi-tenant ecommerce SaaS application. A single backend, frontend, and MongoDB database can serve multiple independent stores. Each tenant has its own domain, plan, admins, catalogue, orders, settings, theme, payment gateways, delivery services, pages, and SEO output.

This README is the primary setup guide for local development and production deployment.

## Contents

1. [Main features](#main-features)
2. [Architecture](#architecture)
3. [Repository structure](#repository-structure)
4. [Prerequisites](#prerequisites)
5. [Local setup](#local-setup)
6. [Environment variables](#environment-variables)
7. [Database seed and accounts](#database-seed-and-accounts)
8. [Running and building](#running-and-building)
9. [Creating tenants and domains](#creating-tenants-and-domains)
10. [Third-party integrations](#third-party-integrations)
11. [SEO and Google product discovery](#seo-and-google-product-discovery)
12. [Production deployment](#production-deployment)
13. [Testing and verification](#testing-and-verification)
14. [Backups and maintenance](#backups-and-maintenance)
15. [Security checklist](#security-checklist)
16. [Troubleshooting](#troubleshooting)

## Main features

- Multi-tenant stores resolved from custom domains
- Super-admin plans, tenant provisioning, billing, and feature flags
- Products, categories, brands, variants, stock, bulk Excel import, bulk URL import, and image uploads
- Customer shop, product pages, cart, checkout, wishlist, accounts, and order tracking
- Orders, coupons, gift cards, delivery services, returns, reviews, subscribers, deals, and seasonal campaigns
- Bank transfer, Cash on Delivery, PayHere, Stripe, and PayPal support
- Cloudinary image hosting and image processing
- Theme Builder, Layout Builder, animation settings, banners, popups, and business pages
- Email notifications using SMTP or Resend
- Google login and Google Drive backups
- AI product content and social post creation using OpenRouter or Gemini
- Facebook/Instagram, WhatsApp, Telegram, and other social publishing integrations
- GA4, Google Tag Manager, Meta Pixel, and Meta Conversions API support
- Tenant-aware metadata, product structured data, robots.txt, XML sitemaps, and Google Merchant feeds
- Automated backup, subscription, token-refresh, and maintenance schedulers

## Architecture

```text
Customer or Googlebot
        |
        v
Vercel frontend / custom tenant domain
        |
        | /api, robots, sitemaps, Merchant feed
        v
Railway Node.js + Express backend
        |
        +---- MongoDB Atlas (tenant data)
        +---- Cloudinary (images)
        +---- Email / payment / AI / social providers
```

Tenant resolution uses request-domain headers and the active domains stored on each `Tenant` document. Public and admin data must remain scoped to the resolved `tenantId`.

Important production files:

- `frontend/vercel.json`: frontend routes and Railway rewrites
- `frontend/middleware.js`: domain and crawler handling at the Vercel edge
- `backend/railway.json`: Railway start and health-check configuration
- `backend/middleware/tenant.js`: tenant-domain resolution
- `backend/routes/seo.js`: tenant-aware SEO, sitemaps, Merchant feed, and crawler HTML

## Repository structure

```text
storekit/
├── backend/
│   ├── controllers/       # Controller logic
│   ├── middleware/        # Authentication, tenant resolution, errors
│   ├── models/            # Mongoose schemas
│   ├── routes/            # REST API and SEO endpoints
│   ├── scripts/           # Migrations, audits, maintenance
│   ├── services/          # Billing, backup, automation, publishing
│   ├── templates/         # Creative templates
│   ├── utils/             # Shared backend helpers
│   ├── .env.example
│   ├── seed.js
│   └── server.js
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/admin/
│   │   ├── pages/customer/
│   │   ├── pages/superadmin/
│   │   └── utils/
│   ├── .env.example
│   ├── middleware.js
│   └── vercel.json
├── qa-bot/                # Playwright QA suite and reports
├── DEPLOY.md              # Additional domain/deployment notes
└── README.md
```

## Prerequisites

- Node.js 18 or newer
- npm 9 or newer
- Git
- MongoDB 6+ locally, or a MongoDB Atlas cluster
- A Cloudinary account for production image hosting
- Railway and Vercel accounts for the documented production architecture

Check your tools:

```bash
node --version
npm --version
git --version
```

## Local setup

### 1. Clone and install dependencies

```bash
git clone YOUR_REPOSITORY_URL storekit
cd storekit

cd backend
npm install

cd ../frontend
npm install
```

### 2. Create environment files

```bash
cd ../backend
cp .env.example .env

cd ../frontend
cp .env.example .env.local
```

Never commit `.env` or `.env.local` files.

### 3. Configure MongoDB

For local MongoDB:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/storekit
```

For MongoDB Atlas:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/storekit?retryWrites=true&w=majority
```

For Atlas, create a database user and allow the Railway deployment to connect. Avoid an unrestricted network allow-list when a narrower rule is practical.

### 4. Minimum local backend configuration

```env
NODE_ENV=development
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/storekit
JWT_SECRET=replace_with_a_long_random_secret
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5001
ADMIN_URL=http://localhost:3000/admin
INTERNAL_SECRET=replace_with_another_random_secret
```

Generate secrets with:

```bash
openssl rand -hex 32
```

### 5. Frontend local configuration

```env
REACT_APP_API_URL=http://localhost:5001/api
```

The frontend also has a proxy to `http://localhost:5001`, but explicitly setting the API URL makes the local dependency clear.

### 6. Seed the development database

```bash
cd backend
npm run seed
```

See [Database seed and accounts](#database-seed-and-accounts) before running this against any shared database.

### 7. Start both applications

Terminal 1:

```bash
cd backend
npm run dev
```

Terminal 2:

```bash
cd frontend
npm start
```

Open:

- Storefront: `http://localhost:3000`
- Store admin login: `http://localhost:3000/login`
- Super-admin login: `http://localhost:3000/superadmin/login`
- API health: `http://localhost:5001/api/health`

## Environment variables

Start from the checked-in example files. The application contains optional integrations, so not every variable is required.

### Required backend variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Signs authentication tokens; use a strong random value |
| `FRONTEND_URL` | Primary frontend origin |
| `BACKEND_URL` | Public Railway/backend origin |
| `INTERNAL_SECRET` | Shared trusted-service secret; must match Vercel |
| `PORT` | Backend port; Railway usually injects it |
| `NODE_ENV` | `development` or `production` |

### URL, CORS, and tenant variables

| Variable | Purpose |
|---|---|
| `ADMIN_URL` | Base URL used in admin email links |
| `EXTRA_ORIGINS` | Comma-separated additional allowed CORS origins |
| `ALLOW_ALL_ORIGINS` | Development-only override; do not enable in production |
| `PRODUCTION_DOMAIN` | Production store/domain fallback used by integrations |
| `API_URL` | API URL used by selected internal jobs/scripts |
| `RAILWAY_BACKEND_URL` | Railway origin used by frontend edge middleware |
| `RAILWAY_STATIC_URL` | Railway-provided public URL fallback |
| `TARGET_DOMAIN` | Domain used by selected maintenance scripts |
| `BACKFILL_TENANT_DOMAIN` | Tenant migration/backfill domain |

### Authentication

| Variable | Purpose |
|---|---|
| `JWT_ISSUER` | Optional JWT issuer validation |
| `JWT_AUDIENCE` | Optional JWT audience validation |
| `GOOGLE_CLIENT_ID` | Platform Google Sign-In web client ID and backend token audience |
| `GOOGLE_AUTH_BRIDGE_URL` | Permanent frontend bridge URL, for example `https://app.example.com/google-auth-bridge` |

### Images

| Variable | Purpose |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

Cloudinary is strongly recommended in production. Bulk URL imports intentionally avoid permanently storing unreliable hotlinked competitor images when rehosting is unavailable.

### Email

| Variable | Purpose |
|---|---|
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port, commonly `587` |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASS` | SMTP password/API key |
| `EMAIL_FROM` | Default sender address |
| `RESEND_API_KEY` | Resend API key |
| `ADMIN_EMAIL` | Fallback administrative recipient |

Tenant-specific sender settings and Resend keys can also be managed through Admin Settings.

### Google Drive backup OAuth

| Variable | Purpose |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Must end with `/api/backup/oauth/callback` |

### AI

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter content/image provider |
| `GEMINI_API_KEY` | Gemini fallback/provider |

At least one AI provider is required for AI generation features. Core ecommerce functions do not require AI.

### Meta, social media, and WhatsApp

| Variable | Purpose |
|---|---|
| `SOCIAL_MEDIA_SECRET` | Encrypts stored social credentials; never rotate without a migration plan |
| `META_PIXEL_ID` | System-level Meta Pixel fallback |
| `META_CAPI_ACCESS_TOKEN` | Meta Conversions API system-user token |
| `META_TEST_EVENT_CODE` | Optional Meta test event code |
| `WHATSAPP_BOT_ENABLED` | Enables/disables the WhatsApp bot |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verification token |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API phone-number ID |
| `WHATSAPP_ADMIN_NUMBER` | Administrative notification number |

### Billing and maintenance

| Variable | Purpose |
|---|---|
| `BILLING_GRACE_DAYS` | Subscription payment grace period |
| `SHOP_NAME` | Global/legacy fallback store name |

### Frontend production variables

| Variable | Purpose |
|---|---|
| `REACT_APP_API_URL` | Optional API base; production normally uses `/api` rewrites |
| `RAILWAY_BACKEND_URL` | Backend URL used by `middleware.js` |
| `INTERNAL_SECRET` | Must exactly match Railway/backend |

Only variables prefixed with `REACT_APP_` are embedded in the browser bundle. Never put secrets in a `REACT_APP_*` variable.

## Database seed and accounts

Run:

```bash
cd backend
npm run seed
```

The seed script:

- Creates or updates Starter and Pro plans
- Creates or updates a Demo tenant for `localhost` and `127.0.0.1`
- Deletes and recreates users matching the built-in demo admin identities
- Synchronizes selected indexes

The seed prints newly generated strong passwords once at the end of the run. To
choose them explicitly, set `SEED_SUPERADMIN_PASSWORD` and
`SEED_STORE_ADMIN_PASSWORD` before running the command.

| Role | Email |
|---|---|
| Super admin | `superadmin@storekit.local` |
| Demo store admin | `admin@storekit.local` |

Production seeding is blocked unless `ALLOW_PRODUCTION_SEED=true` is explicitly
set. The script deliberately recreates the demo users, so use that override only
for an intentional deployment operation.

## Running and building

### Backend

```bash
cd backend
npm run dev       # nodemon development server
npm start         # production-style Node server
```

### Frontend

```bash
cd frontend
npm start         # React development server
npm run build     # optimized build in frontend/build
```

### Health check

```bash
curl http://localhost:5001/api/health
```

Expected shape:

```json
{"status":"ok","time":"..."}
```

## Creating tenants and domains

### Create a tenant

1. Sign in at `/superadmin/login`.
2. Create and configure a plan.
3. Create a tenant and assign the plan.
4. Create the tenant admin with a strong password.
5. Add the domain without protocol or path, for example `shop.example.com`.
6. Ensure the tenant, subscription, and domain are active.

### Connect the domain to Vercel

1. Add the domain in Vercel Project Settings → Domains.
2. Apply the DNS records provided by Vercel at the registrar.
3. Add both root and `www` forms when both should work.
4. Mark one domain as the primary domain in StoreKit.
5. Wait for DNS and TLS verification.

Typical Vercel DNS values are an A record for the apex and a CNAME for `www`, but always use the values displayed by the current Vercel project.

### Verify tenant resolution

```bash
curl "https://BACKEND/api/superadmin/resolve-domain?domain=shop.example.com" \
  -H "x-internal-secret: YOUR_INTERNAL_SECRET"
```

Test public settings through the store domain:

```bash
curl https://shop.example.com/api/settings
```

The response should contain that tenant's store name and tenant ID.

## Third-party integrations

### Cloudinary

1. Create a Cloudinary account.
2. Copy cloud name, API key, and API secret into Railway.
3. Restart the backend.
4. Test a normal admin image upload and a bulk URL product import.

### Google Sign-In

StoreKit uses one permanent OAuth bridge so newly created stores and custom
domains do not need to be added to Google Cloud one by one.

1. Create or select one **Web application** OAuth client in Google Cloud Console.
2. Choose one permanent frontend origin, such as `https://storekit.example.com`.
3. Add that origin (scheme and hostname only, without a path) to **Authorized JavaScript origins**.
4. Set Railway `GOOGLE_CLIENT_ID` to that web client ID.
5. Set Railway `GOOGLE_AUTH_BRIDGE_URL` to the same origin plus `/google-auth-bridge`.
6. Ensure Railway `FRONTEND_URL` is the same permanent frontend origin.
7. Deploy the backend and frontend, then test Google registration from a newly mapped tenant domain.

The bridge validates the requesting origin against active tenant domains in
MongoDB, returns the Google ID token to that exact origin, and the normal tenant
API creates or signs in the customer. Do not add every tenant domain as an
Authorized JavaScript origin.

### Email / Resend

1. Verify a sending domain with the provider.
2. Set SMTP/Resend environment variables.
3. Configure tenant sender name, sender address, reply-to address, and notification toggles in Admin Settings.
4. Test order creation, payment-slip, status-update, and password-reset emails.

### Payment methods

Manual methods are configured under Admin Settings → Payment:

- Direct bank transfer and bank details
- Cash on Delivery

Online gateways are configured under Admin Settings → Gateways:

- PayHere: merchant ID and merchant secret
- Stripe: publishable key, secret key, and webhook secret
- PayPal: client ID and client secret

Gateway records are tenant-scoped. Configure each gateway separately for each store. Use sandbox mode first, then test callbacks/webhooks before enabling live mode.

Never expose merchant secrets, Stripe secret keys, PayPal client secrets, or webhook secrets in frontend environment variables.

### Google Drive backups

1. Enable Google Drive API in Google Cloud.
2. Create OAuth credentials.
3. Set the exact callback URL in Google and `GOOGLE_OAUTH_REDIRECT_URI`.
4. Open Admin → Backup and complete OAuth authorization.
5. Test backup creation and restore using non-production data first.

### AI and social publishing

1. Add an OpenRouter or Gemini key for AI features.
2. Set a permanent, strong `SOCIAL_MEDIA_SECRET` before storing social tokens.
3. Configure each platform from the admin UI.
4. Use provider test accounts/pages before publishing publicly.

## SEO and Google product discovery

Every tenant has domain-specific SEO output:

```text
/robots.txt
/sitemap.xml
/products-sitemap.xml
/categories-sitemap.xml
/brands-sitemap.xml
/pages-sitemap.xml
/google-shopping-feed.xml
```

Product pages generate `Product` and `Offer` structured data with:

- Canonical tenant URL
- Current active price and ISO currency
- `InStock` or `OutOfStock` availability
- Product images, SKU, brand, condition, and seller
- Aggregate rating/reviews when valid data exists
- Breadcrumb structured data

For best eligibility, every active product should have:

- A unique, descriptive name and slug
- A positive, accurate price
- Correct `isOnSale`, sale price, and sale end date
- Accurate stock quantity
- At least one crawlable product image
- A useful description, category, brand, and SKU/MPN where applicable

### Google Search Console per tenant

1. Add the tenant's production domain as a Search Console property.
2. Prefer DNS verification for domain properties.
3. Submit `https://TENANT_DOMAIN/sitemap.xml`.
4. Inspect the home page and representative product URLs.
5. Monitor indexing, structured-data, and Core Web Vitals reports.

### Google Merchant Center per tenant

1. Create or connect the tenant's Merchant Center account.
2. Verify and claim the tenant domain.
3. Add `https://TENANT_DOMAIN/google-shopping-feed.xml` as a scheduled data source.
4. Configure accurate shipping, returns, tax, and business information in Merchant Center.
5. Resolve all item-level diagnostics before enabling free listings or ads.

Structured data and feeds make products eligible; Google controls crawling, indexing, ranking, and whether rich results are displayed.

### SEO verification commands

```bash
curl https://TENANT_DOMAIN/robots.txt
curl https://TENANT_DOMAIN/sitemap.xml
curl https://TENANT_DOMAIN/products-sitemap.xml
curl https://TENANT_DOMAIN/google-shopping-feed.xml
curl -A "Googlebot/2.1" https://TENANT_DOMAIN/product/PRODUCT_SLUG
```

Use Google's Rich Results Test and Search Console URL Inspection for final production validation.

## Production deployment

### Railway backend

1. Create a Railway project from the Git repository.
2. Set Root Directory to `backend`.
3. Use the start command from `backend/railway.json` (`npm start`).
4. Add all required backend variables.
5. Deploy and copy the public Railway URL.
6. Confirm `/api/health` returns HTTP 200.

Minimum production variables:

```env
NODE_ENV=production
MONGODB_URI=...
JWT_SECRET=...
INTERNAL_SECRET=...
BACKEND_URL=https://YOUR_SERVICE.up.railway.app
FRONTEND_URL=https://YOUR_PROJECT.vercel.app
ADMIN_URL=https://YOUR_PROJECT.vercel.app/admin
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Railway normally provides `PORT`; do not hard-code a conflicting production port.

### Vercel frontend

1. Import the same repository into Vercel.
2. Set Root Directory to `frontend`.
3. Build command: `npm run build`.
4. Output directory: `build`.
5. Set `RAILWAY_BACKEND_URL`, `INTERNAL_SECRET`, and optional frontend variables.
6. Ensure `INTERNAL_SECRET` exactly matches Railway.
7. Update every hard-coded Railway destination in `frontend/vercel.json` if the backend service URL changes.
8. Deploy and test all sitemap/feed rewrites.

The current `vercel.json` rewrites `/api/*`, robots.txt, all sitemap files, and the Merchant feed to Railway before its SPA fallback. Keep those rules above `/(.*) -> /index.html`.

### Production smoke test

```bash
curl https://BACKEND/api/health
curl https://FRONTEND/api/settings
curl https://TENANT_DOMAIN/robots.txt
curl https://TENANT_DOMAIN/sitemap.xml
curl https://TENANT_DOMAIN/products-sitemap.xml
```

Also manually test:

- Customer registration and login
- Admin and super-admin login
- Product creation, image upload, search, and product page
- Cart and checkout using each enabled payment method
- Order creation and email notifications
- Tenant isolation using two different domains
- Theme/Layout save followed by a hard refresh
- Mobile navigation and checkout

## Testing and verification

### Compile checks

```bash
cd frontend
npm run build

cd ../backend
node --check server.js
```

### QA bot

The `qa-bot` package contains Playwright tests and reports.

```bash
cd qa-bot
npm install
npx playwright install
npx playwright test
```

Configure `qa-bot/.env` from its example before running tests against a specific environment. Do not point destructive admin tests at production unless the suite and data scope have been reviewed.

### Tenant-isolation audit scripts

Review scripts before execution and back up the database first:

```text
backend/scripts/tenant-isolation-migration.js
backend/scripts/tenant-isolation-audit-fix.js
backend/scripts/tenant-data-audit.js
backend/scripts/bootstrap-existing-tenants.js
backend/scripts/move-null-tenant-data.js
```

These scripts can modify production data. Run them only with a clear migration plan.

## Backups and maintenance

The backend starts backup, subscription, and token-refresh schedulers after MongoDB connects.

Recommended operations:

- Enable automated MongoDB Atlas backups for production.
- Connect and periodically test StoreKit backups.
- Store an independent off-provider backup.
- Test restores in a staging database.
- Monitor Railway logs, MongoDB connections, payment webhooks, email failures, and scheduled jobs.
- Rotate API keys and access tokens using provider-supported procedures.
- Run subscription maintenance scripts only after reviewing their options.

Never treat an untested backup as recoverable.

## Security checklist

- Never commit `.env`, database URLs, JWT secrets, OAuth secrets, API keys, or payment credentials.
- Rotate any secret that has appeared in Git history, logs, screenshots, or chat.
- Use different secrets for development, staging, and production.
- Set strong `JWT_SECRET`, `INTERNAL_SECRET`, and `SOCIAL_MEDIA_SECRET` values.
- Keep `ALLOW_ALL_ORIGINS` disabled in production.
- Restrict MongoDB network access where practical.
- Enable MFA on MongoDB, Railway, Vercel, Cloudinary, Google, Meta, payment, and email accounts.
- Replace seeded credentials before exposing the service publicly.
- Keep online payment secrets server-side and verify webhook signatures.
- Use HTTPS for every production and tenant domain.
- Confirm tenant isolation whenever adding a new model or route.
- Validate file types, upload sizes, and external URLs.
- Back up before migrations, bulk fixes, restores, or index changes.
- Keep dependencies patched and review `npm audit` findings before applying breaking upgrades.

## Troubleshooting

### Backend cannot connect to MongoDB

- Verify `MONGODB_URI`, username, password, database name, and Atlas network rules.
- URL-encode special characters in database passwords.
- Confirm Railway has the variable in the correct environment.

### Frontend API requests return HTML

- Check `REACT_APP_API_URL` locally.
- Check the `/api/:path*` rewrite in `frontend/vercel.json`.
- Confirm the Railway URL is correct and `/api/health` works.

### CORS error on a tenant domain

- Ensure the exact domain exists and is active on the tenant.
- Do not include protocol, port, or path in stored production domains.
- Add staging origins to `EXTRA_ORIGINS` when appropriate.
- Restart Railway after configuration changes if cached origins remain stale.

### Store not found or wrong tenant data

- Confirm DNS points to the correct Vercel project.
- Check tenant status, subscription status, domain `active`, and primary-domain selection.
- Compare the `X-Tenant-Domain` header with the domain stored in MongoDB.
- Verify `INTERNAL_SECRET` matches Vercel and Railway.

### Layout or settings say saved but disappear

- Confirm both backend and frontend deployments contain the latest code.
- Inspect the `PUT /api/settings` response.
- Verify the setting exists in the strict `Tenant.settings` schema.
- Confirm the admin user belongs to the expected tenant.

### Products missing after bulk import

- Check the streamed import errors and Railway logs.
- Ensure the product has the current tenant ID and a category belonging to that tenant.
- Check plan product limits and duplicate SKU/slug errors.
- Configure Cloudinary for reliable imported images.

### Duplicate or incorrect checkout payment methods

- Confirm `/api/payments/gateways` returns only the current tenant's gateways.
- Disable incomplete gateways under Admin Settings → Gateways.
- Re-save gateway credentials for the correct tenant.
- Hard-refresh after deploying frontend changes.

### Products missing from Google

- Products must be active and reachable without login.
- Verify positive price, image, canonical URL, and accurate stock.
- Check robots.txt and product sitemap HTTP responses.
- Submit the tenant sitemap in Search Console.
- Inspect the product URL and Merchant Center diagnostics.
- Allow time for recrawling; eligibility does not guarantee display.

### Google OAuth origin or redirect mismatch

- For customer Google Sign-In `origin_mismatch`, confirm the origin portion of
  `GOOGLE_AUTH_BRIDGE_URL` is registered under **Authorized JavaScript origins**.
- Confirm `GOOGLE_CLIENT_ID` belongs to that exact Google Web OAuth client.
- Customer sign-in uses the permanent bridge; tenant domains should not require
  separate Google Cloud entries.
- For Google Drive backup `redirect_uri_mismatch`, the callback configured in
  Google must exactly equal `GOOGLE_OAUTH_REDIRECT_URI`.
- Google Sign-In and Google Drive backup are different OAuth flows and may use
  different client configurations.

### Production build fails

```bash
cd frontend
npm install
npm run build
```

Read the first compiler error rather than the final summary. Confirm Node 18+, committed lockfiles, and required build-time frontend variables.

## Additional documentation

- [DEPLOY.md](DEPLOY.md) — multi-tenant domain and deployment notes
- [SETUP_GUIDE.md](SETUP_GUIDE.md) — older detailed setup walkthrough; this README should be treated as the current primary guide
- [SEO_SETUP.md](SEO_SETUP.md) — additional SEO notes; review these together with the per-domain Search Console and Merchant Center dashboards

---

Before every production release: back up the database, build the frontend, run backend syntax checks, deploy backend first, deploy frontend second, and complete the production smoke test for at least two tenant domains.
