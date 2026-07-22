# StoreKit multi-tenant SEO architecture audit

Evidence date: 2026-07-22

This report covers the application source in this repository. Search-engine indexing, rankings, rich-result display, production response time, deployed database contents, DNS, provider configuration, and Search Console status cannot be guaranteed by source code and must be verified after deployment.

## Architecture decision

StoreKit retains its backward-compatible hybrid rendering boundary:

- Vercel serves the existing React storefront to visitors.
- verified search, social, and AI crawlers are routed by `frontend/middleware.js` to the tenant-aware HTML renderer in `backend/routes/seo.js`;
- the response contains the title, description, canonical, robots directive, Open Graph/Twitter fields, visible semantic content, crawlable links, product data, and JSON-LD before JavaScript executes;
- sitemap, robots, and Merchant feed requests always use the same tenant resolver;
- crawler failures return retryable `503` plus `noindex`, rather than a generic or wrong-tenant shell.

This provides complete crawler HTML without a framework migration that could break the live checkout/storefront. Dynamic rendering remains a transitional architecture: the long-term target is universal request-time or incremental rendering for crawlers and users from one render tree. The generated content must stay equivalent to the React page to avoid cloaking.

## Findings and implemented controls

| Severity | Finding and SEO impact | Affected source | Implemented control |
|---|---|---|---|
| Critical | Optional Merchant fields previously removed useful products from organic sitemaps and applied `noindex`. This caused preventable product disappearance. | `backend/utils/productSeo.js`, `backend/routes/seo.js` | Organic `indexEligible`, rich-result `eligible`, and Merchant `merchantEligible` are independent. Active products with a name and stable slug remain discoverable while the admin audit reports missing enhancements. |
| Critical | SPA HTML did not contain tenant/product data without JavaScript. | `frontend/middleware.js`, `backend/routes/seo.js` | Crawler-aware hybrid HTML renders complete product/category/brand/store content before JS. Bot and AI-search coverage was expanded. Upstream failures fail closed with `503`. |
| Critical | Redirects were followed inside the Edge proxy, turning obsolete URLs into soft `200` responses. | `frontend/middleware.js` | Upstream redirects are passed through with `redirect: manual`; `/store` consolidates to `/` and legacy category URLs consolidate to canonical category URLs. |
| Critical | Sitemap generation had no 50,000-URL protection and alias routing discarded pagination queries. | `backend/routes/seo.js`, `backend/server.js` | Product sitemaps page at 45,000 records and root aliases preserve `?page=N`. The index advertises every page. |
| High | Sitemap `lastmod` claimed the current date even when content had not changed. Misleading dates reduce trust in crawl hints. | `backend/routes/seo.js` | Sitemap index dates come from the latest real product/category/business-page update; individual URLs use their own `updatedAt`. |
| High | Category, brand, and shop crawler HTML exposed only the first result set, creating orphan products beyond it. | `backend/routes/seo.js` | Stable server pagination uses crawlable `href` links, self-canonical page URLs, unique page titles, and `404` for out-of-range pages. |
| High | Product crawler HTML lacked strong contextual links. | `backend/routes/seo.js` | Product pages expose breadcrumbs, category, brand, store/shop, and related-product links. Shop pagination provides a complete crawl path to the catalogue. |
| High | Product variants were neither grouped in JSON-LD nor expanded in Merchant output. | `backend/models/Product.js`, `backend/routes/seo.js`, `backend/utils/productSeo.js` | `ProductGroup`/`hasVariant`, `variesBy`, per-variant Offer data, stable feed IDs, `item_group_id`, variant attributes, images, inventory, pricing, GTIN, and MPN are supported. Variant identifiers are validated independently. |
| High | Product/organization graphs could be duplicated after React executed. Duplicate or conflicting graphs make interpretation unreliable. | `frontend/src/hooks/useSEO.js`, `frontend/src/index.js` | The client detects server `Product` or `ProductGroup` and breadcrumb graphs, avoids reinsertion, and removes the static visible copy after React commits. |
| High | Faceted/search combinations could create an unlimited indexable URL space. | `backend/routes/seo.js`, `frontend/src/pages/customer/Shop.js`, `backend/routes/seo.js` robots output | Filtered combinations use `noindex,follow`, base canonicals, no filter ItemList schema, and defensive parameter crawl rules. Page-only pagination remains indexable. |
| High | Tenant canonical and feed URLs could inherit stale manual settings. Cross-tenant canonical leakage is severe. | `backend/routes/seo.js` | Canonicals always use the verified active tenant domain, and every catalogue query is tenant scoped. Unknown/unavailable domains fail closed. |
| High | Product rich data lacked consolidated seller, shipping, returns, variants, reviews, and identifiers. | `backend/routes/seo.js` | Eligible products receive Product/ProductGroup, Offer, OnlineStore seller, shipping, return-policy reference, aggregate rating, approved reviews, Brand, SKU, GTIN/MPN, availability, price/currency, images, and BreadcrumbList. Fields are emitted only when supported by stored facts. |
| High | Merchant feed omitted variants and could reject valid extensionless CDN images. | `backend/routes/seo.js` | Tenant feeds support variant items and HTTPS extensionless image URLs while excluding known SVG placeholders. Feed eligibility and an admin readiness audit prevent malformed offers. |
| Medium | Product and listing images lacked intrinsic dimensions or loading intent, increasing CLS/LCP risk. | `frontend/src/pages/customer/Home.js`, `Shop.js`, `ProductDetail.js`, category/brand pages, crawler HTML | Primary product images are eager/high-priority; below-fold images lazy-load and decode asynchronously; key image surfaces have intrinsic dimensions and descriptive alt text. Product sitemap entries include up to ten images. |
| Medium | The document referenced nonexistent fallback favicon files and the static manifest could not represent a tenant's uploaded icon. This produced browser manifest errors and inconsistent store branding. | `frontend/public/index.html`, `frontend/vercel.json`, `backend/routes/settings.js`, `frontend/src/context/ThemeContext.js` | Every static icon reference now resolves, runtime tab icons use the tenant favicon/logo conversion endpoint, and a tenant-aware web manifest advertises valid tenant or bundled fallback PNGs. |
| Medium | Private/customer utility routes depended on client-only robots metadata. | `frontend/vercel.json`, dynamic robots output | `X-Robots-Tag` and robots rules cover admin, account, cart, checkout, authentication, order, wishlist, and tracking routes. Product, category, brand, store, and image crawling remain allowed. |
| Medium | Root, Organization, and entity ownership were weakly connected. | `backend/routes/seo.js` | `WebSite`, `OnlineStore`, publisher/seller IDs, SearchAction, social profiles, contact details, address, logo, and return policy share stable tenant entity IDs. |
| Medium | Synthetic FAQ text could make unverified warranty, authenticity, availability, or delivery claims and was not visible. | `backend/routes/seo.js` | Synthetic FAQ builders were removed. FAQ/HowTo markup must be emitted only for tenant-authored, visible content that matches the page. Product markup—not FAQ markup—is the supported commerce enhancement. |

