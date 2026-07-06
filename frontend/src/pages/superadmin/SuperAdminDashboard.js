import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

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
      { key: 'aiPostCreator', label: 'AI Post Creator',            icon: '🤖', default: false },
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
  name: '', description: '', price: 0, currency: 'LKR', billingCycle: 'monthly', active: true,
  billing: { monthlyPrice: 0, yearlyPrice: 0, trialDays: 0, graceDays: 3, taxPercent: 0, autoRenew: true, allowMonthly: true, allowYearly: true, invoicePrefix: 'INV' },
  limits: { products: 100, ordersPerMonth: 500, admins: 2, storageMb: 500 },
  features: emptyFeatures,
};

const emptyTenant = {
  storeName: '', slug: '', domain: '', plan: '', billingCycle: 'monthly', couponCode: '', autoRenew: true, adminEmail: '', adminPassword: 'Admin@123456',
  adminFirstName: 'Store', adminLastName: 'Admin',
  settings: { currency: 'LKR', country: 'Sri Lanka', timezone: 'Asia/Colombo', whatsapp: '', phone: '', storeEmail: '', metaTitle: '', metaDescription: '' },
  theme: { primaryColor: '#6366f1', accentColor: '#22d3ee', darkColor: '#0f172a', fontFamily: 'Inter' },
};

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'plans', label: 'Plans', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { key: 'billing', label: 'Billing', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 4v16m8-8a8 8 0 11-16 0 8 8 0 0116 0z' },
  { key: 'tenants', label: 'Tenants', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { key: 'domains', label: 'Domains', icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18 15 15 0 010-18z' },
];

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [stats, setStats] = useState({ tenants: 0, activeTenants: 0, plans: 0, admins: 0 });
  const [plans, setPlans] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [tenantForm, setTenantForm] = useState(emptyTenant);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', text }
  const [loading, setLoading] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingTenant, setSavingTenant] = useState(false);

  const selectedTenant = useMemo(() => tenants.find(t => t._id === selectedTenantId), [tenants, selectedTenantId]);

  function notify(type, text) {
    setToast({ type, text });
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(null), 4000);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [statsRes, plansRes, tenantsRes] = await Promise.all([
        API.get('/superadmin/stats'),
        API.get('/superadmin/plans'),
        API.get('/superadmin/tenants'),
      ]);
      setStats(statsRes.data);
      setPlans(plansRes.data);
      setTenants(tenantsRes.data);
      if (!tenantForm.plan && plansRes.data[0]?._id) setTenantForm(prev => ({ ...prev, plan: plansRes.data[0]._id }));
    } catch (err) {
      notify('error', err.response?.data?.message || err.message || 'Failed to load superadmin data');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, []);

  function updatePlan(path, value) { setPlanForm(prev => setDeep(prev, path, value)); }
  function updateTenant(path, value) { setTenantForm(prev => setDeep(prev, path, value)); }

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
      await API.post('/superadmin/tenants', tenantForm);
      setTenantForm({ ...emptyTenant, plan: plans[0]?._id || '' });
      notify('success', 'Tenant created successfully');
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
      const { data } = await API.post(`/superadmin/tenants/${id}/reset-admin-password`, { password: 'Admin@123456' });
      notify('success', `Password reset for ${data.email}: ${data.password}`);
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not reset password'); }
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
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
            <Link to="/" target="_blank" className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              View storefront
            </Link>
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
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="Total Tenants" value={stats.tenants} icon="M17 20h5v-2a3 3 0 00-5.356-1.857" />
                <Stat label="Active Tenants" value={stats.activeTenants} accent="text-emerald-600" icon="M5 13l4 4L19 7" />
                <Stat label="Plans" value={stats.plans} icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10" />
                <Stat label="Store Admins" value={stats.admins} icon="M16 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Recent Tenants</h2>
                <TenantTable
                  tenants={tenants.slice(0, 5)}
                  plans={plans}
                  onUpdate={updateTenantRecord}
                  onResetPassword={resetAdminPassword}
                />
                {tenants.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No tenants yet — create one from the Tenants tab.</p>}
              </div>
            </div>
          )}

          {activeTab === 'plans' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Create Plan</h2>
                <form onSubmit={savePlan} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Input label="Plan Name" value={planForm.name} onChange={v => updatePlan('name', v)} required />
                  <Input label="Price" type="number" value={planForm.price} onChange={v => updatePlan('price', Number(v))} />
                  <Input label="Currency" value={planForm.currency} onChange={v => updatePlan('currency', v)} />
                  <label className="grid gap-1.5 text-xs font-semibold text-slate-600">Billing Cycle<select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={planForm.billingCycle} onChange={e => updatePlan('billingCycle', e.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="once">One-time</option></select></label>
                  <Input label="Description" value={planForm.description} onChange={v => updatePlan('description', v)} />
                  <Input label="Monthly Price" type="number" value={planForm.billing?.monthlyPrice} onChange={v => updatePlan('billing.monthlyPrice', Number(v))} />
                  <Input label="Yearly Price" type="number" value={planForm.billing?.yearlyPrice} onChange={v => updatePlan('billing.yearlyPrice', Number(v))} />
                  <Input label="Trial Days" type="number" value={planForm.billing?.trialDays} onChange={v => updatePlan('billing.trialDays', Number(v))} />
                  <Input label="Grace Days" type="number" value={planForm.billing?.graceDays} onChange={v => updatePlan('billing.graceDays', Number(v))} />
                  <Input label="Tax %" type="number" value={planForm.billing?.taxPercent} onChange={v => updatePlan('billing.taxPercent', Number(v))} />
                  <Input label="Invoice Prefix" value={planForm.billing?.invoicePrefix} onChange={v => updatePlan('billing.invoicePrefix', v)} />
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


          {activeTab === 'billing' && (
            <BillingPanel tenants={tenants} plans={plans} onRefresh={loadAll} notify={notify} />
          )}

          {activeTab === 'tenants' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Create Tenant / Customer Store</h2>
                <form onSubmit={createTenant} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Input label="Store Name" value={tenantForm.storeName} onChange={v => updateTenant('storeName', v)} required />
                  <Input label="Slug" value={tenantForm.slug} onChange={v => updateTenant('slug', v)} required />
                  <Input label="Customer Domain" placeholder="sport.lk" value={tenantForm.domain} onChange={v => updateTenant('domain', v)} />
                  <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                    Plan
                    <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={tenantForm.plan} onChange={e => updateTenant('plan', e.target.value)}>
                      {plans.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-slate-600">Billing Cycle<select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={tenantForm.billingCycle} onChange={e => updateTenant('billingCycle', e.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="once">One-time</option></select></label>
                  <Input label="Subscription Coupon" value={tenantForm.couponCode} onChange={v => updateTenant('couponCode', v)} />
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 mt-7"><input type="checkbox" checked={!!tenantForm.autoRenew} onChange={e => updateTenant('autoRenew', e.target.checked)} /> Auto renewal</label>
                  <Input label="Admin Email" value={tenantForm.adminEmail} onChange={v => updateTenant('adminEmail', v)} required />
                  <Input label="Admin Password" value={tenantForm.adminPassword} onChange={v => updateTenant('adminPassword', v)} />
                  <Input label="WhatsApp" value={tenantForm.settings.whatsapp} onChange={v => updateTenant('settings.whatsapp', v)} />
                  <Input label="Primary Color" type="color" value={tenantForm.theme.primaryColor} onChange={v => updateTenant('theme.primaryColor', v)} />
                  <div className="sm:col-span-2 lg:col-span-4">
                    <button disabled={savingTenant} className="h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors">
                      {savingTenant ? 'Creating…' : 'Create Tenant'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Tenants</h2>
                <TenantTable tenants={tenants} plans={plans} onUpdate={updateTenantRecord} onResetPassword={resetAdminPassword} />
                {tenants.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No tenants yet.</p>}
              </div>
            </div>
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
                          <span className="font-medium text-slate-800">{d.domain}</span>
                          <span className={d.verified ? 'text-emerald-600' : 'text-amber-600'}>{d.verified ? 'Verified' : 'DNS Pending'}</span>
                          <span className="text-slate-500">{d.active ? 'Active' : 'Disabled'}</span>
                          <button onClick={() => removeDomain(d.domain)} className="justify-self-end h-8 px-3 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold">Remove</button>
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
        </main>
      </div>
    </div>
  );
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
      <div className="grid grid-cols-2 gap-2">
        <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" type="number" value={draft.price} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })} />
        <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={draft.billingCycle || 'monthly'} onChange={e => setDraft({ ...draft, billingCycle: e.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="once">One-time</option></select>
        <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Monthly price" type="number" value={draft.billing?.monthlyPrice || 0} onChange={e => setDraft({ ...draft, billing: { ...(draft.billing || {}), monthlyPrice: Number(e.target.value) } })} />
        <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Yearly price" type="number" value={draft.billing?.yearlyPrice || 0} onChange={e => setDraft({ ...draft, billing: { ...(draft.billing || {}), yearlyPrice: Number(e.target.value) } })} />
        <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Trial days" type="number" value={draft.billing?.trialDays || 0} onChange={e => setDraft({ ...draft, billing: { ...(draft.billing || {}), trialDays: Number(e.target.value) } })} />
        <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Grace days" type="number" value={draft.billing?.graceDays ?? 3} onChange={e => setDraft({ ...draft, billing: { ...(draft.billing || {}), graceDays: Number(e.target.value) } })} />
        <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Tax %" type="number" value={draft.billing?.taxPercent || 0} onChange={e => setDraft({ ...draft, billing: { ...(draft.billing || {}), taxPercent: Number(e.target.value) } })} />
        <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Invoice prefix" value={draft.billing?.invoicePrefix || 'INV'} onChange={e => setDraft({ ...draft, billing: { ...(draft.billing || {}), invoicePrefix: e.target.value } })} />
      </div>
      <FeatureEditor features={draft.features || {}} onChange={(features) => setDraft({ ...draft, features })} />
      <button onClick={handleSave} disabled={saving} className="h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm">
        {saving ? 'Saving…' : 'Save Plan'}
      </button>
    </div>
  );
}

function TenantTable({ tenants, plans, onUpdate, onResetPassword }) {
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
          {tenants.map(t => (
            <tr key={t._id}>
              <td className="py-3 pr-3">
                <div className="font-semibold text-slate-800">{t.storeName}</div>
                <div className="text-xs text-slate-400">{t.slug}</div><div className="text-[11px] text-indigo-500">{t.subscription?.status || 'no subscription'} · {t.subscription?.billingCycle || '-'}</div>
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
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function BillingPanel({ tenants, plans, onRefresh, notify }) {
  const [data, setData] = useState({ invoices: [], payments: [], coupons: [] });
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [invoiceTenantId, setInvoiceTenantId] = useState('');
  const [payment, setPayment] = useState({ tenantId: '', invoiceId: '', amount: 0, method: 'manual', status: 'succeeded', transactionId: '', failureReason: '' });
  const [coupon, setCoupon] = useState({ code: '', name: '', type: 'percentage', value: 10, billingCycles: [], maxRedemptions: 0, active: true });
  const selectedTenant = tenants.find(t => t._id === selectedTenantId) || tenants[0];

  async function loadBilling() {
    try {
      const { data: res } = await API.get('/superadmin/billing/summary');
      setData(res || { invoices: [], payments: [], coupons: [] });
    } catch (err) {
      notify('error', err.response?.data?.message || err.message || 'Could not load billing data');
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadBilling(); }, []);

  async function runMaintenance() {
    try {
      await API.post('/superadmin/billing/maintenance');
      notify('success', 'Billing maintenance completed');
      await Promise.all([loadBilling(), onRefresh()]);
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Maintenance failed'); }
  }

  async function changePlan(e) {
    e.preventDefault();
    if (!selectedTenant?._id) return;
    const fd = new FormData(e.currentTarget);
    try {
      await API.post(`/superadmin/tenants/${selectedTenant._id}/billing/change-plan`, {
        planId: fd.get('planId'),
        billingCycle: fd.get('billingCycle'),
        couponCode: fd.get('couponCode'),
        invoice: fd.get('invoice') === 'on',
      });
      notify('success', 'Tenant subscription updated');
      await Promise.all([loadBilling(), onRefresh()]);
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not change plan'); }
  }

  async function issueInvoice(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tenantId = fd.get('tenantId');
    if (!tenantId) return;
    try {
      await API.post(`/superadmin/tenants/${tenantId}/billing/invoice`, {
        billingCycle: fd.get('billingCycle'),
        couponCode: fd.get('couponCode'),
        dueDays: Number(fd.get('dueDays') || 7),
      });
      notify('success', 'Invoice generated');
      await Promise.all([loadBilling(), onRefresh()]);
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not issue invoice'); }
  }

  async function recordTenantPayment(e) {
    e.preventDefault();
    if (!payment.tenantId) return;
    try {
      await API.post(`/superadmin/tenants/${payment.tenantId}/billing/payment`, payment);
      notify(payment.status === 'failed' ? 'error' : 'success', payment.status === 'failed' ? 'Failed payment recorded' : 'Payment recorded');
      setPayment({ tenantId: '', invoiceId: '', amount: 0, method: 'manual', status: 'succeeded', transactionId: '', failureReason: '' });
      await Promise.all([loadBilling(), onRefresh()]);
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not record payment'); }
  }

  async function suspendTenant(id) {
    try {
      await API.post(`/superadmin/tenants/${id}/billing/suspend`, { reason: 'Suspended by Super Admin' });
      notify('success', 'Tenant suspended');
      await Promise.all([loadBilling(), onRefresh()]);
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not suspend tenant'); }
  }

  async function reactivateTenant(id) {
    try {
      await API.post(`/superadmin/tenants/${id}/billing/reactivate`, { extend: true });
      notify('success', 'Tenant reactivated');
      await Promise.all([loadBilling(), onRefresh()]);
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not reactivate tenant'); }
  }

  async function saveCoupon(e) {
    e.preventDefault();
    try {
      await API.post('/superadmin/billing/coupons', coupon);
      setCoupon({ code: '', name: '', type: 'percentage', value: 10, billingCycles: [], maxRedemptions: 0, active: true });
      notify('success', 'Subscription coupon created');
      await loadBilling();
    } catch (err) { notify('error', err.response?.data?.message || err.message || 'Could not create coupon'); }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Paid Revenue" value={`${data.invoices?.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total || 0), 0).toLocaleString()} LKR`} accent="text-emerald-600" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8v16" />
        <Stat label="Open Invoices" value={data.invoices?.filter(i => ['issued', 'overdue'].includes(i.status)).length || 0} accent="text-amber-600" icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5" />
        <Stat label="Coupons" value={data.coupons?.length || 0} icon="M15 5v2m0 4v2m0 4v2M5 5h14a2 2 0 012 2v3a2 2 0 010 4v3a2 2 0 01-2 2H5" />
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
          <div><p className="text-xs font-semibold text-slate-500">Lifecycle Control</p><p className="text-sm text-slate-500 mt-1">Expire/suspend stores based on plan dates.</p></div>
          <button onClick={runMaintenance} className="h-10 rounded-lg bg-slate-900 text-white text-sm font-semibold">Run Maintenance</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Upgrade / Downgrade Tenant</h2>
          <form onSubmit={changePlan} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={selectedTenantId || tenants[0]?._id || ''} onChange={e => setSelectedTenantId(e.target.value)}>
              {tenants.map(t => <option key={t._id} value={t._id}>{t.storeName}</option>)}
            </select>
            <select name="planId" className="h-10 border border-slate-300 rounded-lg px-3 text-sm" defaultValue={selectedTenant?.plan?._id || ''}>
              {plans.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            <select name="billingCycle" className="h-10 border border-slate-300 rounded-lg px-3 text-sm" defaultValue={selectedTenant?.subscription?.billingCycle || 'monthly'}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="once">One-time</option></select>
            <input name="couponCode" className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Coupon code" />
            <label className="flex items-center gap-2 text-sm text-slate-600"><input name="invoice" type="checkbox" defaultChecked /> Generate invoice</label>
            <button className="h-10 rounded-lg bg-indigo-600 text-white font-semibold text-sm">Apply Change</button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Generate Invoice</h2>
          <form onSubmit={issueInvoice} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select name="tenantId" className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={invoiceTenantId} onChange={e => setInvoiceTenantId(e.target.value)}><option value="">Select tenant</option>{tenants.map(t => <option key={t._id} value={t._id}>{t.storeName}</option>)}</select>
            <select name="billingCycle" className="h-10 border border-slate-300 rounded-lg px-3 text-sm"><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="once">One-time</option></select>
            <input name="couponCode" className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Coupon code" />
            <input name="dueDays" type="number" className="h-10 border border-slate-300 rounded-lg px-3 text-sm" defaultValue={7} />
            <button className="h-10 rounded-lg bg-indigo-600 text-white font-semibold text-sm sm:col-span-2">Generate Invoice</button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Record Payment / Failed Payment</h2>
          <form onSubmit={recordTenantPayment} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={payment.tenantId} onChange={e => setPayment({ ...payment, tenantId: e.target.value })}><option value="">Select tenant</option>{tenants.map(t => <option key={t._id} value={t._id}>{t.storeName}</option>)}</select>
            <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={payment.invoiceId} onChange={e => setPayment({ ...payment, invoiceId: e.target.value })}><option value="">No invoice</option>{data.invoices?.map(i => <option key={i._id} value={i._id}>{i.invoiceNumber} · {i.tenant?.storeName}</option>)}</select>
            <input type="number" className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Amount" value={payment.amount} onChange={e => setPayment({ ...payment, amount: Number(e.target.value) })} />
            <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={payment.status} onChange={e => setPayment({ ...payment, status: e.target.value })}><option value="succeeded">Succeeded</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select>
            <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Method" value={payment.method} onChange={e => setPayment({ ...payment, method: e.target.value })} />
            <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Transaction ID / failure reason" value={payment.status === 'failed' ? payment.failureReason : payment.transactionId} onChange={e => setPayment(payment.status === 'failed' ? { ...payment, failureReason: e.target.value } : { ...payment, transactionId: e.target.value })} />
            <button className="h-10 rounded-lg bg-indigo-600 text-white font-semibold text-sm sm:col-span-2">Record Payment</button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Create Subscription Coupon</h2>
          <form onSubmit={saveCoupon} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Code" value={coupon.code} onChange={e => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} />
            <input className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Name" value={coupon.name} onChange={e => setCoupon({ ...coupon, name: e.target.value })} />
            <select className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={coupon.type} onChange={e => setCoupon({ ...coupon, type: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed</option></select>
            <input type="number" className="h-10 border border-slate-300 rounded-lg px-3 text-sm" value={coupon.value} onChange={e => setCoupon({ ...coupon, value: Number(e.target.value) })} />
            <input type="number" className="h-10 border border-slate-300 rounded-lg px-3 text-sm" placeholder="Max redemptions (0 = unlimited)" value={coupon.maxRedemptions} onChange={e => setCoupon({ ...coupon, maxRedemptions: Number(e.target.value) })} />
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={!!coupon.active} onChange={e => setCoupon({ ...coupon, active: e.target.checked })} /> Active</label>
            <button className="h-10 rounded-lg bg-indigo-600 text-white font-semibold text-sm sm:col-span-2">Create Coupon</button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Tenant Subscription Control</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500 border-b"><th className="py-2 pr-3">Tenant</th><th className="py-2 pr-3">Plan</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Period End</th><th className="py-2 pr-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{tenants.map(t => <tr key={t._id}><td className="py-3 pr-3 font-semibold">{t.storeName}</td><td className="py-3 pr-3">{t.plan?.name}</td><td className="py-3 pr-3"><span className="px-2 py-1 rounded-full bg-slate-100 text-xs">{t.status} / {t.subscription?.status || '-'}</span></td><td className="py-3 pr-3 text-xs text-slate-500">{t.subscription?.currentPeriodEnd ? new Date(t.subscription.currentPeriodEnd).toLocaleDateString() : '-'}</td><td className="py-3 pr-3 flex gap-2"><button onClick={() => suspendTenant(t._id)} className="h-8 px-3 rounded-lg bg-red-50 text-red-600 text-xs font-semibold">Suspend</button><button onClick={() => reactivateTenant(t._id)} className="h-8 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold">Reactivate</button></td></tr>)}</tbody></table></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BillingList title="Latest Invoices" rows={data.invoices || []} kind="invoice" />
        <BillingList title="Latest Payments" rows={data.payments || []} kind="payment" />
      </div>
    </div>
  );
}

function BillingList({ title, rows, kind }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="text-base font-bold text-slate-900 mb-4">{title}</h2>
      <div className="divide-y divide-slate-100">
        {rows.slice(0, 12).map(row => (
          <div key={row._id} className="py-3 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate">{kind === 'invoice' ? row.invoiceNumber : row.tenant?.storeName}</p>
              <p className="text-xs text-slate-500 truncate">{kind === 'invoice' ? row.tenant?.storeName : row.invoice?.invoiceNumber || row.method}</p>
            </div>
            <div className="text-right flex-shrink-0"><p className="font-bold text-slate-900">{Number(row.total || row.amount || 0).toLocaleString()} {row.currency || 'LKR'}</p><p className="text-xs text-slate-500">{row.status}</p></div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No records yet.</p>}
      </div>
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