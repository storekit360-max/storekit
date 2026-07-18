import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import SuperAdminBilling from './SuperAdminBilling';

// ── Full feature catalog ─────────────────────────────────────────────────
// Every toggle a tenant's storefront/admin can possibly use, grouped into
// three tiers so super admins can see exactly what a plan unlocks:
//   • Core  — main admin modules (each has its own sidebar section/page)
//   • Sub   — secondary capabilities that extend or sit under a core module
//   • Minor — small, fine-grained operational toggles
const FEATURE_CATALOG = [
  {
    tier: 'core',
    label: 'Core Features',
    desc: 'Main admin modules — each of these is a full page/section in the store admin.',
    items: [
      { key: 'products',      label: 'Products',            icon: '📦', default: true },
      { key: 'orders',        label: 'Orders',               icon: '🧾', default: true },
      { key: 'categories',    label: 'Categories',           icon: '🗂️', default: true },
      { key: 'customers',     label: 'Customers',            icon: '👥', default: true },
      { key: 'coupons',       label: 'Coupons',               icon: '🎟️', default: false },
      { key: 'giftCards',     label: 'Gift Cards',            icon: '🎁', default: false },
      { key: 'banners',       label: 'Banners & Popups',      icon: '🖼️', default: false },
      { key: 'seasonal',      label: 'Seasonal Themes',       icon: '❄️', default: false },
      { key: 'deals',         label: 'Deals & Offers',        icon: '🔥', default: false },
      { key: 'reviews',       label: 'Reviews',                icon: '⭐', default: false },
      { key: 'subscribers',   label: 'Subscribers',            icon: '📬', default: false },
      { key: 'returns',       label: 'Returns & Refunds',      icon: '↩️', default: false },
      { key: 'seo',           label: 'SEO Tools',               icon: '🔍', default: false },
      { key: 'layoutEditor',  label: 'Layout Builder',          icon: '🧩', default: false },
      { key: 'themeBuilder',  label: 'Theme Builder',            icon: '🎨', default: false },
      { key: 'animations',    label: 'Animations',                icon: '✨', default: false },
      { key: 'socialMedia',   label: 'Social Media',              icon: '📱', default: false },
      { key: 'automation',    label: 'Automation Rules',            icon: '⚙️', default: false },
      { key: 'backup',        label: 'Backup Center',                icon: '💾', default: false },
    ],
  },
  {
    tier: 'sub',
    label: 'Sub Features',
    desc: 'Secondary capabilities that extend or depend on a core module above.',
    items: [
      { key: 'analytics',      label: 'Analytics Dashboard',     icon: '📊', default: false },
      { key: 'customDomain',   label: 'Custom Domain',            icon: '🌐', default: true },
      { key: 'metaPixel',      label: 'Meta Pixel Tracking',       icon: '📈', default: false },
      { key: 'wishlist',       label: 'Wishlist',                   icon: '❤️', default: false },
      { key: 'newsletter',     label: 'Newsletter Subscription',     icon: '💌', default: false },
      { key: 'guestCheckout',  label: 'Guest Checkout',                icon: '👤', default: true },
      { key: 'reviewApproval', label: 'Review Approval Workflow',       icon: '✅', default: false },
    ],
  },
  {
    tier: 'minor',
    label: 'Minor Features',
    desc: 'Small, fine-grained operational toggles.',
    items: [
      { key: 'autoConfirmOrders',  label: 'Auto-Confirm Orders',   icon: '✅', default: false },
      { key: 'autoCancelDecision', label: 'Auto Cancel Decision',   icon: '🤖', default: false },
      { key: 'maintenanceMode',    label: 'Maintenance Mode',        icon: '⚠️', default: false },
    ],
  },
];

// Flattened { key: defaultValue } map — used to seed new plan forms and as
// the canonical list of every feature key that exists in the system.
const emptyFeatures = FEATURE_CATALOG.reduce((acc, group) => {
  group.items.forEach(item => { acc[item.key] = item.default; });
  return acc;
}, {});

const emptyPlan = {
  name: '', description: '', price: 0, currency: 'LKR', billingCycle: 'monthly', trialDays: 14, graceDays: 3, active: true,
  limits: { products: 100, ordersPerMonth: 500, admins: 2, storageMb: 500 },
  features: emptyFeatures,
};

const emptyTenant = {
  storeName: '', slug: '', domain: '', plan: '', adminEmail: '', adminPassword: 'Admin@123456',
  adminFirstName: 'Store', adminLastName: 'Admin',
  settings: { currency: 'LKR', country: 'Sri Lanka', timezone: 'Asia/Colombo', whatsapp: '', storePhone: '', phone: '', storeEmail: '', metaTitle: '', metaDescription: '' },
  theme: { primaryColor: '#6366f1', accentColor: '#22d3ee', darkColor: '#0f172a', fontFamily: 'Inter' },
  onboarding: {
    initializeStore: true,
    businessType: 'General retail',
    businessDescription: '',
    itemExamples: '',
    targetCustomers: '',
    brandTone: 'Friendly and trustworthy',
  },
};

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'plans', label: 'Plans', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'tenants', label: 'Tenants', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { key: 'billing', label: 'Billing', icon: 'M3 10h18M7 15h.01M11 15h2M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1z' },
  { key: 'domains', label: 'Domains', icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18 15 15 0 010-18z' },
  { key: 'governance', label: 'Feature Governance', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
];

const money = (value, currency = 'LKR') => `${currency} ${Number(value || 0).toLocaleString()}`;
const compact = value => Number(value || 0).toLocaleString();
const percent = (value, limit) => {
  const l = Number(limit || 0);
  if (!l) return 0;
  return Math.min(100, Math.round((Number(value || 0) / l) * 100));
};
const daysUntil = value => {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
};
const shortDate = value => value ? new Date(value).toLocaleDateString() : '-';

function cleanDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');
}

function storefrontUrl(domain, path = '') {
  const clean = cleanDomain(domain);
  if (!clean) return '';
  const isLocal = clean.startsWith('localhost') || clean.startsWith('127.0.0.1');
  return `${isLocal ? 'http' : 'https'}://${clean}${path}`;
}

