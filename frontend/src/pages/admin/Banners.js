import ImageUpload from '../../components/ImageUpload';
import React, { useEffect, useState, useCallback } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

/* ── Shared Modal ──────────────────────────────────────────────── */
const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
    <div
      className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} my-4`}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
        <h2 className="font-display font-bold text-xl text-gray-900">{title}</h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">×</button>
      </div>
      <div className="p-5 overflow-y-auto max-h-[80vh]">{children}</div>
    </div>
  </div>
);

/* ── Tabs ──────────────────────────────────────────────────────── */
const TABS = [
  { id: 'running_top', label: '📢 Running Banners', desc: 'Scrolling top announcement bar' },
  { id: 'hero', label: '🖼️ Hero Banners', desc: 'Homepage hero slider' },
  { id: 'popup', label: '💬 Popup Banners', desc: 'Overlay popups on site entry' },
  { id: 'flash_sale', label: '⚡ Flash Sale Banners', desc: 'Countdown flash sale strips' },
  { id: 'promo', label: '🎯 Promo Banners', desc: 'Mid-page promotional strips' },
  { id: 'product_page', label: '📦 Product Page Banners', desc: 'Shown on product detail pages' },
  { id: 'category_page', label: '📂 Category Page Banners', desc: 'Shown on category/shop pages' },
  { id: 'global', label: '🌐 Global Banners', desc: 'Shown sitewide below header' },
];

const EMPTY_FORM = {
  title: '', subtitle: '', image: '', link: '', buttonText: 'Shop Now',
  buttonColor: '#ffffff', buttonBgColor: '#3b82f6',
  runningText: '', runningSpeed: 30, runningBgColor: '#1e293b', runningTextColor: '#ffffff', runningIcon: '🔥',
  popupDelay: 3, popupFrequency: 'once_per_session', popupWidth: 'md',
  flashSaleEndTime: '', flashSaleText: '',
  targetCategories: '', targetProducts: '',
  showOnMobile: true, showOnDesktop: true,
  isActive: true, sortOrder: 0, startDate: '', endDate: '',
  position: 'hero',
};

/* ── Banner Card ───────────────────────────────────────────────── */
const BannerCard = ({ b, onEdit, onToggle, onDelete, type }) => {
  const isRunning = type === 'running_top';
  return (
    <div className={`bg-white rounded-2xl border-2 overflow-hidden group transition-all ${b.isActive ? 'border-gray-100 hover:border-primary/30' : 'border-dashed border-gray-200 opacity-60'}`}>
      {isRunning ? (
        <div className="p-4 flex items-center gap-3" style={{ background: b.runningBgColor || '#1e293b' }}>
          <span className="text-xl">{b.runningIcon || '🔥'}</span>
          <p className="text-sm font-medium truncate flex-1" style={{ color: b.runningTextColor || '#fff' }}>
            {b.runningText || b.title}
          </p>
          <span className="text-xs opacity-60" style={{ color: b.runningTextColor || '#fff' }}>speed: {b.runningSpeed}s</span>
        </div>
      ) : b.image ? (
        <div className="relative aspect-video bg-gray-100">
          <img src={b.image} alt={b.title} className="w-full h-full object-cover" />
          <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
            {b.isActive ? <span className="badge badge-new text-xs shadow">Active</span> : <span className="badge bg-gray-100 text-gray-500 text-xs">Hidden</span>}
            {b.startDate && <span className="badge bg-blue-100 text-blue-700 text-xs">Scheduled</span>}
          </div>
        </div>
      ) : (
        <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <span className="text-4xl">{TABS.find(t => t.id === type)?.label.split(' ')[0] || '🖼️'}</span>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-gray-800 text-sm line-clamp-1">{b.title}</h3>
          {b.flashSaleEndTime && <span className="badge bg-orange-100 text-orange-700 text-xs flex-shrink-0">⏱ Timer</span>}
        </div>
        {b.subtitle && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{b.subtitle}</p>}
        {b.link && <p className="text-xs text-primary mt-1 truncate">{b.link}</p>}
        {(b.startDate || b.endDate) && (
          <p className="text-xs text-blue-600 mt-1">
            📅 {b.startDate ? new Date(b.startDate).toLocaleDateString() : '∞'} → {b.endDate ? new Date(b.endDate).toLocaleDateString() : '∞'}
          </p>
        )}
        <div className="flex items-center gap-2 mt-3">
          <button onClick={() => onEdit(b)} className="btn-outline text-xs py-1.5 px-3 flex-1">✏️ Edit</button>
          <button onClick={() => onToggle(b)} className={`text-xs py-1.5 px-3 rounded-lg border font-medium transition-colors flex-1 ${b.isActive ? 'text-orange-600 border-orange-200 hover:bg-orange-50' : 'text-green-600 border-green-200 hover:bg-green-50'}`}>
            {b.isActive ? 'Hide' : 'Show'}
          </button>
          <button onClick={() => onDelete(b._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Banner Form ───────────────────────────────────────────────── */
const BannerForm = ({ form, setForm, onSave, onCancel, saving, type }) => {
  const isRunning = type === 'running_top';
  const isPopup = type === 'popup';
  const isFlash = type === 'flash_sale';
  const isTargeted = type === 'product_page' || type === 'category_page';

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }));

  return (
    <div className="space-y-4">
      {/* Running banner special fields */}
      {isRunning && (
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <label className="text-white text-xs font-semibold uppercase tracking-wide">Marquee Text *</label>
          <input value={form.runningText} onChange={e => f('runningText', e.target.value)}
            className="form-input" placeholder="🔥 Free shipping on orders over Rs. 5000 | New arrivals every week!" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label text-gray-300">Icon / Emoji</label>
              <input value={form.runningIcon} onChange={e => f('runningIcon', e.target.value)} className="form-input" placeholder="🔥" />
            </div>
            <div>
              <label className="form-label text-gray-300">Scroll Speed (seconds)</label>
              <input type="number" min="5" max="120" value={form.runningSpeed} onChange={e => f('runningSpeed', Number(e.target.value))} className="form-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label text-gray-300">Background Color</label>
              <div className="flex gap-2">
                <input type="color" value={form.runningBgColor} onChange={e => f('runningBgColor', e.target.value)} className="h-9 w-10 rounded-lg border border-gray-600 cursor-pointer bg-transparent" />
                <input value={form.runningBgColor} onChange={e => f('runningBgColor', e.target.value)} className="form-input flex-1 font-mono text-sm" />
              </div>
            </div>
            <div>
              <label className="form-label text-gray-300">Text Color</label>
              <div className="flex gap-2">
                <input type="color" value={form.runningTextColor} onChange={e => f('runningTextColor', e.target.value)} className="h-9 w-10 rounded-lg border border-gray-600 cursor-pointer bg-transparent" />
                <input value={form.runningTextColor} onChange={e => f('runningTextColor', e.target.value)} className="form-input flex-1 font-mono text-sm" />
              </div>
            </div>
          </div>
          <div className="rounded-lg overflow-hidden" style={{ background: form.runningBgColor }}>
            <div className="p-2 text-center text-sm font-medium" style={{ color: form.runningTextColor }}>
              {form.runningIcon} Preview: {form.runningText || 'Your text here...'}
            </div>
          </div>
        </div>
      )}

      {/* Title always */}
      <div>
        <label className="form-label">Title {isRunning ? '(internal name)' : '*'}</label>
        <input value={form.title} onChange={e => f('title', e.target.value)} className="form-input" placeholder="Banner name" />
      </div>

      {!isRunning && (
        <>
          <div><label className="form-label">Subtitle</label>
            <input value={form.subtitle} onChange={e => f('subtitle', e.target.value)} className="form-input" /></div>

          <div>
            <label className="form-label">Banner Image</label>
            <ImageUpload value={form.image} onChange={url => f('image', url)} />
          </div>

          <div><label className="form-label">Link URL</label>
            <input value={form.link} onChange={e => f('link', e.target.value)} className="form-input" placeholder="/shop/electronics" /></div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1"><label className="form-label">Button Text</label>
              <input value={form.buttonText} onChange={e => f('buttonText', e.target.value)} className="form-input" /></div>
            <div>
              <label className="form-label">Button Color</label>
              <div className="flex gap-1.5">
                <input type="color" value={form.buttonColor} onChange={e => f('buttonColor', e.target.value)} className="h-9 w-9 rounded-lg border border-gray-200 cursor-pointer" />
                <input value={form.buttonColor} onChange={e => f('buttonColor', e.target.value)} className="form-input flex-1 font-mono text-xs" />
              </div>
            </div>
            <div>
              <label className="form-label">Button BG</label>
              <div className="flex gap-1.5">
                <input type="color" value={form.buttonBgColor} onChange={e => f('buttonBgColor', e.target.value)} className="h-9 w-9 rounded-lg border border-gray-200 cursor-pointer" />
                <input value={form.buttonBgColor} onChange={e => f('buttonBgColor', e.target.value)} className="form-input flex-1 font-mono text-xs" />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Flash sale countdown */}
      {isFlash && (
        <div className="bg-orange-50 rounded-xl p-4 space-y-3 border border-orange-100">
          <label className="text-orange-800 text-xs font-bold uppercase tracking-wide">⚡ Flash Sale Settings</label>
          <div><label className="form-label">Sale Ends At</label>
            <input type="datetime-local" value={form.flashSaleEndTime} onChange={e => f('flashSaleEndTime', e.target.value)} className="form-input" /></div>
          <div><label className="form-label">Sale Tag Text</label>
            <input value={form.flashSaleText} onChange={e => f('flashSaleText', e.target.value)} className="form-input" placeholder="Up to 50% OFF!" /></div>
        </div>
      )}

      {/* Popup settings */}
      {isPopup && (
        <div className="bg-purple-50 rounded-xl p-4 space-y-3 border border-purple-100">
          <label className="text-purple-800 text-xs font-bold uppercase tracking-wide">💬 Popup Settings</label>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Show After (seconds)</label>
              <input type="number" min="0" value={form.popupDelay} onChange={e => f('popupDelay', Number(e.target.value))} className="form-input" /></div>
            <div><label className="form-label">Width</label>
              <select value={form.popupWidth} onChange={e => f('popupWidth', e.target.value)} className="form-input">
                <option value="sm">Small (400px)</option>
                <option value="md">Medium (540px)</option>
                <option value="lg">Large (720px)</option>
              </select></div>
          </div>
          <div><label className="form-label">Frequency</label>
            <select value={form.popupFrequency} onChange={e => f('popupFrequency', e.target.value)} className="form-input">
              <option value="always">Every Visit</option>
              <option value="once_per_session">Once per Session</option>
              <option value="once_per_day">Once per Day</option>
            </select></div>
        </div>
      )}

      {/* Targeting (product/category page banners) */}
      {isTargeted && (
        <div className="bg-blue-50 rounded-xl p-4 space-y-3 border border-blue-100">
          <label className="text-blue-800 text-xs font-bold uppercase tracking-wide">🎯 Targeting (comma-separated slugs)</label>
          {type === 'category_page' && (
            <div><label className="form-label">Category Slugs</label>
              <input value={form.targetCategories} onChange={e => f('targetCategories', e.target.value)} className="form-input" placeholder="electronics, fashion, phones" /></div>
          )}
          {type === 'product_page' && (
            <div><label className="form-label">Product Slugs (blank = all)</label>
              <input value={form.targetProducts} onChange={e => f('targetProducts', e.target.value)} className="form-input" placeholder="iphone-15, samsung-s24 (blank for all)" /></div>
          )}
        </div>
      )}

      {/* Scheduling */}
      <div className="border border-gray-100 rounded-xl p-4 space-y-3">
        <label className="text-gray-600 text-xs font-bold uppercase tracking-wide">📅 Scheduling (optional)</label>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="form-label">Start Date</label>
            <input type="datetime-local" value={form.startDate} onChange={e => f('startDate', e.target.value)} className="form-input" /></div>
          <div><label className="form-label">End Date</label>
            <input type="datetime-local" value={form.endDate} onChange={e => f('endDate', e.target.value)} className="form-input" /></div>
        </div>
      </div>

      {/* Device & order */}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.showOnDesktop} onChange={e => f('showOnDesktop', e.target.checked)} className="accent-primary" />
          <span className="text-sm text-gray-600">🖥️ Show on Desktop</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.showOnMobile} onChange={e => f('showOnMobile', e.target.checked)} className="accent-primary" />
          <span className="text-sm text-gray-600">📱 Show on Mobile</span>
        </label>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-sm text-gray-600">Sort Order</label>
          <input type="number" value={form.sortOrder} onChange={e => f('sortOrder', Number(e.target.value))} className="form-input w-20 text-sm" />
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.isActive} onChange={e => f('isActive', e.target.checked)} className="accent-primary" />
        <span className="text-sm text-gray-600">Active (visible to customers)</span>
      </label>

      <div className="flex gap-3 pt-2 border-t">
        <button onClick={onSave} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : '💾 Save Banner'}</button>
        <button onClick={onCancel} className="btn-outline">Cancel</button>
      </div>
    </div>
  );
};

/* ── Main AdminBanners ─────────────────────────────────────────── */
export function AdminBanners() {
  const [activeTab, setActiveTab] = useState('running_top');
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, position: 'running_top' });

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/banners/admin/all');
      setBanners(data);
    } catch {
      toast.error('Failed to load banners');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBanners(); }, [fetchBanners]);

  const filtered = banners.filter(b => b.position === activeTab);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, position: activeTab });
    setEditing(null);
    setModal(true);
  };
  const openEdit = (b) => {
    setForm({
      ...EMPTY_FORM, ...b,
      startDate: b.startDate ? new Date(b.startDate).toISOString().slice(0,16) : '',
      endDate: b.endDate ? new Date(b.endDate).toISOString().slice(0,16) : '',
      flashSaleEndTime: b.flashSaleEndTime ? new Date(b.flashSaleEndTime).toISOString().slice(0,16) : '',
      targetCategories: Array.isArray(b.targetCategories) ? b.targetCategories.join(', ') : b.targetCategories || '',
      targetProducts: Array.isArray(b.targetProducts) ? b.targetProducts.join(', ') : b.targetProducts || '',
    });
    setEditing(b);
    setModal(true);
  };

  const save = async () => {
    if (!form.title && !form.runningText) { toast.error('Title or text required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        position: activeTab,
        targetCategories: form.targetCategories ? form.targetCategories.split(',').map(s => s.trim()).filter(Boolean) : [],
        targetProducts: form.targetProducts ? form.targetProducts.split(',').map(s => s.trim()).filter(Boolean) : [],
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        flashSaleEndTime: form.flashSaleEndTime || null,
      };
      if (editing?._id) await API.put(`/banners/${editing._id}`, payload);
      else await API.post('/banners', payload);
      toast.success(editing ? 'Banner updated!' : 'Banner created!');
      setModal(false);
      fetchBanners();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this banner?')) return;
    await API.delete(`/banners/${id}`);
    toast.success('Deleted');
    fetchBanners();
  };

  const toggle = async (b) => {
    await API.put(`/banners/${b._id}`, { ...b, isActive: !b.isActive });
    fetchBanners();
  };

  const currentTab = TABS.find(t => t.id === activeTab);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-gray-900">Banner System</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage all banners, popups, and announcements across your store</p>
        </div>
        <button onClick={openAdd} className="btn-primary text-sm">+ Add {currentTab?.label.split(' ').slice(1).join(' ')}</button>
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1.5 mb-6 bg-gray-50 p-1.5 rounded-2xl">
        {TABS.map(tab => {
          const count = banners.filter(b => b.position === tab.id).length;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${activeTab === tab.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
            >
              <span>{tab.label.split(' ')[0]}</span>
              <span className="hidden sm:inline">{tab.label.split(' ').slice(1).join(' ')}</span>
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab description */}
      <div className="mb-4 p-3 bg-blue-50 rounded-xl text-xs text-blue-700 flex items-center gap-2">
        <span className="text-base">{currentTab?.label.split(' ')[0]}</span>
        <strong>{currentTab?.label.split(' ').slice(1).join(' ')}:</strong> {currentTab?.desc}
      </div>

      {/* Banner grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-48 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-16 text-center">
          <div className="text-5xl mb-3">{currentTab?.label.split(' ')[0]}</div>
          <h3 className="font-semibold text-gray-700 mb-1">No {currentTab?.label.split(' ').slice(1).join(' ')} yet</h3>
          <p className="text-sm text-gray-400 mb-4">{currentTab?.desc}</p>
          <button onClick={openAdd} className="btn-primary text-sm">+ Create First Banner</button>
        </div>
      ) : (
        <div className={`grid gap-4 ${activeTab === 'running_top' ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
          {filtered.sort((a,b) => a.sortOrder - b.sortOrder).map(b => (
            <BannerCard key={b._id} b={b} type={activeTab} onEdit={openEdit} onToggle={toggle} onDelete={del} />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal
          title={editing ? `Edit ${currentTab?.label}` : `New ${currentTab?.label}`}
          onClose={() => setModal(false)}
          wide
        >
          <BannerForm
            form={form} setForm={setForm}
            onSave={save} onCancel={() => setModal(false)}
            saving={saving} type={activeTab}
          />
        </Modal>
      )}
    </div>
  );
}

