/**
 * frontend/middleware.js — Vercel Edge Middleware (Multi-Tenant Edition)
 *
 * What this does:
 *
 *  1. TENANT DOMAIN RESOLUTION
 *     When a request arrives on a custom domain (e.g. computers.lk), this
 *     middleware calls the Railway backend's /api/superadmin/resolve-domain
 *     endpoint to check whether that domain belongs to a known tenant.
 *     The result is cached in-memory per domain for 5 minutes.
 *
 *  2. SEO BOT SSR PROXY
 *     If the requesting User-Agent is a known SEO/social crawler (Googlebot,
 *     facebookexternalhit, Twitterbot, etc.), the request is proxied to the
 *     Railway backend's seoRenderMiddleware, which injects per-tenant meta
 *     tags, JSON-LD schemas, and sitemap into the HTML before returning it.
 *     The X-Tenant-Domain header is forwarded so the backend knows which
 *     tenant to scope queries to.
 *
 *  3. REGULAR USERS
 *     Real visitors get the static SPA shell from Vercel CDN — zero Railway
 *     round-trip, zero Function invocation cost.
 *
 *  4. SITEMAP / ROBOTS.TXT
 *     These are always forwarded to Railway with X-Tenant-Domain so the backend
 *     returns per-tenant XML/text, which Google Search Console requires.
 *
 * IMPORTANT: Set INTERNAL_SECRET in both Vercel and Railway environment
 *            variables to the same random string (min 32 chars).
 */

export const config = {
  // Run on page-like routes only. Vercel's matcher filters everything else
  // (assets, /api, /static, favicons, fonts, etc.) before the function runs.
  matcher: [
    '/',
    '/store',
    '/product/:path*',
    '/category/:path*',
    '/brand/:path*',
    '/shop',
    '/shop/:path*',
    '/page/:path*',
    '/campaign/:path*',
    '/sitemap.xml',
    '/sitmap.xml',
    '/site-map.xml',
    '/sitemap_index.xml',
    '/products-sitemap.xml',
    '/categories-sitemap.xml',
    '/brands-sitemap.xml',
    '/pages-sitemap.xml',
    '/google-shopping-feed.xml',
    '/robots.txt',
    '/sitemap/:path*',
  ],
};

const ACTIVE_RAILWAY_ORIGIN = 'https://storekit1-production.up.railway.app';
const configuredRailwayValue = String(process.env.RAILWAY_BACKEND_URL || '').trim().replace(/\/$/, '');
const configuredRailwayOrigin = configuredRailwayValue && !/^https?:\/\//i.test(configuredRailwayValue)
  ? `https://${configuredRailwayValue}`
  : configuredRailwayValue;
// This hostname belonged to the previous unprovisioned Railway service. Ignore
// it even if it remains in an older Vercel environment-variable deployment.
const RAILWAY_ORIGIN = !configuredRailwayOrigin
  || configuredRailwayOrigin === 'https://storekit-production.up.railway.app'
  ? ACTIVE_RAILWAY_ORIGIN
  : configuredRailwayOrigin;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

