import React, { useState, useEffect } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

// ── helpers ───────────────────────────────────────────────────────────────────
const ScoreBadge = ({ score, size = 'md' }) => {
  const color = score >= 90 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  const bg    = score >= 90 ? '#dcfce7' : score >= 50 ? '#fef3c7' : '#fee2e2';
  const s = size === 'lg' ? 'text-3xl font-black w-16 h-16' : 'text-sm font-bold w-10 h-10';
  return (
    <div className={`${s} rounded-full flex items-center justify-center flex-shrink-0`} style={{ background: bg, color }}>
      {score}
    </div>
  );
};

const CopyBtn = ({ text }) => (
  <button onClick={() => { navigator.clipboard.writeText(text); toast.success('Copied!'); }}
    className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0">
    📋 Copy
  </button>
);

// ── Field — defined OUTSIDE AdminSEO to prevent re-mount on every render ──────
const Field = ({ label, value, onChange, placeholder, hint, type = 'text' }) => (
  <div>
    <label className="form-label">{label}</label>
    <input type={type} value={value || ''} onChange={onChange} placeholder={placeholder} className="form-input"/>
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

// ── Tab Nav ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',  icon: '📊', label: 'Overview' },
  { id: 'technical', icon: '⚡', label: 'Technical SEO' },
  { id: 'offpage',   icon: '🔗', label: 'Off-Page SEO' },
  { id: 'tools',     icon: '🛠️', label: 'Tools & Analytics' },
  { id: 'files',     icon: '📄', label: 'Sitemap & Robots' },
];