/* ── AdminReviews (unchanged, kept here) ───────────────────────── */
export function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => { const { data } = await API.get('/reviews/admin/all'); setReviews(data); setLoading(false); };
  useEffect(() => { fetch(); }, []);

  const approve = async (id, current) => {
    await API.put(`/reviews/admin/${id}/approve`, { approved: !current });
    toast.success('Review status updated');
    fetch();
  };

  const del = async (id) => {
    if (!window.confirm('Delete review?')) return;
    await API.delete(`/reviews/admin/${id}`);
    toast.success('Deleted');
    fetch();
  };

  return (
    <div>
      <div className="mb-6"><h2 className="font-display text-xl font-bold text-gray-900">Reviews</h2><p className="text-sm text-gray-500">Moderate customer reviews</p></div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? <div className="p-8 text-center text-gray-400">Loading...</div> : reviews.length === 0 ? <div className="p-12 text-center text-gray-400">No reviews yet</div> : (
          <div className="divide-y divide-gray-100">
            {reviews.map(r => (
              <div key={r._id} className="p-5 flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{r.user?.firstName} {r.user?.lastName}</p>
                      <p className="text-xs text-gray-400">{r.product?.name}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(s => <span key={s} className={`text-sm ${s <= r.rating ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>)}
                    </div>
                  </div>
                  {r.title && <p className="font-semibold text-sm text-gray-700 mt-2">{r.title}</p>}
                  <p className="text-sm text-gray-600 mt-1">{r.comment}</p>
                  <p className="text-xs text-gray-400 mt-2">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <span className={`badge text-xs ${r.isApproved ? 'badge-new' : 'bg-yellow-100 text-yellow-700'}`}>{r.isApproved ? 'Approved' : 'Pending'}</span>
                  <button onClick={() => approve(r._id, r.isApproved)} className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${r.isApproved ? 'text-orange-600 border-orange-200 hover:bg-orange-50' : 'text-green-600 border-green-200 hover:bg-green-50'}`}>{r.isApproved ? 'Unapprove' : 'Approve'}</button>
                  <button onClick={() => del(r._id)} className="text-xs px-2.5 py-1 rounded-lg font-medium border text-red-500 border-red-200 hover:bg-red-50">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminBanners;
