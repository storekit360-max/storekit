import React, { useEffect, useState } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';
import { THEMES, FONTS, applyTheme } from '../../context/ThemeContext';
import { Link } from 'react-router-dom';
import ImageUpload from '../../components/ImageUpload';

const TABS = [
  { id:'general', label:'🏪 Store', group:'store' },
  { id:'business', label:'🏢 Business', group:'store' },
  { id:'delivery', label:'🚚 Delivery', group:'ops' },
  { id:'announcement', label:'📢 Announcement', group:'ops' },
  { id:'whatsapp', label:'💬 WhatsApp', group:'ops' },
  { id:'payment', label:'💳 Payment', group:'ops' },
  { id:'gateways', label:'🔌 Gateways', group:'ops' },
  { id:'appearance', label:'🎨 Theme', group:'design' },
  { id:'fonts', label:'🔤 Fonts', group:'design' },
  { id:'pages', label:'📄 Pages', group:'design' },
  { id:'banners_link', label:'🖼️ Banners & Popups', group:'design' },
  { id:'content', label:'✏️ Content', group:'design' },
  { id:'seo', label:'🔍 SEO', group:'marketing' },
  { id:'discounts', label:'🏷️ Discounts', group:'marketing' },
  { id:'features', label:'⚙️ Features', group:'advanced' },
  { id:'advanced', label:'🔧 Advanced', group:'advanced' },
  { id:'admins', label:'👑 Admins', group:'advanced' },
  { id:'emails', label:'📧 Email Notifications', group:'advanced' },
];

const GROUPS = [
  { id:'store', label:'Store' },
  { id:'ops', label:'Operations' },
  { id:'design', label:'Design' },
  { id:'marketing', label:'Marketing' },
  { id:'advanced', label:'Advanced' },
];

const GATEWAY_PRESETS = {
  payhere: { name: 'PayHere', logo: '💳', color: '#0066cc', fields: [{ key:'merchantId', label:'Merchant ID', type:'text' }, { key:'merchantSecret', label:'Merchant Secret', type:'password' }, { key:'appId', label:'App ID (optional)', type:'text' }, { key:'appSecret', label:'App Secret (optional)', type:'password' }] },
  stripe: { name: 'Stripe', logo: '💜', color: '#635bff', fields: [{ key:'publicKey', label:'Publishable Key', type:'text', hint:'pk_test_... or pk_live_...' }, { key:'secretKey', label:'Secret Key', type:'password', hint:'sk_test_... or sk_live_...' }, { key:'webhookSecret', label:'Webhook Secret', type:'password' }] },
  paypal: { name: 'PayPal', logo: '🅿️', color: '#003087', fields: [{ key:'clientId', label:'Client ID', type:'text' }, { key:'clientSecret', label:'Client Secret', type:'password' }] },
};


// ─── Shared field components defined OUTSIDE AdminSettings ───────────────────
// IMPORTANT: These MUST be module-level constants, NOT defined inside the
// parent component. Defining components inside a render function causes React
// to treat them as new component types on every render, which unmounts and
// remounts the input on every keystroke — losing keyboard focus and mouse
// pointer position. Keeping them here fixes both the focus-loss bug on the
// Order Notification Email field and any similar inputs.