// In-memory domain resolution cache (resets on cold start, which is fine)
const domainCache = new Map(); // domain → { found, tenantId, storeName, siteUrl, cachedAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function resolveDomain(domain) {
  const cached = domainCache.get(domain);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached;

  try {
    const url = `${RAILWAY_ORIGIN}/api/superadmin/resolve-domain?domain=${encodeURIComponent(domain)}`;
    const resp = await fetch(url, {
      headers: { 'x-internal-secret': INTERNAL_SECRET },
      // Short timeout — if Railway is slow, fall through to SPA shell
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const entry = { ...data, cachedAt: Date.now() };
    domainCache.set(domain, entry);
    return entry;
  } catch {
    return null;
  }
}

// SEO / social crawler detection
const BOT_UA_RE = new RegExp(
  [
    'Googlebot', 'Googlebot-Image', 'Google-InspectionTool', 'Google-Site-Verification',
    'AdsBot-Google', 'StoreBot-Google',
    'Bingbot', 'BingPreview',
    'facebookexternalhit', 'Facebot', 'WhatsApp',
    'Twitterbot', 'LinkedInBot',
    'Slackbot', 'Slack-ImgProxy',
    'Discordbot', 'TelegramBot',
    'Pinterest', 'redditbot',
    'Applebot', 'DuckDuckBot',
    'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
    'ClaudeBot', 'Claude-User', 'PerplexityBot', 'Amazonbot',
    'YandexBot', 'Baiduspider',
  ].join('|'),
  'i'
);
const NON_SEO_UA_RE = /HeadlessChrome|Lighthouse|Chrome-Lighthouse|PageSpeed/i;

function isSeoBot(ua) {
  if (!ua) return false;
  if (NON_SEO_UA_RE.test(ua)) return false;
  return BOT_UA_RE.test(ua);
}

function isSitemapOrRobots(pathname) {
  return pathname === '/robots.txt'
    || pathname === '/sitemap.xml'
    || pathname === '/sitemap_index.xml'
    || pathname === '/products-sitemap.xml'
    || pathname === '/categories-sitemap.xml'
    || pathname === '/brands-sitemap.xml'
    || pathname === '/pages-sitemap.xml'
    || pathname === '/google-shopping-feed.xml'
    || pathname.startsWith('/sitemap/');
}

export default async function middleware(request) {
  const url      = new URL(request.url);
  const { pathname, search } = url;
  const ua       = request.headers.get('user-agent') || '';
  const hostname = url.hostname; // the domain the request arrived on, e.g. computers.lk

  if (pathname === '/sitmap.xml' || pathname === '/site-map.xml') {
    return Response.redirect(new URL('/sitemap.xml', request.url), 308);
  }

  const isBot          = isSeoBot(ua);
  const isSitemapRoute = isSitemapOrRobots(pathname);

  // Only bots and sitemap/robots requests need the Railway round-trip.
  // Real users get the static SPA shell served by Vercel CDN.
  if (!isBot && !isSitemapRoute) return;

  // Only proxy GET/HEAD navigations that accept HTML (or always for sitemap/robots)
  const accept = request.headers.get('accept') || '';
  if (!isSitemapRoute) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return;
    if (accept && !accept.includes('text/html') && !accept.includes('*/*')) return;
  }

  // Resolve the domain → tenant (cached)
  const tenantInfo = await resolveDomain(hostname);
  const tenantDomain = (tenantInfo?.found && tenantInfo.domain) ? tenantInfo.domain : hostname;

  // Proxy to Railway with X-Tenant-Domain so the backend resolves the right tenant
  const target = new URL(pathname + search, RAILWAY_ORIGIN);

  try {
    const upstream = await fetch(target.toString(), {
      method:  request.method,
      headers: {
        'user-agent':       ua,
        'accept':           accept || 'text/html',
        'x-tenant-domain':  tenantDomain,
        'x-forwarded-host': hostname,
        'x-forwarded-proto': 'https',
      },
      // Preserve canonical/legacy redirects (for example /store -> /) for the
      // crawler instead of following them inside the proxy and returning 200
      // for the obsolete URL.
      redirect: 'manual',
      signal:   AbortSignal.timeout(10000),
    });

    const headers = new Headers(upstream.headers);
    // Never cache at the edge — Railway sets correct per-route Cache-Control
    headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    headers.set('X-SEO-SSR', 'railway');
    headers.set('X-Tenant-Domain', tenantDomain);

    return new Response(upstream.body, {
      status:  upstream.status,
      headers,
    });
  } catch {
    // A retryable failure is safer than letting a crawler index the generic SPA
    // shell without tenant-specific canonical tags, product data, or schemas.
    return new Response('SEO service temporarily unavailable', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '60',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }
}