function tenantStorefrontUrl(tenant, path = '') {
  const domains = (tenant?.domains || []).filter(d => d?.active !== false && d?.domain);
  const domain =
    domains.find(d => d.type === 'primary') ||
    domains.find(d => !['localhost', '127.0.0.1'].includes(cleanDomain(d.domain))) ||
    domains[0];
  return storefrontUrl(domain?.domain, path);
}

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [stats, setStats] = useState({ tenants: 0, activeTenants: 0, plans: 0, admins: 0 });
  const [plans, setPlans] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [monitoring, setMonitoring] = useState(null);
  const [featureGovernance, setFeatureGovernance] = useState(null);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [tenantForm, setTenantForm] = useState(emptyTenant);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', text }
  const [loading, setLoading] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingTenant, setSavingTenant] = useState(false);
  const [generatingStarterKit, setGeneratingStarterKit] = useState(false);
  const [starterKitPreview, setStarterKitPreview] = useState(null);
  const [starterKitWarnings, setStarterKitWarnings] = useState([]);
  const [lastCreatedStore, setLastCreatedStore] = useState(null);
  const [tenantDeletion, setTenantDeletion] = useState(null);

  const selectedTenant = useMemo(() => tenants.find(t => t._id === selectedTenantId), [tenants, selectedTenantId]);

  function notify(type, text) {
    setToast({ type, text });
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(null), 4000);
  }

  const loadAll = useCallback(async function loadAll() {
    setLoading(true);
    try {
      const [statsRes, plansRes, tenantsRes, monitoringRes, governanceRes] = await Promise.all([
        API.get('/superadmin/stats'),
        API.get('/superadmin/plans'),
        API.get('/superadmin/tenants'),
        API.get('/superadmin/monitoring'),
        API.get('/superadmin/feature-registry'),
      ]);
      setStats(statsRes.data);
      setPlans(plansRes.data);
      setTenants(tenantsRes.data);
      setMonitoring(monitoringRes.data);
      setFeatureGovernance(governanceRes.data);
      if (!tenantForm.plan && plansRes.data[0]?._id) setTenantForm(prev => ({ ...prev, plan: plansRes.data[0]._id }));
    } catch (err) {
      notify('error', err.response?.data?.message || err.message || 'Failed to load superadmin data');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  function updatePlan(path, value) { setPlanForm(prev => setDeep(prev, path, value)); }
  function updateTenant(path, value) {
    setTenantForm(prev => setDeep(prev, path, value));
    if (path === 'storeName' || path.startsWith('onboarding.')) {
      setStarterKitPreview(null);
      setStarterKitWarnings([]);
    }
  }

  function updateStoreName(value) {
    setTenantForm(prev => {
      const makeSlug = text => text.toLowerCase().trim().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const previousAutoSlug = makeSlug(prev.storeName);
      return {
        ...prev,
        storeName: value,
        slug: !prev.slug || prev.slug === previousAutoSlug ? makeSlug(value) : prev.slug,
      };
    });
    setStarterKitPreview(null);
    setStarterKitWarnings([]);
  }

  async function requestStarterKitPreview() {
    if (!tenantForm.storeName.trim()) throw new Error('Enter the store name first');
    const { data } = await API.post('/superadmin/tenant-starter-kit/preview', {
      storeName: tenantForm.storeName,
      ...tenantForm.onboarding,
      currency: tenantForm.settings.currency,
    });
    setStarterKitPreview(data.starterKit);
    setStarterKitWarnings(data.warnings || []);
    setTenantForm(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        metaTitle: data.starterKit.settings?.metaTitle || prev.settings.metaTitle,
        metaDescription: data.starterKit.settings?.metaDescription || prev.settings.metaDescription,
      },
      theme: { ...prev.theme, ...(data.starterKit.theme || {}) },
    }));
    return data.starterKit;
  }

  async function generateStarterKitPreview() {
    setGeneratingStarterKit(true);
    try {
      const kit = await requestStarterKitPreview();
      notify('success', `${kit.source === 'ai' ? 'AI' : 'Smart'} starter kit is ready for review`);
    } catch (err) {
      notify('error', err.response?.data?.message || err.message || 'Could not generate starter store');
    } finally {
      setGeneratingStarterKit(false);
    }
  }

  function updateStarterItem(section, index, key, value) {
    setStarterKitPreview(prev => ({
      ...prev,
      [section]: (prev?.[section] || []).map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  }

  function removeStarterItem(section, index) {
    setStarterKitPreview(prev => ({ ...prev, [section]: (prev?.[section] || []).filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function savePlan(e) {
    e.preventDefault();
    setSavingPlan(true);
    try {
      await API.post('/superadmin/plans', planForm);
      setPlanForm(emptyPlan);
      notify('success', 'Plan created successfully');
      await loadAll();
    } catch (err) {
      notify('error', err.response?.data?.message || err.message || 'Could not save plan');
    } finally {
      setSavingPlan(false);
    }
  }

  async function updateExistingPlan(plan) {
    try {
      await API.put(`/superadmin/plans/${plan._id}`, plan);
      notify('success', 'Plan updated');
      await loadAll();
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not update plan'); }
  }

  async function createTenant(e) {
    e.preventDefault();
    setSavingTenant(true);
    try {
      let starterKit = starterKitPreview;
      const generatedDuringCreate = tenantForm.onboarding.initializeStore && !starterKit;
      if (generatedDuringCreate) starterKit = await requestStarterKitPreview();
      const resolvedTheme = generatedDuringCreate && starterKit?.theme ? {
        ...starterKit.theme,
        ...tenantForm.theme,
        primaryColor: tenantForm.theme.primaryColor === emptyTenant.theme.primaryColor ? starterKit.theme.primaryColor : tenantForm.theme.primaryColor,
        accentColor: tenantForm.theme.accentColor === emptyTenant.theme.accentColor ? starterKit.theme.accentColor : tenantForm.theme.accentColor,
        darkColor: tenantForm.theme.darkColor === emptyTenant.theme.darkColor ? starterKit.theme.darkColor : tenantForm.theme.darkColor,
        fontFamily: tenantForm.theme.fontFamily === emptyTenant.theme.fontFamily ? starterKit.theme.fontFamily : tenantForm.theme.fontFamily,
      } : tenantForm.theme;
      const { data } = await API.post('/superadmin/tenants', { ...tenantForm, theme: resolvedTheme, starterKit });
      setLastCreatedStore({
        name: data.storeName,
        source: data.starterKitResult?.source,
        counts: data.starterKitResult?.created,
        warnings: data.starterKitResult?.warnings || [],
      });
      setTenantForm({ ...emptyTenant, plan: plans[0]?._id || '' });
      setStarterKitPreview(null);
      setStarterKitWarnings([]);
      notify('success', data.starterKitResult ? 'Tenant and starter storefront created successfully' : 'Tenant created successfully');
      await loadAll();
    } catch (err) {
      notify('error', err.response?.data?.message || err.message || 'Could not create tenant');
    } finally {
      setSavingTenant(false);
    }
  }

  async function updateTenantRecord(id, patch) {
    try {
      await API.put(`/superadmin/tenants/${id}`, patch);
      notify('success', 'Tenant updated');
      await loadAll();
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not update tenant'); }
  }

  async function addDomain(e) {
    e.preventDefault();
    if (!selectedTenantId || !domainInput) return;
    try {
      await API.post(`/superadmin/tenants/${selectedTenantId}/domains`, { domain: domainInput, type: 'alias', verified: false });
      setDomainInput('');
      notify('success', 'Domain mapped');
      await loadAll();
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not map domain'); }
  }

  async function removeDomain(domain) {
    try {
      await API.delete(`/superadmin/tenants/${selectedTenantId}/domains/${domain}`);
      notify('success', 'Domain removed');
      await loadAll();
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not remove domain'); }
  }

  async function resetAdminPassword(id) {
    try {
      const { data } = await API.post(`/superadmin/tenants/${id}/reset-admin-password`, {});
      notify('success', `Password reset for ${data.email}: ${data.password}`);
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not reset password'); }
  }

  async function openTenantDeletion(tenant) {
    setTenantDeletion({ tenant, preview: null, confirmationText: '', loading: true, deleting: false });
    try {
      const { data } = await API.get(`/superadmin/tenants/${tenant._id}/deletion-preview`);
      setTenantDeletion(current => current?.tenant?._id === tenant._id
        ? { ...current, preview: data, loading: false }
        : current);
    } catch (err) {
      setTenantDeletion(null);
      notify('error', err.response?.data?.message || err.message || 'Could not verify tenant deletion');
    }
  }

  async function permanentlyDeleteTenant() {
    if (!tenantDeletion?.tenant?._id || !tenantDeletion?.preview) return;
    setTenantDeletion(current => ({ ...current, deleting: true }));
    try {
      const { data } = await API.delete(`/superadmin/tenants/${tenantDeletion.tenant._id}`, {
        data: { confirmationText: tenantDeletion.confirmationText },
      });
      if (selectedTenantId === tenantDeletion.tenant._id) setSelectedTenantId('');
      setTenantDeletion(null);
      notify('success', `${data.message}. ${data.total || 0} tenant-owned records removed.`);
      await loadAll();
    } catch (err) {
      setTenantDeletion(current => current ? { ...current, deleting: false } : current);
      notify('error', err.response?.data?.message || err.message || 'Could not delete tenant');
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {tenantDeletion && (
        <TenantDeletionDialog
          state={tenantDeletion}
          onConfirmationChange={confirmationText => setTenantDeletion(current => ({ ...current, confirmationText }))}
          onClose={() => { if (!tenantDeletion.deleting) setTenantDeletion(null); }}
          onDelete={permanentlyDeleteTenant}
        />
      )}
      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed lg:static z-40 lg:z-auto inset-y-0 left-0 w-64 flex-shrink-0 transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{ background: '#0f172a' }}
      >
        <div className="flex flex-col h-full">
          <div className="flex-shrink-0 p-5 border-b border-white/10">
            <Link to="/" className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18M3 9h18M3 15h18M15 3v18" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white text-base leading-tight truncate">StoreKit</p>
                <p className="text-xs text-indigo-300">Super Admin</p>
              </div>
            </Link>
          </div>

          <div className="px-5 py-4 border-b border-white/10">
            <p className="text-xs text-slate-500">Signed in as</p>
            <p className="text-sm text-white font-medium truncate">{user?.email}</p>
          </div>

          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key ? 'bg-indigo-500/20 text-white border-l-2 border-indigo-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-3 border-t border-white/10">
            <a href={tenantStorefrontUrl(selectedTenant || tenants[0]) || '/'} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              View storefront
            </a>
            <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex-shrink-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-500">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h1 className="text-lg font-bold text-slate-900 capitalize">{TABS.find(t => t.key === activeTab)?.label}</h1>
          </div>
          {loading && <span className="text-xs text-slate-400">Refreshing…</span>}
        </header>

        {/* Toast */}
        {toast && (
          <div className={`mx-4 lg:mx-6 mt-4 px-4 py-3 rounded-xl text-sm font-medium ${
            toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {toast.text}
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {activeTab === 'overview' && (
            <AdvancedOverview
              stats={stats}
              plans={plans}
              tenants={tenants}
              monitoring={monitoring}
              onTab={setActiveTab}
              onUpdate={updateTenantRecord}
              onResetPassword={resetAdminPassword}
              onDelete={openTenantDeletion}
            />
          )}

          {activeTab === 'plans' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Create Plan</h2>
                <form onSubmit={savePlan} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Input label="Plan Name" value={planForm.name} onChange={v => updatePlan('name', v)} required />
                  <Input label="Price" type="number" value={planForm.price} onChange={v => updatePlan('price', Number(v))} />
                  <Input label="Currency" value={planForm.currency} onChange={v => updatePlan('currency', v)} />
                  <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                    Billing Cycle
                    <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={planForm.billingCycle} onChange={e => updatePlan('billingCycle', e.target.value)}>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </label>
                  <Input label="Description" value={planForm.description} onChange={v => updatePlan('description', v)} />
                  <Input label="Trial Days" type="number" value={planForm.trialDays} onChange={v => updatePlan('trialDays', Number(v))} />
                  <Input label="Grace Days" type="number" value={planForm.graceDays} onChange={v => updatePlan('graceDays', Number(v))} />
                  <Input label="Product Limit" type="number" value={planForm.limits.products} onChange={v => updatePlan('limits.products', Number(v))} />
                  <Input label="Orders / Month" type="number" value={planForm.limits.ordersPerMonth} onChange={v => updatePlan('limits.ordersPerMonth', Number(v))} />
                  <Input label="Admins" type="number" value={planForm.limits.admins} onChange={v => updatePlan('limits.admins', Number(v))} />
                  <Input label="Storage MB" type="number" value={planForm.limits.storageMb} onChange={v => updatePlan('limits.storageMb', Number(v))} />
                  <div className="sm:col-span-2 lg:col-span-4">
                    <FeatureEditor features={planForm.features} onChange={(features) => setPlanForm(prev => ({ ...prev, features }))} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <button disabled={savingPlan} className="h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors">
                      {savingPlan ? 'Saving…' : 'Create Plan'}
                    </button>
                  </div>
                </form>
              </div>

              <div>
                <h2 className="text-base font-bold text-slate-900 mb-4">Existing Plans</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plans.map(plan => <PlanCard key={plan._id} plan={plan} onSave={updateExistingPlan} />)}
                  {plans.length === 0 && <p className="text-sm text-slate-400">No plans yet.</p>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tenants' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Create Tenant / Customer Store</h2>
                    <p className="text-sm text-slate-500 mt-1">Create the account and hand over a useful, branded storefront instead of an empty website.</p>
                  </div>
                  <span className="rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-bold">✨ AI-assisted onboarding</span>
                </div>
                {lastCreatedStore && (
                  <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <p className="font-bold">✓ {lastCreatedStore.name} is ready</p>
                    {lastCreatedStore.counts && (
                      <p className="mt-1 text-emerald-700">
                        Created {lastCreatedStore.counts.categories || 0} categories, {lastCreatedStore.counts.products || 0} sample products and {lastCreatedStore.counts.banners || 0} banners using {lastCreatedStore.source === 'ai' ? 'AI-generated' : 'smart starter'} content.
                      </p>
                    )}
                    {(lastCreatedStore.warnings || []).map(warning => <p key={warning} className="mt-1 text-amber-700">⚠ {warning}</p>)}
                  </div>
                )}
                <form onSubmit={createTenant} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <span className="w-7 h-7 rounded-full bg-slate-900 text-white inline-flex items-center justify-center text-xs font-bold">1</span>
                    <p className="text-sm font-bold text-slate-800">Account and store identity</p>
                  </div>
                  <Input label="Store Name" value={tenantForm.storeName} onChange={updateStoreName} required />
                  <Input label="Slug" value={tenantForm.slug} onChange={v => updateTenant('slug', v)} required />
                  <Input label="Customer Domain" placeholder="sport.lk" value={tenantForm.domain} onChange={v => updateTenant('domain', v)} />
                  <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                    Plan
                    <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={tenantForm.plan} onChange={e => updateTenant('plan', e.target.value)}>
                      {plans.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>
                  </label>
                  <Input label="Admin Email" value={tenantForm.adminEmail} onChange={v => updateTenant('adminEmail', v)} required />
                  <Input label="Admin Password" type="password" value={tenantForm.adminPassword} onChange={v => updateTenant('adminPassword', v)} required />
                  <Input label="Public Store Email" type="email" placeholder="support@store.com" value={tenantForm.settings.storeEmail} onChange={v => updateTenant('settings.storeEmail', v)} />
                  <Input label="Public Contact Number" placeholder="+94 77 123 4567" value={tenantForm.settings.storePhone} onChange={v => updateTenant('settings.storePhone', v)} />
                  <Input label="WhatsApp" value={tenantForm.settings.whatsapp} onChange={v => updateTenant('settings.whatsapp', v)} />
                  <Input label="Primary Color" type="color" value={tenantForm.theme.primaryColor} onChange={v => updateTenant('theme.primaryColor', v)} />

                  <div className="sm:col-span-2 lg:col-span-4 mt-2 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-cyan-50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center text-xs font-bold">2</span>
                          <p className="text-sm font-bold text-slate-900">Describe the customer’s business</p>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 ml-9">This brief is used only to prepare this tenant’s starter content. It is not shown on the customer storefront.</p>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-indigo-900 bg-white border border-indigo-200 rounded-lg px-3 py-2">
                        <input
                          type="checkbox"
                          checked={tenantForm.onboarding.initializeStore}
                          onChange={e => updateTenant('onboarding.initializeStore', e.target.checked)}
                          className="accent-indigo-600"
                        />
                        Build starter storefront
                      </label>
                    </div>

                    {tenantForm.onboarding.initializeStore && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Business Type" placeholder="Fashion boutique, electronics, grocery…" value={tenantForm.onboarding.businessType} onChange={v => updateTenant('onboarding.businessType', v)} required />
                        <Input label="Brand Tone" placeholder="Premium, playful, professional…" value={tenantForm.onboarding.brandTone} onChange={v => updateTenant('onboarding.brandTone', v)} />
                        <label className="grid gap-1.5 text-xs font-semibold text-slate-600 md:col-span-2">
                          Short Business Description
                          <textarea
                            rows="3"
                            maxLength="700"
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                            placeholder="What does this business sell, what makes it special, and where does it deliver?"
                            value={tenantForm.onboarding.businessDescription}
                            onChange={e => updateTenant('onboarding.businessDescription', e.target.value)}
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                          Typical Items
                          <textarea
                            rows="3"
                            maxLength="500"
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                            placeholder="T-shirts, handbags, shoes, watches"
                            value={tenantForm.onboarding.itemExamples}
                            onChange={e => updateTenant('onboarding.itemExamples', e.target.value)}
                          />
                          <span className="font-normal text-slate-400">Separate items with commas or new lines.</span>
                        </label>
                        <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                          Target Customers
                          <textarea
                            rows="3"
                            maxLength="180"
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                            placeholder="Young professionals in Sri Lanka looking for affordable style"
                            value={tenantForm.onboarding.targetCustomers}
                            onChange={e => updateTenant('onboarding.targetCustomers', e.target.value)}
                          />
                        </label>
                        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={generateStarterKitPreview}
                            disabled={generatingStarterKit || !tenantForm.storeName.trim()}
                            className="h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                          >
                            {generatingStarterKit ? '✨ Creating starter kit…' : starterKitPreview ? '✨ Regenerate Preview' : '✨ Generate & Preview Starter Store'}
                          </button>
                          <p className="text-xs text-slate-500">Edit the generated content before creation. The required 6 Featured + 6 New Arrival products and one banner per type are preserved.</p>
                        </div>
                        {starterKitWarnings.map(warning => (
                          <div key={warning} className="md:col-span-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">⚠ {warning}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {tenantForm.onboarding.initializeStore && starterKitPreview && (
                    <div className="sm:col-span-2 lg:col-span-4">
                      <StarterKitEditor
                        kit={starterKitPreview}
                        onChange={updateStarterItem}
                        onRemove={removeStarterItem}
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2 lg:col-span-4">
                    <button disabled={savingTenant || generatingStarterKit} className="h-12 px-7 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors shadow-lg shadow-slate-900/10">
                      {savingTenant ? 'Creating account and storefront…' : tenantForm.onboarding.initializeStore ? 'Create Tenant + Starter Store' : 'Create Empty Tenant'}
                    </button>
                    {tenantForm.onboarding.initializeStore && !starterKitPreview && (
                      <p className="text-xs text-slate-500 mt-2">If you do not preview first, the system will automatically generate the starter kit during creation.</p>
                    )}
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Tenants</h2>
                <TenantMonitorGrid rows={monitoring?.tenants || []} onUpdate={updateTenantRecord} onResetPassword={resetAdminPassword} onDelete={openTenantDeletion} />
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Administrative Table</h3>
                  <TenantTable tenants={tenants} plans={plans} onUpdate={updateTenantRecord} onResetPassword={resetAdminPassword} onDelete={openTenantDeletion} getStorefrontUrl={tenantStorefrontUrl} />
                </div>
                {tenants.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No tenants yet.</p>}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <SuperAdminBilling notify={notify} />
          )}

          {activeTab === 'domains' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Domain Mapping</h2>
                <form onSubmit={addDomain} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={selectedTenantId} onChange={e => setSelectedTenantId(e.target.value)}>
                    <option value="">Select tenant</option>
                    {tenants.map(t => <option key={t._id} value={t._id}>{t.storeName}</option>)}
                  </select>
                  <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="example.lk" value={domainInput} onChange={e => setDomainInput(e.target.value)} />
                  <button className="h-10 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm">Map Domain</button>
                </form>

                {selectedTenant ? (
                  <div className="mt-6">
                    <h3 className="text-sm font-bold text-slate-800 mb-3">{selectedTenant.storeName} Domains</h3>
                    <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                      {(selectedTenant.domains || []).map(d => (
                        <div key={d.domain} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-3 items-center px-4 py-3 text-sm">
                          <a href={storefrontUrl(d.domain)} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline truncate">
                            {d.domain}
                          </a>
                          <span className={d.verified ? 'text-emerald-600' : 'text-amber-600'}>{d.verified ? 'Verified' : 'DNS Pending'}</span>
                          <span className="text-slate-500">{d.active ? 'Active' : 'Disabled'}</span>
                          <div className="justify-self-end flex items-center gap-2">
                            <a href={`${storefrontUrl(d.domain)}/sitemap.xml`} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold inline-flex items-center">Test Sitemap</a>
                            <button onClick={() => removeDomain(d.domain)} className="h-8 px-3 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold">Remove</button>
                          </div>
                        </div>
                      ))}
                      {(!selectedTenant.domains || selectedTenant.domains.length === 0) && (
                        <p className="text-sm text-slate-400 px-4 py-6 text-center">No domains mapped yet.</p>
                      )}
                    </div>
                    <div className="mt-4 p-4 bg-slate-50 rounded-xl text-sm text-slate-600 leading-relaxed">
                      <strong className="text-slate-800">DNS instruction for customer:</strong><br />
                      Point apex/root domain to Vercel according to your Vercel project domain settings.<br />
                      Point www subdomain with CNAME to Vercel. Backend stays on Railway and frontend sends tenant domain using X-Tenant-Domain.
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 mt-6">Select a tenant above to view or manage its domains.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'governance' && <FeatureGovernance data={featureGovernance} plans={plans} />}
        </main>
      </div>
    </div>
  );
}

function FeatureGovernance({ data, plans }) {
  if (!data) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">Loading feature governance…</div>;
  return <div className="space-y-6">
    <div className="rounded-2xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 p-6 text-white shadow-xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Release governance</p>
      <h2 className="mt-2 text-2xl font-extrabold">Plan impact control center</h2>
      <p className="mt-2 max-w-3xl text-sm text-slate-300">Every plan-gated capability has one registered key. Review how many plans and active customer stores will receive a feature before changing plan assignments.</p>
      <div className="mt-5 flex flex-wrap gap-3 text-xs"><span className="rounded-full bg-white/10 px-3 py-1.5">{data.catalog?.flatMap(group=>group.items).length || 0} registered features</span><span className="rounded-full bg-white/10 px-3 py-1.5">{plans.length} plans</span><span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-emerald-200">Schema synchronization enforced by tests</span></div>
    </div>
    {(data.catalog || []).map(group => <section key={group.tier} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-bold text-slate-900">{group.label}</h3><p className="text-xs text-slate-500 mt-1">{group.description}</p></div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">{group.items.map(item=>{const impact=data.impact?.[item.key]||{};return <article key={item.key} className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3"><div className="flex gap-2"><span>{item.icon}</span><div><p className="text-sm font-bold text-slate-900">{item.label}</p><code className="text-[11px] text-slate-400">{item.key}</code></div></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.default?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>Default {item.default?'ON':'OFF'}</span></div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center"><div className="rounded-lg bg-slate-50 p-2"><strong className="block text-slate-900">{impact.enabledPlanCount||0}</strong><span className="text-[10px] text-slate-500">Plans</span></div><div className="rounded-lg bg-slate-50 p-2"><strong className="block text-slate-900">{impact.affectedTenantCount||0}</strong><span className="text-[10px] text-slate-500">Stores</span></div><div className="rounded-lg bg-indigo-50 p-2"><strong className="block text-indigo-700">{impact.affectedActiveTenantCount||0}</strong><span className="text-[10px] text-indigo-600">Active</span></div></div>
        <p className="mt-3 text-xs text-slate-500 line-clamp-2">{(impact.plans||[]).map(plan=>plan.name).join(', ') || 'Not enabled on any plan'}</p>
      </article>})}</div>
    </section>)}
  </div>;
}

function Stat({ label, value, icon, accent = 'text-indigo-600' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <svg className={`w-4 h-4 ${accent}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <div className={`text-2xl font-extrabold ${accent}`}>{value}</div>
    </div>
  );
}

function AdvancedOverview({ stats, plans, tenants, monitoring, onTab, onUpdate, onResetPassword, onDelete }) {
  const totals = monitoring?.totals || {};
  const rows = monitoring?.tenants || [];
  const riskRows = rows.filter(t => t.alerts?.suspended || t.alerts?.pastDue || t.alerts?.paymentDueSoon || t.alerts?.hasNoDomain || t.alerts?.domainPending);
  const dueRows = rows
    .filter(t => t.billing?.nextPaymentDate || t.billing?.trialEndsAt)
    .sort((a, b) => new Date(a.billing?.nextPaymentDate || a.billing?.trialEndsAt) - new Date(b.billing?.nextPaymentDate || b.billing?.trialEndsAt))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-indigo-500/30 to-transparent" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-200">Platform Control Center</p>
            <h2 className="mt-2 text-2xl lg:text-3xl font-extrabold">Tenant monitoring and administration</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Monitor store availability, billing health, plan limits, usage, domains, admins, and payment risk from one place.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 min-w-[280px]">
            <HeroMetric label="MRR" value={money(totals.monthlyRevenue)} />
            <HeroMetric label="ARR Estimate" value={money((totals.monthlyRevenue || 0) * 12 + (totals.yearlyRevenue || 0))} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
        <Stat label="Total Tenants" value={stats.tenants || totals.tenants || 0} icon="M17 20h5v-2a3 3 0 00-5.356-1.857" />
        <Stat label="Active Stores" value={stats.activeTenants || totals.active || 0} accent="text-emerald-600" icon="M5 13l4 4L19 7" />
        <Stat label="Suspended" value={totals.suspended || 0} accent="text-red-600" icon="M18.364 18.364A9 9 0 115.636 5.636" />
        <Stat label="Trial / Past Due" value={`${totals.trial || 0}/${totals.pastDue || 0}`} accent="text-amber-600" icon="M12 8v4l3 3" />
        <Stat label="Plans" value={stats.plans || plans.length} icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10" />
        <Stat label="Admins" value={stats.admins || totals.admins || 0} icon="M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <Panel title="Income & Payment Watch" action={<button onClick={() => onTab('billing')} className="text-xs font-bold text-indigo-600">Open billing</button>}>
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Pending payments" value={compact(totals.pendingPaymentCount)} sub={money(totals.pendingPaymentAmount)} tone="amber" />
            <MiniMetric label="Tenant sales this month" value={money(totals.storeRevenueThisMonth)} sub="Across all stores" tone="emerald" />
          </div>
          <div className="mt-4 space-y-2">
            {dueRows.length === 0 ? <EmptyLine text="No upcoming payment dates." /> : dueRows.map(t => <DueLine key={t._id} tenant={t} />)}
          </div>
        </Panel>

        <Panel title="Risk Alerts" action={<span className="text-xs text-slate-400">{riskRows.length} alerts</span>}>
          <div className="space-y-2">
            {riskRows.length === 0 ? <EmptyLine text="No tenant risk alerts right now." /> : riskRows.slice(0, 8).map(t => (
              <button key={t._id} onClick={() => onTab('tenants')} className="w-full text-left rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{t.storeName}</p>
                    <p className="text-xs text-slate-400 truncate">{alertText(t)}</p>
                  </div>
                  <StatusPill status={t.alerts?.suspended ? 'suspended' : t.billing?.subscriptionStatus || t.status} />
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Platform Usage">
          <UsageSummary label="Products" value={totals.products || 0} />
          <UsageSummary label="Orders this month" value={totals.ordersThisMonth || 0} />
          <UsageSummary label="Store revenue total" value={money(totals.storeRevenue || 0)} />
          <UsageSummary label="Mapped domains" value={rows.reduce((sum, t) => sum + (t.domains?.length || 0), 0)} />
        </Panel>
      </div>

      <Panel title="Tenant Health Monitor" action={<button onClick={() => onTab('tenants')} className="text-xs font-bold text-indigo-600">Manage all</button>}>
        <TenantMonitorGrid rows={rows.slice(0, 6)} onUpdate={onUpdate} onResetPassword={onResetPassword} onDelete={onDelete} />
        {tenants.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No tenants yet — create one from the Tenants tab.</p>}
      </Panel>
    </div>
  );
}

function HeroMetric({ label, value }) {
  return (
    <div className="rounded-xl bg-white/10 border border-white/10 p-4">
      <p className="text-xs text-indigo-100">{label}</p>
      <p className="mt-1 text-xl font-extrabold">{value}</p>
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MiniMetric({ label, value, sub, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  };
  return (
    <div className={`rounded-xl p-4 ${tones[tone] || tones.indigo}`}>
      <p className="text-xs font-semibold opacity-75">{label}</p>
      <p className="mt-1 text-lg font-extrabold">{value}</p>
      {sub && <p className="text-xs opacity-70">{sub}</p>}
    </div>
  );
}

function EmptyLine({ text }) {
  return <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">{text}</p>;
}

function DueLine({ tenant }) {
  const date = tenant.billing?.nextPaymentDate || tenant.billing?.trialEndsAt;
  const days = daysUntil(date);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{tenant.storeName}</p>
        <p className="text-xs text-slate-400">{shortDate(date)} {days != null ? `· ${days <= 0 ? 'due now' : `${days} days`}` : ''}</p>
      </div>
      <p className="text-sm font-bold text-slate-900">{money(tenant.billing?.nextPaymentAmount, tenant.plan?.currency || 'LKR')}</p>
    </div>
  );
}

function UsageSummary({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 last:border-0 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-extrabold text-slate-900">{value}</span>
    </div>
  );
}

function StatusPill({ status }) {
  const s = status || 'unknown';
  const cls = {
    active: 'bg-emerald-100 text-emerald-700',
    trial: 'bg-sky-100 text-sky-700',
    past_due: 'bg-amber-100 text-amber-700',
    grace: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-200 text-slate-600',
    pending: 'bg-slate-100 text-slate-600',
  }[s] || 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${cls}`}>{String(s).replace(/_/g, ' ')}</span>;
}

function alertText(t) {
  if (t.alerts?.suspended) return 'Store is unavailable to customers';
  if (t.alerts?.pastDue) return 'Payment is past due or in grace period';
  if (t.alerts?.paymentDueSoon) return 'Payment due within 7 days';
  if (t.alerts?.hasNoDomain) return 'No active customer domain mapped';
  if (t.alerts?.domainPending) return 'One or more domains are DNS pending';
  return 'Needs review';
}

function UsageBar({ label, value, limit }) {
  const p = percent(value, limit);
  const tone = p >= 90 ? 'bg-red-500' : p >= 75 ? 'bg-amber-500' : 'bg-indigo-500';
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-semibold text-slate-500">{label}</span>
        <span className="text-slate-400">{compact(value)}{limit ? ` / ${compact(limit)}` : ''}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${limit ? p : 0}%` }} />
      </div>
    </div>
  );
}

function TenantMonitorGrid({ rows, onUpdate, onResetPassword, onDelete }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-slate-400 py-6 text-center">No monitoring data available yet.</p>;
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map(t => {
        const url = tenantStorefrontUrl(t);
        const nextDate = t.billing?.nextPaymentDate || t.billing?.trialEndsAt || t.billing?.currentPeriodEnd;
        return (
          <div key={t._id} className="rounded-2xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-extrabold text-slate-900 truncate">{t.storeName}</p>
                <p className="text-xs text-slate-400 truncate">{t.owner?.email || t.slug}</p>
              </div>
              <StatusPill status={t.billing?.subscriptionStatus || t.status} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <MiniInfo label="Plan" value={t.plan?.name || '-'} />
              <MiniInfo label="Next pay" value={nextDate ? shortDate(nextDate) : '-'} />
              <MiniInfo label="Amount" value={money(t.billing?.nextPaymentAmount || t.plan?.price || 0, t.plan?.currency || 'LKR')} />
              <MiniInfo label="Domains" value={`${(t.domains || []).filter(d => d.active).length} active`} />
            </div>

            <div className="mt-4 space-y-3">
              <UsageBar label="Products" value={t.usage?.products || 0} limit={t.usage?.productLimit || 0} />
              <UsageBar label="Orders / month" value={t.usage?.ordersThisMonth || 0} limit={t.usage?.ordersPerMonthLimit || 0} />
              <UsageBar label="Admins" value={t.usage?.admins || 0} limit={t.usage?.adminLimit || 0} />
              <UsageBar label="Storage MB" value={t.usage?.storageMb || 0} limit={t.usage?.storageLimitMb || 0} />
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500 mb-2">Alerts</p>
              <div className="flex flex-wrap gap-1.5">
                {t.alerts?.suspended && <AlertChip tone="red" text="Unavailable" />}
                {t.alerts?.pastDue && <AlertChip tone="amber" text="Past due" />}
                {t.alerts?.paymentDueSoon && <AlertChip tone="amber" text="Due soon" />}
                {t.alerts?.hasNoDomain && <AlertChip tone="slate" text="No domain" />}
                {t.alerts?.domainPending && <AlertChip tone="sky" text="DNS pending" />}
                {!alertText(t).includes('Needs') ? null : <span className="text-xs text-slate-400">No alerts</span>}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {url && <a href={url} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold inline-flex items-center">Open</a>}
              <button onClick={() => onResetPassword(t._id)} className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-bold">Reset Admin</button>
              <button
                onClick={() => onUpdate(t._id, { status: t.status === 'active' ? 'suspended' : 'active' })}
                className={`h-8 px-3 rounded-lg text-xs font-bold ${t.status === 'active' ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
              >
                {t.status === 'active' ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => onDelete(t)}
                className="h-8 px-3 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 text-xs font-bold"
              >
                Delete Tenant
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">{label}</p>
      <p className="mt-0.5 font-bold text-slate-800 truncate">{value}</p>
    </div>
  );
}

function AlertChip({ tone, text }) {
  const cls = {
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    sky: 'bg-sky-100 text-sky-700',
    slate: 'bg-slate-200 text-slate-600',
  }[tone] || 'bg-slate-100 text-slate-600';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{text}</span>;
}

function StarterKitEditor({ kit, onChange, onRemove }) {
  const categories = kit?.categories || [];
  const products = kit?.products || [];
  const banners = kit?.banners || [];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-white/15 inline-flex items-center justify-center text-xs font-bold">3</span>
            <p className="font-bold">Review the starter storefront</p>
          </div>
          <p className="text-xs text-slate-300 mt-1 ml-9">{kit.summary}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${kit.source === 'ai' ? 'bg-violet-400/20 text-violet-200' : 'bg-amber-400/20 text-amber-200'}`}>
          {kit.source === 'ai' ? '✨ AI generated' : '⚡ Smart fallback'}
        </span>
      </div>

      <div className="p-5 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">Categories</h3>
            <span className="text-xs font-bold text-slate-400">{categories.length}</span>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {categories.map((category, index) => (
              <div key={`${category.slug}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                <input
                  className="min-w-0 flex-1 h-9 rounded-md border border-slate-200 px-2 text-xs font-semibold"
                  value={category.name}
                  aria-label={`Category ${index + 1} name`}
                  onChange={e => onChange('categories', index, 'name', e.target.value)}
                />
                <button type="button" onClick={() => onRemove('categories', index)} className="w-8 h-8 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${category.name}`}>×</button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">Editable sample products</h3>
            <span className="text-xs font-bold text-slate-400">{products.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
            {products.map((product, index) => (
              <div key={`${product.sku}-${index}`} className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                <span className={`inline-flex mb-2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${index < 6 ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                  {index < 6 ? 'Featured product' : 'New arrival'}
                </span>
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 h-9 rounded-md border border-slate-200 px-2 text-xs font-semibold"
                    value={product.name}
                    aria-label={`Product ${index + 1} name`}
                    onChange={e => onChange('products', index, 'name', e.target.value)}
                  />
                  <span className="w-8 h-8 rounded-md text-slate-300 inline-flex items-center justify-center" title="Six products are required in each starter collection">🔒</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <label className="text-[10px] font-bold text-slate-500">Price
                    <input type="number" min="1" className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2 text-xs" value={product.price} onChange={e => onChange('products', index, 'price', Number(e.target.value))} />
                  </label>
                  <label className="text-[10px] font-bold text-slate-500">Stock
                    <input type="number" min="0" className="mt-1 w-full h-8 rounded-md border border-slate-200 px-2 text-xs" value={product.stock} onChange={e => onChange('products', index, 'stock', Number(e.target.value))} />
                  </label>
                  <label className="text-[10px] font-bold text-slate-500">Category
                    <select className="mt-1 w-full h-8 rounded-md border border-slate-200 px-1 text-[11px]" value={product.categorySlug} onChange={e => onChange('products', index, 'categorySlug', e.target.value)}>
                      {categories.map(category => <option key={category.slug} value={category.slug}>{category.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">Banners and announcement</h3>
            <span className="text-xs font-bold text-slate-400">{banners.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {banners.map((banner, index) => {
              const textKey = banner.position === 'running_top' ? 'runningText' : 'title';
              return (
                <div key={`${banner.position}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                  <span className="rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-black uppercase text-slate-500">{banner.position.replace('_', ' ')}</span>
                  <input className="min-w-0 flex-1 h-9 rounded-md border border-slate-200 px-2 text-xs font-semibold" value={banner[textKey] || ''} onChange={e => onChange('banners', index, textKey, e.target.value)} />
                  <span className="w-8 h-8 rounded-md text-slate-300 inline-flex items-center justify-center" title="One starter banner is required for each banner type">🔒</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-800 mb-3">Brand direction</h3>
          <div className="flex items-center gap-3">
            {[kit.theme?.primaryColor, kit.theme?.accentColor, kit.theme?.darkColor].map((color, index) => (
              <div key={`${color}-${index}`} className="w-10 h-10 rounded-xl border-2 border-white shadow ring-1 ring-slate-200" style={{ backgroundColor: color }} title={color} />
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">Template: <strong className="text-slate-700">{kit.theme?.storeTemplate || 'classic'}</strong></p>
          <p className="text-xs text-slate-500 mt-1">SEO title: <strong className="text-slate-700">{kit.settings?.metaTitle}</strong></p>
          <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">Initially hidden: <strong className="text-slate-700">Categories, brands and newsletter</strong>. The tenant admin can enable them from Layout Builder.</p>
        </section>
      </div>
      <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">
        Sample products use a professional placeholder image. The tenant admin should replace sample names, prices, stock and images with real catalogue data before advertising the store.
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder = '', required = false }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
      {label}{required ? <span className="text-red-500"> *</span> : null}
      <input
        className="h-10 border border-slate-300 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
        type={type}
        placeholder={placeholder}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        required={required}
      />
    </label>
  );
}

const TIER_STYLE = {
  core:  { chip: 'bg-indigo-100 text-indigo-700',  bar: 'bg-indigo-500' },
  sub:   { chip: 'bg-sky-100 text-sky-700',        bar: 'bg-sky-500' },
  minor: { chip: 'bg-amber-100 text-amber-700',    bar: 'bg-amber-500' },
};

function FeatureEditor({ features, onChange }) {
  const safeFeatures = features || {};

  function toggle(key) {
    onChange({ ...safeFeatures, [key]: !safeFeatures[key] });
  }

  function setGroup(items, value) {
    const patch = {};
    items.forEach(item => { patch[item.key] = value; });
    onChange({ ...safeFeatures, ...patch });
  }

  return (
    <div className="space-y-4">
      {FEATURE_CATALOG.map(group => {
        const enabledCount = group.items.filter(item => !!safeFeatures[item.key]).length;
        const style = TIER_STYLE[group.tier];
        return (
          <div key={group.tier} className="border border-slate-200 rounded-xl overflow-hidden">
            <div className={`h-1 ${style.bar}`} />
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${style.chip}`}>
                    {group.label}
                  </span>
                  <span className="text-xs text-slate-400">{enabledCount}/{group.items.length} enabled</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{group.desc}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setGroup(group.items, true)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50"
                >
                  Enable all
                </button>
                <button
                  type="button"
                  onClick={() => setGroup(group.items, false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100"
                >
                  Disable all
                </button>
              </div>
            </div>
            <div
              className="grid gap-x-3 gap-y-2 p-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}
            >
              {group.items.map(item => {
                const checked = !!safeFeatures[item.key];
                return (
                  <label
                    key={item.key}
                    className={`flex items-center gap-2 text-xs font-medium rounded-lg px-2.5 py-2 border cursor-pointer transition-colors min-w-0 ${
                      checked ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-indigo-600 flex-shrink-0"
                      checked={checked}
                      onChange={() => toggle(item.key)}
                    />
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="truncate" title={item.key}>{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlanCard({ plan, onSave }) {
  const [draft, setDraft] = useState(plan);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(plan), [plan]);

  async function handleSave() {
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); }
  }

  return (
    <div className="border border-slate-200 rounded-2xl p-4 grid gap-3">
      <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm font-semibold" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
      <textarea className="min-h-[64px] border border-slate-300 rounded-lg p-3 text-sm" value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Price<input className="h-9 border rounded-lg px-2" type="number" value={draft.price ?? 0} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })} /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Currency<input className="h-9 border rounded-lg px-2" value={draft.currency || 'LKR'} onChange={e => setDraft({ ...draft, currency: e.target.value })} /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Cycle
          <select className="h-9 border rounded-lg px-2" value={draft.billingCycle || 'monthly'} onChange={e => setDraft({ ...draft, billingCycle: e.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Trial Days<input className="h-9 border rounded-lg px-2" type="number" value={draft.trialDays ?? 0} onChange={e => setDraft({ ...draft, trialDays: Number(e.target.value) })} /></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Grace Days<input className="h-9 border rounded-lg px-2" type="number" value={draft.graceDays ?? 3} onChange={e => setDraft({ ...draft, graceDays: Number(e.target.value) })} /></label>
        {['products', 'ordersPerMonth', 'admins', 'storageMb'].map(key => (
          <label key={key} className="grid gap-1 text-xs font-semibold text-slate-600">
            {key}
            <input className="h-9 border rounded-lg px-2" type="number" value={draft.limits?.[key] ?? 0} onChange={e => setDraft({ ...draft, limits: { ...(draft.limits || {}), [key]: Number(e.target.value) } })} />
          </label>
        ))}
      </div>
      <FeatureEditor features={draft.features || {}} onChange={(features) => setDraft({ ...draft, features })} />
      <button onClick={handleSave} disabled={saving} className="h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm">
        {saving ? 'Saving…' : 'Save Plan'}
      </button>
    </div>
  );
}

function TenantDeletionDialog({ state, onConfirmationChange, onClose, onDelete }) {
  const expected = state.preview?.confirmationText || `DELETE ${state.tenant?.slug || ''}`;
  const counts = state.preview?.counts || {};
  const verified = state.confirmationText.trim() === expected;
  const importantCounts = [
    ['Products', counts.products],
    ['Orders', counts.orders],
    ['Users', counts.users],
    ['Categories', counts.categories],
    ['Payments', (counts.tenantPayments || 0) + (counts.subscriptionPayments || 0)],
    ['Marketing events', counts.behaviorEvents],
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="delete-tenant-title">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-red-200 overflow-hidden">
        <div className="px-6 py-5 bg-red-50 border-b border-red-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0 font-black">!</div>
            <div>
              <h2 id="delete-tenant-title" className="text-lg font-extrabold text-red-900">Permanently delete tenant</h2>
              <p className="mt-1 text-sm text-red-700">This action cannot be undone and will remove the storefront, customer accounts, orders, products, settings and integrations belonging to this tenant.</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-bold text-slate-900">{state.tenant?.storeName}</p>
            <p className="text-xs text-slate-500 mt-0.5">Tenant slug: {state.tenant?.slug}</p>
          </div>

          {state.loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Verifying tenant-owned data…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
                {importantCounts.map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-[11px] font-semibold text-slate-500">{label}</p>
                    <p className="text-lg font-extrabold text-slate-900">{value || 0}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">Verified scope: {state.preview?.total || 0} tenant-owned database records. Global plans, platform settings and Super Admin accounts are not included.</p>

              <label className="grid gap-2 mt-5 text-sm font-semibold text-slate-700">
                Type <code className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 select-all">{expected}</code> to verify
                <input
                  autoFocus
                  value={state.confirmationText}
                  onChange={event => onConfirmationChange(event.target.value)}
                  disabled={state.deleting}
                  autoComplete="off"
                  spellCheck="false"
                  className="h-11 rounded-lg border border-slate-300 px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 disabled:bg-slate-100"
                  placeholder={expected}
                />
              </label>
            </>
          )}

          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={onClose} disabled={state.deleting} className="h-10 px-4 rounded-lg border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={onDelete} disabled={state.loading || state.deleting || !verified} className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {state.deleting ? 'Deleting tenant data…' : 'Verify & Permanently Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TenantTable({ tenants, plans, onUpdate, onResetPassword, onDelete, getStorefrontUrl }) {
  if (!tenants || tenants.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-3">Store</th>
            <th className="py-2 pr-3">Plan</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Domains</th>
            <th className="py-2 pr-3">Admin</th>
            <th className="py-2 pr-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tenants.map(t => {
            const url = getStorefrontUrl ? getStorefrontUrl(t) : '';
            return (
            <tr key={t._id}>
              <td className="py-3 pr-3">
                <div className="font-semibold text-slate-800">{t.storeName}</div>
                <div className="text-xs text-slate-400">{t.slug}</div>
              </td>
              <td className="py-3 pr-3 text-slate-600">{t.plan?.name || '-'}</td>
              <td className="py-3 pr-3">
                <select
                  className="h-8 border border-slate-300 rounded-lg px-2 text-xs"
                  value={t.status}
                  onChange={e => onUpdate(t._id, { status: e.target.value })}
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="pending">pending</option>
                </select>
              </td>
              <td className="py-3 pr-3 text-slate-600 text-xs max-w-[160px] truncate">{t.domains?.map(d => d.domain).join(', ') || '-'}</td>
              <td className="py-3 pr-3 text-slate-600">{t.owner?.email || '-'}</td>
              <td className="py-3 pr-3">
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 border border-slate-300 rounded-lg px-2 text-xs"
                    value={t.plan?._id || ''}
                    onChange={e => onUpdate(t._id, { plan: e.target.value })}
                  >
                    {plans.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                  <button onClick={() => onResetPassword(t._id)} className="h-8 px-2.5 rounded-lg bg-slate-800 text-white text-xs font-semibold whitespace-nowrap">
                    Reset Password
                  </button>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="h-8 px-2.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold whitespace-nowrap inline-flex items-center">
                      Open Store
                    </a>
                  ) : null}
                  <button onClick={() => onDelete(t)} className="h-8 px-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold whitespace-nowrap">
                    Delete Tenant
                  </button>
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function setDeep(obj, path, value) {
  const clone = JSON.parse(JSON.stringify(obj));
  const parts = path.split('.');
  let current = clone;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
  return clone;
}
