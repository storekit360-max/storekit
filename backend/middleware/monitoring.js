// ─── Monitoring Middleware ────────────────────────────────────────────────────
// Tracks per-endpoint stats, response times, error rates, IP hits,
// cache performance, and throttle events in-process (no DB required).
// Stats reset when the server restarts — for persistent history wire
// in a DB or external metrics store.

const stats = {
    requests:     {},   // { [endpoint]: { count, totalMs, errors, statusCodes } }
    ips:          {},   // { [ip]: count }
    cacheHits:    0,
    cacheMisses:  0,
    throttled:    0,
    startedAt:    Date.now(),
  };
  
  // ─── Request / Response tracker ──────────────────────────────────────────────
  function monitoringMiddleware(req, res, next) {
    const start = Date.now();
  
    res.on('finish', () => {
      const ms       = Date.now() - start;
      const method   = req.method;
      const base     = req.route ? req.route.path : req.path;
      const endpoint = `${method} ${base}`;
      const status   = res.statusCode;
      const ip       = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  
      // Per-endpoint
      if (!stats.requests[endpoint]) {
        stats.requests[endpoint] = { count: 0, totalMs: 0, errors: 0, statusCodes: {} };
      }
      const e = stats.requests[endpoint];
      e.count++;
      e.totalMs += ms;
      if (status >= 400) e.errors++;
      e.statusCodes[status] = (e.statusCodes[status] || 0) + 1;
  
      // Per-IP
      if (ip) stats.ips[ip] = (stats.ips[ip] || 0) + 1;
    });
  
    next();
  }
  
  // ─── Cache hit/miss helpers (call from your cache middleware) ─────────────────
  function recordCacheHit()  { stats.cacheHits++;  }
  function recordCacheMiss() { stats.cacheMisses++; }
  function recordThrottled() { stats.throttled++;   }
  
  // ─── Snapshot builder ─────────────────────────────────────────────────────────
  function getSnapshot() {
    const endpoints = Object.entries(stats.requests).map(([endpoint, d]) => ({
      endpoint,
      count:      d.count,
      avgMs:      d.count ? Math.round(d.totalMs / d.count) : 0,
      totalMs:    d.totalMs,
      errors:     d.errors,
      errorRate:  d.count ? +(d.errors / d.count * 100).toFixed(1) : 0,
      statusCodes: d.statusCodes,
    }));
  
    // Sort by request count descending
    endpoints.sort((a, b) => b.count - a.count);
  
    const totalRequests = endpoints.reduce((s, e) => s + e.count, 0);
    const totalErrors   = endpoints.reduce((s, e) => s + e.errors, 0);
  
    // Top IPs
    const topIPs = Object.entries(stats.ips)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));
  
    return {
      uptimeMs:      Date.now() - stats.startedAt,
      startedAt:     stats.startedAt,
      totalRequests,
      totalErrors,
      errorRate:     totalRequests ? +(totalErrors / totalRequests * 100).toFixed(1) : 0,
      endpoints,
      topEndpoints:  endpoints.slice(0, 10),
      topIPs,
      cache: {
        hits:    stats.cacheHits,
        misses:  stats.cacheMisses,
        ratio:   (stats.cacheHits + stats.cacheMisses)
                   ? +(stats.cacheHits / (stats.cacheHits + stats.cacheMisses) * 100).toFixed(1)
                   : 0,
      },
      throttling: {
        blocked: stats.throttled,
      },
    };
  }
  
  // ─── Reset (useful for testing) ──────────────────────────────────────────────
  function resetStats() {
    stats.requests  = {};
    stats.ips       = {};
    stats.cacheHits = 0;
    stats.cacheMisses = 0;
    stats.throttled = 0;
    stats.startedAt = Date.now();
  }
  
  module.exports = {
    monitoringMiddleware,
    recordCacheHit,
    recordCacheMiss,
    recordThrottled,
    getSnapshot,
    resetStats,
  };
  