const F = ({ label, value, onChange, type='text', placeholder, hint, col2, disabled }) => (
  <div className={col2 ? 'sm:col-span-2' : ''}>
    <label className="form-label">{label}</label>
    <input
      type={type}
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
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

const withoutClientSecrets = (settings = {}) => {
  const { resendApiKey, ...safeSettings } = settings;
  return safeSettings;
};

// SaveBar receives onSave + saving as props so it does not need to close over
// the parent's state (which would force it back inside the component).
const SaveBar = ({ onSave, saving }) => (
  <div className="mt-8 pt-5 border-t border-gray-100 flex items-center justify-between">
    <p className="text-xs text-gray-400">Changes preview live · Save to apply permanently</p>
    <button onClick={onSave} disabled={saving} className="btn-primary flex items-center gap-2">
      {saving ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Saving...
        </>
      ) : '✓ Save & Apply'}
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const [tab, setTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    storeName:'', storeTagline:'', storeEmail:'', storePhone:'', storeAddress:'',
    emailFromName:'', emailFromAddress:'', emailReplyTo:'', resendApiKey:'', resendApiKeyConfigured:false,
    currency:'LKR', currencySymbol:'Rs.',
    standardDelivery:600, freeDeliveryThreshold:5000,
    codEnabled:true, bankTransferEnabled:true,
    bankName:'', bankAccountName:'', bankAccountNumber:'', bankBranch:'',
    theme:'default', primaryColor:'', secondaryColor:'', darkBgColor:'', darkMode:false,
    fontStyle:'default', logoUrl:'', faviconUrl:'', logoSize:48, customCSS:'',
    metaTitle:'', metaDescription:'', googleAnalytics:'', facebookPixel:'',
    lowStockAlert:5, orderNotificationEmail:'', cancelWindowMinutes:60, autoConfirmOrders:false,
    autoDecisionEnabled:false, autoDecisionMinutes:60, autoDecisionAction:'approve',
    reviewsRequireApproval:true, allowGuestCheckout:true, maintenanceMode:false,
    facebookUrl:'', instagramUrl:'', twitterUrl:'', whatsappNumber:'', youtubeUrl:'', linkedinUrl:'',
    businessType:'ecommerce', enableNewsletter:true, enableWishlist:true,
    enableReviews:true, enableGiftCards:true, enableReturns:true, maxReturnDays:7,
    taxEnabled:false, taxRate:0, taxLabel:'VAT',
    emailNotif_order_placed_customer:true, emailNotif_order_placed_admin:true,
    emailNotif_slip_uploaded_admin:true, emailNotif_slip_received_customer:true,
    emailNotif_payment_confirmed_customer:true, emailNotif_payment_confirmed_admin:true,
    emailNotif_order_status_customer:true, emailNotif_order_status_admin:true,
    emailNotif_order_delivered_customer:true,
    emailNotif_cancel_request_admin:true, emailNotif_cancel_request_customer:true,
    emailNotif_cancel_approved_customer:true, emailNotif_cancel_approved_admin:true,
    emailNotif_cancel_rejected_customer:true, emailNotif_cancel_rejected_admin:true,
    emailNotif_return_request_customer:true, emailNotif_return_request_admin:true,
    emailNotif_return_approved_customer:true, emailNotif_return_rejected_customer:true,
    emailNotif_return_received_customer:true, emailNotif_return_refunded_customer:true,
    emailNotif_return_status_admin:true,
    // Panel notification visibility toggles
    panelNotif_new_order:true, panelNotif_new_user:true,
    panelNotif_payment_slip:true, panelNotif_payment_confirmed:true,
    panelNotif_cancel_request:true, panelNotif_return_request:true,
    // Discount Engine global settings
    discountPriority:'best',       // 'best' = highest saving wins
    allowCouponOnSaleItems:false,   // false = block coupons on already-discounted items
    globalMaxDiscountPct:0,         // 0 = disabled; otherwise cap all coupon discounts at N% of subtotal
    globalMinProfitMarginPct:0,     // 0 = disabled; minimum profit margin % to preserve
    giftCardCoversDelivery:true,    // true = gift card balance can absorb delivery fee
    heroStyle:'gradient', headerStyle:'default', footerStyle:'default',
    customHeaderCode:'', customFooterCode:'',
    termsUrl:'', privacyUrl:'',
    announcementEnabled:true, announcementText:'', announcementBg:'#15803d', announcementTextColor:'#ffffff', announcementLink:'',
  });
  const [, setGateways] = useState([]);
  const [deliveryServices, setDeliveryServices] = useState([]);
  const [pages, setPages] = useState([]);
  const [adminForm, setAdminForm] = useState({ firstName:'', lastName:'', email:'', password:'', confirmPassword:'' });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [editingPage, setEditingPage] = useState(null);
  const [pageForm, setPageForm] = useState({ slug:'', title:'', content:'', showInFooter:true, showInNav:false, sortOrder:0 });
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [deliveryForm, setDeliveryForm] = useState({ name:'', code:'', description:'', estimatedDays:'', trackingUrl:'', rates:[{ name:'Standard', price:600, freeAbove:0, estimatedDays:'' }] });
  const [gwConfigs, setGwConfigs] = useState({});
  const [whatsappConfig, setWhatsappConfig] = useState({
    whatsappEnabled: false,
    whatsappNumber: '',
    whatsappWelcomeMessage: "Hi there 👋 Welcome! How can we help you today?",
    whatsappPrefilledMessage: "Hi! I'd like to know more about your products.",
    whatsappAgentName: 'Support Team',
    whatsappAgentAvatar: '',
    whatsappButtonPosition: 'bottom-right',
    whatsappOnlineHours: { start: '09:00', end: '18:00' },
    whatsappOfflineMessage: "We're currently offline but will reply as soon as possible.",
    whatsappShowOnMobile: true,
    whatsappShowOnDesktop: true,
  });
  const [savingWA, setSavingWA] = useState(false);

  useEffect(() => {
    API.get('/settings', { cacheTTL: 5 * 60 * 1000 }).then(r => {
      const raw = r.data;
      const coerced = {};
      Object.keys(raw).forEach(k => {
        if (k.startsWith('emailNotif_')) {
          const v = raw[k];
          coerced[k] = v === true || v === 'true' || v === 1;
        } else {
          coerced[k] = raw[k];
        }
      });
      setSettings(p => ({ ...p, ...coerced }));
    }).catch(() => {});
    API.get('/payments/admin/all').then(r => { setGateways(r.data); const cfgs = {}; r.data.forEach(g => { cfgs[g.gateway] = { ...g.config, isEnabled: g.isEnabled, isLive: g.isLive, displayName: g.displayName }; }); setGwConfigs(cfgs); }).catch(() => {});
    API.get('/delivery/admin/all').then(r => setDeliveryServices(r.data)).catch(() => {});
    API.get('/whatsapp/config').then(r => setWhatsappConfig(p => ({ ...p, ...r.data }))).catch(() => {});
    API.get('/pages/admin/all').then(r => setPages(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await API.put('/settings', settings);
      const safeSettings = withoutClientSecrets(settings);
      // Treat any non-success response as an error so the toast is accurate
      if (res.data && res.data.success === false) {
        throw new Error(res.data.message || 'Server returned success:false');
      }
      // Apply theme and cache — wrapped separately so a non-critical failure
      // here does NOT trigger the "Failed to save" toast.
      try { applyTheme(safeSettings); } catch (themeErr) {
        console.warn('applyTheme error (non-critical):', themeErr);
      }
      try {
        localStorage.setItem('storekit_theme_v2', JSON.stringify(safeSettings));
      } catch (lsErr) {
        console.warn('localStorage error (non-critical):', lsErr);
      }
      toast.success('✅ Settings saved & applied!');
      setSettings(p => p.resendApiKey ? ({ ...p, resendApiKey:'', resendApiKeyConfigured:true }) : p);
    } catch (err) {
      console.error('Save settings error:', err);
      // Show the specific server message when available, otherwise a clear
      // generic message. Never show "Failed to save settings" when the save
      // actually succeeded (the backend now returns { success:true } reliably).
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not reach server — check your connection';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const saveGateway = async (gateway) => {
    try {
      const cfg = gwConfigs[gateway] || {};
      await API.put(`/payments/admin/${gateway}`, {
        isEnabled: cfg.isEnabled || false, isLive: cfg.isLive || false,
        displayName: cfg.displayName || GATEWAY_PRESETS[gateway]?.name,
        config: Object.fromEntries(Object.entries(cfg).filter(([k]) => !['isEnabled','isLive','displayName'].includes(k)))
      });
      toast.success(`${GATEWAY_PRESETS[gateway]?.name} settings saved!`);
    } catch (err) {
      console.error('Save gateway error:', err);
      toast.error(err?.response?.data?.message || 'Failed to save gateway');
    }
  };

  const toggleGateway = async (gateway) => {
    try {
      const { data } = await API.put(`/payments/admin/${gateway}/toggle`);
      setGwConfigs(p => ({ ...p, [gateway]: { ...p[gateway], isEnabled: data.isEnabled } }));
      toast.success(data.isEnabled ? 'Gateway enabled!' : 'Gateway disabled');
    } catch (err) {
      console.error('Toggle gateway error:', err);
      toast.error(err?.response?.data?.message || 'Failed to toggle gateway');
    }
  };

  const saveDelivery = async () => {
    try {
      await API.put(`/delivery/admin/${deliveryForm.code}`, deliveryForm);
      const { data } = await API.get('/delivery/admin/all');
      setDeliveryServices(data); setEditingDelivery(null);
      toast.success('Delivery service saved!');
    } catch (err) {
      console.error('Save delivery error:', err);
      toast.error(err?.response?.data?.message || 'Failed to save delivery service');
    }
  };

  const toggleDelivery = async (code) => {
    try {
      const { data } = await API.put(`/delivery/admin/${code}/toggle`);
      setDeliveryServices(p => p.map(s => s.code === code ? data : s));
    } catch (err) {
      console.error('Toggle delivery error:', err);
      toast.error(err?.response?.data?.message || 'Failed to toggle delivery');
    }
  };

  // Allow/disallow Cash on Delivery for a specific delivery service
  // (e.g. PickMe Flash may not support COD while Standard Delivery does).
  const toggleDeliveryCOD = async (svc) => {
    const nextCodAllowed = !(svc.codAllowed !== false); // default true -> flips to false, etc.
    try {
      const { data } = await API.put(`/delivery/admin/${svc.code}`, { ...svc, codAllowed: nextCodAllowed });
      setDeliveryServices(p => p.map(s => s.code === svc.code ? data : s));
      toast.success(nextCodAllowed ? `COD enabled for ${svc.name}` : `COD disabled for ${svc.name}`);
    } catch (err) {
      console.error('Toggle delivery COD error:', err);
      toast.error(err?.response?.data?.message || 'Failed to update COD setting');
    }
  };

  const savePage = async () => {
    try {
      if (editingPage?._id) await API.put(`/pages/admin/${editingPage._id}`, pageForm);
      else await API.post('/pages/admin', pageForm);
      const { data } = await API.get('/pages/admin/all');
      setPages(data); setEditingPage(null);
      toast.success('Page saved!');
    } catch (err) {
      console.error('Save page error:', err);
      toast.error(err?.response?.data?.message || 'Failed to save page');
    }
  };

  const deletePage = async (id) => {
    if (!window.confirm('Delete this page?')) return;
    try {
      await API.delete(`/pages/admin/${id}`);
      setPages(p => p.filter(x => x._id !== id));
    } catch (err) {
      console.error('Delete page error:', err);
      toast.error(err?.response?.data?.message || 'Failed to delete page');
    }
  };

  const createAdmin = async () => {
    if (adminForm.password !== adminForm.confirmPassword) { toast.error('Passwords do not match'); return; }
    setCreatingAdmin(true);
    try {
      await API.post('/admin/create-admin', { ...adminForm, username: adminForm.email.split('@')[0] + '_admin' });
      toast.success('Admin created!');
      setAdminForm({ firstName:'', lastName:'', email:'', password:'', confirmPassword:'' });
    } catch (err) {
      console.error('Create admin error:', err);
      toast.error(err.response?.data?.message || 'Failed to create admin');
    } finally { setCreatingAdmin(false); }
  };

  const applyPreset = (key) => {
    const t = THEMES[key]; if (!t) return;
    const next = { ...settings, theme: key, primaryColor: t.primary, secondaryColor: t.accent, darkBgColor: t.dark };
    setSettings(next);
    try { applyTheme(next); } catch (e) { console.warn('applyTheme error:', e); }
  };

  const applyFont = (key) => {
    const next = { ...settings, fontStyle: key };
    setSettings(next);
    try { applyTheme(next); } catch (e) { console.warn('applyTheme error:', e); }
  };

  const handleColor = (key, val) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    try { applyTheme(next); } catch (e) { console.warn('applyTheme error:', e); }
  };

  const currentTheme = THEMES[settings.theme] || THEMES.default;
  const currentFont = FONTS[settings.fontStyle] || FONTS.default;

  // F, Toggle, SaveBar are defined OUTSIDE the component (below) to prevent
  // React from treating them as new component types on every render.
  // Inline definitions caused focus loss on every keystroke and unmount loops.

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500">Full control over your store</p>
        </div>
        {!['admins','gateways','delivery','whatsapp','pages'].includes(tab) && (
          <button onClick={save} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
            {saving ? 'Saving...' : '✓ Save & Apply'}
          </button>
        )}
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Sidebar */}
        <div className="lg:w-56 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 p-2 sticky top-24">
            {GROUPS.map(group => (
              <div key={group.id} className="mb-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-1">{group.label}</p>
                {TABS.filter(t => t.group === group.id).map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.id ? 'bg-primary/10 text-primary font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">

            {/* ── GENERAL ── */}
            {tab === 'general' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 mb-4">Store Information</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <F label="Store Name *" value={settings.storeName} onChange={e=>setSettings(p=>({...p,storeName:e.target.value}))} />
                  <F label="Tagline" value={settings.storeTagline} onChange={e=>setSettings(p=>({...p,storeTagline:e.target.value}))} />
                  <F label="Email" type="email" value={settings.storeEmail} onChange={e=>setSettings(p=>({...p,storeEmail:e.target.value}))} />
                  <F label="Phone" value={settings.storePhone} onChange={e=>setSettings(p=>({...p,storePhone:e.target.value}))} />
                  <F label="Currency Code" value={settings.currency} onChange={e=>setSettings(p=>({...p,currency:e.target.value}))} placeholder="LKR" />
                  <F label="Currency Symbol" value={settings.currencySymbol} onChange={e=>setSettings(p=>({...p,currencySymbol:e.target.value}))} placeholder="Rs." />
                </div>
                <div><label className="form-label">Address</label><textarea value={settings.storeAddress||''} onChange={e=>setSettings(p=>({...p,storeAddress:e.target.value}))} rows={2} className="form-input resize-none"/></div>
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Social Media Links</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <F label="Facebook" value={settings.facebookUrl} onChange={e=>setSettings(p=>({...p,facebookUrl:e.target.value}))} placeholder="https://facebook.com/..." />
                    <F label="Instagram" value={settings.instagramUrl} onChange={e=>setSettings(p=>({...p,instagramUrl:e.target.value}))} placeholder="https://instagram.com/..." />
                    <F label="Twitter / X" value={settings.twitterUrl} onChange={e=>setSettings(p=>({...p,twitterUrl:e.target.value}))} />
                    <F label="WhatsApp" value={settings.whatsappNumber} onChange={e=>setSettings(p=>({...p,whatsappNumber:e.target.value}))} placeholder="+94 7X XXX XXXX" />
                    <F label="YouTube" value={settings.youtubeUrl} onChange={e=>setSettings(p=>({...p,youtubeUrl:e.target.value}))} />
                    <F label="LinkedIn" value={settings.linkedinUrl} onChange={e=>setSettings(p=>({...p,linkedinUrl:e.target.value}))} />
                  </div>
                </div>
                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── BUSINESS ── */}
            {tab === 'business' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 mb-4">Business Configuration</h3>
                <div>
                  <label className="form-label">Business Type</label>
                  <select value={settings.businessType||'ecommerce'} onChange={e=>setSettings(p=>({...p,businessType:e.target.value}))} className="form-input">
                    <option value="ecommerce">E-Commerce (Products)</option>
                    <option value="digital">Digital Products / Downloads</option>
                    <option value="services">Services</option>
                    <option value="food">Food & Restaurant</option>
                    <option value="fashion">Fashion & Clothing</option>
                    <option value="electronics">Electronics</option>
                    <option value="grocery">Grocery & Supermarket</option>
                    <option value="pharmacy">Pharmacy / Health</option>
                    <option value="jewelry">Jewelry & Accessories</option>
                    <option value="furniture">Furniture & Home</option>
                    <option value="books">Books & Stationery</option>
                    <option value="sports">Sports & Fitness</option>
                    <option value="auto">Automotive</option>
                    <option value="other">Other</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Helps customize the store for your business type</p>
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Tax Settings</p>
                  <Toggle label="Enable Tax" desc="Add tax to orders" value={settings.taxEnabled} onChange={()=>setSettings(p=>({...p,taxEnabled:!p.taxEnabled}))} />
                  {settings.taxEnabled && (
                    <div className="grid sm:grid-cols-2 gap-4 mt-3 ml-4">
                      <F label="Tax Label" value={settings.taxLabel} onChange={e=>setSettings(p=>({...p,taxLabel:e.target.value}))} placeholder="VAT, GST, Tax" />
                      <F label="Tax Rate (%)" type="number" value={settings.taxRate} onChange={e=>setSettings(p=>({...p,taxRate:Number(e.target.value)}))} placeholder="15" />
                    </div>
                  )}
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Policy URLs</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <F label="Terms & Conditions URL" value={settings.termsUrl} onChange={e=>setSettings(p=>({...p,termsUrl:e.target.value}))} placeholder="/page/terms" />
                    <F label="Privacy Policy URL" value={settings.privacyUrl} onChange={e=>setSettings(p=>({...p,privacyUrl:e.target.value}))} placeholder="/page/privacy" />
                  </div>
                </div>
                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── DELIVERY ── */}
            {tab === 'delivery' && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div><h3 className="font-semibold text-gray-900">Delivery Services</h3><p className="text-xs text-gray-400">Configure shipping options for customers</p></div>
                  <button onClick={() => { setDeliveryForm({ name:'', code:'', description:'', estimatedDays:'', trackingUrl:'', coverageAreas:'', deliveryNote:'', codAllowed:true, rates:[{ name:'Standard', price:600, freeAbove:0, estimatedDays:'' }], zoneRates:[], shippingRules:[] }); setEditingDelivery('new'); }} className="btn-primary text-sm">+ Add Service</button>
                </div>
                <div className="space-y-3">
                  {deliveryServices.map(svc => (
                    <div key={svc.code} className="border border-gray-100 rounded-xl p-4 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-gray-800 text-sm">{svc.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${svc.isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{svc.isEnabled ? 'Active' : 'Disabled'}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${svc.codAllowed !== false ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{svc.codAllowed !== false ? '💵 COD allowed' : '🚫 COD disabled'}</span>
                        </div>
                        <p className="text-xs text-gray-500">{svc.description}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {svc.rates?.map((r, i) => (
                            <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">
                              {r.name}: Rs. {r.price} {r.freeAbove > 0 ? `· Free >Rs.${r.freeAbove}` : ''}
                            </span>
                          ))}
                          {svc.zoneRates?.length > 0 && (
                            <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg">🗺️ {svc.zoneRates.length} zone{svc.zoneRates.length > 1 ? 's' : ''}</span>
                          )}
                          {svc.shippingRules?.length > 0 && (
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg">⚡ {svc.shippingRules.length} rule{svc.shippingRules.length > 1 ? 's' : ''}</span>
                          )}
                        </div>
                        {svc.estimatedDays && <p className="text-xs text-gray-400 mt-1">🕐 {svc.estimatedDays}</p>}
                        {svc.trackingUrl && <p className="text-xs text-gray-400 mt-0.5">🔗 Tracking: {svc.trackingUrl}</p>}
                        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-50">
                          <span className="text-xs text-gray-600 whitespace-nowrap">Allow Cash on Delivery for this service</span>
                          <button
                            type="button"
                            onClick={() => toggleDeliveryCOD(svc)}
                            className={`relative inline-flex flex-shrink-0 items-center w-11 h-6 rounded-full transition-colors duration-200 ${svc.codAllowed !== false ? 'bg-blue-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${svc.codAllowed !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => { setDeliveryForm({ zoneRates:[], shippingRules:[], ...svc }); setEditingDelivery(svc); }} className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">Edit</button>
                        <button onClick={() => toggleDelivery(svc.code)} className={`text-xs px-2.5 py-1.5 rounded-lg ${svc.isEnabled ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>{svc.isEnabled ? 'Disable' : 'Enable'}</button>
                      </div>
                    </div>
                  ))}
                </div>

                {editingDelivery && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingDelivery(null)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="font-bold text-lg mb-4">{editingDelivery === 'new' ? 'Add Delivery Service' : 'Edit Service'}</h3>
                      <div className="space-y-4">
                        {/* Basic info */}
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="form-label">Name *</label><input value={deliveryForm.name} onChange={e=>setDeliveryForm(p=>({...p,name:e.target.value}))} className="form-input"/></div>
                          <div><label className="form-label">Code *</label><input value={deliveryForm.code} onChange={e=>setDeliveryForm(p=>({...p,code:e.target.value.toLowerCase().replace(/\s/g,'-')}))} className="form-input" placeholder="express"/></div>
                        </div>
                        <div><label className="form-label">Description</label><input value={deliveryForm.description||''} onChange={e=>setDeliveryForm(p=>({...p,description:e.target.value}))} className="form-input" placeholder="Fast express delivery"/></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="form-label">Default ETA</label><input value={deliveryForm.estimatedDays||''} onChange={e=>setDeliveryForm(p=>({...p,estimatedDays:e.target.value}))} className="form-input" placeholder="3-5 business days"/></div>
                          <div><label className="form-label">Tracking URL</label><input value={deliveryForm.trackingUrl||''} onChange={e=>setDeliveryForm(p=>({...p,trackingUrl:e.target.value}))} className="form-input" placeholder="https://provider.com/track/{trackingNumber}"/></div>
                        </div>
                        <div><label className="form-label">Coverage Areas</label><input value={deliveryForm.coverageAreas||''} onChange={e=>setDeliveryForm(p=>({...p,coverageAreas:e.target.value}))} className="form-input" placeholder="Island-wide delivery"/></div>
                        <div><label className="form-label">Checkout Note</label><input value={deliveryForm.deliveryNote||''} onChange={e=>setDeliveryForm(p=>({...p,deliveryNote:e.target.value}))} className="form-input" placeholder="Orders placed before 2pm ship same day"/></div>

                        <div className="flex items-center justify-between border border-gray-100 rounded-2xl p-4">
                          <div>
                            <p className="font-semibold text-sm text-gray-700">💵 Allow Cash on Delivery</p>
                            <p className="text-xs text-gray-400">Turn off if this courier (e.g. PickMe Flash) doesn't support COD</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDeliveryForm(p => ({ ...p, codAllowed: !(p.codAllowed !== false) }))}
                            className={`relative inline-flex flex-shrink-0 items-center w-11 h-6 rounded-full transition-colors duration-200 ${deliveryForm.codAllowed !== false ? 'bg-blue-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${deliveryForm.codAllowed !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </button>
                        </div>

                        {/* Base Rates */}
                        <div className="border border-gray-100 rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-semibold text-sm text-gray-700">📦 Base Rates</p>
                            <button type="button" onClick={()=>setDeliveryForm(p=>({...p,rates:[...(p.rates||[]),{name:'',price:0,freeAbove:0,estimatedDays:''}]}))} className="text-xs text-primary hover:underline">+ Add Rate</button>
                          </div>
                          <div className="grid grid-cols-4 gap-1 mb-2 text-xs text-gray-400 font-medium px-1">
                            <span>Name</span><span>Price (Rs.)</span><span>Free Above</span><span>ETA</span>
                          </div>
                          {deliveryForm.rates?.map((rate, i) => (
                            <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-center">
                              <input value={rate.name} onChange={e=>setDeliveryForm(p=>({...p,rates:p.rates.map((r,ri)=>ri===i?{...r,name:e.target.value}:r)}))} className="form-input text-sm" placeholder="Standard"/>
                              <input type="number" value={rate.price} onChange={e=>setDeliveryForm(p=>({...p,rates:p.rates.map((r,ri)=>ri===i?{...r,price:Number(e.target.value)}:r)}))} className="form-input text-sm" placeholder="600"/>
                              <input type="number" value={rate.freeAbove} onChange={e=>setDeliveryForm(p=>({...p,rates:p.rates.map((r,ri)=>ri===i?{...r,freeAbove:Number(e.target.value)}:r)}))} className="form-input text-sm" placeholder="0=never"/>
                              <div className="flex gap-1">
                                <input value={rate.estimatedDays} onChange={e=>setDeliveryForm(p=>({...p,rates:p.rates.map((r,ri)=>ri===i?{...r,estimatedDays:e.target.value}:r)}))} className="form-input text-sm flex-1" placeholder="3-5 days"/>
                                {deliveryForm.rates.length > 1 && <button type="button" onClick={()=>setDeliveryForm(p=>({...p,rates:p.rates.filter((_,ri)=>ri!==i)}))} className="text-red-400 hover:text-red-600 text-lg px-1">✕</button>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Delivery Zones */}
                        <div className="border border-gray-100 rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-semibold text-sm text-gray-700">🗺️ Zone-Based Rates</p>
                              <p className="text-xs text-gray-400">Override base rate for specific cities/areas</p>
                            </div>
                            <button type="button" onClick={()=>setDeliveryForm(p=>({...p,zoneRates:[...(p.zoneRates||[]),{zoneName:'',zones:[],price:0,freeAbove:0,estimatedDays:''}]}))} className="text-xs text-primary hover:underline">+ Add Zone</button>
                          </div>
                          {(!deliveryForm.zoneRates || deliveryForm.zoneRates.length === 0) && (
                            <p className="text-xs text-gray-400 italic py-2">No zones configured — base rates apply everywhere.</p>
                          )}
                          {deliveryForm.zoneRates?.map((zr, i) => (
                            <div key={i} className="bg-gray-50 rounded-xl p-3 mb-2 space-y-2">
                              <div className="flex gap-2 items-center">
                                <input value={zr.zoneName} onChange={e=>setDeliveryForm(p=>({...p,zoneRates:p.zoneRates.map((z,zi)=>zi===i?{...z,zoneName:e.target.value}:z)}))} className="form-input text-sm flex-1" placeholder="Zone name (e.g. Colombo City)"/>
                                <button type="button" onClick={()=>setDeliveryForm(p=>({...p,zoneRates:p.zoneRates.filter((_,zi)=>zi!==i)}))} className="text-red-400 hover:text-red-600 text-lg">✕</button>
                              </div>
                              <input value={(zr.zones||[]).join(', ')} onChange={e=>setDeliveryForm(p=>({...p,zoneRates:p.zoneRates.map((z,zi)=>zi===i?{...z,zones:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}:z)}))} className="form-input text-sm" placeholder="Colombo 1, Colombo 2, Colombo 3 (comma-separated)"/>
                              <div className="grid grid-cols-3 gap-2">
                                <div><label className="text-xs text-gray-500">Price (Rs.)</label><input type="number" value={zr.price} onChange={e=>setDeliveryForm(p=>({...p,zoneRates:p.zoneRates.map((z,zi)=>zi===i?{...z,price:Number(e.target.value)}:z)}))} className="form-input text-sm"/></div>
                                <div><label className="text-xs text-gray-500">Free Above (Rs.)</label><input type="number" value={zr.freeAbove||0} onChange={e=>setDeliveryForm(p=>({...p,zoneRates:p.zoneRates.map((z,zi)=>zi===i?{...z,freeAbove:Number(e.target.value)}:z)}))} className="form-input text-sm"/></div>
                                <div><label className="text-xs text-gray-500">ETA</label><input value={zr.estimatedDays||''} onChange={e=>setDeliveryForm(p=>({...p,zoneRates:p.zoneRates.map((z,zi)=>zi===i?{...z,estimatedDays:e.target.value}:z)}))} className="form-input text-sm" placeholder="1-2 days"/></div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Dynamic Shipping Rules */}
                        <div className="border border-gray-100 rounded-2xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-semibold text-sm text-gray-700">⚡ Dynamic Rules</p>
                              <p className="text-xs text-gray-400">Conditional adjustments applied on top of the base rate</p>
                            </div>
                            <button type="button" onClick={()=>setDeliveryForm(p=>({...p,shippingRules:[...(p.shippingRules||[]),{name:'',condition:'order_above',conditionValue:0,adjustment:0,adjustmentType:'fixed'}]}))} className="text-xs text-primary hover:underline">+ Add Rule</button>
                          </div>
                          {(!deliveryForm.shippingRules || deliveryForm.shippingRules.length === 0) && (
                            <p className="text-xs text-gray-400 italic py-2">No rules — base rate applies directly.</p>
                          )}
                          {deliveryForm.shippingRules?.map((rule, i) => (
                            <div key={i} className="bg-gray-50 rounded-xl p-3 mb-2 space-y-2">
                              <div className="flex gap-2">
                                <input value={rule.name} onChange={e=>setDeliveryForm(p=>({...p,shippingRules:p.shippingRules.map((r,ri)=>ri===i?{...r,name:e.target.value}:r)}))} className="form-input text-sm flex-1" placeholder="Rule name (e.g. Express Surcharge)"/>
                                <button type="button" onClick={()=>setDeliveryForm(p=>({...p,shippingRules:p.shippingRules.filter((_,ri)=>ri!==i)}))} className="text-red-400 hover:text-red-600 text-lg">✕</button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-gray-500">Condition</label>
                                  <select value={rule.condition} onChange={e=>setDeliveryForm(p=>({...p,shippingRules:p.shippingRules.map((r,ri)=>ri===i?{...r,condition:e.target.value}:r)}))} className="form-input text-sm">
                                    <option value="always">Always apply</option>
                                    <option value="order_above">Order above</option>
                                    <option value="order_below">Order below</option>
                                    <option value="weight_above">Weight above (kg)</option>
                                  </select>
                                </div>
                                {rule.condition !== 'always' && (
                                  <div><label className="text-xs text-gray-500">Condition Value</label><input type="number" value={rule.conditionValue||0} onChange={e=>setDeliveryForm(p=>({...p,shippingRules:p.shippingRules.map((r,ri)=>ri===i?{...r,conditionValue:Number(e.target.value)}:r)}))} className="form-input text-sm"/></div>
                                )}
                                <div>
                                  <label className="text-xs text-gray-500">Adjustment Type</label>
                                  <select value={rule.adjustmentType||'fixed'} onChange={e=>setDeliveryForm(p=>({...p,shippingRules:p.shippingRules.map((r,ri)=>ri===i?{...r,adjustmentType:e.target.value}:r)}))} className="form-input text-sm">
                                    <option value="fixed">Fixed Amount (Rs.)</option>
                                    <option value="percentage">Percentage (%)</option>
                                  </select>
                                </div>
                                <div><label className="text-xs text-gray-500">Adjustment Value</label><input type="number" value={rule.adjustment||0} onChange={e=>setDeliveryForm(p=>({...p,shippingRules:p.shippingRules.map((r,ri)=>ri===i?{...r,adjustment:Number(e.target.value)}:r)}))} className="form-input text-sm" placeholder="e.g. 200 or -100"/></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-3 mt-5 pt-4 border-t">
                        <button onClick={saveDelivery} className="btn-primary flex-1">Save Service</button>
                        <button onClick={()=>setEditingDelivery(null)} className="btn-outline">Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Delivery ETA + Global Free Shipping ── */}
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <h4 className="font-semibold text-gray-800 text-sm mb-3">Global Delivery Settings</h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <F label="Default Shipping Cost (Rs.)" type="number" value={settings.standardDelivery} onChange={e=>setSettings(p=>({...p,standardDelivery:Number(e.target.value)}))} hint="Used when no delivery service is configured"/>
                    <F label="Free Shipping Threshold (Rs.)" type="number" value={settings.freeDeliveryThreshold} onChange={e=>setSettings(p=>({...p,freeDeliveryThreshold:Number(e.target.value)}))} hint="0 = always charge"/>
                    <F label="Default ETA" value={settings.deliveryETA||''} onChange={e=>setSettings(p=>({...p,deliveryETA:e.target.value}))} placeholder="3-5 business days" hint="Shown on product pages"/>
                    <F label="Delivery Note" value={settings.deliveryNote||''} onChange={e=>setSettings(p=>({...p,deliveryNote:e.target.value}))} placeholder="Orders placed before 2pm ship same day" hint="Optional note shown at checkout"/>
                  </div>
                  <SaveBar onSave={save} saving={saving}/>
                </div>
              </div>
            )}

            {/* ── WHATSAPP ── */}
            {tab === 'whatsapp' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-semibold text-gray-900">WhatsApp Integration</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Add a floating WhatsApp chat button to your store and enable product inquiry sharing.</p>
                </div>

                {/* Enable toggle */}
                <div className="flex items-center justify-between p-4 rounded-2xl border-2 transition-colors" style={{borderColor: whatsappConfig.whatsappEnabled ? '#25d366' : '#e5e7eb', background: whatsappConfig.whatsappEnabled ? '#f0fdf4' : '#fafafa'}}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{background: '#25d366'}}>💬</div>
                    <div>
                      <p className="font-semibold text-sm text-gray-800">Enable WhatsApp Widget</p>
                      <p className="text-xs text-gray-400">Show floating chat button on your store</p>
                    </div>
                  </div>
                  <button onClick={()=>setWhatsappConfig(p=>({...p,whatsappEnabled:!p.whatsappEnabled}))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${whatsappConfig.whatsappEnabled?'bg-green-500':'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${whatsappConfig.whatsappEnabled?'left-6.5 translate-x-1':'left-0.5'}`} style={{transform: whatsappConfig.whatsappEnabled ? 'translateX(24px)' : 'translateX(0)'}}/>
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">WhatsApp Number *</label>
                    <input value={whatsappConfig.whatsappNumber||''} onChange={e=>setWhatsappConfig(p=>({...p,whatsappNumber:e.target.value}))} className="form-input" placeholder="+94 7X XXX XXXX"/>
                    <p className="text-xs text-gray-400 mt-1">Include country code, e.g. +94771234567</p>
                  </div>
                  <div>
                    <label className="form-label">Agent / Team Name</label>
                    <input value={whatsappConfig.whatsappAgentName||''} onChange={e=>setWhatsappConfig(p=>({...p,whatsappAgentName:e.target.value}))} className="form-input" placeholder="Support Team"/>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="form-label">Welcome Message</label>
                    <textarea value={whatsappConfig.whatsappWelcomeMessage||''} onChange={e=>setWhatsappConfig(p=>({...p,whatsappWelcomeMessage:e.target.value}))} className="form-input resize-none" rows={2} placeholder="Hi there 👋 How can we help you today?"/>
                    <p className="text-xs text-gray-400 mt-1">Shown in the chat popup before the customer clicks "Start Chat"</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="form-label">Pre-filled Chat Message</label>
                    <textarea value={whatsappConfig.whatsappPrefilledMessage||''} onChange={e=>setWhatsappConfig(p=>({...p,whatsappPrefilledMessage:e.target.value}))} className="form-input resize-none" rows={2} placeholder="Hi! I'd like to know more about your products."/>
                    <p className="text-xs text-gray-400 mt-1">Auto-typed in WhatsApp when the customer opens it. Use <code className="bg-gray-100 px-1 rounded">{'{product}'}</code> and <code className="bg-gray-100 px-1 rounded">{'{url}'}</code> on product pages.</p>
                  </div>
                  <div>
                    <label className="form-label">Offline Message</label>
                    <textarea value={whatsappConfig.whatsappOfflineMessage||''} onChange={e=>setWhatsappConfig(p=>({...p,whatsappOfflineMessage:e.target.value}))} className="form-input resize-none" rows={2} placeholder="We're offline but will reply soon..."/>
                  </div>
                  <div>
                    <label className="form-label">Button Position</label>
                    <select value={whatsappConfig.whatsappButtonPosition||'bottom-right'} onChange={e=>setWhatsappConfig(p=>({...p,whatsappButtonPosition:e.target.value}))} className="form-input">
                      <option value="bottom-right">Bottom Right (default)</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="top-left">Top Left</option>
                    </select>
                  </div>
                </div>

                {/* Online hours */}
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <p className="text-sm font-semibold text-gray-700 mb-3">🕐 Online Hours</p>
                  <p className="text-xs text-gray-400 mb-3">Outside these hours the "Away" indicator shows and the offline message is displayed.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">From</label>
                      <input type="time" value={whatsappConfig.whatsappOnlineHours?.start||'09:00'} onChange={e=>setWhatsappConfig(p=>({...p,whatsappOnlineHours:{...p.whatsappOnlineHours,start:e.target.value}}))} className="form-input"/>
                    </div>
                    <div>
                      <label className="form-label">To</label>
                      <input type="time" value={whatsappConfig.whatsappOnlineHours?.end||'18:00'} onChange={e=>setWhatsappConfig(p=>({...p,whatsappOnlineHours:{...p.whatsappOnlineHours,end:e.target.value}}))} className="form-input"/>
                    </div>
                  </div>
                </div>

                {/* Visibility */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Widget Visibility</p>
                  <Toggle label="Show on Mobile" desc="Display floating button on mobile devices" value={whatsappConfig.whatsappShowOnMobile!==false} onChange={()=>setWhatsappConfig(p=>({...p,whatsappShowOnMobile:!p.whatsappShowOnMobile}))}/>
                  <Toggle label="Show on Desktop" desc="Display floating button on desktop browsers" value={whatsappConfig.whatsappShowOnDesktop!==false} onChange={()=>setWhatsappConfig(p=>({...p,whatsappShowOnDesktop:!p.whatsappShowOnDesktop}))}/>
                </div>

                {/* Preview */}
                {whatsappConfig.whatsappEnabled && whatsappConfig.whatsappNumber && (
                  <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                    <p className="text-sm font-semibold text-blue-700 mb-1">✅ Widget Active</p>
                    <p className="text-xs text-blue-600">Connected to <strong>{whatsappConfig.whatsappNumber}</strong>. The floating button will appear on your store. You can also see it live on any product page.</p>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <button onClick={async()=>{
                    setSavingWA(true);
                    try {
                      await API.put('/whatsapp/config', whatsappConfig);
                      toast.success('✅ WhatsApp settings saved!');
                    } catch (err) {
                      console.error('Save WhatsApp error:', err);
                      toast.error(err?.response?.data?.message || 'Failed to save WhatsApp settings');
                    } finally {
                      setSavingWA(false);
                    }
                  }} disabled={savingWA} className="btn-primary">
                    {savingWA ? 'Saving...' : '💾 Save WhatsApp Settings'}
                  </button>
                </div>
              </div>
            )}

            {/* ── ANNOUNCEMENT BAR ── */}
            {tab === 'announcement' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 mb-2">Announcement Bar</h3>
                <p className="text-sm text-gray-400 mb-4">The top ticker/announcement bar shown on your storefront. You can override this from a Seasonal Campaign too.</p>
                <Toggle label="📢 Show Announcement Bar" desc="Enable the scrolling ticker at the top of all pages" value={settings.announcementEnabled!==false} onChange={()=>setSettings(p=>({...p,announcementEnabled:!p.announcementEnabled}))} />
                <div><label className="form-label">Announcement Text</label><input value={settings.announcementText||''} onChange={e=>setSettings(p=>({...p,announcementText:e.target.value}))} className="form-input" placeholder="🚚 Free delivery on orders over Rs. 5,000 — Shop now!"/></div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Background Color</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={settings.announcementBg||'#15803d'} onChange={e=>setSettings(p=>({...p,announcementBg:e.target.value}))} className="w-11 h-10 rounded-xl border-2 border-gray-200 cursor-pointer p-0.5"/>
                      <input value={settings.announcementBg||''} onChange={e=>setSettings(p=>({...p,announcementBg:e.target.value}))} className="form-input font-mono text-sm flex-1"/>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Text Color</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={settings.announcementTextColor||'#ffffff'} onChange={e=>setSettings(p=>({...p,announcementTextColor:e.target.value}))} className="w-11 h-10 rounded-xl border-2 border-gray-200 cursor-pointer p-0.5"/>
                      <input value={settings.announcementTextColor||''} onChange={e=>setSettings(p=>({...p,announcementTextColor:e.target.value}))} className="form-input font-mono text-sm flex-1"/>
                    </div>
                  </div>
                </div>
                <F label="Announcement Link (optional)" value={settings.announcementLink||''} onChange={e=>setSettings(p=>({...p,announcementLink:e.target.value}))} placeholder="/shop" hint="Make the announcement clickable"/>
                {/* Preview */}
                {settings.announcementEnabled !== false && settings.announcementText && (
                  <div className="rounded-xl overflow-hidden border border-gray-100">
                    <p className="text-xs text-gray-400 px-3 py-1 bg-gray-50">Preview:</p>
                    <div className="py-2 px-4 text-sm font-semibold text-center" style={{background:settings.announcementBg||'#15803d',color:settings.announcementTextColor||'#fff'}}>
                      {settings.announcementText}
                    </div>
                  </div>
                )}
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
                  💡 <strong>Tip:</strong> Active <a href="/admin/seasonal" className="underline">Seasonal Campaigns</a> will override this announcement bar automatically.
                </div>
                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── PAYMENT ── */}
            {tab === 'payment' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 mb-4">Manual Payment Methods</h3>
                <Toggle label="🏦 Bank Transfer" desc="Accept direct bank transfers" value={settings.bankTransferEnabled} onChange={()=>setSettings(p=>({...p,bankTransferEnabled:!p.bankTransferEnabled}))} />
                {settings.bankTransferEnabled && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3 ml-4 border-l-2 border-primary">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <F label="Bank Name" value={settings.bankName} onChange={e=>setSettings(p=>({...p,bankName:e.target.value}))} placeholder="Bank of Ceylon" />
                      <F label="Account Name" value={settings.bankAccountName} onChange={e=>setSettings(p=>({...p,bankAccountName:e.target.value}))} />
                      <F label="Account Number" value={settings.bankAccountNumber} onChange={e=>setSettings(p=>({...p,bankAccountNumber:e.target.value}))} />
                      <F label="Branch" value={settings.bankBranch} onChange={e=>setSettings(p=>({...p,bankBranch:e.target.value}))} />
                    </div>
                  </div>
                )}
                <Toggle label="💵 Cash on Delivery" desc="Accept cash on delivery" value={settings.codEnabled} onChange={()=>setSettings(p=>({...p,codEnabled:!p.codEnabled}))} />
                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── GATEWAYS ── */}
            {tab === 'gateways' && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Payment Gateways</h3>
                <p className="text-sm text-gray-400 mb-5">Configure online payment gateways. Customers will see enabled gateways at checkout.</p>
                <div className="space-y-5">
                  {Object.entries(GATEWAY_PRESETS).map(([gwKey, preset]) => {
                    const cfg = gwConfigs[gwKey] || {};
                    const isEnabled = cfg.isEnabled || false;
                    return (
                      <div key={gwKey} className={`border-2 rounded-2xl overflow-hidden transition-all ${isEnabled ? 'border-primary/30' : 'border-gray-100'}`}>
                        <div className={`flex items-center justify-between p-4 ${isEnabled ? 'bg-primary/5' : 'bg-gray-50'}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{preset.logo}</span>
                            <div>
                              <p className="font-bold text-gray-800">{preset.name}</p>
                              <p className="text-xs text-gray-500">Payment gateway integration</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                            <div onClick={() => toggleGateway(gwKey)} className={`w-12 h-6 rounded-full cursor-pointer relative transition-all ${isEnabled ? 'bg-primary' : 'bg-gray-200'}`}>
                              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${isEnabled ? 'left-6' : 'left-0.5'}`}/>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">Live Mode</label>
                            <div onClick={() => setGwConfigs(p => ({ ...p, [gwKey]: { ...p[gwKey], isLive: !cfg.isLive } }))}
                              className={`w-10 h-5 rounded-full cursor-pointer relative transition-all ${cfg.isLive ? 'bg-green-500' : 'bg-gray-200'}`}>
                              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${cfg.isLive ? 'left-5' : 'left-0.5'}`}/>
                            </div>
                          </div>
                          {!cfg.isLive && <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">⚠️ Sandbox/Test mode — no real charges</p>}
                          <div className="grid sm:grid-cols-2 gap-3">
                            {preset.fields.map(field => (
                              <div key={field.key}>
                                <label className="form-label text-xs">{field.label}</label>
                                <input type={field.type} value={cfg[field.key]||''} onChange={e=>setGwConfigs(p=>({...p,[gwKey]:{...p[gwKey],[field.key]:e.target.value}}))}
                                  className="form-input text-sm" placeholder={field.type==='password'?'••••••••':''}/>
                                {field.hint && <p className="text-xs text-gray-400 mt-0.5">{field.hint}</p>}
                              </div>
                            ))}
                          </div>
                          <button onClick={() => saveGateway(gwKey)} className="btn-primary text-sm">Save {preset.name} Settings</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-sm font-semibold text-blue-800 mb-1">💡 More gateways coming</p>
                  <p className="text-xs text-blue-600">Razorpay, 2Checkout, HNB iPay, Sampath Vishwa integrations available on request.</p>
                </div>
              </div>
            )}

            {/* ── APPEARANCE ── */}
            {tab === 'appearance' && (
              <div className="mb-4 p-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl border border-primary/20 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">🎨 Advanced Theme Builder</p>
                  <p className="text-xs text-gray-500 mt-0.5">20+ themes, custom colors, dark mode & more</p>
                </div>
                <Link to="/admin/theme-builder" className="btn-primary text-xs px-4 py-2">Open Builder →</Link>
              </div>
            )}
            {tab === 'appearance' && (
              <div className="space-y-7">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Color Themes</h3>
                  <p className="text-xs text-gray-400 mb-4">Click to preview instantly. Save to apply permanently.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Object.entries(THEMES).map(([key, theme]) => (
                      <button key={key} onClick={() => applyPreset(key)}
                        className={`relative p-3 rounded-2xl border-2 transition-all hover:scale-105 hover:shadow-md ${settings.theme===key?'border-gray-800 shadow-xl':'border-gray-100 hover:border-gray-300'}`}>
                        <div className="flex gap-1 mb-2 rounded-lg overflow-hidden h-9">
                          <div className="flex-1" style={{background:theme.primary}}/><div className="flex-1" style={{background:theme.accent}}/><div className="flex-1" style={{background:theme.dark}}/>
                        </div>
                        <p className="text-xs font-bold text-gray-700 text-center">{theme.name}</p>
                        {settings.theme===key && <div className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"><span className="text-white text-xs font-bold">✓</span></div>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h4 className="font-semibold text-gray-800 mb-3">Custom Colors</h4>
                  <div className="grid sm:grid-cols-3 gap-4">
                    {[['primaryColor','🎨 Primary',currentTheme.primary],['secondaryColor','✨ Accent',currentTheme.accent],['darkBgColor','🌑 Dark BG',currentTheme.dark]].map(([key,label,fb]) => (
                      <div key={key}>
                        <label className="form-label text-xs">{label}</label>
                        <div className="flex gap-2 items-center">
                          <input type="color" value={settings[key]||fb||'#000000'} onChange={e=>handleColor(key,e.target.value)} className="w-12 h-10 rounded-xl border-2 border-gray-200 cursor-pointer p-0.5 flex-shrink-0"/>
                          <input value={settings[key]||fb||''} onChange={e=>handleColor(key,e.target.value)} className="form-input font-mono text-sm flex-1"/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h4 className="font-semibold text-gray-800 mb-4">Logo & Favicon</h4>
                  <div className="grid sm:grid-cols-2 gap-5">
                    <ImageUpload label="Store Logo" hint="Recommended: 200×60px PNG or SVG" value={settings.logoUrl} onChange={url=>setSettings(p=>({...p,logoUrl:url}))} />
                    <ImageUpload label="Favicon" hint="32×32px .ico or .png" value={settings.faviconUrl} onChange={url=>setSettings(p=>({...p,faviconUrl:url}))} />
                  </div>

                  {/* Logo Size Control */}
                  <div className="mt-5 p-4 rounded-2xl border border-gray-100 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Logo Size in Navbar</p>
                        <p className="text-xs text-gray-400 mt-0.5">Adjust the visible height of your logo in the header</p>
                      </div>
                      <span className="text-sm font-bold px-3 py-1.5 rounded-xl text-white" style={{background:'var(--theme-gradient)'}}>{settings.logoSize||56}px</span>
                    </div>
                    <input
                      type="range"
                      min={28}
                      max={160}
                      step={4}
                      value={settings.logoSize||56}
                      onChange={e=>setSettings(p=>({...p,logoSize:Number(e.target.value)}))}
                      className="w-full accent-primary"
                      style={{cursor:'pointer'}}
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                      <span>28px</span>
                      <span>Default (56px)</span>
                      <span>160px</span>
                    </div>
                    {/* Live logo preview */}
                    {settings.logoUrl && (
                      <div className="mt-4 flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <span className="text-xs text-gray-400 flex-shrink-0">Preview:</span>
                        <img
                          src={settings.logoUrl}
                          alt="logo preview"
                          style={{height:`${settings.logoSize||56}px`,maxWidth:'260px',objectFit:'contain'}}
                        />
                      </div>
                    )}
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {[28, 40, 56, 72, 96, 128, 160].map(sz => (
                        <button
                          key={sz}
                          onClick={()=>setSettings(p=>({...p,logoSize:sz}))}
                          className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-all border min-w-[36px] ${(settings.logoSize||56)===sz?'border-primary bg-primary text-white':'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'}`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">⚠️ Logos above 96px will significantly increase header height</p>
                  </div>
                </div>

                <div className="border-t pt-5">
                  <h4 className="font-semibold text-gray-800 mb-1">Custom CSS</h4>
                  <p className="text-xs text-gray-400 mb-2">Inject CSS into the storefront</p>
                  <textarea value={settings.customCSS||''} onChange={e=>setSettings(p=>({...p,customCSS:e.target.value}))} rows={5} className="form-input resize-none font-mono text-xs" placeholder=".btn-primary { border-radius: 20px; }"/>
                </div>

                {/* Live preview */}
                <div className="border-t pt-5">
                  <h4 className="font-semibold text-gray-800 mb-3">Live Preview</h4>
                  <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-100">
                    <div className="py-1.5 text-center text-xs font-semibold text-white" style={{background:settings.primaryColor||currentTheme.primary}}>🚚 Free delivery on orders over {settings.currencySymbol||'Rs.'} {(settings.freeDeliveryThreshold||5000).toLocaleString()}</div>
                    <div className="px-5 py-4 flex items-center justify-between" style={{background:settings.darkBgColor||currentTheme.dark}}>
                      <div className="flex items-center gap-2.5">
                        {settings.logoUrl ? <img src={settings.logoUrl} alt="" style={{height:`${settings.logoSize||56}px`,maxWidth:'180px',objectFit:'contain'}}/> : <span className="font-bold text-white text-base" style={{fontFamily:currentFont.display}}>{settings.storeName||'StoreKit'}</span>}
                      </div>
                      <div className="px-4 py-1.5 rounded-lg text-white text-xs font-semibold" style={{background:settings.primaryColor||currentTheme.primary}}>Shop Now</div>
                    </div>
                    <div className="p-4 grid grid-cols-3 gap-2" style={{background:currentTheme.bodyBg}}>
                      {[1,2,3].map(i=>(
                        <div key={i} className="rounded-xl overflow-hidden border border-gray-100" style={{background:currentTheme.cardBg}}>
                          <div className="h-12" style={{background:`linear-gradient(135deg,${settings.primaryColor||currentTheme.primary}33,${settings.secondaryColor||currentTheme.accent}33)`}}/>
                          <div className="p-2 space-y-1"><div className="h-2 bg-gray-200 rounded-full"/><div className="h-3 rounded-full w-2/3" style={{background:settings.primaryColor||currentTheme.primary}}/></div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── FONTS ── */}
            {tab === 'fonts' && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Typography</h3>
                <p className="text-sm text-gray-400 mb-5">Click to preview. Save to apply site-wide.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {Object.entries(FONTS).map(([key, font]) => (
                    <button key={key} onClick={()=>applyFont(key)}
                      className={`p-5 rounded-2xl border-2 text-left transition-all hover:shadow-lg ${settings.fontStyle===key?'border-primary bg-primary/5 shadow-lg':'border-gray-100 hover:border-gray-200'}`}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <p className="text-xl font-bold text-gray-900 leading-tight" style={{fontFamily:font.display}}>{settings.storeName||'StoreKit'}</p>
                        {settings.fontStyle===key&&<span className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-white text-xs flex-shrink-0">✓</span>}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed mb-3" style={{fontFamily:font.body}}>Premium shopping. Quality products delivered to your door.</p>
                      <div className="flex gap-2 flex-wrap">
                        <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full">{font.name?.split(' + ')?.[0] || font.name || ''}</span>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full">+</span>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full">{font.name?.split(' + ')?.[1] || ''}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── BANNERS REDIRECT ── */}
            {tab === 'banners_link' && (
              <div className="space-y-4">
                <div className="p-8 text-center bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl border border-primary/20">
                  <div className="text-5xl mb-3">🖼️</div>
                  <h3 className="font-bold text-gray-900 text-lg mb-1">Banners & Popups</h3>
                  <p className="text-sm text-gray-500 mb-5">Hero sliders, running banners, popups, flash sale strips and more are managed in the dedicated Banners section.</p>
                  <a href="/admin/banners" className="btn-primary inline-flex items-center gap-2">Open Banners Manager →</a>
                </div>
              </div>
            )}

            {/* ── PAGES ── */}
            {tab === 'pages' && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div><h3 className="font-semibold text-gray-900">Business Pages</h3><p className="text-xs text-gray-400">About, Terms, Privacy, FAQ, Contact etc</p></div>
                  <button onClick={() => { setPageForm({ slug:'', title:'', content:'', showInFooter:true, showInNav:false, sortOrder:0 }); setEditingPage('new'); }} className="btn-primary text-sm">+ Add Page</button>
                </div>
                <div className="space-y-2">
                  {pages.map(page => (
                    <div key={page._id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                      <div>
                        <p className="font-medium text-sm text-gray-800">{page.title}</p>
                        <p className="text-xs text-gray-400">/page/{page.slug} {page.showInFooter?'· Footer':''} {page.showInNav?'· Nav':''}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setPageForm({...page}); setEditingPage(page); }} className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">Edit</button>
                        <button onClick={() => deletePage(page._id)} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>

                {editingPage && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPage(null)}>
                    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                      <h3 className="font-bold text-lg mb-4">{editingPage === 'new' ? 'Create Page' : 'Edit Page'}</h3>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="form-label">Title *</label><input value={pageForm.title} onChange={e=>setPageForm(p=>({...p,title:e.target.value}))} className="form-input"/></div>
                          <div><label className="form-label">URL Slug *</label><input value={pageForm.slug} onChange={e=>setPageForm(p=>({...p,slug:e.target.value.toLowerCase().replace(/\s/g,'-')}))} className="form-input" placeholder="about-us"/></div>
                        </div>
                        <div><label className="form-label">Content (HTML)</label><textarea value={pageForm.content} onChange={e=>setPageForm(p=>({...p,content:e.target.value}))} rows={10} className="form-input resize-none font-mono text-xs" placeholder="<h2>Title</h2><p>Your content...</p>"/></div>
                        <div className="flex gap-5">
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={pageForm.showInFooter} onChange={e=>setPageForm(p=>({...p,showInFooter:e.target.checked}))} className="accent-primary"/><span className="text-sm">Show in Footer</span></label>
                          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={pageForm.showInNav} onChange={e=>setPageForm(p=>({...p,showInNav:e.target.checked}))} className="accent-primary"/><span className="text-sm">Show in Nav</span></label>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-4 pt-4 border-t">
                        <button onClick={savePage} className="btn-primary flex-1">Save Page</button>
                        <button onClick={()=>setEditingPage(null)} className="btn-outline">Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CONTENT CUSTOMIZER ── */}
            {tab === 'content' && (
              <div className="space-y-6">
                <h3 className="font-semibold text-gray-900 mb-2">Content Customizer</h3>
                <p className="text-sm text-gray-400 mb-5">Customize every text label on your storefront — no coding needed.</p>

                {/* Hero Stats */}
                <div className="border border-gray-100 rounded-xl p-5">
                  <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">🏆 Hero Stats Numbers</h4>
                  <div className="space-y-3">
                    {(() => {
                      let stats = [];
                      try { stats = JSON.parse(settings.heroStats||'[]'); } catch {}
                      return stats.map((s,i) => (
                        <div key={i} className="flex gap-3 items-center">
                          <input value={s.number} onChange={e=>{ const n=[...stats]; n[i]={...n[i],number:e.target.value}; setSettings(p=>({...p,heroStats:JSON.stringify(n)})); }} className="form-input w-28 text-sm" placeholder="50K+"/>
                          <input value={s.label} onChange={e=>{ const n=[...stats]; n[i]={...n[i],label:e.target.value}; setSettings(p=>({...p,heroStats:JSON.stringify(n)})); }} className="form-input flex-1 text-sm" placeholder="Products"/>
                          <button onClick={()=>{ const n=stats.filter((_,si)=>si!==i); setSettings(p=>({...p,heroStats:JSON.stringify(n)})); }} className="text-red-400 hover:text-red-600 text-sm px-2">✕</button>
                        </div>
                      ));
                    })()}
                    <button onClick={()=>{ let s=[]; try{s=JSON.parse(settings.heroStats||'[]');}catch{}; s.push({number:'100+',label:'New Label'}); setSettings(p=>({...p,heroStats:JSON.stringify(s)})); }}
                      className="text-sm font-semibold" style={{color:'var(--color-primary)'}}>+ Add Stat</button>
                  </div>
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input type="checkbox" checked={settings.heroShowStats!==false} onChange={e=>setSettings(p=>({...p,heroShowStats:e.target.checked}))} style={{accentColor:'var(--color-primary)'}} className="w-4 h-4"/>
                    <span className="text-sm text-gray-700">Show stats in hero</span>
                  </label>
                  <div className="mt-3"><label className="form-label">Browse All Button Label</label>
                    <input value={settings.heroBrowseAllLabel||'Browse All'} onChange={e=>setSettings(p=>({...p,heroBrowseAllLabel:e.target.value}))} className="form-input"/></div>
                </div>

                {/* Trust Badges */}
                <div className="border border-gray-100 rounded-xl p-5">
                  <h4 className="font-bold text-gray-800 mb-4">🏅 Trust Bar Badges</h4>
                  <div className="space-y-3">
                    {(() => {
                      let badges = [];
                      try { badges = JSON.parse(settings.trustBadges||'[]'); } catch {}
                      return badges.map((b,i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-xl">
                          <input value={b.icon} onChange={e=>{ const n=[...badges]; n[i]={...n[i],icon:e.target.value}; setSettings(p=>({...p,trustBadges:JSON.stringify(n)})); }} className="form-input text-center col-span-1 text-lg px-1" placeholder="🚀"/>
                          <input value={b.title} onChange={e=>{ const n=[...badges]; n[i]={...n[i],title:e.target.value}; setSettings(p=>({...p,trustBadges:JSON.stringify(n)})); }} className="form-input col-span-4 text-sm" placeholder="Title"/>
                          <input value={b.subtitle} onChange={e=>{ const n=[...badges]; n[i]={...n[i],subtitle:e.target.value}; setSettings(p=>({...p,trustBadges:JSON.stringify(n)})); }} className="form-input col-span-5 text-sm" placeholder="Subtitle"/>
                          <div className="col-span-1 flex justify-center">
                            <input type="checkbox" checked={b.enabled!==false} onChange={e=>{ const n=[...badges]; n[i]={...n[i],enabled:e.target.checked}; setSettings(p=>({...p,trustBadges:JSON.stringify(n)})); }} style={{accentColor:'var(--color-primary)'}} className="w-4 h-4"/>
                          </div>
                          <button onClick={()=>{ const n=badges.filter((_,bi)=>bi!==i); setSettings(p=>({...p,trustBadges:JSON.stringify(n)})); }} className="text-red-400 hover:text-red-600 text-sm col-span-1">✕</button>
                        </div>
                      ));
                    })()}
                    <button onClick={()=>{ let b=[]; try{b=JSON.parse(settings.trustBadges||'[]');}catch{}; b.push({icon:'⭐',title:'New Badge',subtitle:'Description',enabled:true}); setSettings(p=>({...p,trustBadges:JSON.stringify(b)})); }}
                      className="text-sm font-semibold" style={{color:'var(--color-primary)'}}>+ Add Badge</button>
                  </div>
                </div>

                {/* Section Labels */}
                <div className="border border-gray-100 rounded-xl p-5">
                  <h4 className="font-bold text-gray-800 mb-4">📝 Section Labels</h4>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      ['sectionFeaturedTitle','Featured Title'],['sectionFeaturedSubtitle','Featured Subtitle'],
                      ['sectionSaleTitle','Sale Title'],['sectionSaleSubtitle','Sale Subtitle'],
                      ['sectionNewTitle','New Arrivals Title'],['sectionNewSubtitle','New Arrivals Subtitle'],
                      ['sectionCatTitle','Categories Title'],['sectionCatSubtitle','Categories Subtitle'],
                    ].map(([key,label])=>(
                      <div key={key}>
                        <label className="form-label">{label}</label>
                        <input value={settings[key]||''} onChange={e=>setSettings(p=>({...p,[key]:e.target.value}))} className="form-input text-sm"/>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Newsletter Labels */}
                <div className="border border-gray-100 rounded-xl p-5">
                  <h4 className="font-bold text-gray-800 mb-4">📬 Newsletter Labels</h4>
                  <div className="space-y-3">
                    {[
                      ['newsletterBadgeLabel','Badge Label','Newsletter'],
                      ['newsletterTitle','Heading','Be the First to Know'],
                      ['newsletterSubtitle','Subtitle','Exclusive deals in your inbox.'],
                      ['newsletterCta','Button Text','Subscribe'],
                      ['newsletterDisclaimer','Disclaimer Text','No spam. Unsubscribe any time.'],
                    ].map(([key,label,placeholder])=>(
                      <div key={key}>
                        <label className="form-label">{label}</label>
                        <input value={settings[key]||''} onChange={e=>setSettings(p=>({...p,[key]:e.target.value}))} className="form-input text-sm" placeholder={placeholder}/>
                      </div>
                    ))}
                  </div>
                </div>

                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── SEO ── */}
            {tab === 'seo' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 mb-2">SEO & Analytics</h3>
                <div className="rounded-2xl border-2 p-5 text-center" style={{borderColor:'var(--color-primary)',background:'var(--color-primary)08'}}>
                  <div className="text-4xl mb-2">🔍</div>
                  <h4 className="font-bold text-gray-900 mb-1" style={{fontFamily:'var(--font-display)'}}>Full SEO Dashboard Available</h4>
                  <p className="text-sm text-gray-500 mb-4">Complete SEO tools including Core Web Vitals, Sitemap generator, Robots.txt editor, Google Analytics, Search Console, Social signals and more.</p>
                  <a href="/admin/seo" className="btn-primary inline-flex items-center gap-2 text-sm">Open SEO Dashboard →</a>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <F label="Google Analytics ID" value={settings.googleAnalytics} onChange={e=>setSettings(p=>({...p,googleAnalytics:e.target.value}))} placeholder="G-XXXXXXXXXX" hint="GA4 Measurement ID"/>
                  <F label="Facebook Pixel ID" value={settings.facebookPixel} onChange={e=>setSettings(p=>({...p,facebookPixel:e.target.value}))} placeholder="123456789012345"/>
                </div>
                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── FEATURES ── */}
            {/* ── DISCOUNTS ── */}
            {tab === 'discounts' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-gray-900">Discount Engine Settings</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Global rules enforced by the centralized Discount Engine across all coupons, gift cards, and promotions</p>
                </div>

                {/* How it works strip */}
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { icon:'🏆', title:'Best Benefit Wins', body:'Coupon vs gift card — whichever saves the customer more is applied automatically. They never stack.' },
                    { icon:'🚫', title:'No Stacking', body:'Only one customer benefit (coupon or gift card) applies per order. Multiple promotions cannot combine.' },
                    { icon:'💰', title:'Gift Card = Payment', body:'Gift cards apply after discounts and can cover delivery fees. They act as a payment method, not a discount.' },
                    { icon:'🔒', title:'Server Revalidation', body:'All coupon rules are rechecked at order creation time on the server — a pre-check passing does not guarantee final approval.' },
                  ].map(({ icon, title, body }) => (
                    <div key={title} className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                      <div className="text-2xl mb-2">{icon}</div>
                      <p className="font-semibold text-blue-900 text-sm">{title}</p>
                      <p className="text-xs text-blue-600 mt-1">{body}</p>
                    </div>
                  ))}
                </div>

                {/* Priority rule */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                  <h4 className="font-semibold text-gray-800 text-sm">Discount Priority Rule</h4>
                  <div className="space-y-2">
                    {[
                      { value:'best',   label:'Best Saving Wins (Recommended)', desc:'The engine automatically picks whichever benefit — coupon or gift card — gives the customer the larger discount.' },
                      { value:'coupon', label:'Coupon First',                   desc:'If a valid coupon is applied, it always takes priority over a gift card, even if the gift card would save more.' },
                      { value:'giftcard', label:'Gift Card First',              desc:'If a gift card has balance, it always takes priority over a coupon.' },
                    ].map(opt => (
                      <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${settings.discountPriority===opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                        <input type="radio" name="discountPriority" value={opt.value}
                          checked={settings.discountPriority===opt.value}
                          onChange={() => setSettings(p => ({ ...p, discountPriority: opt.value }))}
                          className="mt-0.5 accent-blue-500" />
                        <div>
                          <p className="font-semibold text-sm text-gray-800">{opt.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Coupon on sale items */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                  <h4 className="font-semibold text-gray-800 text-sm">Coupon on Sale Items — Global Default</h4>
                  <p className="text-xs text-gray-400">This sets the default for all new coupons. Individual coupons can override this setting.</p>
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Block Coupons on Already-Discounted Products</p>
                      <p className="text-xs text-gray-400 mt-0.5">When enabled, coupons cannot be applied to carts containing any product with an active sale price. Prevents discount stacking.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettings(p => ({ ...p, allowCouponOnSaleItems: !p.allowCouponOnSaleItems }))}
                      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${!settings.allowCouponOnSaleItems ? 'bg-orange-500' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${!settings.allowCouponOnSaleItems ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  {!settings.allowCouponOnSaleItems && (
                    <div className="bg-orange-50 rounded-xl px-4 py-3 text-xs text-orange-700 border border-orange-100">
                      ⚠️ Coupons blocked on sale items globally. Individual coupons can still override this by disabling their own "Block on Sale Items" flag.
                    </div>
                  )}
                </div>

                {/* Maximum discount cap */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                  <h4 className="font-semibold text-gray-800 text-sm">Maximum Discount Cap (Global)</h4>
                  <F label="Maximum Discount % of Subtotal" type="number" min="0" max="100"
                    value={settings.globalMaxDiscountPct || 0}
                    onChange={e => setSettings(p => ({ ...p, globalMaxDiscountPct: Number(e.target.value) }))}
                    hint="Cap any coupon discount so it never exceeds this % of the order subtotal. Set 0 to disable this global cap (individual coupon maxDiscount caps still apply)."
                  />
                  {settings.globalMaxDiscountPct > 0 && (
                    <div className="bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3 text-xs text-yellow-700">
                      Global cap active — no coupon can discount more than <strong>{settings.globalMaxDiscountPct}%</strong> of the subtotal, regardless of its own settings.
                    </div>
                  )}
                </div>

                {/* Minimum profit margin */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                  <h4 className="font-semibold text-gray-800 text-sm">Minimum Profit Margin Protection</h4>
                  <F label="Minimum Profit Margin % to Preserve" type="number" min="0" max="100"
                    value={settings.globalMinProfitMarginPct || 0}
                    onChange={e => setSettings(p => ({ ...p, globalMinProfitMarginPct: Number(e.target.value) }))}
                    hint="Prevent any coupon from reducing margin below this %. Requires Cost Price to be set on products. Set 0 to disable."
                  />
                  {settings.globalMinProfitMarginPct > 0 && (
                    <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-700">
                      ⚠️ Profit protection active — discounts that would push order margin below <strong>{settings.globalMinProfitMarginPct}%</strong> will be reduced automatically. Requires <strong>Cost Price</strong> on all products.
                    </div>
                  )}
                </div>

                {/* Gift card covers delivery */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h4 className="font-semibold text-gray-800 text-sm mb-3">Gift Card Behaviour</h4>
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Gift Card Covers Delivery Fee</p>
                      <p className="text-xs text-gray-400 mt-0.5">When enabled, a gift card with sufficient balance will also cover the delivery fee (total goes to Rs. 0). This is the recommended setting.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettings(p => ({ ...p, giftCardCoversDelivery: !p.giftCardCoversDelivery }))}
                      className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${settings.giftCardCoversDelivery ? 'bg-blue-500' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.giftCardCoversDelivery ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {tab === 'features' && (
              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900 mb-4">Store Features</h3>
                <p className="text-xs text-gray-400 mb-4">Enable or disable features based on your business needs</p>
                <Toggle label="💌 Newsletter Subscription" desc="Allow customers to subscribe to newsletter" value={settings.enableNewsletter} onChange={()=>setSettings(p=>({...p,enableNewsletter:!p.enableNewsletter}))} />
                <Toggle label="❤️ Wishlist" desc="Allow customers to save products to wishlist" value={settings.enableWishlist} onChange={()=>setSettings(p=>({...p,enableWishlist:!p.enableWishlist}))} />
                <Toggle label="⭐ Product Reviews" desc="Allow customers to leave reviews" value={settings.enableReviews} onChange={()=>setSettings(p=>({...p,enableReviews:!p.enableReviews}))} />
                <Toggle label="🎁 Gift Cards" desc="Enable gift card purchase and redemption" value={settings.enableGiftCards} onChange={()=>setSettings(p=>({...p,enableGiftCards:!p.enableGiftCards}))} />
                <Toggle label="↩️ Returns & Refunds" desc="Allow customers to submit return requests" value={settings.enableReturns} onChange={()=>setSettings(p=>({...p,enableReturns:!p.enableReturns}))} />
                {settings.enableReturns && (
                  <div className="ml-4">
                    <F label="Return Window (days)" type="number" value={settings.maxReturnDays} onChange={e=>setSettings(p=>({...p,maxReturnDays:Number(e.target.value)}))} hint="Days after delivery customer can request return"/>
                  </div>
                )}
                <Toggle label="⭐ Require Review Approval" desc="Manually approve reviews before publishing" value={settings.reviewsRequireApproval} onChange={()=>setSettings(p=>({...p,reviewsRequireApproval:!p.reviewsRequireApproval}))} />
                <Toggle label="👤 Guest Checkout" desc="Allow orders without account" value={settings.allowGuestCheckout} onChange={()=>setSettings(p=>({...p,allowGuestCheckout:!p.allowGuestCheckout}))} />
                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── ADVANCED ── */}
            {tab === 'advanced' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 mb-4">Advanced Settings</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <F label="Low Stock Alert Threshold" type="number" value={settings.lowStockAlert} onChange={e=>setSettings(p=>({...p,lowStockAlert:Number(e.target.value)}))} hint="Alert when stock falls below this"/>
                  <F label="Order Notification Email" type="email" value={settings.orderNotificationEmail} onChange={e=>setSettings(p=>({...p,orderNotificationEmail:e.target.value}))} hint="Receive order alerts here"/>
                  <F label="Cancel Window (minutes)" type="number" value={settings.cancelWindowMinutes} onChange={e=>setSettings(p=>({...p,cancelWindowMinutes:Number(e.target.value)}))} hint="How long customers can request cancellation after placing an order (e.g. 60 = 1 hour)"/>
                  <F label="Auto-Decision Delay (minutes)" type="number" value={settings.autoDecisionMinutes} onChange={e=>setSettings(p=>({...p,autoDecisionMinutes:Number(e.target.value)}))} hint="After this many minutes, pending cancel requests are auto-decided (only if Auto-Decision is enabled below)"/>
                </div>
                {/* ── Cancel Auto-Decision ── */}
                <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">🤖 Auto Cancel Decision</p>
                      <p className="text-xs text-gray-500 mt-0.5">Automatically approve or reject cancel requests after the delay above — no manual review needed</p>
                    </div>
                    <button
                      onClick={()=>setSettings(p=>({...p,autoDecisionEnabled:!p.autoDecisionEnabled}))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.autoDecisionEnabled?'bg-green-500':'bg-gray-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.autoDecisionEnabled?'translate-x-6':'translate-x-1'}`}/>
                    </button>
                  </div>
                  {settings.autoDecisionEnabled && (
                    <div className="flex gap-3 pt-1">
                      {[['approve','✅ Auto-Approve (cancel the order)'],['reject','❌ Auto-Reject (keep the order)']].map(([val,label])=>(
                        <label key={val} className={`flex items-center gap-2 flex-1 cursor-pointer rounded-lg border-2 px-3 py-2 text-sm transition-all ${settings.autoDecisionAction===val?'border-blue-500 bg-blue-50 font-semibold text-blue-800':'border-gray-200 bg-white text-gray-600'}`}>
                          <input type="radio" name="autoDecisionAction" value={val}
                            checked={settings.autoDecisionAction===val}
                            onChange={()=>setSettings(p=>({...p,autoDecisionAction:val}))}
                            className="accent-blue-500"/>
                          {label}
                        </label>
                      ))}
                    </div>
                  )}
                  {settings.autoDecisionEnabled && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ⚠️ Both the customer and admin will receive an email when an auto-decision is made. The system checks every 60 seconds.
                    </p>
                  )}
                </div>
                <Toggle label="✅ Auto-Confirm Orders" desc="Automatically confirm orders after placement" value={settings.autoConfirmOrders} onChange={()=>setSettings(p=>({...p,autoConfirmOrders:!p.autoConfirmOrders}))} />
                <Toggle label="⚠️ Maintenance Mode" desc="Show maintenance page to all visitors" value={settings.maintenanceMode} onChange={()=>setSettings(p=>({...p,maintenanceMode:!p.maintenanceMode}))} />
                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}


            {/* ── EMAIL NOTIFICATIONS ── */}
            {tab === 'emails' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">📧 Email Notifications</h3>
                  <p className="text-sm text-gray-500 mt-1">Control which emails are sent automatically. Toggles take effect immediately — no server restart needed.</p>
                </div>

                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <p className="font-semibold text-gray-800 text-sm">Sender Identity</p>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <F
                      label="Sender Name"
                      value={settings.emailFromName}
                      onChange={e=>setSettings(p=>({...p,emailFromName:e.target.value}))}
                      placeholder={settings.storeName || 'Store Name'}
                      hint="Example: Lily Store"
                    />
                    <F
                      label="Sender Email"
                      type="email"
                      value={settings.emailFromAddress}
                      onChange={e=>setSettings(p=>({...p,emailFromAddress:e.target.value}))}
                      placeholder="noreply@your-verified-domain.com"
                      hint="Must be verified in Resend or allowed by your SMTP provider."
                    />
                    <F
                      label="Reply-To Email"
                      type="email"
                      value={settings.emailReplyTo}
                      onChange={e=>setSettings(p=>({...p,emailReplyTo:e.target.value}))}
                      placeholder={settings.storeEmail || 'support@yourstore.com'}
                      hint="Customer replies go here. Leave empty to use Store Email."
                      col2
                    />
                    <F
                      label="Resend API Key"
                      type="password"
                      value={settings.resendApiKey}
                      onChange={e=>setSettings(p=>({...p,resendApiKey:e.target.value}))}
                      placeholder={settings.resendApiKeyConfigured ? 'Configured - leave blank to keep current key' : 're_...'}
                      hint={settings.resendApiKeyConfigured ? 'A tenant Resend key is saved. Enter a new key only when replacing it.' : 'Paste this store Resend secret key here. It is saved securely and not shown again.'}
                      col2
                    />
                  </div>
                </div>

                {/* Orders */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <p className="font-semibold text-gray-800 text-sm">🛒 Order Emails</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Order Placed — Customer Confirmation</p>
                        <p className="text-xs text-gray-500">Customer receives order confirmation after checkout</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_order_placed_customer:!p.emailNotif_order_placed_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_order_placed_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_order_placed_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Order Placed — Admin Alert</p>
                        <p className="text-xs text-gray-500">Admin receives a new order notification email</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_order_placed_admin:!p.emailNotif_order_placed_admin}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_order_placed_admin?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_order_placed_admin?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Order Status Update — Customer</p>
                        <p className="text-xs text-gray-500">Customer is notified when order status changes (confirmed, shipped, delivered, etc.)</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_order_status_customer:!p.emailNotif_order_status_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_order_status_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_order_status_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Order Status Update — Admin Alert</p>
                        <p className="text-xs text-gray-500">Admin receives email when any order status changes (processing, shipped, delivered, etc.)</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_order_status_admin:!p.emailNotif_order_status_admin}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_order_status_admin?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_order_status_admin?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Order Delivered — Customer Email</p>
                        <p className="text-xs text-gray-500">Customer receives a dedicated delivery confirmation email with review prompt when order is marked delivered</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_order_delivered_customer:!p.emailNotif_order_delivered_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_order_delivered_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_order_delivered_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Payment Slip */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <p className="font-semibold text-gray-800 text-sm">📎 Payment Slip Emails</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Slip Uploaded — Admin Notification</p>
                        <p className="text-xs text-gray-500">Admin receives email when a customer uploads a bank transfer slip</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_slip_uploaded_admin:!p.emailNotif_slip_uploaded_admin}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_slip_uploaded_admin?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_slip_uploaded_admin?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Slip Received — Customer Confirmation</p>
                        <p className="text-xs text-gray-500">Customer receives email confirming their slip was received and is under review</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_slip_received_customer:!p.emailNotif_slip_received_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_slip_received_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_slip_received_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Payment Confirmed — Customer Email</p>
                        <p className="text-xs text-gray-500">Customer receives email when admin confirms their bank transfer payment</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_payment_confirmed_customer:!p.emailNotif_payment_confirmed_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_payment_confirmed_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_payment_confirmed_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Payment Confirmed — Admin Copy</p>
                        <p className="text-xs text-gray-500">Admin receives a confirmation copy when a payment is verified (manual, slip, or gateway)</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_payment_confirmed_admin:!p.emailNotif_payment_confirmed_admin}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_payment_confirmed_admin?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_payment_confirmed_admin?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cancellations */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <p className="font-semibold text-gray-800 text-sm">🚫 Cancellation Emails</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Cancel Request — Admin Notification</p>
                        <p className="text-xs text-gray-500">Admin receives email when a customer submits a cancellation request</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_cancel_request_admin:!p.emailNotif_cancel_request_admin}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_cancel_request_admin?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_cancel_request_admin?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Cancel Request Received — Customer</p>
                        <p className="text-xs text-gray-500">Customer receives confirmation that their cancellation request was received</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_cancel_request_customer:!p.emailNotif_cancel_request_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_cancel_request_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_cancel_request_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Cancellation Approved — Customer</p>
                        <p className="text-xs text-gray-500">Customer receives email when their order is cancelled (manual or auto)</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_cancel_approved_customer:!p.emailNotif_cancel_approved_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_cancel_approved_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_cancel_approved_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Cancellation Approved — Admin Confirmation</p>
                        <p className="text-xs text-gray-500">Admin receives a copy when a cancellation is approved</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_cancel_approved_admin:!p.emailNotif_cancel_approved_admin}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_cancel_approved_admin?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_cancel_approved_admin?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Cancellation Rejected — Customer</p>
                        <p className="text-xs text-gray-500">Customer receives email when their cancellation request is rejected</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_cancel_rejected_customer:!p.emailNotif_cancel_rejected_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_cancel_rejected_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_cancel_rejected_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Cancellation Rejected — Admin Confirmation</p>
                        <p className="text-xs text-gray-500">Admin receives a copy when a cancellation request is rejected</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_cancel_rejected_admin:!p.emailNotif_cancel_rejected_admin}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_cancel_rejected_admin?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_cancel_rejected_admin?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notification Panel */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <p className="font-semibold text-gray-800 text-sm">🔔 Notification Panel — Visible Types</p>
                    <p className="text-xs text-gray-500 mt-0.5">Choose which event types appear in the admin notification bell. Disabled types are still stored but hidden from the panel.</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {[
                      { key:'panelNotif_new_order',         icon:'🛒', label:'New Order',          desc:'Show when a customer places a new order' },
                      { key:'panelNotif_new_user',          icon:'👤', label:'New User Registration', desc:'Show when a new customer account is created' },
                      { key:'panelNotif_payment_slip',      icon:'🏦', label:'Payment Slip Uploaded', desc:'Show when a customer uploads a bank transfer slip' },
                      { key:'panelNotif_payment_confirmed', icon:'✅', label:'Payment Confirmed',   desc:'Show when a payment is verified (manual, slip, or gateway)' },
                      { key:'panelNotif_cancel_request',    icon:'🚫', label:'Cancel Request',      desc:'Show when a customer requests order cancellation' },
                      { key:'panelNotif_return_request',    icon:'↩️', label:'Return Request',      desc:'Show when a customer submits a return request' },
                    ].map(({ key, icon, label, desc }) => (
                      <div key={key} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{icon}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{label}</p>
                            <p className="text-xs text-gray-500">{desc}</p>
                          </div>
                        </div>
                        <button onClick={()=>setSettings(p=>({...p,[key]:!p[key]}))}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${settings[key]!==false?'bg-blue-500':'bg-gray-300'}`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings[key]!==false?'translate-x-6':'translate-x-1'}`}/>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                                {/* Returns & Refunds */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <p className="font-semibold text-gray-800 text-sm">🔄 Returns &amp; Refund Emails</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Return Requested — Customer Confirmation</p>
                        <p className="text-xs text-gray-500">Customer receives confirmation email when they submit a return request</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_return_request_customer:!p.emailNotif_return_request_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_return_request_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_return_request_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Return Requested — Admin Alert</p>
                        <p className="text-xs text-gray-500">Admin receives email when a customer submits a new return request</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_return_request_admin:!p.emailNotif_return_request_admin}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_return_request_admin?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_return_request_admin?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Return Approved — Customer</p>
                        <p className="text-xs text-gray-500">Customer is notified when their return request is approved, with refund amount and method</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_return_approved_customer:!p.emailNotif_return_approved_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_return_approved_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_return_approved_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Return Rejected — Customer</p>
                        <p className="text-xs text-gray-500">Customer is notified when their return request is rejected, with admin note/reason</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_return_rejected_customer:!p.emailNotif_return_rejected_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_return_rejected_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_return_rejected_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Return Item Received — Customer</p>
                        <p className="text-xs text-gray-500">Customer is notified when their returned item arrives at the store and is being inspected</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_return_received_customer:!p.emailNotif_return_received_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_return_received_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_return_received_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Refund Processed — Customer</p>
                        <p className="text-xs text-gray-500">Customer receives a refund confirmation email with amount and payment method when refund is issued</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_return_refunded_customer:!p.emailNotif_return_refunded_customer}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_return_refunded_customer?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_return_refunded_customer?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Return Status Changed — Admin Copy</p>
                        <p className="text-xs text-gray-500">Admin receives a copy email on every return status change (approved, rejected, received, refunded)</p>
                      </div>
                      <button onClick={()=>setSettings(p=>({...p,emailNotif_return_status_admin:!p.emailNotif_return_status_admin}))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.emailNotif_return_status_admin?'bg-green-500':'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.emailNotif_return_status_admin?'translate-x-6':'translate-x-1'}`}/>
                      </button>
                    </div>
                  </div>
                </div>

                                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                  <p className="text-sm text-blue-800">
                    <strong>ℹ️ Note:</strong> All toggles are <strong>enabled by default</strong>. Disabling a toggle stops that specific email from sending immediately — no restart required. Admin emails go to the address in <em>Advanced → Order Notification Email</em>.
                  </p>
                </div>

                <SaveBar onSave={save} saving={saving}/>
              </div>
            )}

            {/* ── ADMINS ── */}
            {tab === 'admins' && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-5">Create Admin Account</h3>
                <div className="max-w-md space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="form-label">First Name *</label><input value={adminForm.firstName} onChange={e=>setAdminForm(p=>({...p,firstName:e.target.value}))} className="form-input"/></div>
                    <div><label className="form-label">Last Name</label><input value={adminForm.lastName} onChange={e=>setAdminForm(p=>({...p,lastName:e.target.value}))} className="form-input"/></div>
                  </div>
                  <div><label className="form-label">Email *</label><input type="email" value={adminForm.email} onChange={e=>setAdminForm(p=>({...p,email:e.target.value}))} className="form-input"/></div>
                  <div><label className="form-label">Password *</label><input type="password" value={adminForm.password} onChange={e=>setAdminForm(p=>({...p,password:e.target.value}))} className="form-input"/></div>
                  <div><label className="form-label">Confirm Password *</label><input type="password" value={adminForm.confirmPassword} onChange={e=>setAdminForm(p=>({...p,confirmPassword:e.target.value}))} className="form-input"/></div>
                  <button onClick={createAdmin} disabled={creatingAdmin} className="btn-primary">{creatingAdmin?'Creating...':'Create Admin Account'}</button>
                </div>
                <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl max-w-md">
                  <p className="text-sm font-semibold text-amber-800 mb-1">⚠️ Security Notice</p>
                  <p className="text-xs text-amber-700">Admin accounts have full access. Only create for trusted team members.</p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