export default function AdminSEO() {
  const [tab, setTab] = useState('overview');
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [vitals, setVitals] = useState(null);
  const [checkingVitals, setCheckingVitals] = useState(false);
  const [sitemapXml, setSitemapXml] = useState('');
  const [robotsTxt, setRobotsTxt] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [generatingSitemap, setGeneratingSitemap] = useState(false);
  const [productAudit, setProductAudit] = useState(null);

  useEffect(() => {
    API.get('/settings', { cacheTTL: 5 * 60 * 1000 }).then(r => {
      const s = r.data || {};
      // Merge CAPI-specific keys into settings state so form fields are pre-filled
      setSettings({
        ...s,
        capiAccessToken:   s.meta_capi_token       || '',
        capiTestEventCode: s.meta_test_event_code  || '',
      });
    }).catch(() => {});
    API.get('/products?limit=100').then(r => setProducts(r.data.products || [])).catch(() => {});
    API.get('/categories').then(r => setCategories(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const base = settings.siteUrl || window.location.origin;
    const fallback = `User-agent: Googlebot\nAllow: /\n\nUser-agent: Googlebot-Image\nAllow: /\n\nUser-agent: StoreBot-Google\nAllow: /\n\nUser-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /superadmin/\nDisallow: /api/\nDisallow: /checkout\nDisallow: /cart\nDisallow: /account\nDisallow: /my-orders\nDisallow: /returns\n\nSitemap: ${base}/sitemap.xml`;
    setRobotsTxt(settings.robotsTxt || fallback);
  }, [settings.siteUrl, settings.robotsTxt]);

  const saveSettings = async (patch = {}) => {
    const merged = { ...settings, ...patch };
    setSettings(merged);
    setSaving(true);
    try {
      // Build the unified seo_config object that useSEO / AnalyticsBootstrap reads
      const seo_config = {
        siteName:           merged.storeName        || merged.seo_config?.siteName || '',
        siteUrl:            merged.siteUrl          || window.location.origin,
        defaultDescription: merged.metaDescription  || merged.seo_config?.defaultDescription || '',
        defaultOgImage:     merged.ogImage          || merged.seo_config?.defaultOgImage || '',
        twitterHandle:      merged.twitterHandle    || merged.seo_config?.twitterHandle || '',
        orgName:            merged.storeName        || '',
        logoUrl:            merged.logoUrl          || '',
        phone:              merged.phone            || '',
        facebookUrl:        merged.facebookUrl      || '',
        instagramUrl:       merged.instagramUrl     || '',
        twitterUrl:         merged.twitterUrl       || '',
        linkedinUrl:        merged.linkedinUrl      || '',
        youtubeUrl:         merged.youtubeUrl       || '',
        // Analytics IDs
        ga4Id:              merged.googleAnalytics   || '',
        gtmId:              merged.googleTagManager  || '',
        metaPixelId:        merged.facebookPixel     || '',
        currencyCode:       merged.currencyCode      || 'LKR',
      };
      // Save CAPI credentials as separate Settings keys (not in seo_config,
      // since they are server-read — never sent to the browser window object)
      if (merged.capiAccessToken !== undefined) {
        await API.put('/settings', { meta_capi_token: merged.capiAccessToken }).catch(() => {});
      }
      if (merged.capiTestEventCode !== undefined) {
        await API.put('/settings', { meta_test_event_code: merged.capiTestEventCode }).catch(() => {});
      }
      const payload = { ...merged, robotsTxt, seo_config };
      await API.put('/settings', payload);
      // Immediately inject into window so analytics fires without page reload
      window.__STOREKIT_SEO__ = seo_config;
      window.dispatchEvent(new CustomEvent('storekit:seo-ready'));
      toast.success('SEO settings saved!');
    } catch (error) { toast.error(error?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  // ── Core Web Vitals Simulation ───────────────────────────────────────────────
  const runVitalsCheck = async () => {
    setCheckingVitals(true);
    setVitals(null);
    try {
      const { data } = await API.get('/seo/admin/product-audit', { skipCache: true });
      setProductAudit(data);
      const checks = Object.fromEntries((data.storeChecks || []).map(check => [check.key, check]));
      const merchantEligible = data.summary.merchantEligible ?? data.summary.eligible ?? 0;
      const eligiblePct = data.summary.active ? Math.round((merchantEligible / data.summary.active) * 100) : 0;
      setVitals({
        lcp:  { code:'PRODUCTS', score: data.summary.score, value: `${data.summary.eligible}/${data.summary.active}`, label: 'Google-ready active products', pass: data.summary.eligible === data.summary.active && data.summary.active > 0, tip: `${data.summary.errorCount} errors · ${data.summary.warningCount} warnings` },
        fid:  { code:'DOMAIN', score: checks.domain?.ok ? 100 : 0, value: checks.domain?.ok ? 'Ready' : 'Missing', label: 'Canonical store domain', pass: !!checks.domain?.ok, tip: checks.domain?.message || '' },
        cls:  { code:'META', score: checks.description?.ok ? 100 : 30, value: checks.description?.ok ? 'Ready' : 'Missing', label: 'Store search description', pass: !!checks.description?.ok, tip: checks.description?.message || '' },
        fcp:  { code:'FEED', score: eligiblePct, value: `${merchantEligible}/${data.summary.active}`, label: 'Merchant feed eligibility', pass: eligiblePct === 100, tip: `${data.summary.merchantErrorCount || 0} Merchant data errors · ${data.urls?.merchantFeed || 'Configure an active domain'}` },
        ttfb: { code:'RETURNS', score: checks.returns?.ok ? 100 : 50, value: checks.returns?.ok ? 'Ready' : 'Optional', label: 'Merchant return policy', pass: !!checks.returns?.ok, tip: checks.returns?.message || '' },
        mobile: { score: 100, pass: true, tip: 'Responsive storefront and crawlable links are enabled.' },
        https:  { score: checks.domain?.ok ? 100 : 0, pass: !!checks.domain?.ok, tip: checks.domain?.message || '' },
        meta:   { score: checks.description?.ok ? 100 : 40, pass: !!checks.description?.ok, tip: checks.description?.message || '' },
        analytics: { score: settings.googleAnalytics || settings.googleTagManager ? 100 : 0, pass: !!(settings.googleAnalytics || settings.googleTagManager), tip: settings.googleAnalytics || settings.googleTagManager ? 'Analytics configured.' : 'Add GA4 or GTM to measure Google sales.' },
        searchConsole: { score: checks.searchConsole?.ok ? 100 : 0, pass: !!checks.searchConsole?.ok, tip: checks.searchConsole?.message || '' },
        structured: { score: data.summary.score, pass: data.summary.errorCount === 0, tip: `${data.summary.eligible} active products pass required structured-data checks.` },
        sitemap: { score: data.urls?.sitemap ? 100 : 0, pass: !!data.urls?.sitemap, tip: data.urls?.sitemap || 'Add an active domain.' },
        robots: { score: checks.robots?.ok ? 100 : 0, pass: !!checks.robots?.ok, tip: checks.robots?.message || '' },
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'SEO analysis failed');
    } finally {
      setCheckingVitals(false);
    }
  };

  // ── Sitemap Generator ────────────────────────────────────────────────────────
  const generateSitemap = () => {
    setGeneratingSitemap(true);
    const base = settings.siteUrl || window.location.origin;
    const now = new Date().toISOString().split('T')[0];
    const urls = [
      { loc: base, priority: '1.0', freq: 'daily' },
      { loc: `${base}/shop`, priority: '0.9', freq: 'daily' },
      { loc: `${base}/gift-cards`, priority: '0.7', freq: 'weekly' },
      ...categories.map(c => ({ loc: `${base}/category/${c.slug}`, priority: '0.8', freq: 'weekly' })),
      ...products.filter(p => p.isActive).map(p => ({ loc: `${base}/product/${p.slug}`, priority: '0.7', freq: 'weekly' })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
    setSitemapXml(xml);
    setGeneratingSitemap(false);
    toast.success(`Sitemap generated with ${urls.length} URLs!`);
  };

  const downloadFile = (content, filename, type = 'text/plain') => {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    toast.success(`${filename} downloaded!`);
  };

  const saveRobots = () => saveSettings({ robotsTxt });

  const overallScore = vitals
    ? Math.round(Object.values(vitals).filter(v => typeof v.score === 'number').reduce((s, v) => s + v.score, 0) / Object.values(vitals).filter(v => typeof v.score === 'number').length)
    : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold text-gray-900">SEO Dashboard</h2>
        <p className="text-sm text-gray-500">Improve your store's search engine visibility</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Run check */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="font-bold text-gray-900 mb-1">SEO Health Check</h3>
                <p className="text-sm text-gray-500">Analyse your store's SEO performance and get improvement tips</p>
              </div>
              <button onClick={runVitalsCheck} disabled={checkingVitals}
                className="btn-primary text-sm flex items-center gap-2">
                {checkingVitals ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Analysing...</>
                ) : '🔍 Run SEO Analysis'}
              </button>
            </div>

            {overallScore !== null && (
              <div className="mt-5 flex items-center gap-5 p-4 rounded-2xl" style={{ background: 'var(--body-bg)' }}>
                <ScoreBadge score={overallScore} size="lg"/>
                <div>
                  <p className="font-bold text-gray-900 text-lg">Overall SEO Score</p>
                  <p className="text-sm text-gray-500">{overallScore >= 80 ? '🎉 Great job! Your store is well-optimised.' : overallScore >= 60 ? '⚠️ Good, but there are areas to improve.' : '🔴 Needs attention — check recommendations below.'}</p>
                </div>
              </div>
            )}
          </div>

          {vitals && (
            <>
              {/* Core Web Vitals */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">🔎 Live Google Product Checks</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {['lcp','fid','cls','fcp','ttfb'].map(key => {
                    const v = vitals[key];
                    const color = v.score >= 90 ? '#16a34a' : v.score >= 50 ? '#d97706' : '#dc2626';
                    return (
                      <div key={key} className="border border-gray-100 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{v.code || key.toUpperCase()}</p>
                            <p className="text-sm font-semibold text-gray-700 mt-0.5">{v.label}</p>
                          </div>
                          <ScoreBadge score={v.score}/>
                        </div>
                        <p className="text-2xl font-black" style={{ color }}>{v.value}</p>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 mb-2">
                          <div className="h-1.5 rounded-full" style={{ width: `${v.score}%`, background: color }}/>
                        </div>
                        <p className="text-xs text-gray-400">{v.tip}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {productAudit?.products?.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div><h3 className="font-bold text-gray-900">Products needing SEO attention</h3><p className="text-xs text-gray-400">Fix errors first; warnings improve Merchant Center quality.</p></div>
                    <a href="/admin/products" className="text-xs font-bold text-blue-600">Open Products →</a>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {productAudit.products.map(row => (
                      <div key={row.id} className="rounded-xl border border-gray-100 p-3">
                        <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-gray-800 truncate">{row.name}</p><ScoreBadge score={row.score}/></div>
                        {row.errors.map(error => <p key={error} className="text-xs text-red-600 mt-1">● {error}</p>)}
                        {(row.merchantErrors || []).map(error => <p key={`merchant-${error}`} className="text-xs text-red-600 mt-1">● Merchant Center: {error}</p>)}
                        {row.warnings.map(warning => <p key={warning} className="text-xs text-amber-600 mt-1">● {warning}</p>)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="font-bold text-gray-900 mb-4">SEO Checklist</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { key: 'mobile',     icon: '📱', label: 'Mobile Responsive' },
                    { key: 'https',      icon: '🔒', label: 'HTTPS / Secure' },
                    { key: 'meta',       icon: '🏷️', label: 'Meta Tags' },
                    { key: 'analytics',  icon: '📊', label: 'Google Analytics' },
                    { key: 'searchConsole', icon: '🔍', label: 'Search Console' },
                    { key: 'structured', icon: '📋', label: 'Structured Data' },
                    { key: 'sitemap',    icon: '🗺️', label: 'Sitemap.xml' },
                    { key: 'robots',     icon: '🤖', label: 'Crawler Access' },
                  ].map(item => {
                    const v = vitals[item.key];
                    return (
                      <div key={item.key} className={`flex items-start gap-3 p-3 rounded-xl border ${v.pass ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'}`}>
                        <span className="text-lg flex-shrink-0">{item.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className={`text-sm font-semibold ${v.pass ? 'text-green-800' : 'text-red-700'}`}>{item.label}</p>
                            <span className={`text-sm ${v.pass ? 'text-green-600' : 'text-red-500'}`}>{v.pass ? '✓' : '✗'}</span>
                          </div>
                          <p className="text-xs mt-0.5 text-gray-500">{v.tip}</p>
                          {!v.pass && (
                            <button onClick={() => setTab(item.key === 'analytics' || item.key === 'searchConsole' ? 'tools' : item.key === 'sitemap' || item.key === 'robots' ? 'files' : 'technical')}
                              className="text-xs font-semibold mt-1" style={{ color: 'var(--color-primary)' }}>
                              Fix this →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick wins */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="font-bold text-gray-900 mb-4">💡 Quick Wins</h3>
                <div className="space-y-3">
                  {[
                    { done: !!settings.metaTitle, tip: 'Add a meta title', action: () => setTab('technical'), fix: 'Go to Technical SEO' },
                    { done: !!settings.metaDescription, tip: 'Add a meta description (150–160 chars)', action: () => setTab('technical'), fix: 'Go to Technical SEO' },
                    { done: !!settings.googleAnalytics, tip: 'Connect Google Analytics GA4', action: () => setTab('tools'), fix: 'Add GA4 ID' },
                    { done: !!settings.googleSearchConsole, tip: 'Verify Google Search Console', action: () => setTab('tools'), fix: 'Add verification code' },
                    { done: !!sitemapXml, tip: 'Generate & submit sitemap.xml', action: () => setTab('files'), fix: 'Generate Sitemap' },
                    { done: !!settings.facebookUrl || !!settings.instagramUrl, tip: 'Add social media profiles', action: () => setTab('offpage'), fix: 'Add Social Links' },
                    { done: products.length > 0, tip: 'Add products with descriptions & images', action: () => {}, fix: 'Add Products' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${item.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        {item.done ? '✓' : i + 1}
                      </span>
                      <p className={`text-sm flex-1 ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.tip}</p>
                      {!item.done && (
                        <button onClick={item.action} className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--color-primary)' }}>{item.fix} →</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TECHNICAL SEO ── */}
      {tab === 'technical' && (
        <div className="space-y-5">
          {/* Meta Tags */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">🏷️ Meta Tags</h3>
            <p className="text-sm text-gray-400 mb-4">These appear in search engine results</p>
            <div className="space-y-4">
              <Field label="Meta Title" value={settings.metaTitle} onChange={e => setSettings(p => ({ ...p, metaTitle: e.target.value }))} placeholder={`${settings.storeName || 'Your Store'} — Best Products Online`} hint={`${(settings.metaTitle || '').length}/60 chars (ideal: 50–60)`}/>
              <div>
                <label className="form-label">Meta Description</label>
                <textarea value={settings.metaDescription || ''} onChange={e => setSettings(p => ({ ...p, metaDescription: e.target.value }))} rows={3} className="form-input resize-none" placeholder="Describe your store in 150–160 characters for search engines..."/>
                <p className="text-xs text-gray-400 mt-1">{(settings.metaDescription || '').length}/160 chars (ideal: 150–160)</p>
              </div>
            </div>
            {/* SERP preview */}
            <div className="mt-5 p-4 border border-gray-100 rounded-xl bg-gray-50">
              <p className="text-xs font-bold text-gray-400 uppercase mb-3">Search Result Preview</p>
              <p className="text-blue-600 text-base font-medium">{settings.metaTitle || settings.storeName || 'Your Store'}</p>
              <p className="text-green-700 text-xs">{(settings.siteUrl || 'https://yourstore.com').slice(0, 60)}</p>
              <p className="text-gray-500 text-sm mt-1 leading-snug">{settings.metaDescription || 'Add a meta description to improve your click-through rate from search results.'}</p>
            </div>
          </div>

          {/* Site URL */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">🌐 Site Configuration</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Site URL (Production)" value={settings.siteUrl} onChange={e => setSettings(p => ({ ...p, siteUrl: e.target.value }))} placeholder="https://yourstore.com" hint="Used for sitemap and canonical URLs"/>
              <Field label="Language" value={settings.siteLanguage || 'en'} onChange={e => setSettings(p => ({ ...p, siteLanguage: e.target.value }))} placeholder="en" hint="ISO language code"/>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">🛍️ Google Merchant Information</h3>
            <p className="text-sm text-gray-400 mb-4">Used in Product structured data for shipping and return information. Values must match checkout and store policy pages.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Country Code" value={settings.merchantCountryCode || 'LK'} onChange={e=>setSettings(p=>({...p,merchantCountryCode:e.target.value.toUpperCase().slice(0,2)}))} placeholder="LK" hint="ISO two-letter country code"/>
              <Field label="Shipping Cost" type="number" value={settings.merchantShippingCost ?? settings.standardDelivery ?? 0} onChange={e=>setSettings(p=>({...p,merchantShippingCost:Number(e.target.value)}))} placeholder="0"/>
              <Field label="Return Window (days)" type="number" value={settings.merchantReturnDays || ''} onChange={e=>setSettings(p=>({...p,merchantReturnDays:Number(e.target.value)}))} placeholder="7" hint="Leave 0 only when no standard return window exists"/>
              <Field label="Minimum Delivery Days" type="number" value={settings.merchantShippingMinDays ?? 1} onChange={e=>setSettings(p=>({...p,merchantShippingMinDays:Number(e.target.value)}))} placeholder="1"/>
              <Field label="Maximum Delivery Days" type="number" value={settings.merchantShippingMaxDays ?? 5} onChange={e=>setSettings(p=>({...p,merchantShippingMaxDays:Number(e.target.value)}))} placeholder="5"/>
              <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 mt-5"><input type="checkbox" checked={settings.merchantFreeReturns===true} onChange={e=>setSettings(p=>({...p,merchantFreeReturns:e.target.checked}))}/><span className="text-sm font-semibold text-gray-700">Free returns</span></label>
            </div>
          </div>

          {/* Open Graph / Social Preview */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">🖼️ Open Graph (Social Preview)</h3>
            <p className="text-sm text-gray-400 mb-4">Controls how your site looks when shared on Facebook, WhatsApp, Twitter etc.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="OG Title" value={settings.ogTitle} onChange={e => setSettings(p => ({ ...p, ogTitle: e.target.value }))} placeholder="Same as Meta Title"/>
              <Field label="OG Description" value={settings.ogDescription} onChange={e => setSettings(p => ({ ...p, ogDescription: e.target.value }))} placeholder="Same as Meta Description"/>
              <div className="sm:col-span-2">
                <label className="form-label">OG Image URL</label>
                <input value={settings.ogImage || ''} onChange={e => setSettings(p => ({ ...p, ogImage: e.target.value }))} className="form-input" placeholder="https://yourstore.com/og-image.jpg"/>
                <p className="text-xs text-gray-400 mt-1">Recommended size: 1200×630px. Use your store banner or logo.</p>
              </div>
            </div>
            {/* OG Preview */}
            {(settings.ogImage || settings.logoUrl) && (
              <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden max-w-sm">
                <div className="h-28 bg-gray-100 overflow-hidden">
                  <img src={settings.ogImage || settings.logoUrl} alt="OG Preview" className="w-full h-full object-cover"/>
                </div>
                <div className="p-3 bg-white">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{(settings.siteUrl || 'yourstore.com').replace('https://', '').split('/')[0]}</p>
                  <p className="font-semibold text-sm text-gray-800 mt-0.5">{settings.ogTitle || settings.metaTitle || settings.storeName}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{settings.ogDescription || settings.metaDescription}</p>
                </div>
              </div>
            )}
          </div>

          {/* Mobile */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">📱 Mobile Responsiveness</h3>
            <div className="space-y-3">
              {[
                { ok: true, label: 'Responsive meta viewport tag', detail: '<meta name="viewport" content="width=device-width, initial-scale=1">' },
                { ok: true, label: 'Mobile bottom navigation', detail: 'Fixed bottom nav for easy mobile browsing' },
                { ok: true, label: 'Touch-friendly buttons (44px+)', detail: 'All interactive elements meet Apple HIG standards' },
                { ok: true, label: '16px font inputs (no iOS zoom)', detail: 'All form inputs prevent unwanted zoom on iOS' },
                { ok: true, label: 'Mobile cart drawer', detail: 'Slides up from bottom on small screens' },
                { ok: true, label: 'Responsive product grid', detail: '2 columns mobile → 3 tablet → 4 desktop' },
                { ok: true, label: 'Safe area support (iPhone notch)', detail: 'env(safe-area-inset-*) CSS applied' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-green-50 border border-green-100">
                  <span className="text-green-500 font-bold text-sm flex-shrink-0 mt-0.5">✓</span>
                  <div>
                    <p className="text-sm font-semibold text-green-800">{item.label}</p>
                    <p className="text-xs text-green-600 mt-0.5 font-mono">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Loading Speed Tips */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">🚀 Loading Speed Tips</h3>
            <div className="space-y-3">
              {[
                { ok: true,  tip: 'Images lazy-loaded', detail: 'Product images load only when visible' },
                { ok: true,  tip: 'CSS animations GPU-accelerated', detail: 'Uses transform/opacity for smooth 60fps' },
                { ok: true,  tip: 'Google Fonts preconnect', detail: '<link rel="preconnect" href="https://fonts.googleapis.com">' },
                { ok: false, tip: 'Enable image compression', detail: 'Use WebP format for product images to reduce file size by 30–50%' },
                { ok: false, tip: 'Enable GZIP/Brotli compression on server', detail: 'Add compression middleware to Express backend' },
                { ok: false, tip: 'Set up CDN for static assets', detail: 'Use Cloudflare or AWS CloudFront for faster delivery' },
              ].map((item, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${item.ok ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                  <span className={`font-bold text-sm flex-shrink-0 mt-0.5 ${item.ok ? 'text-green-500' : 'text-amber-500'}`}>{item.ok ? '✓' : '⚠'}</span>
                  <div>
                    <p className={`text-sm font-semibold ${item.ok ? 'text-green-800' : 'text-amber-800'}`}>{item.tip}</p>
                    <p className={`text-xs mt-0.5 ${item.ok ? 'text-green-600' : 'text-amber-600'}`}>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => saveSettings()} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : '✓ Save SEO Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── OFF-PAGE SEO ── */}
      {tab === 'offpage' && (
        <div className="space-y-5">
          {/* Social Signals */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">📣 Social Media Signals</h3>
            <p className="text-sm text-gray-400 mb-4">Social presence boosts brand trust and indirectly improves rankings</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { key:'facebookUrl',   icon:'📘', label:'Facebook Page URL',   ph:'https://facebook.com/yourbrand' },
                { key:'instagramUrl',  icon:'📷', label:'Instagram Profile',   ph:'https://instagram.com/yourbrand' },
                { key:'twitterUrl',    icon:'𝕏', label:'Twitter / X Profile',  ph:'https://twitter.com/yourbrand' },
                { key:'youtubeUrl',    icon:'📺', label:'YouTube Channel',     ph:'https://youtube.com/@yourbrand' },
                { key:'linkedinUrl',   icon:'💼', label:'LinkedIn Page',       ph:'https://linkedin.com/company/yourbrand' },
                { key:'pinterestUrl',  icon:'📌', label:'Pinterest Profile',   ph:'https://pinterest.com/yourbrand' },
                { key:'tiktokUrl',     icon:'🎵', label:'TikTok Profile',      ph:'https://tiktok.com/@yourbrand' },
                { key:'whatsappNumber',icon:'💬', label:'WhatsApp Business',   ph:'+94 7X XXX XXXX' },
              ].map(field => (
                <div key={field.key}>
                  <label className="form-label">{field.icon} {field.label}</label>
                  <input value={settings[field.key] || ''} onChange={e => setSettings(p => ({ ...p, [field.key]: e.target.value }))} className="form-input text-sm" placeholder={field.ph}/>
                </div>
              ))}
            </div>
            <div className="mt-5 p-4 border border-blue-100 rounded-xl bg-blue-50">
              <p className="text-sm font-semibold text-blue-800 mb-2">💡 Social SEO Tips</p>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• Share products regularly on all platforms — Google indexes social content</li>
                <li>• Use consistent brand name across all platforms</li>
                <li>• Encourage customers to tag your store in posts</li>
                <li>• Respond to comments and messages promptly</li>
              </ul>
            </div>
          </div>

          {/* Backlinks */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">🔗 Backlink Strategy</h3>
            <p className="text-sm text-gray-400 mb-4">Backlinks from other websites are one of the strongest ranking signals</p>
            <div className="grid sm:grid-cols-2 gap-4 mb-5">
              <div className="border border-gray-100 rounded-xl p-4">
                <div className="text-2xl mb-1">📝</div>
                <p className="font-semibold text-gray-800 text-sm">Blog & Content</p>
                <p className="text-xs text-gray-500 mt-1">Write blog posts about your products. Guest post on related websites. Create buying guides.</p>
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <div className="text-2xl mb-1">🤝</div>
                <p className="font-semibold text-gray-800 text-sm">Business Directories</p>
                <p className="text-xs text-gray-500 mt-1">List on Google Business Profile, Yelp, local directories. These give strong local SEO signals.</p>
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <div className="text-2xl mb-1">🎯</div>
                <p className="font-semibold text-gray-800 text-sm">Influencer Collaborations</p>
                <p className="text-xs text-gray-500 mt-1">Partner with bloggers and influencers. Ask for product reviews with a link to your store.</p>
              </div>
              <div className="border border-gray-100 rounded-xl p-4">
                <div className="text-2xl mb-1">💬</div>
                <p className="font-semibold text-gray-800 text-sm">Forums & Communities</p>
                <p className="text-xs text-gray-500 mt-1">Answer questions on Reddit, Quora. Add your store link where genuinely helpful.</p>
              </div>
            </div>
            <div>
              <label className="form-label">Your Store's Backlink Tracking URL</label>
              <div className="flex gap-2">
                <input value={settings.siteUrl || ''} readOnly className="form-input bg-gray-50 text-sm flex-1"/>
                <CopyBtn text={settings.siteUrl || window.location.origin}/>
              </div>
              <p className="text-xs text-gray-400 mt-1">Share this URL when requesting backlinks from partners</p>
            </div>
          </div>

          {/* Schema Markup */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">📋 Structured Data (Schema)</h3>
            <p className="text-sm text-gray-400 mb-4">Helps Google understand your content for rich search snippets</p>
            <div className="space-y-3">
              {[
                { ok: true,  type: 'Organization',     desc: 'Store name, logo, contact info' },
                { ok: true,  type: 'Product',          desc: 'Name, price, availability, images' },
                { ok: true,  type: 'BreadcrumbList',   desc: 'Navigation breadcrumbs' },
                { ok: false, type: 'Review/Rating',    desc: 'Product star ratings in search results — enable reviews' },
                { ok: false, type: 'LocalBusiness',    desc: 'Physical store location for local search — add address' },
              ].map((s, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${s.ok ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                  <span className={`text-sm font-bold flex-shrink-0 ${s.ok ? 'text-green-500' : 'text-gray-400'}`}>{s.ok ? '✓' : '○'}</span>
                  <div>
                    <p className={`text-sm font-semibold ${s.ok ? 'text-green-800' : 'text-gray-600'}`}>{s.type}</p>
                    <p className={`text-xs ${s.ok ? 'text-green-600' : 'text-gray-400'}`}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => saveSettings()} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : '✓ Save Social Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── TOOLS & ANALYTICS ── */}
      {tab === 'tools' && (
        <div className="space-y-5">
          {/* Google Analytics */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 bg-orange-50">📊</div>
              <div>
                <h3 className="font-bold text-gray-900">Google Analytics 4</h3>
                <p className="text-sm text-gray-400">Track visitors, traffic sources, conversions and more</p>
                {settings.googleAnalytics ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mt-1">✓ Connected</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mt-1">Not configured</span>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <Field label="GA4 Measurement ID" value={settings.googleAnalytics} onChange={e => setSettings(p => ({ ...p, googleAnalytics: e.target.value }))} placeholder="G-XXXXXXXXXX" hint="Found in GA4 → Admin → Data Streams → Measurement ID"/>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Setup Guide</p>
                <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
                  <li>Go to <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">analytics.google.com</a></li>
                  <li>Create a new GA4 property for your store</li>
                  <li>Create a Web data stream with your store URL</li>
                  <li>Copy the Measurement ID (starts with G-)</li>
                  <li>Paste it above and save</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Google Tag Manager */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 bg-blue-50">🏷️</div>
              <div>
                <h3 className="font-bold text-gray-900">Google Tag Manager</h3>
                <p className="text-sm text-gray-400">Manage all tracking scripts from one place — GTM replaces manual script injection</p>
                {settings.googleTagManager ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mt-1">✓ Connected</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mt-1">Not configured</span>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <Field label="GTM Container ID" value={settings.googleTagManager || ''} onChange={e => setSettings(p => ({ ...p, googleTagManager: e.target.value }))} placeholder="GTM-XXXXXXX" hint="Found in Google Tag Manager → Admin → Container Settings"/>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs text-amber-700"><strong>💡 Tip:</strong> If using GTM, you can manage GA4 and Meta Pixel tags inside GTM and leave those fields below empty. GTM handles injection automatically.</p>
              </div>
            </div>
          </div>

          {/* Google Search Console */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 bg-blue-50">🔍</div>
              <div>
                <h3 className="font-bold text-gray-900">Google Search Console</h3>
                <p className="text-sm text-gray-400">Monitor search rankings, click-through rates and index coverage</p>
                {settings.googleSearchConsole ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mt-1">✓ Verification code set</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mt-1">Not configured</span>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">Verification Meta Tag Content</label>
                <input value={settings.googleSearchConsole || ''} onChange={e => setSettings(p => ({ ...p, googleSearchConsole: e.target.value }))} className="form-input font-mono text-sm" placeholder="abc123def456..."/>
                <p className="text-xs text-gray-400 mt-1">Only paste the content value, not the full meta tag</p>
              </div>
              {settings.googleSearchConsole && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <p className="text-xs font-bold text-gray-500 mb-1">Rendered meta tag:</p>
                  <code className="text-xs text-gray-700 font-mono break-all">{`<meta name="google-site-verification" content="${settings.googleSearchConsole}">`}</code>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Setup Guide</p>
                <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
                  <li>Go to <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Google Search Console</a></li>
                  <li>Add your property (URL prefix method)</li>
                  <li>Choose "HTML tag" verification method</li>
                  <li>Copy the content attribute value</li>
                  <li>Paste above and save — then click Verify in GSC</li>
                  <li>Submit your sitemap URL once verified</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Facebook Pixel */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 bg-blue-50">📘</div>
              <div>
                <h3 className="font-bold text-gray-900">Facebook / Meta Pixel</h3>
                <p className="text-sm text-gray-400">Track Facebook ad conversions and build retargeting audiences</p>
                {settings.facebookPixel ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full mt-1">✓ Connected</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mt-1">Not configured</span>
                )}
              </div>
            </div>
            <Field label="Facebook Pixel ID" value={settings.facebookPixel} onChange={e => setSettings(p => ({ ...p, facebookPixel: e.target.value }))} placeholder="123456789012345" hint="Found in Meta Business Suite → Events Manager → Pixel → Settings"/>

            {/* Conversions API */}
            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <h4 className="font-semibold text-blue-900 mb-1 flex items-center gap-2">
                🔗 Conversions API (Server-Side Events)
              </h4>
              <p className="text-xs text-blue-700 mb-3">
                Sends Purchase events from your server to Meta — catches purchases blocked by ad blockers or iOS privacy settings.
                Get your token from: <strong>Meta Events Manager → Data Sources → your Pixel → Settings → Conversions API → Generate access token</strong>.
              </p>
              <div className="space-y-3">
                <Field
                  label="CAPI Access Token"
                  value={settings.capiAccessToken || ''}
                  onChange={e => setSettings(p => ({ ...p, capiAccessToken: e.target.value }))}
                  placeholder="EAAxxxxx... (system user access token)"
                  hint="Generate in Meta Events Manager → your Pixel → Settings → Conversions API"
                  type="password"
                />
                <Field
                  label="Test Event Code (dev only)"
                  value={settings.capiTestEventCode || ''}
                  onChange={e => setSettings(p => ({ ...p, capiTestEventCode: e.target.value }))}
                  placeholder="TEST36398 — leave empty in production"
                  hint="Only set this during testing. Remove it before going live or all events appear as test events."
                />
              </div>
            </div>
          </div>

          {/* Custom Code Injection */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2">💻 Custom Code Injection</h3>
            <p className="text-sm text-gray-400 mb-4">Add tracking scripts, chat widgets, or other integrations</p>
            <div className="space-y-4">
              <div>
                <label className="form-label">Header Code (injected before &lt;/head&gt;)</label>
                <textarea value={settings.customHeaderCode || ''} onChange={e => setSettings(p => ({ ...p, customHeaderCode: e.target.value }))} rows={5} className="form-input resize-none font-mono text-xs" placeholder="<!-- Analytics, heatmaps, chat widgets -->"/>
              </div>
              <div>
                <label className="form-label">Footer Code (injected before &lt;/body&gt;)</label>
                <textarea value={settings.customFooterCode || ''} onChange={e => setSettings(p => ({ ...p, customFooterCode: e.target.value }))} rows={5} className="form-input resize-none font-mono text-xs" placeholder="<!-- Intercom, Crisp, Tawk.to scripts -->"/>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => saveSettings()} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : '✓ Save Analytics Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── SITEMAP & ROBOTS ── */}
      {tab === 'files' && (
        <div className="space-y-5">
          {/* Sitemap */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 flex items-center gap-2">🗺️ Sitemap.xml</h3>
                <p className="text-sm text-gray-400">Tells search engines which pages to index</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={generateSitemap} disabled={generatingSitemap} className="btn-primary text-sm flex items-center gap-2">
                  {generatingSitemap ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating...</> : '🔄 Generate Sitemap'}
                </button>
                {sitemapXml && <button onClick={() => downloadFile(sitemapXml, 'sitemap.xml', 'application/xml')} className="btn-outline text-sm">⬇️ Download</button>}
              </div>
            </div>

            {/* Live sitemap info — served by backend /api/seo/sitemap.xml */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3">
              <p className="text-xs font-bold text-green-700 mb-1">✅ Live Dynamic Sitemap</p>
              <p className="text-xs text-green-600 mb-2">Your sitemap is auto-generated by the backend and served at:</p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono text-xs bg-white border border-green-200 px-2 py-1 rounded text-gray-700 break-all">
                  {settings.siteUrl || 'https://yourstore.com'}/sitemap.xml
                </code>
                <CopyBtn text={`${settings.siteUrl || 'https://yourstore.com'}/sitemap.xml`}/>
              </div>
              <p className="text-xs text-green-600 mt-2">It is generated live from this tenant’s active products and categories.</p>
              {productAudit?.urls?.merchantFeed && <p className="text-xs text-green-700 mt-2 break-all"><strong>Merchant Center feed:</strong> {productAudit.urls.merchantFeed}</p>}
            </div>
            {sitemapXml ? (
              <>
                <p className="text-xs font-bold text-gray-500 mb-1">Preview (static snapshot):</p>
                <textarea value={sitemapXml} readOnly rows={12} className="form-input resize-none font-mono text-xs bg-gray-50"/>
                <button onClick={() => downloadFile(sitemapXml, 'sitemap.xml', 'application/xml')} className="btn-outline text-sm mt-2">⬇️ Download Snapshot</button>
              </>
            ) : (
              <div className="text-center py-6 text-gray-400">
                <div className="text-4xl mb-2">🗺️</div>
                <p className="text-sm">Click "Generate Sitemap" to preview a static snapshot</p>
                <p className="text-xs mt-1">{products.length} products · {categories.length} categories</p>
              </div>
            )}
          </div>

          {/* Robots.txt */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 flex items-center gap-2">🤖 Robots.txt</h3>
                <p className="text-sm text-gray-400">Controls which pages search engine crawlers can access</p>
              </div>
              <div className="flex gap-2">
                <button onClick={saveRobots} className="btn-primary text-sm">💾 Save</button>
                <button onClick={() => downloadFile(robotsTxt, 'robots.txt')} className="btn-outline text-sm">⬇️ Download</button>
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3">
              <p className="text-xs font-bold text-green-700 mb-1">✅ Live Dynamic Robots.txt</p>
              <p className="text-xs text-green-600">Served automatically at <code className="font-mono">{settings.siteUrl || 'https://yourstore.com'}/robots.txt</code> via Vercel rewrite → backend.</p>
            </div>
            <textarea value={robotsTxt} onChange={e => setRobotsTxt(e.target.value)} rows={14} className="form-input resize-none font-mono text-xs"/>
            <p className="text-xs text-blue-600 mt-2 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
              💡 The backend auto-generates robots.txt. The editor above is for preview/reference only.
            </p>
          </div>

          {/* Instructions */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-4">📋 Submission Checklist</h3>
            <div className="space-y-3">
              {[
                { done: true, step: '1', title: 'Sitemap auto-generated', detail: 'Backend generates /sitemap.xml dynamically — no manual upload needed' },
                { done: !!settings.siteUrl, step: '2', title: 'Set your production URL', detail: 'Add your domain in Tools & Analytics → Site URL' },
                { done: !!settings.googleSearchConsole, step: '3', title: 'Verify Google Search Console', detail: 'Add verification code in Tools tab' },
                { done: true, step: '4', title: 'robots.txt auto-served', detail: 'Backend serves /robots.txt via Vercel rewrite — no manual upload needed' },
                { done: false, step: '5', title: 'Submit sitemap in Google Search Console', detail: 'GSC → Sitemaps → Add your sitemap URL' },
                { done: !!settings.googleAnalytics || !!settings.googleTagManager, step: '6', title: 'Connect analytics', detail: 'Add GA4 or GTM ID in Tools & Analytics tab' },
              ].map(item => (
                <div key={item.step} className={`flex items-start gap-3 p-3 rounded-xl border ${item.done ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${item.done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {item.done ? '✓' : item.step}
                  </span>
                  <div>
                    <p className={`text-sm font-semibold ${item.done ? 'text-green-800' : 'text-gray-700'}`}>{item.title}</p>
                    <p className={`text-xs mt-0.5 ${item.done ? 'text-green-600' : 'text-gray-400'}`}>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
