/**
 * SocialMedia.js  — Admin Social Media Automation Settings + Post Management
 * Path: frontend/src/pages/admin/SocialMedia.js
 *
 * MODIFIED: Added "Post Management" tab for bulk product posting with:
 *   - Filter by brand / category
 *   - Product selection with checkboxes
 *   - Platform selection
 *   - Rate-limiting config (posts per minute + delay between posts)
 *   - Live progress display
 *   - Results summary (posted / failed)
 *   - Posted products marked; unlimited repost support
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

// ─── Platform meta-data ───────────────────────────────────────────────────────
const PLATFORMS = [
  {
    id: 'facebook',
    label: 'Facebook Pages',
    color: '#1877F2',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    fields: [
      { key: 'accountId',   label: 'Page ID',       placeholder: '123456789', hint: 'Your Facebook Page numeric ID' },
      { key: 'accountName', label: 'Page Name',      placeholder: 'My Store Page' },
      { key: 'appId',       label: 'App ID',         placeholder: 'Your Facebook App ID' },
      { key: 'appSecret',   label: 'App Secret',     placeholder: '••••••••', type: 'password', hint: 'Stored encrypted — never shown after save' },
      { key: 'accessToken', label: 'Page Access Token', placeholder: 'EAAxxxxxxx...', type: 'password', hint: 'Long-lived page access token' },
    ],
    guide: 'Create a Facebook App at developers.facebook.com → add Pages API → generate a long-lived Page Access Token.',
  },
  {
    id: 'instagram',
    label: 'Instagram Business',
    color: '#E1306C',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
    fields: [
      { key: 'accountId',    label: 'Instagram Business Account ID', placeholder: '17841400000000000' },
      { key: 'accountName',  label: 'Account Display Name',          placeholder: 'My Store' },
      { key: 'accountHandle',label: '@Handle',                       placeholder: 'mystoreofficial' },
      { key: 'appId',        label: 'Facebook App ID',               placeholder: 'App used for Instagram Graph API' },
      { key: 'appSecret',    label: 'Facebook App Secret',           placeholder: '••••••••', type: 'password' },
      { key: 'accessToken',  label: 'Long-lived Access Token',       placeholder: 'EAAxxxxxxx...', type: 'password', hint: 'Instagram Graph API uses Facebook tokens' },
    ],
    guide: 'Instagram Graph API requires a Facebook App. Connect your Instagram Business account to your Facebook Page → generate a long-lived token.',
  },
  {
    id: 'tiktok',
    label: 'TikTok Business',
    color: '#010101',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.84 4.84 0 0 1-1.01-.07z"/>
      </svg>
    ),
    fields: [
      { key: 'accountId',   label: 'Open ID',         placeholder: 'TikTok open_id' },
      { key: 'accountName', label: 'Display Name',    placeholder: 'My TikTok Account' },
      { key: 'appId',       label: 'Client Key',      placeholder: 'TikTok for Developers client key' },
      { key: 'appSecret',   label: 'Client Secret',   placeholder: '••••••••', type: 'password' },
      { key: 'accessToken', label: 'Access Token',    placeholder: 'act.xxxxxxx...', type: 'password', hint: 'TikTok Content Posting API access token' },
    ],
    guide: 'Register at developers.tiktok.com → create an app → request Content Posting API access → generate an access token.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Business',
    color: '#25D366',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
      </svg>
    ),
    fields: [
      { key: 'accountId',   label: 'Phone Number ID',      placeholder: '123456789012345',
        hint: 'The numeric Phone Number ID from Meta → WhatsApp → API Setup. NOT the phone number itself.' },
      { key: 'accountName', label: 'Business Display Name', placeholder: 'StoreKit Store' },
      { key: 'appId',       label: 'WhatsApp Business Account ID (WABA ID)', placeholder: '215589313241560883',
        hint: 'WhatsApp Business Account ID — shown in Meta → WhatsApp → API Setup' },
      { key: 'accessToken', label: 'System User Access Token', placeholder: 'EAAxxxxxxx...', type: 'password',
        hint: 'Permanent System User token with whatsapp_business_messaging permission (never expires)' },
      { key: 'extraConfig.broadcastList', label: 'Broadcast List (recipients)', placeholder: '+94771234567,+94779876543',
        hint: 'Comma-separated WhatsApp numbers in E.164 format (+country code). These are who receives your posts.' },
      { key: 'extraConfig.templateName', label: 'Message Template Name', placeholder: 'hello_world',
        hint: 'Name of your approved WhatsApp message template. Use hello_world for testing.' },
      { key: 'extraConfig.languageCode', label: 'Template Language Code', placeholder: 'en_US',
        hint: 'Language code for your template (e.g. en_US, si_LK). Must match template language in Meta.' },
    ],
    guide: 'Create a Meta App → add WhatsApp use case → go to API Setup → copy Phone Number ID and WABA ID → create a System User in Business Settings with whatsapp_business_messaging + whatsapp_business_management permissions → generate a permanent token → add recipient numbers to the Broadcast List.',
  },
  {
    id: 'telegram',
    label: 'Telegram Bot / Channel',
    color: '#229ED9',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    ),
    fields: [
      { key: 'accountId',    label: 'Channel / Group Chat ID', placeholder: '-1001234567890 or @mypublicchannel',
        hint: 'Where to post. Private channels & supergroups need the numeric ID with -100 prefix (e.g. -1001234567890). Public channels can use @handle. Get the numeric ID by forwarding a message from the channel to @userinfobot.' },
      { key: 'accountName',  label: 'Channel / Bot Display Name', placeholder: 'My Store Channel' },
      { key: 'accountHandle',label: 'Bot Username (from @BotFather)', placeholder: 'MyStoreBot' },
      { key: 'accessToken',  label: 'Bot Token',                 placeholder: '123456789:ABCdefGHIjklMNO...', type: 'password', hint: 'Get from @BotFather on Telegram → /newbot. The bot must be added as Admin to your channel.' },
    ],
    guide: '1. Create bot via @BotFather → /newbot → copy the Bot Token. 2. Add the bot as Admin to your channel (Manage Channel → Administrators → Add Admin). 3. For the Chat ID: public channels use @handle; for private channels forward any message from your channel to @userinfobot to get the numeric ID (add -100 prefix, e.g. if ID is 1234567890 use -1001234567890).',
  },
];

const PLATFORM_IDS = PLATFORMS.map(p => p.id);

// ─── Shared UI primitives ─────────────────────────────────────────────────────

const F = ({ label, value, onChange, type = 'text', placeholder, hint, col2, disabled }) => (
  <div className={col2 ? 'sm:col-span-2' : ''}>
    <label className="form-label">{label}</label>
    <input
      type={type}
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="new-password"
      className={`form-input ${disabled ? 'bg-gray-50 text-gray-400' : ''}`}
    />
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

const Toggle = ({ label, desc, value, onChange }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
    <div>
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
    </div>
    <div
      onClick={onChange}
      className={`w-12 h-6 rounded-full cursor-pointer relative flex-shrink-0 transition-all ${value ? 'bg-primary' : 'bg-gray-200'}`}
    >
      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${value ? 'left-6' : 'left-0.5'}`} />
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  if (!status) return null;
  const ok = status === 'ok';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {ok ? 'Connected & verified' : 'Test failed'}
    </span>
  );
};

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// ─── Token Health Banner ─────────────────────────────────────────────────────
function TokenHealthBanner({ platform, status, onRefresh, refreshing }) {
  if (!status || !status.connected) return null;

  const expiresAt     = status.tokenExpiresAt ? new Date(status.tokenExpiresAt) : null;
  const msLeft        = expiresAt ? expiresAt.getTime() - Date.now() : null;
  const daysLeft      = msLeft !== null ? Math.ceil(msLeft / 86400000) : null;
  const isExpired     = daysLeft !== null && daysLeft <= 0;
  const isCritical    = daysLeft !== null && daysLeft <= 3 && daysLeft > 0;
  const isWarning     = daysLeft !== null && daysLeft <= 10 && daysLeft > 3;
  const needsReconnect = status.reconnectNeeded;

  if (!needsReconnect && !isExpired && !isCritical && !isWarning) return null;

  if (needsReconnect || isExpired) {
    return (
      <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
        <div className="flex items-start gap-3">
          <span className="text-xl">🔴</span>
          <div className="flex-1">
            <p className="font-semibold text-red-800 text-sm">
              {platform === 'facebook' ? 'Facebook' : 'Instagram'} Token Expired — Reconnect Required
            </p>
            <p className="text-red-700 text-xs mt-1">
              {status.tokenRefreshError
                ? `Auto-refresh failed: ${status.tokenRefreshError}`
                : 'The access token has expired and could not be refreshed automatically.'}
            </p>
            <p className="text-red-600 text-xs mt-1">
              Re-enter your Page Access Token below and click <strong>Connect Account</strong> to restore publishing.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isCritical) {
    return (
      <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-xl">🟠</span>
            <div>
              <p className="font-semibold text-orange-800 text-sm">Token Expiring Very Soon</p>
              <p className="text-orange-700 text-xs mt-1">
                Your {platform} access token expires in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong>.
                Auto-refresh will run before the next publish.
              </p>
              {status.tokenLastRefreshedAt && (
                <p className="text-orange-500 text-xs mt-0.5">
                  Last refreshed: {new Date(status.tokenLastRefreshedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => onRefresh(platform)}
            disabled={refreshing}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {refreshing ? '⏳' : '🔄 Refresh Now'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-xl">🟡</span>
          <div>
            <p className="font-semibold text-amber-800 text-sm">Token Expiring Soon</p>
            <p className="text-amber-700 text-xs mt-1">
              Your {platform} access token expires in <strong>{daysLeft} days</strong> ({expiresAt?.toLocaleDateString()}).
              StoreKit will auto-refresh this token before it expires.
            </p>
          </div>
        </div>
        <button
          onClick={() => onRefresh(platform)}
          disabled={refreshing}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {refreshing ? '⏳' : '🔄 Refresh Now'}
        </button>
      </div>
    </div>
  );
}

function TokenExpiryBadge({ status }) {
  if (!status || !status.tokenExpiresAt) return null;
  const daysLeft = Math.ceil((new Date(status.tokenExpiresAt) - Date.now()) / 86400000);
  if (daysLeft <= 0) return <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Token expired</span>;
  if (daysLeft <= 10) return <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Expires in {daysLeft}d</span>;
  return <span className="text-xs text-gray-400">Token valid · {daysLeft}d left</span>;
}

// ─── Post Management Tab ──────────────────────────────────────────────────────
function PostManagementTab({ connectedPlatforms }) {
  // Filters
  const [brands, setBrands]           = useState([]);
  const [categories, setCategories]   = useState([]);
  const [filterBrand, setFilterBrand] = useState('');
  const [filterCat, setFilterCat]     = useState('');

  // Products
  const [products, setProducts]       = useState([]);
  const [loadingProds, setLoadingProds] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Platform selection
  const [selPlatforms, setSelPlatforms] = useState(new Set());

  // Rate-limit config
  const [postsPerMin, setPostsPerMin] = useState(5);
  const [delayBetweenMs, setDelayMs]  = useState(3000);

  // Bulk post state
  const [running, setRunning]         = useState(false);
  const [progress, setProgress]       = useState(null); // { total, done, success, fail, current }
  const [results, setResults]         = useState(null); // final summary
  const abortRef                      = useRef(false);

  // Track which productIds have been posted (per-session badge)
  const [postedIds, setPostedIds]     = useState(new Set());

  // ── Load brands + categories on mount ──────────────────────────────────────
  useEffect(() => {
    API.get('/products/admin/brands').then(r => setBrands(r.data || [])).catch(() => {});
    API.get('/categories').then(r => setCategories(r.data || [])).catch(() => {});
  }, []);

  // ── Load products whenever filter changes ───────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingProds(true);
      setSelectedIds(new Set());
      try {
        const params = new URLSearchParams({ limit: 200, status: 'active' });
        if (filterBrand) params.set('brand', filterBrand);
        if (filterCat)   params.set('category', filterCat);
        const { data } = await API.get(`/products/admin/all?${params}`);
        setProducts(data.products || []);
      } catch {
        toast.error('Failed to load products');
      } finally {
        setLoadingProds(false);
      }
    };
    load();
  }, [filterBrand, filterCat]);

  const toggleProduct  = (id) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllProds = () => {
    if (selectedIds.size === products.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(products.map(p => p._id)));
  };
  const togglePlatform = (pid) => setSelPlatforms(s => { const n = new Set(s); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });

  // ── Bulk post runner ────────────────────────────────────────────────────────
  const startBulkPost = async () => {
    if (selectedIds.size === 0)   return toast.error('Select at least one product');
    if (selPlatforms.size === 0)  return toast.error('Select at least one platform');

    const productList  = products.filter(p => selectedIds.has(p._id));
    const platformList = [...selPlatforms];
    // Each product × each platform = one post
    const jobs = [];
    for (const product of productList) {
      for (const platform of platformList) {
        jobs.push({ productId: product._id, productName: product.name, platform });
      }
    }

    const minIntervalMs = Math.ceil(60000 / postsPerMin); // ms between posts based on rate limit
    const waitMs        = Math.max(delayBetweenMs, minIntervalMs);

    abortRef.current = false;
    setRunning(true);
    setResults(null);
    setProgress({ total: jobs.length, done: 0, success: 0, fail: 0, current: '' });

    let success = 0, fail = 0;
    const failDetails = [];

    for (let i = 0; i < jobs.length; i++) {
      if (abortRef.current) break;

      const job = jobs[i];
      setProgress(p => ({ ...p, done: i, current: `${job.productName} → ${job.platform}` }));

      try {
        // Use a 120s timeout for bulk-post — Instagram can take 60-90s due to
        // container polling. A timeout does NOT mean the post failed; the backend
        // may have already published successfully before the connection closed.
        await API.post('/social-media/bulk-post', {
          productId: job.productId,
          platform:  job.platform,
        }, { timeout: 120000 });
        success++;
        setPostedIds(s => new Set([...s, job.productId]));
      } catch (err) {
        const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
        if (isTimeout) {
          // Timeout means the request took too long to respond, but the backend
          // may have already posted successfully. Mark as "posted (unconfirmed)".
          success++;
          setPostedIds(s => new Set([...s, job.productId]));
          failDetails.push({
            name: job.productName,
            platform: job.platform,
            error: '⚠️ Timeout — post likely published but confirmation was not received',
            warn: true,
          });
        } else {
          fail++;
          failDetails.push({ name: job.productName, platform: job.platform, error: err.response?.data?.message || err.message });
        }
      }

      // Rate-limit delay (skip after last job)
      if (i < jobs.length - 1 && !abortRef.current) {
        await new Promise(r => setTimeout(r, waitMs));
      }
    }

    setProgress(null);
    setRunning(false);
    setResults({ total: jobs.length, success, fail, failDetails, aborted: abortRef.current });
  };

  const stopBulkPost = () => { abortRef.current = true; };

  const connectedIds = connectedPlatforms || [];

  return (
    <div className="space-y-6">

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Filter Products</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Brand</label>
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className="form-input">
              <option value="">All Brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Category</label>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="form-input">
              <option value="">All Categories</option>
              {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Product list ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <input type="checkbox" className="w-4 h-4 rounded accent-primary cursor-pointer"
              checked={products.length > 0 && selectedIds.size === products.length}
              onChange={toggleAllProds} />
            <span className="text-sm font-semibold text-gray-800">
              Products {loadingProds ? '(loading…)' : `(${products.length})`}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-1 rounded-full">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {loadingProds ? (
          <div className="p-8 text-center text-gray-400 text-sm animate-pulse">Loading products…</div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No active products found for the selected filters.</div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {products.map(p => {
              const isPosted  = postedIds.has(p._id);
              const isChecked = selectedIds.has(p._id);
              return (
                <div
                  key={p._id}
                  onClick={() => toggleProduct(p._id)}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${isChecked ? 'bg-primary/5' : ''}`}
                >
                  <input type="checkbox" className="w-4 h-4 rounded accent-primary flex-shrink-0"
                    checked={isChecked} onChange={() => {}} onClick={e => e.stopPropagation()} />
                  {(p.thumbnail || p.images?.[0]) && (
                    <img src={p.thumbnail || p.images[0]} alt={p.name}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.brand || '—'} · LKR {(p.salePrice || p.price)?.toLocaleString()}</p>
                  </div>
                  {isPosted && (
                    <span className="flex-shrink-0 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                      ✓ Posted
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Platform + Rate-limit config ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Post Settings</h2>

        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select Platforms</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(p => {
              const isConnected = connectedIds.includes(p.id);
              const isSel = selPlatforms.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => isConnected && togglePlatform(p.id)}
                  title={!isConnected ? 'Platform not connected' : ''}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                    ${isSel && isConnected ? 'border-transparent text-white shadow-sm' : 'border-gray-200 text-gray-400 bg-gray-50'}
                    ${!isConnected ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                  style={{ background: isSel && isConnected ? p.color : undefined }}
                >
                  <span className="opacity-90">{p.icon}</span>
                  {p.label.split(' ')[0]}
                  {isSel && isConnected && <span className="opacity-80">✓</span>}
                  {!isConnected && <span className="opacity-60 text-gray-400">(not connected)</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          <div>
            <label className="form-label">Posts per minute (rate limit)</label>
            <input
              type="number" min="1" max="60" value={postsPerMin}
              onChange={e => setPostsPerMin(Math.max(1, Math.min(60, Number(e.target.value))))}
              className="form-input"
            />
            <p className="text-xs text-gray-400 mt-1">Keeps posting under platform API limits. Max 60.</p>
          </div>
          <div>
            <label className="form-label">Minimum delay between posts (ms)</label>
            <input
              type="number" min="500" max="60000" step="500" value={delayBetweenMs}
              onChange={e => setDelayMs(Math.max(500, Number(e.target.value)))}
              className="form-input"
            />
            <p className="text-xs text-gray-400 mt-1">Protects against system overload. Min 500ms.</p>
          </div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      {running && progress && (
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800">Posting in progress…</p>
            <button onClick={stopBulkPost} className="px-3 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              Stop
            </button>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{progress.done} / {progress.total} jobs</span>
            <span className="text-green-600">✓ {progress.success || 0} success</span>
            {progress.fail > 0 && <span className="text-red-500">✗ {progress.fail} failed</span>}
          </div>
          {progress.current && (
            <p className="text-xs text-gray-400 mt-2 truncate">Now posting: {progress.current}</p>
          )}
        </div>
      )}

      {/* ── Results summary ── */}
      {results && !running && (
        <div className={`bg-white rounded-2xl shadow-sm border p-5 ${results.fail === 0 ? 'border-green-100' : 'border-amber-100'}`}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">{results.fail === 0 ? '🎉' : results.success === 0 ? '❌' : '⚠️'}</span>
            <div>
              <p className="font-semibold text-gray-900">
                {results.aborted ? 'Posting stopped early' : 'Bulk post complete'}
              </p>
              <p className="text-sm text-gray-500">
                {results.success} posted successfully · {results.fail} failed · {results.total} total jobs
              </p>
            </div>
          </div>

          {/* Progress bar summary */}
          <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
            <div className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${results.total > 0 ? Math.round((results.success / results.total) * 100) : 0}%` }} />
          </div>
          <div className="flex gap-4 text-xs mb-4">
            <span className="text-green-600 font-medium">✓ {results.success} posted</span>
            {results.fail > 0 && <span className="text-red-500 font-medium">✗ {results.fail} failed</span>}
          </div>

          {results.failDetails?.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs font-medium text-red-600 cursor-pointer">
                Show details ({results.failDetails.length} item{results.failDetails.length !== 1 ? 's' : ''})
              </summary>
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {results.failDetails.map((f, i) => (
                  <div key={i} className={`text-xs rounded-lg px-3 py-2 ${f.warn ? 'bg-amber-50' : 'bg-red-50'}`}>
                    <span className={`font-medium ${f.warn ? 'text-amber-700' : 'text-red-700'}`}>{f.name} → {f.platform}</span>
                    <span className={`ml-2 ${f.warn ? 'text-amber-500' : 'text-red-400'}`}>{f.error}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Action button ── */}
      {!running && (
        <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="text-sm text-gray-500">
            {selectedIds.size > 0 && selPlatforms.size > 0
              ? `${selectedIds.size} product${selectedIds.size !== 1 ? 's' : ''} × ${selPlatforms.size} platform${selPlatforms.size !== 1 ? 's' : ''} = ${selectedIds.size * selPlatforms.size} posts`
              : 'Select products and platforms above to start'}
          </div>
          <button
            onClick={startBulkPost}
            disabled={selectedIds.size === 0 || selPlatforms.size === 0}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🚀 Post Selected
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SocialMediaSettings() {
  // ── Main tab: 'accounts' | 'post-management'
  const [mainTab, setMainTab] = useState('accounts');

  const [loading, setLoading]           = useState(true);
  const [settings, setSettings]         = useState(null);
  const [activePlatform, setActive]     = useState('facebook');
  const [formData, setFormData]         = useState({});
  const [saving, setSaving]             = useState({});
  const [testing, setTesting]           = useState({});

  const [automationSaving, setAutoSav]  = useState(false);
  const [templateSaving, setTplSav]     = useState(false);
  const [templates, setTemplates]       = useState([]);

  const [tokenStatus, setTokenStatus]   = useState({});
  const [refreshing, setRefreshing]     = useState({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await API.get('/social-media');
      setSettings(data);
      const initialTpls = PLATFORM_IDS.map(pid => {
        const existing = (data.templates || []).find(t => t.platform === pid);
        return existing || { platform: pid, template: '', hashtags: [], enabled: true };
      });
      setTemplates(initialTpls);
      const forms = {};
      PLATFORM_IDS.forEach(pid => {
        forms[pid] = {
          accountId:    data[pid]?.accountId    || '',
          accountName:  data[pid]?.accountName  || '',
          accountHandle:data[pid]?.accountHandle|| '',
          appId:        data[pid]?.appId        || '',
          appSecret:    '',
          accessToken:  '',
          accessSecret: '',
          'extraConfig.broadcastList': data[pid]?.extraConfig?.broadcastList || '',
          'extraConfig.templateName':  data[pid]?.extraConfig?.templateName  || 'hello_world',
          'extraConfig.languageCode':  data[pid]?.extraConfig?.languageCode  || 'en_US',
        };
      });
      setFormData(forms);
    } catch (err) {
      toast.error('Failed to load social media settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadTokenStatus = useCallback(async () => {
    const results = {};
    await Promise.allSettled(
      ['facebook', 'instagram'].map(async (pid) => {
        try {
          const { data } = await API.get(`/social-media/platform/${pid}/token-status`);
          results[pid] = data;
        } catch { /* silently ignore */ }
      })
    );
    setTokenStatus(results);
  }, []);

  useEffect(() => { loadTokenStatus(); }, [loadTokenStatus]);

  const handleRefreshToken = async (pid) => {
    setRefreshing(r => ({ ...r, [pid]: true }));
    try {
      await API.post(`/social-media/platform/${pid}/refresh-token`);
      toast.success(`✅ ${pid} token refreshed successfully`);
      await load();
      await loadTokenStatus();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to refresh ${pid} token`);
    } finally {
      setRefreshing(r => ({ ...r, [pid]: false }));
    }
  };

  const handleConnect = async (pid) => {
    setSaving(s => ({ ...s, [pid]: true }));
    try {
      const payload = {};
      const extraConfig = {};
      Object.entries(formData[pid] || {}).forEach(([k, v]) => {
        if (v === '') return;
        if (k.startsWith('extraConfig.')) {
          extraConfig[k.replace('extraConfig.', '')] = v;
        } else {
          payload[k] = v;
        }
      });

      if (pid === 'whatsapp') {
        const tplName = (extraConfig.templateName || '').trim();
        if (tplName && tplName !== 'hello_world' && !/^[a-z0-9_]+$/.test(tplName)) {
          toast.error('Template name can only contain lowercase letters, numbers and underscores (e.g. hello_world, my_product_post).');
          setSaving(s => ({ ...s, [pid]: false }));
          return;
        }
        const langCode = (extraConfig.languageCode || '').trim();
        if (langCode && !/^[a-z]{2}(_[A-Z]{2})?$/.test(langCode)) {
          toast.error('Language code must be in format en_US or en.');
          setSaving(s => ({ ...s, [pid]: false }));
          return;
        }
        const bList = (extraConfig.broadcastList || '').trim();
        if (bList) {
          const nums = bList.split(',').map(n => n.trim()).filter(Boolean);
          const invalid = nums.filter(n => !/^\+\d{7,15}$/.test(n));
          if (invalid.length) {
            toast.error(`Invalid phone numbers: ${invalid.join(', ')} — use E.164 format starting with + (e.g. +94771234567)`);
            setSaving(s => ({ ...s, [pid]: false }));
            return;
          }
        }
      }

      if (Object.keys(extraConfig).length) payload.extraConfig = extraConfig;
      await API.post(`/social-media/platform/${pid}/connect`, payload);
      toast.success('Credentials saved — run Test Connection to verify');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save credentials');
    } finally {
      setSaving(s => ({ ...s, [pid]: false }));
    }
  };

  const handleDisconnect = async (pid) => {
    if (!window.confirm(`Disconnect ${pid}? This will wipe all stored credentials.`)) return;
    setSaving(s => ({ ...s, [pid]: true }));
    try {
      await API.delete(`/social-media/platform/${pid}`);
      toast.success('Account disconnected');
      load();
    } catch (err) {
      toast.error('Failed to disconnect');
    } finally {
      setSaving(s => ({ ...s, [pid]: false }));
    }
  };

  const handleTest = async (pid) => {
    setTesting(t => ({ ...t, [pid]: true }));
    try {
      const { data } = await API.post(`/social-media/platform/${pid}/test`);
      if (data.ok) toast.success(`✓ ${data.message}`);
      else          toast.error(`✗ ${data.message}`);
      load();
    } catch (err) {
      toast.error('Test request failed');
    } finally {
      setTesting(t => ({ ...t, [pid]: false }));
    }
  };

  const handleToggle = async (pid, enabled) => {
    try {
      await API.patch(`/social-media/platform/${pid}/toggle`, { enabled });
      setSettings(s => ({ ...s, [pid]: { ...s[pid], enabled } }));
    } catch {
      toast.error('Failed to toggle platform');
    }
  };

  const handleAutomation = async (field, value) => {
    const next = { ...settings, [field]: value };
    setSettings(next);
    setAutoSav(true);
    try {
      await API.put('/social-media/automation', {
        automationEnabled: next.automationEnabled,
        enabledPlatforms: next.enabledPlatforms,
      });
    } catch {
      toast.error('Failed to update automation settings');
    } finally {
      setAutoSav(false);
    }
  };

  const toggleEnabledPlatform = (pid) => {
    const cur = settings?.enabledPlatforms || [];
    const next = cur.includes(pid) ? cur.filter(p => p !== pid) : [...cur, pid];
    handleAutomation('enabledPlatforms', next);
  };

  const updateTemplate = (pid, field, value) => {
    setTemplates(ts => ts.map(t => t.platform === pid ? { ...t, [field]: value } : t));
  };

  const saveTemplates = async () => {
    setTplSav(true);
    try {
      await API.put('/social-media/templates', { templates });
      toast.success('Templates saved');
    } catch {
      toast.error('Failed to save templates');
    } finally {
      setTplSav(false);
    }
  };

  const setField = (pid, key, val) => {
    setFormData(f => ({ ...f, [pid]: { ...f[pid], [key]: val } }));
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-100 rounded-lg w-48" />
        <div className="h-32 bg-gray-100 rounded-2xl" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  const activeMeta  = PLATFORMS.find(p => p.id === activePlatform);
  const activeData  = settings?.[activePlatform] || {};
  const activeForm  = formData[activePlatform]   || {};
  const activeTpl   = templates.find(t => t.platform === activePlatform) || { template: '', hashtags: [], enabled: true };

  // Connected platforms for Post Management tab
  const connectedPlatformIds = PLATFORM_IDS.filter(pid => settings?.[pid]?.connected && settings?.[pid]?.enabled);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white shadow-lg">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Social Media</h1>
          <p className="text-sm text-gray-500">Connect accounts, configure automation, and bulk-post products</p>
        </div>
      </div>

      {/* ── Main Tab Strip ── */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setMainTab('accounts')}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${mainTab === 'accounts' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Account Settings
        </button>
        <button
          onClick={() => setMainTab('post-management')}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-all flex items-center gap-2 ${mainTab === 'post-management' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Post Management
          {connectedPlatformIds.length > 0 && (
            <span className="bg-primary/10 text-primary text-xs font-semibold px-1.5 py-0.5 rounded-full">{connectedPlatformIds.length}</span>
          )}
        </button>
      </div>

      {/* ── Post Management Tab ── */}
      {mainTab === 'post-management' && (
        <PostManagementTab connectedPlatforms={connectedPlatformIds} />
      )}

      {/* ── Account Settings Tab ── */}
      {mainTab === 'accounts' && (
        <>
          {/* ── Global automation toggle ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Global Automation</h2>
            <Toggle
              label="Enable Social Media Automation"
              desc="When enabled, new products and promotions can be auto-posted to connected platforms"
              value={!!settings?.automationEnabled}
              onChange={() => handleAutomation('automationEnabled', !settings?.automationEnabled)}
            />
            {settings?.automationEnabled && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Platforms enabled for automation</p>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(p => {
                    const on = (settings?.enabledPlatforms || []).includes(p.id);
                    const connected = settings?.[p.id]?.connected;
                    return (
                      <button
                        key={p.id}
                        onClick={() => connected && toggleEnabledPlatform(p.id)}
                        title={!connected ? 'Connect this platform first' : ''}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          on && connected
                            ? 'border-transparent text-white shadow-sm'
                            : 'border-gray-200 text-gray-400 bg-gray-50'
                        } ${!connected ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                        style={{ background: on && connected ? p.color : undefined }}
                      >
                        <span className="opacity-90">{p.icon}</span>
                        {p.label}
                        {on && connected && <span className="opacity-80">✓</span>}
                      </button>
                    );
                  })}
                </div>
                {automationSaving && <p className="text-xs text-gray-400 mt-2">Saving…</p>}
              </div>
            )}
          </div>

          {/* ── Platform tabs + detail ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex overflow-x-auto border-b border-gray-100 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
              {PLATFORMS.map(p => {
                const pd = settings?.[p.id] || {};
                const isActive = activePlatform === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setActive(p.id)}
                    className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                      isActive ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <span style={{ color: isActive ? p.color : undefined }}>{p.icon}</span>
                    <span className="hidden sm:inline">{p.label.split(' ')[0]}</span>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      pd.connected && pd.lastTestStatus === 'ok'    ? 'bg-green-400' :
                      pd.connected && pd.lastTestStatus === 'error' ? 'bg-red-400' :
                      pd.connected                                  ? 'bg-yellow-400' :
                                                                      'bg-gray-200'
                    }`} />
                  </button>
                );
              })}
            </div>

            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: activeMeta.color }}>
                    {activeMeta.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{activeMeta.label}</p>
                    {activeData.connected ? (
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        <span className="text-xs text-green-600 font-medium">Connected</span>
                        {activeData.accountName && (
                          <span className="text-xs text-gray-400">— {activeData.accountName}</span>
                        )}
                        {(activePlatform === 'facebook' || activePlatform === 'instagram') && tokenStatus[activePlatform] && (
                          <TokenExpiryBadge status={tokenStatus[activePlatform]} />
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
                        <span className="text-xs text-gray-400">Not connected</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {activeData.connected && (
                    <>
                      <StatusBadge status={activeData.lastTestStatus} />
                      <Toggle
                        label="Enabled"
                        value={!!activeData.enabled}
                        onChange={() => handleToggle(activePlatform, !activeData.enabled)}
                      />
                    </>
                  )}
                </div>
              </div>

              {!activeData.connected && (
                <div className="mb-5 p-4 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-700">
                  <p className="font-semibold mb-1">📋 Setup Guide</p>
                  <p>{activeMeta.guide}</p>
                </div>
              )}

              {(activePlatform === 'facebook' || activePlatform === 'instagram') && activeData.connected && (
                <TokenHealthBanner
                  platform={activePlatform}
                  status={tokenStatus[activePlatform]}
                  onRefresh={handleRefreshToken}
                  refreshing={!!refreshing[activePlatform]}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                {activeMeta.fields.map(field => (
                  <F
                    key={field.key}
                    label={field.label}
                    type={field.type || 'text'}
                    placeholder={
                      field.type === 'password' && activeData[`has${field.key.charAt(0).toUpperCase() + field.key.slice(1)}`]
                        ? '(unchanged — enter new value to update)'
                        : field.placeholder
                    }
                    value={activeForm[field.key] || ''}
                    onChange={e => setField(activePlatform, field.key, e.target.value)}
                    hint={field.hint}
                  />
                ))}
              </div>

              {activeData.lastTestMessage && (
                <div className={`mb-4 p-3 rounded-xl text-sm ${activeData.lastTestStatus === 'ok' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                  {activeData.lastTestStatus === 'ok' ? '✓ ' : '✗ '}{activeData.lastTestMessage}
                  {activeData.lastTested && (
                    <span className="ml-2 text-xs opacity-60">— tested {new Date(activeData.lastTested).toLocaleString()}</span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => handleConnect(activePlatform)}
                  disabled={saving[activePlatform]}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  {saving[activePlatform] ? <><Spinner /> Saving…</> : (activeData.connected ? '↑ Update Credentials' : '🔗 Connect Account')}
                </button>

                {activeData.connected && (
                  <>
                    <button
                      onClick={() => handleTest(activePlatform)}
                      disabled={testing[activePlatform]}
                      className="px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors flex items-center gap-2"
                    >
                      {testing[activePlatform] ? <><Spinner /> Testing…</> : '⚡ Test Connection'}
                    </button>
                    <button
                      onClick={() => handleDisconnect(activePlatform)}
                      disabled={saving[activePlatform]}
                      className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Post Templates ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Post Templates</h2>
            <p className="text-xs text-gray-400 mb-4">
              Default templates used when auto-posting. Use <code className="bg-gray-100 px-1 rounded">{'{{productName}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{price}}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{{url}}'}</code> as variables.
            </p>

            <div className="flex gap-1.5 flex-wrap mb-4">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActive(p.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${activePlatform === p.id ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  style={{ background: activePlatform === p.id ? p.color : undefined }}
                >
                  {p.label.split(' ')[0]}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <label className="form-label">Post Template for {activeMeta.label}</label>
                <textarea
                  rows={4}
                  value={activeTpl.template}
                  onChange={e => updateTemplate(activePlatform, 'template', e.target.value)}
                  placeholder={`🛍️ Check out {{productName}}!\n\nNow only LKR {{price}} — limited stock!\n\nShop now 👉 {{url}}`}
                  className="form-input resize-none"
                />
              </div>
              <div>
                <label className="form-label">Default Hashtags (comma-separated)</label>
                <input
                  type="text"
                  value={(activeTpl.hashtags || []).join(', ')}
                  onChange={e => updateTemplate(
                    activePlatform,
                    'hashtags',
                    e.target.value.split(',').map(h => h.trim()).filter(Boolean)
                  )}
                  placeholder="#storekit, #sale, #newproduct, #srilanka"
                  className="form-input"
                />
                {activeTpl.hashtags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {activeTpl.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">#{tag.replace(/^#/, '')}</span>
                    ))}
                  </div>
                )}
              </div>
              <Toggle
                label="Enable template for this platform"
                desc="Disable to skip auto-posting for this platform while keeping the template"
                value={!!activeTpl.enabled}
                onChange={() => updateTemplate(activePlatform, 'enabled', !activeTpl.enabled)}
              />
            </div>

            <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400">Templates apply to all future auto-posts</p>
              <button onClick={saveTemplates} disabled={templateSaving} className="btn-primary flex items-center gap-2 text-sm">
                {templateSaving ? <><Spinner /> Saving…</> : '✓ Save Templates'}
              </button>
            </div>
          </div>

          {/* ── Connection status overview ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Connection Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PLATFORMS.map(p => {
                const pd = settings?.[p.id] || {};
                return (
                  <div
                    key={p.id}
                    onClick={() => setActive(p.id)}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 cursor-pointer transition-all"
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: p.color }}>
                      {p.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.label}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          pd.connected && pd.lastTestStatus === 'ok'    ? 'bg-green-400' :
                          pd.connected && pd.lastTestStatus === 'error' ? 'bg-red-400' :
                          pd.connected                                  ? 'bg-yellow-400' :
                                                                          'bg-gray-200'
                        }`} />
                        <span className="text-xs text-gray-400 truncate">
                          {pd.connected
                            ? pd.accountName || (pd.lastTestStatus === 'ok' ? 'Verified' : 'Connected')
                            : 'Not connected'}
                        </span>
                      </div>
                    </div>
                    {pd.connected && pd.enabled && (
                      <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full flex-shrink-0">On</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}