## URL, canonical, and index policy

- Product: `/product/:slug`, self-canonical, `200` only for an active tenant-owned product, real `404` when absent.
- Category: `/category/:slug[?page=N]`, each real page self-canonical and internally linked.
- Brand: `/brand/:slug[?page=N]`, derived only from active tenant products.
- Shop: `/shop[?page=N]` indexable; search, sort, price, stock, campaign, and category-filter permutations are `noindex,follow` and canonicalize to the clean collection URL.
- Business content: `/page/:slug`, tenant scoped with authored metadata fallback.
- Store alias: `/store` permanently redirects to `/` for crawlers.
- Tracking parameters are stripped from client canonicals and blocked as crawl-trap defense.
- Missing and unavailable resources return meaningful `404`/`503` status and `noindex`.

## Sitemaps and feeds

- `/sitemap.xml` and `/sitemap_index.xml`: tenant sitemap index.
- `/products-sitemap.xml?page=N`: paged product and image sitemap (45,000 database rows per page).
- `/categories-sitemap.xml`: non-empty categories.
- `/brands-sitemap.xml`: brands represented by active products.
- `/pages-sitemap.xml`: tenant store/static and business pages.
- `/google-shopping-feed.xml`: tenant Merchant Center RSS feed.
- `/robots.txt`: tenant-aware crawler policy and sitemap declaration.

Image records are embedded in the product sitemap, which avoids duplicating every product URL in a second image-only sitemap. Empty video and news sitemaps are intentionally not emitted; add them only when the platform stores indexable videos or eligible news content.

## Structured-data policy

Structured data is derived from database truth. Missing facts are omitted instead of invented. Ratings use approved review data; sale prices require a valid discount; `priceValidUntil` is emitted only when stored; return policy exists only when a positive tenant return window is configured; variant dimensions use Schema.org properties where defined and `additionalProperty` otherwise.

Schema eligibility is intentionally stricter than organic indexability. A product can be crawled and indexed while the admin SEO audit identifies what prevents a product rich result or Merchant listing.

## Performance posture

The storefront already code-splits route modules and production assets use immutable hashed caching. This change adds image sizing/loading controls without changing business behavior. Production Core Web Vitals still require field measurement per tenant and template; source inspection and a local build cannot prove LCP, CLS, or INP at the 75th percentile.

Recommended production budgets:

- LCP at or below 2.5 seconds at p75;
- CLS at or below 0.1 at p75;
- INP at or below 200 ms at p75;
- no crawler HTML response above the platform timeout; and
- sitemap/feed database queries verified with production-shaped indexes and catalogue volume.

## Release and operational gates

1. Deploy backend first, then Vercel, because Edge routes depend on the new renderer behavior.
2. Confirm every tenant has one active primary domain, HTTPS, store name, logo, description, currency, country, shipping cost/time, and return window.
3. Run the Admin SEO product audit; fix identifier, image, description, price, category, inventory, and sale-price findings.
4. Validate representative simple and variant products in Google Rich Results Test and Schema Markup Validator.
5. Fetch `/`, a product, category page 2, a filtered shop URL, a missing product, every sitemap page, robots, and Merchant feed using Googlebot and a normal browser user-agent. Compare visible facts for parity.
6. Submit only `/sitemap.xml` in Google Search Console and Bing Webmaster Tools; monitor Page Indexing, Merchant listings, Product snippets, crawl stats, and enhancements.
7. Register the tenant feed in Merchant Center, configure account-level shipping/returns where appropriate, and resolve diagnostics before enabling paid distribution.
8. Run Lighthouse and real-user monitoring per major template and high-traffic tenant; treat lab scores as diagnostics rather than field proof.
9. Inspect server logs for sitemap/feed `5xx`, crawler latency, soft-404 behavior, and redirect loops after release.

## Authoritative guidance

- Google JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Ecommerce pagination: https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading
- Product structured data: https://developers.google.com/search/docs/appearance/structured-data/product
- Merchant listings: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- Product variants: https://developers.google.com/search/docs/appearance/structured-data/product-variants
- Sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Breadcrumbs: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb

## Honest readiness statement

The repository is now technically prepared to give search engines complete, tenant-correct, crawlable commerce documents and feeds. It is “rich-results eligible,” not “rich-results guaranteed”: Google decides crawling, indexing, canonical selection, ranking, AI citation, and whether to display an enhancement. A 10/10 production claim requires the post-deployment evidence above and clean real catalogue data for every tenant.
