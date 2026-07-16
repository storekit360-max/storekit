# StoreKit — SEO Optimisation Setup Guide

## What Was Added

### Frontend (`frontend/`)

| File | Change |
|------|--------|
| `src/hooks/useSEO.js` | **NEW** — Dynamic meta, OG, Twitter Cards, JSON-LD, canonical, analytics events |
| `src/hooks/useAnalytics.js` | **NEW** — Injects GA4, GTM, Meta Pixel scripts from Settings |
| `src/App.js` | Added `<AnalyticsBootstrap/>` — analytics loads once per session |
| `src/context/ThemeContext.js` | Exposes `window.__STOREKIT_SEO__` after settings load; dispatches `storekit:seo-ready` |
| `src/pages/customer/CustomerLayout.js` | Injects `google-site-verification` meta tag dynamically |
| `src/pages/customer/Home.js` | Calls `useSEO()` for homepage |
| `src/pages/customer/Shop.js` | Calls `useSEO()` with category breadcrumbs |
| `src/pages/customer/ProductDetail.js` | Calls `useSEO()` with full Product schema + trackViewItem + trackAddToCart |
| `src/pages/customer/OrderSuccess.js` | Calls `useSEO()` noindex + `trackPurchase()` GA4/Meta Pixel |
| `src/pages/customer/Checkout.js` | `useSEO({ noindex: true })` |
| `src/pages/customer/Cart.js` | `useSEO({ noindex: true })` |
| `src/pages/customer/Account.js` | `useSEO({ noindex: true })` |
| `src/pages/admin/SEO.js` | GTM field added; `saveSettings` now persists unified `seo_config` object; sitemap/robots section updated |
| `public/index.html` | Full SEO baseline (OG, Twitter, canonical, robots), preconnect hints, dns-prefetch |
| `vercel.json` | Rewrites `/sitemap.xml` and `/robots.txt` → backend; security headers added |

### Backend (`backend/`)

| File | Change |
|------|--------|
| `routes/seo.js` | **NEW** — Dynamic `GET /api/seo/sitemap.xml` + `GET /api/seo/robots.txt` + cache-bust |
| `utils/productSeo.js` | Validates Google product eligibility and builds shipping, return, GTIN and condition data |
| `server.js` | Registered `app.use('/api/seo', require('./routes/seo'))` |

---

## One-Time Setup Steps

### 1. Update `vercel.json` with your Railway URL

Open `frontend/vercel.json` and replace both placeholder URLs:

```json
"destination": "https://YOUR-RAILWAY-APP.railway.app/api/seo/sitemap.xml"
"destination": "https://YOUR-RAILWAY-APP.railway.app/api/seo/robots.txt"
```

### 2. Configure SEO Settings in Admin

Go to **Admin → SEO → Tools & Analytics** and fill in:

| Field | Value |
|-------|-------|
| Site URL | `https://yourdomain.com` (no trailing slash) |
| GA4 Measurement ID | `G-XXXXXXXXXX` |
| Google Tag Manager ID | `GTM-XXXXXXX` (optional) |
| Facebook Pixel ID | Your Pixel ID (optional) |
| Twitter Handle | `@yourbrand` (optional) |
| Default OG Image | Full URL to a 1200×630px image |

Save — this writes a unified `seo_config` object to your Settings and immediately injects analytics scripts.

Then open **Admin → SEO → Technical SEO → Google Merchant Information** and configure the real shipping cost, delivery range, country and return window. These values must match checkout and the store policy pages.

### Product requirements

Every active product should have:

- A unique title and slug
- A useful description of at least 50 characters
- A crawlable HTTPS main image plus additional product images
- Price, stock and category
- Brand and the real GTIN or MPN when assigned by the manufacturer
- “No manufacturer identifiers” selected only when the product genuinely has none
- Correct New, Refurbished or Used condition

New active products are now rejected with a clear validation message when a required Google field is missing or inconsistent. Products may still be saved as **Hidden** while their information is being completed. Existing incomplete products appear in the tenant-scoped SEO audit and are excluded from the Merchant feed and indexable Product structured data until fixed.

Run **Admin → SEO → Run SEO Analysis** after imports. It reports real tenant-scoped product errors and warnings; it does not use simulated scores.

### 3. Submit Sitemap to Google Search Console

1. Visit https://search.google.com/search-console
2. Add your property → verify via HTML tag (paste the verification code in Admin → SEO → Tools)
3. Go to Sitemaps → enter `https://yourdomain.com/sitemap.xml` → Submit

