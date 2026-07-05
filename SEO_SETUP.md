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

### 3. Submit Sitemap to Google Search Console

1. Visit https://search.google.com/search-console
2. Add your property → verify via HTML tag (paste the verification code in Admin → SEO → Tools)
3. Go to Sitemaps → enter `https://yourdomain.com/sitemap.xml` → Submit

### 4. Add OG Default Image

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

- **Sitemap**: Auto-generated from live MongoDB data. Cached 1 hour. Includes all active products + categories + static pages.
- **Robots.txt**: Dynamically served; blocks admin, checkout, account, cart from crawlers.
- Both served at `/sitemap.xml` and `/robots.txt` via Vercel rewrites → Railway backend.
- To bust the sitemap cache manually: `POST /api/seo/bust-cache`

