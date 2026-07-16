import React, { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';

/* ── Section Definitions ──────────────────────────────────────── */
const SECTION_DEFS = {
  homepage: [
    { id: 'running_banner',  label: '📢 Running Banner Bar',   desc: 'Scrolling announcement at top of page', icon: '📢' },
    { id: 'hero',            label: '🖼️ Hero Slider',          desc: 'Full-width top image slider', icon: '🖼️' },
    { id: 'categories',      label: '📂 Category Grid',        desc: 'Shop by category tiles', icon: '📂' },
    { id: 'featured',        label: '⭐ Featured Products',    desc: 'Hand-picked product row', icon: '⭐' },
    { id: 'promo',           label: '🎯 Promo Banner',         desc: 'Mid-page promotional strip', icon: '🎯' },
    { id: 'new_arrivals',    label: '🆕 New Arrivals',         desc: 'Latest products carousel', icon: '🆕' },
    { id: 'bestsellers',     label: '🏆 Best Sellers',         desc: 'Top-selling products row', icon: '🏆' },
    { id: 'deals',           label: '⚡ Flash Sale Strip',     desc: 'Countdown flash sale section', icon: '⚡' },
    { id: 'newsletter',      label: '📧 Newsletter Bar',       desc: 'Email signup strip', icon: '📧' },
    { id: 'testimonials',    label: '💬 Testimonials',         desc: 'Customer review quotes', icon: '💬' },
    { id: 'brands',          label: '🏷️ Brand Logos',          desc: 'Trusted brands marquee', icon: '🏷️' },
    { id: 'gift_cards',      label: '🎁 Gift Cards',           desc: 'Gift card promotion block', icon: '🎁' },
    { id: 'seasonal',        label: '🌸 Seasonal Banner',      desc: 'Seasonal/holiday promotion', icon: '🌸' },
    { id: 'recently',        label: '🕐 Recently Viewed',      desc: 'Personalized product trail', icon: '🕐' },
    { id: 'popup_banner',    label: '💬 Popup Banner',         desc: 'Entry popup display control', icon: '💬' },
  ],
  product_page: [
    { id: 'breadcrumb',      label: '🔗 Breadcrumb',          desc: 'Navigation breadcrumbs', icon: '🔗' },
    { id: 'gallery',         label: '🖼️ Product Gallery',      desc: 'Image gallery / zoom', icon: '🖼️' },
    { id: 'product_info',    label: '📋 Product Info',         desc: 'Title, price, variants, Add to Cart', icon: '📋' },
    { id: 'product_banner',  label: '📢 Product Banner',       desc: 'Custom banner below product info', icon: '📢' },
    { id: 'description',     label: '📝 Description',          desc: 'Full product description tab', icon: '📝' },
    { id: 'reviews',         label: '⭐ Customer Reviews',     desc: 'Review list and form', icon: '⭐' },
    { id: 'shipping_info',   label: '🚚 Shipping Info',        desc: 'Delivery & return info block', icon: '🚚' },
    { id: 'related',         label: '🔁 Related Products',     desc: 'You may also like section', icon: '🔁' },
    { id: 'recently_viewed', label: '🕐 Recently Viewed',      desc: 'Recently viewed products trail', icon: '🕐' },
  ],
  category_page: [
    { id: 'category_banner', label: '🖼️ Category Banner',      desc: 'Top banner for category page', icon: '🖼️' },
    { id: 'filters_sidebar', label: '🔽 Filter Sidebar',       desc: 'Price, brand, rating filters', icon: '🔽' },
    { id: 'sort_bar',        label: '↕️ Sort Bar',             desc: 'Sort & view options bar', icon: '↕️' },
    { id: 'product_grid',    label: '📦 Product Grid',         desc: 'Main product listing grid', icon: '📦' },
    { id: 'pagination',      label: '📄 Pagination',           desc: 'Page navigation controls', icon: '📄' },
    { id: 'promo_strip',     label: '🎯 Mid-Category Banner',  desc: 'Inline promo banner mid-page', icon: '🎯' },
  ],
  checkout: [
    { id: 'order_summary',   label: '🛒 Order Summary',        desc: 'Cart items and totals sidebar', icon: '🛒' },
    { id: 'delivery_form',   label: '🚚 Delivery Info',        desc: 'Shipping address form', icon: '🚚' },
    { id: 'payment',         label: '💳 Payment Section',      desc: 'Payment method selection', icon: '💳' },
    { id: 'coupon',          label: '🏷️ Coupon Code',          desc: 'Discount coupon input', icon: '🏷️' },
    { id: 'trust_badges',    label: '🛡️ Trust Badges',         desc: 'Security & guarantee icons', icon: '🛡️' },
    { id: 'checkout_banner', label: '📢 Checkout Banner',      desc: 'Custom banner during checkout', icon: '📢' },
  ],
  header: [
    { id: 'top_bar',         label: '📢 Top Announcement Bar', desc: 'Slim colored bar above header', icon: '📢' },
    { id: 'logo',            label: '🏷️ Logo / Brand',         desc: 'Store logo or name', icon: '🏷️' },
    { id: 'search_bar',      label: '🔍 Search Bar',           desc: 'Product search input', icon: '🔍' },
    { id: 'nav_links',       label: '🔗 Navigation Links',     desc: 'Main menu categories', icon: '🔗' },
    { id: 'cart_icon',       label: '🛒 Cart Icon',            desc: 'Shopping cart button', icon: '🛒' },
    { id: 'wishlist_icon',   label: '❤️ Wishlist Icon',         desc: 'Saved items button', icon: '❤️' },
    { id: 'user_menu',       label: '👤 User Account Menu',    desc: 'Login / account dropdown', icon: '👤' },
    { id: 'whatsapp_btn',    label: '💚 WhatsApp Button',      desc: 'WhatsApp floating contact', icon: '💚' },
  ],
  footer: [
    { id: 'logo_tagline',    label: '🏷️ Logo & Tagline',       desc: 'Brand identity block', icon: '🏷️' },
    { id: 'quick_links',     label: '🔗 Quick Links',          desc: 'Navigation shortcut column', icon: '🔗' },
    { id: 'contact_info',    label: '📞 Contact Info',         desc: 'Address, phone, email block', icon: '📞' },
    { id: 'social_links',    label: '📱 Social Media Links',   desc: 'Social media icons row', icon: '📱' },
    { id: 'newsletter_foot', label: '📧 Newsletter Signup',    desc: 'Email subscription strip', icon: '📧' },
    { id: 'payment_icons',   label: '💳 Payment Icons',        desc: 'Accepted payment method logos', icon: '💳' },
    { id: 'footer_links',    label: '📄 Legal Links',          desc: 'Terms, Privacy, etc.', icon: '📄' },
    { id: 'copyright',       label: '©️ Copyright Bar',         desc: 'Bottom copyright line', icon: '©️' },
  ],
};

const PAGE_TABS = [
  { id: 'homepage',      label: '🏠 Homepage',      color: 'blue' },
  { id: 'product_page',  label: '📦 Product Page',  color: 'green' },
  { id: 'category_page', label: '📂 Category Page', color: 'purple' },
  { id: 'checkout',      label: '💳 Checkout',      color: 'orange' },
  { id: 'header',        label: '🔝 Header',        color: 'indigo' },
  { id: 'footer',        label: '🔽 Footer',        color: 'gray' },
];

const COLOR_MAP = {
  blue: 'bg-blue-500', green: 'bg-green-500', purple: 'bg-purple-500',
  orange: 'bg-orange-500', indigo: 'bg-indigo-500', gray: 'bg-gray-500',
};

function initLayout(pageId) {
  return (SECTION_DEFS[pageId] || []).map((s, i) => ({ ...s, enabled: true, order: i }));
}

/* ── Reusable Section Modal ───────────────────────────────────── */
const SavedSectionsModal = ({ sections, onUse, onDelete, onClose }) => (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <h2 className="font-bold text-gray-900">📚 Reusable Sections</h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">×</button>
      </div>
      <div className="p-4 max-h-[60vh] overflow-y-auto">
        {sections.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <div className="text-4xl mb-2">📭</div>
            <p className="text-sm">No saved sections yet. Save a section configuration to reuse it across pages.</p>
          </div>
        ) : sections.map((s, i) => (
          <div key={i} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl mb-2">
            <div className="flex-1">
              <p className="font-semibold text-sm text-gray-800">{s.name}</p>
              <p className="text-xs text-gray-400">{s.pageId} • {s.sections?.length} sections</p>
            </div>
            <button onClick={() => onUse(s)} className="text-xs btn-outline px-2 py-1">Use</button>
            <button onClick={() => onDelete(i)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1">Delete</button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ── Section Row ──────────────────────────────────────────────── */
const SectionRow = ({ section, idx, total, onToggle, onMoveUp, onMoveDown, onDragStart, onDragOver, onDrop, onDragEnd, dragging, dragOver }) => (
  <div
    draggable
    onDragStart={e => onDragStart(e, section.id)}
    onDragOver={e => onDragOver(e, section.id)}
    onDrop={e => onDrop(e, section.id)}
    onDragEnd={onDragEnd}
    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-grab active:cursor-grabbing select-none ${
      dragOver === section.id ? 'border-primary bg-primary/5 scale-[1.01] shadow-md' :
      dragging === section.id ? 'border-gray-300 opacity-30 scale-95' :
      'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
    } ${!section.enabled ? 'opacity-40' : ''}`}
  >
    <div className="text-gray-300 text-xl select-none">⠿</div>
    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-bold flex-shrink-0">{idx + 1}</div>
    <span className="text-lg">{section.icon}</span>
    <div className="flex-1 min-w-0">
      <div className={`font-semibold text-sm leading-tight ${section.enabled ? 'text-gray-900' : 'text-gray-400'}`}>{section.label}</div>
      <div className="text-xs text-gray-400 truncate">{section.desc}</div>
    </div>
    <div className="flex flex-col gap-0.5 flex-shrink-0">
      <button onClick={() => onMoveUp(section.id)} disabled={idx === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs px-1 leading-none">▲</button>
      <button onClick={() => onMoveDown(section.id)} disabled={idx === total - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs px-1 leading-none">▼</button>
    </div>
    <button
      onClick={() => onToggle(section.id)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${section.enabled ? 'bg-green-500' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${section.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

/* ── Main Layout Editor ───────────────────────────────────────── */
export default function LayoutEditor() {
  const { refreshTheme } = useTheme();
  const [activePage, setActivePage] = useState('homepage');
  const [layouts, setLayouts] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [savedSections, setSavedSections] = useState(() => {
    try { return JSON.parse(localStorage.getItem('storekit_saved_sections') || '[]'); } catch { return []; }
  });
  const [showSaved, setShowSaved] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveAs, setShowSaveAs] = useState(false);

  /* ── Load layouts from Settings API ────────────────────── */
  useEffect(() => {
    API.get('/settings', { cacheTTL: 5 * 60 * 1000 })
      .then(r => {
        const saved = r.data?.layout_builder || {};
        const merged = {};
        PAGE_TABS.forEach(page => {
          const defs = SECTION_DEFS[page.id] || [];
          const savedPage = saved[page.id];
          if (savedPage && Array.isArray(savedPage)) {
            const savedIds = savedPage.map(s => s.id);
            const missing = defs.filter(s => !savedIds.includes(s.id))
              .map((s, i) => ({ ...s, enabled: false, order: savedPage.length + i }));
            merged[page.id] = [...savedPage, ...missing].map(s => {
              const meta = defs.find(d => d.id === s.id);
              return { ...s, label: meta?.label || s.label, desc: meta?.desc || s.desc, icon: meta?.icon || s.icon || '📄' };
            });
          } else {
            merged[page.id] = initLayout(page.id);
          }
        });
        setLayouts(merged);
      })
      .catch(() => {
        const init = {};
        PAGE_TABS.forEach(p => { init[p.id] = initLayout(p.id); });
        setLayouts(init);
      })
      .finally(() => setLoading(false));
  }, []);

  const currentLayout = (layouts[activePage] || initLayout(activePage))
    .slice().sort((a, b) => a.order - b.order);

  const setPageLayout = useCallback((pageId, updater) => {
    setLayouts(prev => ({ ...prev, [pageId]: typeof updater === 'function' ? updater(prev[pageId] || initLayout(pageId)) : updater }));
  }, []);

  /* ── Save ───────────────────────────────────────────────── */
  const save = async () => {
    setSaving(true);
    try {
      const toSave = {};
      PAGE_TABS.forEach(p => {
        toSave[p.id] = (layouts[p.id] || initLayout(p.id)).map(({ id, enabled, order }) => ({ id, enabled, order }));
      });
      const newsletterSection = toSave.homepage?.find(section => section.id === 'newsletter');
      const { data } = await API.put('/settings', {
        layout_builder: toSave,
        ...(newsletterSection ? { enableNewsletter: newsletterSection.enabled } : {}),
      });
      if (!data?.settings?.layout_builder) {
        throw new Error('The server did not persist the layout configuration');
      }
      // Keep the storefront settings context in sync when the admin opens the
      // customer side in the same browser session.
      await refreshTheme();
      toast.success('✅ All layouts saved!');
    } catch { toast.error('Failed to save layouts'); }
    finally { setSaving(false); }
  };

  /* ── Toggle ─────────────────────────────────────────────── */
  const toggle = (id) => {
    setPageLayout(activePage, prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  /* ── Move up/down ───────────────────────────────────────── */
  const moveUp = (id) => {
    setPageLayout(activePage, prev => {
      const arr = [...prev].sort((a, b) => a.order - b.order);
      const idx = arr.findIndex(s => s.id === id);
      if (idx === 0) return prev;
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr.map((s, i) => ({ ...s, order: i }));
    });
  };
  const moveDown = (id) => {
    setPageLayout(activePage, prev => {
      const arr = [...prev].sort((a, b) => a.order - b.order);
      const idx = arr.findIndex(s => s.id === id);
      if (idx === arr.length - 1) return prev;
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr.map((s, i) => ({ ...s, order: i }));
    });
  };

  /* ── Drag-and-drop ──────────────────────────────────────── */
  const onDragStart = (e, id) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (e, id) => { e.preventDefault(); setDragOver(id); };
  const onDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return; }
    setPageLayout(activePage, prev => {
      const arr = [...prev].sort((a, b) => a.order - b.order);
      const fi = arr.findIndex(s => s.id === dragging);
      const ti = arr.findIndex(s => s.id === targetId);
      const [item] = arr.splice(fi, 1);
      arr.splice(ti, 0, item);
      return arr.map((s, i) => ({ ...s, order: i }));
    });
    setDragging(null); setDragOver(null);
  };
  const onDragEnd = () => { setDragging(null); setDragOver(null); };

  /* ── Reset to default ───────────────────────────────────── */
  const resetPage = () => {
    if (!window.confirm(`Reset ${PAGE_TABS.find(p => p.id === activePage)?.label} layout to default?`)) return;
    setPageLayout(activePage, initLayout(activePage));
    toast.success('Reset to default');
  };

  /* ── Enable/disable all ─────────────────────────────────── */
  const enableAll = () => setPageLayout(activePage, prev => prev.map(s => ({ ...s, enabled: true })));
  const disableAll = () => setPageLayout(activePage, prev => prev.map(s => ({ ...s, enabled: false })));

  /* ── Reusable sections ──────────────────────────────────── */
  const saveAs = () => {
    if (!saveAsName.trim()) { toast.error('Enter a name'); return; }
    const entry = {
      name: saveAsName.trim(),
      pageId: activePage,
      sections: currentLayout.map(({ id, enabled, order }) => ({ id, enabled, order })),
    };
    const updated = [...savedSections, entry];
    setSavedSections(updated);
    localStorage.setItem('storekit_saved_sections', JSON.stringify(updated));
    setSaveAsName('');
    setShowSaveAs(false);
    toast.success('Section saved to library!');
  };

  const useSavedSection = (entry) => {
    if (entry.pageId !== activePage) {
      toast.error(`This section was saved for "${entry.pageId}" page, not "${activePage}"`);
      return;
    }
    const defs = SECTION_DEFS[activePage] || [];
    const merged = entry.sections.map(s => {
      const meta = defs.find(d => d.id === s.id);
      return { ...s, label: meta?.label || s.id, desc: meta?.desc || '', icon: meta?.icon || '📄' };
    });
    setPageLayout(activePage, merged);
    setShowSaved(false);
    toast.success('Section layout applied!');
  };

  const deleteSaved = (idx) => {
    const updated = savedSections.filter((_, i) => i !== idx);
    setSavedSections(updated);
    localStorage.setItem('storekit_saved_sections', JSON.stringify(updated));
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">Loading layouts…</div>;

  const enabledCount = currentLayout.filter(s => s.enabled).length;
  const totalCount = currentLayout.length;
  const activePageMeta = PAGE_TABS.find(p => p.id === activePage);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">🏗️ Layout Builder</h2>
        <p className="text-sm text-gray-500 mt-1">Drag, reorder, and toggle sections across every page of your store.</p>
      </div>

      {/* Page tabs */}
      <div className="flex flex-wrap gap-1.5 mb-6 bg-gray-50 p-1.5 rounded-2xl">
        {PAGE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActivePage(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${activePage === tab.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span className={`w-2 h-2 rounded-full ${activePage === tab.id ? COLOR_MAP[tab.color] : 'bg-gray-300'}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between mb-4 bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${COLOR_MAP[activePageMeta?.color || 'gray']} flex items-center justify-center text-white text-sm`}>
            {activePageMeta?.label.split(' ')[0]}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{activePageMeta?.label.split(' ').slice(1).join(' ')} Layout</p>
            <p className="text-xs text-gray-400">{enabledCount}/{totalCount} sections visible</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-24 bg-gray-100 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${COLOR_MAP[activePageMeta?.color || 'gray']}`}
            style={{ width: `${Math.round((enabledCount / totalCount) * 100)}%` }} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={enableAll} className="text-xs text-green-600 border border-green-200 hover:bg-green-50 px-3 py-1.5 rounded-lg font-medium transition-colors">✅ Enable All</button>
        <button onClick={disableAll} className="text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-medium transition-colors">🚫 Disable All</button>
        <button onClick={resetPage} className="text-xs text-orange-500 border border-orange-200 hover:bg-orange-50 px-3 py-1.5 rounded-lg font-medium transition-colors">↺ Reset Page</button>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowSaved(true)} className="text-xs text-purple-600 border border-purple-200 hover:bg-purple-50 px-3 py-1.5 rounded-lg font-medium transition-colors">📚 Saved ({savedSections.length})</button>
          <button onClick={() => setShowSaveAs(true)} className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium transition-colors">💾 Save As</button>
        </div>
      </div>

      {/* Save as name input */}
      {showSaveAs && (
        <div className="mb-4 flex gap-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <input
            value={saveAsName}
            onChange={e => setSaveAsName(e.target.value)}
            placeholder="Name for this layout (e.g. Holiday Homepage)"
            className="form-input flex-1 text-sm"
            onKeyDown={e => e.key === 'Enter' && saveAs()}
          />
          <button onClick={saveAs} className="btn-primary text-sm px-4">Save</button>
          <button onClick={() => setShowSaveAs(false)} className="btn-outline text-sm px-3">Cancel</button>
        </div>
      )}

      {/* Section list */}
      <div className="space-y-2 mb-6">
        {currentLayout.map((section, idx) => (
          <SectionRow
            key={section.id}
            section={section}
            idx={idx}
            total={currentLayout.length}
            onToggle={toggle}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            dragging={dragging}
            dragOver={dragOver}
          />
        ))}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 sticky bottom-4">
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary px-8 py-3 text-sm font-semibold shadow-lg"
        >
          {saving ? '⏳ Saving…' : '💾 Save All Layouts'}
        </button>
        <p className="text-xs text-gray-400">Changes apply after the storefront refreshes</p>
      </div>

      <div className="mt-4 p-3 bg-amber-50 rounded-xl text-xs text-amber-800 border border-amber-100">
        💡 <strong>Tip:</strong> Sections toggled OFF are hidden from customers but preserved. Drag rows to reorder.
        Product/Category page banners are set up under <strong>Banners → Product/Category Page Banners</strong>.
      </div>

      {/* Saved sections modal */}
      {showSaved && (
        <SavedSectionsModal
          sections={savedSections}
          onUse={useSavedSection}
          onDelete={deleteSaved}
          onClose={() => setShowSaved(false)}
        />
      )}
    </div>
  );
}