For reliable multi-tenant ownership verification, prefer a DNS-domain property in Search Console. HTML verification metadata is also injected into tenant-rendered crawler HTML when configured.

### 4. Configure Google Merchant Center

Add this scheduled XML data source in Merchant Center:

`https://yourdomain.com/google-shopping-feed.xml`

The feed contains only Google-eligible active products and includes live tenant-scoped title, description, canonical product URL, supported image and additional images, stable ID, regular and sale prices, availability, condition, identifiers, product category, and configured shipping data. Review Merchant Center’s **Needs attention** report after every initial import.

### 5. Add OG Default Image

Upload a 1200×630px image to Cloudinary (or anywhere public), then paste the URL in Admin → SEO as **Default OG Image**.

---

## How Analytics Works

```
Settings API (/api/settings)
       ↓
ThemeContext.loadAndApply()
       ↓
window.__STOREKIT_SEO__ = { ga4Id, gtmId, metaPixelId, ... }
dispatchEvent('storekit:seo-ready')
       ↓
AnalyticsBootstrap (in App.js)
  ├─ Injects GTM script  (if gtmId)
  ├─ Injects GA4 script  (if ga4Id)
  └─ Injects Pixel script (if metaPixelId)
       ↓
useSEO() hook (per page)
  ├─ Sets <title>, meta, OG, Twitter, canonical
  ├─ Injects JSON-LD (WebSite, Organization, Product, BreadcrumbList)
  ├─ Fires gtag('config') page_view
  ├─ Fires fbq('track', 'PageView')
  └─ Pushes to dataLayer
```

### Ecommerce Events Tracked

| Event | Where |
|-------|-------|
| `page_view` | Every route change (useSEO hook) |
| `view_item` | ProductDetail page load |
| `add_to_cart` | Add to cart button click |
| `purchase` | OrderSuccess page load |
| Meta `ViewContent` | ProductDetail |
| Meta `AddToCart` | Add to cart |
| Meta `Purchase` | OrderSuccess |

---

## JSON-LD Schemas Injected

| Schema | Page | ID |
|--------|------|----|
| `WebSite` + SearchAction | All pages | `ld-website` |
| `Organization` | All pages | `ld-org` |
| `Product` + `AggregateRating` + `Offer` | ProductDetail | `ld-product` |
| `OfferShippingDetails` + `MerchantReturnPolicy` | ProductDetail / Organization | Server-rendered JSON-LD |
| `BreadcrumbList` | Shop, ProductDetail | `ld-breadcrumb` |

---

## Core Web Vitals Improvements

| Optimization | How |
|-------------|-----|
| Preconnect to Google Fonts | Added `<link rel="preconnect">` in index.html |
| DNS-prefetch Cloudinary | Added `<link rel="dns-prefetch">` |
| Analytics scripts async | GA4 / GTM / Pixel all injected with `async` attribute |
| No duplicate analytics calls | `document.getElementById` guard before each inject |
| Lazy analytics injection | Scripts only load after settings are fetched — no blocking |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` via vercel.json |

---

## Sitemap & Robots

- **Sitemap**: Auto-generated from live tenant-scoped MongoDB data. Product, category and brand sitemap responses are generated live and revalidated rather than held in an application cache.
- **Robots.txt**: Dynamically served; blocks private/admin areas from general crawlers while explicitly allowing Googlebot, Googlebot-Image, and StoreBot-Google to validate public products and the checkout flow.
- Both served at `/sitemap.xml` and `/robots.txt` via Vercel rewrites → Railway backend.
- Product feed: `/google-shopping-feed.xml` for Merchant Center scheduled fetches.

## Production verification after deployment

1. Open **Admin → SEO**, save the production merchant shipping/return values, then run **SEO Analysis**.
2. Resolve every red product error. Warnings are improvement suggestions; errors exclude a product from Google output.
3. Open these URLs on the tenant’s real domain and confirm they return that tenant only: `/robots.txt`, `/sitemap.xml`, `/products-sitemap.xml`, and `/google-shopping-feed.xml`.
4. Test one product in Google Rich Results Test and Search Console URL Inspection.
5. Submit `/sitemap.xml` in Search Console and the Merchant XML feed in Merchant Center.
6. Monitor Search Console indexing and Merchant Center **Needs attention** after Google recrawls.

The application can make products crawlable and eligible, but no application can guarantee that Google will index every URL, display a rich result, choose a particular ranking, or do so immediately. Those decisions remain with Google and depend on crawl timing, policy/account approval, content quality, competition, and site reputation.
