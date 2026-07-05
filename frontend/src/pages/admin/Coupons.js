import React, { useEffect, useState, useCallback } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

// ─── Modal shell (matches Deals/GiftCards pattern) ─────────────────────────────
const Modal = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
        <div>
          <h2 className="font-display font-bold text-xl text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-gray-500 text-sm flex-shrink-0">✕</button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

// ─── Toggle (matches Deals pattern) ────────────────────────────────────────────
const Toggle = ({ value, onChange, label, hint }) => (
  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
    <div
      className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${value ? 'bg-green-500' : 'bg-gray-200'}`}
      onClick={() => onChange(!value)}
    >
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </div>
    <div>
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  </label>
);

// ─── Cascading eligibility picker: Brand → Category → Subcategory → Products ───
// Same logic as before, reskinned to match the admin design system.
const EligibilityPicker = ({ form, setForm, brandOptions }) => {
  const [brand, setBrand]             = useState(form.applicableBrands?.[0] || '');
  const [category, setCategory]       = useState(form.applicableCategories?.[0] || '');
  const [subCategory, setSubCategory] = useState('');
  const [categoryOptions, setCategoryOptions]       = useState([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState([]);
  const [products, setProducts]                     = useState([]);
  const [loading, setLoading]                       = useState(false);

  // Re-seed when a different coupon is opened
  useEffect(() => {
    setBrand(form.applicableBrands?.[0] || '');
    setCategory(form.applicableCategories?.[0] || '');
    setSubCategory('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form._id]);

  const selectedProductIds = form.applicableProducts || [];
  const selectedProducts   = form.selectedProductDetails || [];

  // Refetch cascade whenever filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (brand)       params.set('brand', brand);
    if (category)    params.set('category', category);
    if (subCategory) params.set('subCategory', subCategory);
    API.get(`/products/admin/lookup?${params.toString()}`)
      .then(({ data }) => {
        if (cancelled) return;
        setCategoryOptions(data.categories || []);
        setSubCategoryOptions(data.subCategories || []);
        setProducts(data.products || []);
      })
      .catch(() => { if (!cancelled) { setCategoryOptions([]); setSubCategoryOptions([]); setProducts([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brand, category, subCategory]);

  const chooseBrand = (val) => {
    setBrand(val); setCategory(''); setSubCategory('');
    setForm(p => ({ ...p, applicableBrands: val ? [val] : [] }));
  };
  const chooseCategory = (val) => {
    setCategory(val); setSubCategory('');
    setForm(p => ({ ...p, applicableCategories: val ? [val] : [] }));
  };
  const chooseSubCategory = (val) => {
    setSubCategory(val);
    setForm(p => ({ ...p, applicableCategories: val ? [val] : (category ? [category] : []) }));
  };

  const toggleProduct = (product) => {
    const id = product._id;
    const isSelected = selectedProductIds.includes(id);
    setForm(p => {
      const nextIds     = isSelected ? p.applicableProducts.filter(x => x !== id) : [...(p.applicableProducts || []), id];
      const nextDetails = isSelected
        ? (p.selectedProductDetails || []).filter(x => x._id !== id)
        : [...(p.selectedProductDetails || []), { _id: id, name: product.name, thumbnail: product.thumbnail }];
      return { ...p, applicableProducts: nextIds, selectedProductDetails: nextDetails };
    });
  };

  const removeSelectedProduct = (id) => {
    setForm(p => ({
      ...p,
      applicableProducts:    (p.applicableProducts    || []).filter(x => x !== id),
      selectedProductDetails: (p.selectedProductDetails || []).filter(x => x._id !== id),
    }));
  };

  return (
    <div className="space-y-4">
      {/* Brand → Category → Subcategory cascade */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="form-label">Brand</label>
          <select className="form-input" value={brand} onChange={e => chooseBrand(e.target.value)}>
            <option value="">All brands</option>
            {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Category</label>
          <select
            className="form-input"
            value={category}
            disabled={categoryOptions.length === 0}
            onChange={e => chooseCategory(e.target.value)}
          >
            <option value="">{categoryOptions.length === 0 ? 'Pick a brand first' : 'All categories'}</option>
            {categoryOptions.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Subcategory</label>
          <select
            className="form-input"
            value={subCategory}
            disabled={subCategoryOptions.length === 0}
            onChange={e => chooseSubCategory(e.target.value)}
          >
            <option value="">{subCategoryOptions.length === 0 ? 'Pick a category first' : 'All subcategories'}</option>
            {subCategoryOptions.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Product checklist filtered by the cascade above */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="form-label mb-0">Products</label>
          <span className="text-xs text-gray-400">{loading ? 'Loading…' : `${products.length} match${products.length !== 1 ? 'es' : ''}`}</span>
        </div>
        <div className="border border-gray-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-gray-50">
          {loading ? (
            <div className="p-6 text-center text-xs text-gray-400">Loading products…</div>
          ) : products.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">No products match this filter</div>
          ) : products.map(p => {
            const checked = selectedProductIds.includes(p._id);
            return (
              <button
                key={p._id}
                type="button"
                onClick={() => toggleProduct(p)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${checked ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                  {checked && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                </div>
                {p.thumbnail && <img src={p.thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">Rs. {(p.salePrice || p.price)?.toLocaleString()}</p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-1">Check specific products to restrict the coupon to exactly those items. Leave all unchecked to apply to every product matching the filters above.</p>
      </div>

      {/* Selected product chips */}
      {selectedProducts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedProducts.map(p => (
            <span key={p._id} className="inline-flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-200 text-blue-700 font-medium px-2.5 py-1 rounded-full">
              {p.thumbnail && <img src={p.thumbnail} alt="" className="w-4 h-4 rounded object-cover" />}
              {p.name}
              <button type="button" onClick={() => removeSelectedProduct(p._id)} className="text-blue-400 hover:text-red-500 leading-none">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Excluded products picker ───────────────────────────────────────────────
// Lets admin search and blacklist specific products from a coupon even when
// those products would otherwise match the brand/category scope.
const ExcludedProductsPicker = ({ form, setForm, brandOptions }) => {
  const [search, setSearch]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const excludedIds     = form.excludedProducts     || [];
  const excludedDetails = form.excludedProductDetails || [];

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await API.get(`/products/admin/lookup?search=${encodeURIComponent(search)}`);
        setResults(data.products || []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const toggleExcluded = (product) => {
    const id = product._id;
    const isExcluded = excludedIds.includes(id);
    setForm(p => ({
      ...p,
      excludedProducts:    isExcluded ? p.excludedProducts.filter(x => x !== id) : [...(p.excludedProducts || []), id],
      excludedProductDetails: isExcluded
        ? (p.excludedProductDetails || []).filter(x => x._id !== id)
        : [...(p.excludedProductDetails || []), { _id: id, name: product.name, thumbnail: product.thumbnail }],
    }));
  };

  const removeExcluded = (id) => {
    setForm(p => ({
      ...p,
      excludedProducts:       (p.excludedProducts       || []).filter(x => x !== id),
      excludedProductDetails: (p.excludedProductDetails || []).filter(x => x._id !== id),
    }));
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          className="form-input text-sm w-full"
          placeholder="Search products to exclude…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {loading && <span className="absolute right-3 top-2.5 text-xs text-gray-400">Loading…</span>}
      </div>

      {results.length > 0 && (
        <div className="border border-gray-200 rounded-xl max-h-44 overflow-y-auto divide-y divide-gray-50">
          {results.map(p => {
            const checked = excludedIds.includes(p._id);
            return (
              <button
                key={p._id}
                type="button"
                onClick={() => toggleExcluded(p)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${checked ? 'bg-red-50' : 'hover:bg-gray-50'}`}
              >
                <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${checked ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                  {checked && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                </div>
                {p.thumbnail && <img src={p.thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">Rs. {(p.salePrice || p.price)?.toLocaleString()}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {excludedDetails.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {excludedDetails.map(p => (
            <span key={p._id} className="inline-flex items-center gap-1.5 text-xs bg-red-50 border border-red-200 text-red-700 font-medium px-2.5 py-1 rounded-full">
              {p.thumbnail && <img src={p.thumbnail} alt="" className="w-4 h-4 rounded object-cover" />}
              🚫 {p.name}
              <button type="button" onClick={() => removeExcluded(p._id)} className="text-red-400 hover:text-red-600 leading-none">✕</button>
            </span>
          ))}
        </div>
      )}

      {excludedDetails.length === 0 && (
        <p className="text-xs text-gray-400">No products excluded. Search above to block specific items from this coupon.</p>
      )}
    </div>
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const EMPTY = {
  code: '', description: '', type: 'percentage', value: '',
  minOrderAmount: 0, maxDiscount: '', usageLimit: '', userLimit: 1,
  validFrom:  new Date().toISOString().slice(0, 10),
  validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  isActive: true, isNewUserOnly: false, excludeSaleItems: false,
  maxDiscountPercentOfProfit: 0,
  applicableCategories: [], applicableProducts: [], applicableBrands: [],
  excludedProducts: [],
  selectedProductDetails: [],
  excludedProductDetails: [],
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' });
}
function isExpired(d)  { return d && new Date(d) < new Date(); }
function isUpcoming(d) { return d && new Date(d) > new Date(); }

const StatusBadge = ({ c }) => {
  if (!c.isActive)             return <span className="badge bg-gray-100 text-gray-500 text-xs">Inactive</span>;
  if (isExpired(c.validUntil)) return <span className="badge bg-red-100 text-red-600 text-xs">Expired</span>;
  if (isUpcoming(c.validFrom)) return <span className="badge bg-yellow-100 text-yellow-700 text-xs">Upcoming</span>;
  return                              <span className="badge bg-green-100 text-green-700 text-xs font-bold">● Active</span>;
};

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdminCoupons() {
  const [coupons, setCoupons]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null); // null | 'add' | 'edit'
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [editId, setEditId]     = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');
  const [brandOptions, setBrandOptions] = useState([]);

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/coupons');
      setCoupons(data);
    } catch { toast.error('Failed to load coupons'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    API.get('/products/admin/brands').then(r => setBrandOptions(r.data)).catch(() => {});
  }, []);

  // ── Derived list ──────────────────────────────────────────────────────────
  const filtered = coupons.filter(c => {
    const matchSearch = !search || c.code.includes(search.toUpperCase()) || (c.description || '').toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'active')   return c.isActive && !isExpired(c.validUntil);
    if (filter === 'expired')  return isExpired(c.validUntil);
    if (filter === 'inactive') return !c.isActive;
    return true;
  });

  //const now = new Date();
  const activeCount  = coupons.filter(c => c.isActive && !isExpired(c.validUntil)).length;
  const expiredCount = coupons.filter(c => isExpired(c.validUntil)).length;

  // ── Open forms ────────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY });
    setEditId(null);
    setModal('add');
  };

  const openEdit = async (c) => {
    const base = { ...EMPTY, ...c, validFrom: c.validFrom?.slice(0, 10), validUntil: c.validUntil?.slice(0, 10) };
    setForm(base);
    setEditId(c._id);
    setModal('edit');
    // Resolve product names for applicable + excluded product chips
    const loadProductNames = async (ids, key) => {
      if (!ids?.length) return;
      try {
        const { data } = await API.get(`/products/admin/lookup?ids=${ids.join(',')}`);
        setForm(p => p && p._id === c._id
          ? { ...p, [key]: (data.products || []).map(pr => ({ _id: pr._id, name: pr.name, thumbnail: pr.thumbnail })) }
          : p
        );
      } catch {}
    };
    await Promise.all([
      loadProductNames(c.applicableProducts, 'selectedProductDetails'),
      loadProductNames(c.excludedProducts,   'excludedProductDetails'),
    ]);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.code.trim())  return toast.error('Code is required');
    if (!form.value)        return toast.error('Discount value is required');
    if (!form.validUntil)   return toast.error('Expiry date is required');

    setSaving(true);
    try {
      const payload = {
        ...form,
        code:                       form.code.toUpperCase().trim(),
        value:                      Number(form.value),
        minOrderAmount:             Number(form.minOrderAmount) || 0,
        maxDiscount:                form.maxDiscount ? Number(form.maxDiscount) : undefined,
        usageLimit:                 form.usageLimit  ? Number(form.usageLimit)  : undefined,
        userLimit:                  Number(form.userLimit) || 1,
        maxDiscountPercentOfProfit: Number(form.maxDiscountPercentOfProfit) || 0,
        applicableCategories:       form.applicableCategories || [],
        applicableBrands:           form.applicableBrands || [],
        applicableProducts:         form.applicableProducts || [],
        excludedProducts:           form.excludedProducts || [],
      };
      delete payload.selectedProductDetails;  // frontend-only display cache
      delete payload.excludedProductDetails;  // frontend-only display cache

      if (modal === 'edit' && editId) {
        await API.put(`/coupons/${editId}`, payload);
        toast.success('Coupon updated ✓');
      } else {
        await API.post('/coupons', payload);
        toast.success('Coupon created ✓');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this coupon? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await API.delete(`/coupons/${id}`);
      toast.success('Deleted');
      load();
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  // ── Toggle active ─────────────────────────────────────────────────────────
  const toggleActive = async (c) => {
    try {
      await API.put(`/coupons/${c._id}`, { ...c, isActive: !c.isActive });
      load();
    } catch { toast.error('Update failed'); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Coupons</h2>
          <p className="text-sm text-gray-500">Create and manage discount codes for your store</p>
        </div>
        <button onClick={openAdd} className="btn-primary text-sm">+ New Coupon</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total',   value: coupons.length, icon: '🏷️', color: 'bg-blue-50 text-blue-700' },
          { label: 'Active',  value: activeCount,    icon: '✅',  color: 'bg-green-50 text-green-700' },
          { label: 'Expired', value: expiredCount,   icon: '⏰',  color: 'bg-red-50 text-red-600' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl p-4 ${s.color} flex items-center gap-3`}>
            <span className="text-2xl">{s.icon}</span>
            <div>
              <p className="text-2xl font-black leading-none">{s.value}</p>
              <p className="text-xs font-semibold mt-0.5 opacity-70">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          className="form-input text-sm w-48 min-h-0 py-2"
          placeholder="Search code or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {['all', 'active', 'expired', 'inactive'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors capitalize ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {f}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} coupon{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <p className="text-5xl mb-4">🏷️</p>
          <p className="text-lg font-bold text-gray-700 mb-1">No coupons found</p>
          <p className="text-sm text-gray-400 mb-5">Create your first coupon to get started</p>
          <button onClick={openAdd} className="btn-primary text-sm">+ New Coupon</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c._id} className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-4 items-start">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-gray-900 text-base tracking-wide">{c.code}</span>
                  <StatusBadge c={c} />
                  {c.isNewUserOnly    && <span className="badge bg-purple-100 text-purple-700 text-xs">New users</span>}
                  {c.excludeSaleItems && <span className="badge bg-orange-100 text-orange-700 text-xs">No sale items</span>}
                  {c.maxDiscountPercentOfProfit > 0 && <span className="badge bg-yellow-100 text-yellow-700 text-xs">Profit cap {c.maxDiscountPercentOfProfit}%</span>}
                </div>
                {c.description && <p className="text-xs text-gray-500 mb-2">{c.description}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>
                    {c.type === 'percentage'
                      ? `${c.value}% off${c.maxDiscount ? ` (max Rs. ${c.maxDiscount.toLocaleString()})` : ''}`
                      : `Rs. ${c.value?.toLocaleString()} off`}
                  </span>
                  {c.minOrderAmount > 0 && <span>Min: Rs. {c.minOrderAmount.toLocaleString()}</span>}
                  <span>Until {fmtDate(c.validUntil)}</span>
                  <span>Used: {c.usedCount || 0}{c.usageLimit ? `/${c.usageLimit}` : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleActive(c)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${c.isActive ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                >
                  {c.isActive ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => openEdit(c)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold">
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(c._id)}
                  disabled={deleting === c._id}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 font-semibold"
                >
                  {deleting === c._id ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <Modal
          title={modal === 'edit' ? '✏️ Edit Coupon' : '🏷️ New Coupon'}
          subtitle="All discounts are enforced server-side at checkout"
          onClose={() => setModal(null)}
        >
          <div className="space-y-5">

            {/* ── Basic Info ───────────────────────────────────── */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Coupon Code *</label>
                <input
                  className="form-input font-mono uppercase"
                  value={form.code}
                  onChange={e => upd('code', e.target.value.toUpperCase())}
                  placeholder="SAVE20"
                />
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="form-input" value={form.isActive ? 'active' : 'inactive'} onChange={e => upd('isActive', e.target.value === 'active')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description || ''} onChange={e => upd('description', e.target.value)} placeholder="e.g. 20% off sitewide for new customers" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Valid From *</label>
                <input className="form-input" type="date" value={form.validFrom?.slice(0, 10)} onChange={e => upd('validFrom', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Valid Until *</label>
                <input className="form-input" type="date" value={form.validUntil?.slice(0, 10)} onChange={e => upd('validUntil', e.target.value)} />
                <div className="flex gap-2 mt-1.5">
                  {[
                    { label: '+7 days',  fn: () => { const d = new Date(); d.setDate(d.getDate() + 7);  upd('validUntil', d.toISOString().slice(0, 10)); } },
                    { label: '+30 days', fn: () => { const d = new Date(); d.setDate(d.getDate() + 30); upd('validUntil', d.toISOString().slice(0, 10)); } },
                    { label: '+90 days', fn: () => { const d = new Date(); d.setDate(d.getDate() + 90); upd('validUntil', d.toISOString().slice(0, 10)); } },
                  ].map(btn => (
                    <button key={btn.label} type="button" onClick={btn.fn} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">{btn.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Discount Value ───────────────────────────────── */}
            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Discount</p>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Type *</label>
                  <select className="form-input" value={form.type} onChange={e => upd('type', e.target.value)}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (Rs.)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">{form.type === 'percentage' ? 'Discount (%)' : 'Discount (Rs.)'} *</label>
                  <input className="form-input" type="number" min="0" value={form.value} onChange={e => upd('value', e.target.value)} placeholder={form.type === 'percentage' ? '20' : '500'} />
                </div>
                {form.type === 'percentage' && (
                  <div>
                    <label className="form-label">Max Cap (Rs.)</label>
                    <input className="form-input" type="number" min="0" value={form.maxDiscount || ''} onChange={e => upd('maxDiscount', e.target.value)} placeholder="No cap" />
                  </div>
                )}
              </div>
              <div className="mt-4">
                <label className="form-label">Minimum Order (Rs.)</label>
                <input className="form-input" type="number" min="0" value={form.minOrderAmount || 0} onChange={e => upd('minOrderAmount', e.target.value)} placeholder="0 = no minimum" />
              </div>
            </div>

            {/* ── Usage Limits ─────────────────────────────────── */}
            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Usage Limits</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Total Usage Limit</label>
                  <input className="form-input" type="number" min="1" value={form.usageLimit || ''} onChange={e => upd('usageLimit', e.target.value)} placeholder="Unlimited" />
                  <p className="text-xs text-gray-400 mt-1">Max redemptions across all customers</p>
                </div>
                <div>
                  <label className="form-label">Uses Per Customer</label>
                  <input className="form-input" type="number" min="1" value={form.userLimit || 1} onChange={e => upd('userLimit', Number(e.target.value))} />
                  <p className="text-xs text-gray-400 mt-1">Max times one customer can use this</p>
                </div>
              </div>
              {editId && (
                <div className="mt-3 bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700">
                  Used <strong>{form.usedCount || 0}</strong> time{(form.usedCount || 0) !== 1 ? 's' : ''} so far
                  {form.usageLimit ? ` out of ${form.usageLimit}` : ''}
                </div>
              )}
            </div>

            {/* ── Eligibility ──────────────────────────────────── */}
            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Eligibility</p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">How scope works (most specific wins):</p>
                <p>• <strong>Specific Products checked</strong> → only those exact products qualify. Brand/category filters are ignored.</p>
                <p>• <strong>Category + Brand (no products)</strong> → item must match both category AND brand.</p>
                <p>• <strong>Brand only</strong> → all products of that brand qualify.</p>
                <p>• <strong>Nothing set</strong> → sitewide (all products).</p>
              </div>
              <EligibilityPicker form={form} setForm={setForm} brandOptions={brandOptions} />
            </div>

            {/* ── Excluded Products ─────────────────────────────── */}
            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Excluded Products</p>
              <p className="text-xs text-gray-400 mb-3">
                Block specific products from this coupon even if they match the brand/category scope above.
                Useful for premium items or products already on sale that you don't want further discounted.
              </p>
              <ExcludedProductsPicker form={form} setForm={setForm} brandOptions={brandOptions} />
            </div>

            {/* ── Rules & Restrictions ─────────────────────────── */}
            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Rules & Restrictions</p>
              <div className="space-y-2">
                <Toggle
                  value={form.isNewUserOnly}
                  onChange={v => upd('isNewUserOnly', v)}
                  label="New Customers Only"
                  hint="Blocks customers who have placed any prior order"
                />
                <Toggle
                  value={form.excludeSaleItems}
                  onChange={v => upd('excludeSaleItems', v)}
                  label="Exclude Sale Items"
                  hint="Prevents use when eligible cart items already have a sale price"
                />
              </div>
              <div className="mt-4">
                <label className="form-label">Max Discount % of Profit Margin</label>
                <input
                  className="form-input"
                  type="number" min="0" max="100"
                  value={form.maxDiscountPercentOfProfit || 0}
                  onChange={e => upd('maxDiscountPercentOfProfit', Number(e.target.value))}
                  placeholder="0 = disabled"
                />
                <p className="text-xs text-gray-400 mt-1">Caps the discount to X% of the order's profit margin. Requires Cost Price set on products. 0 = off.</p>
                {Number(form.maxDiscountPercentOfProfit) > 0 && (
                  <div className="mt-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700">
                    ⚠️ Profit protection active — discount will be reduced if it exceeds {form.maxDiscountPercentOfProfit}% of the order margin.
                  </div>
                )}
              </div>
            </div>

            {/* ── Actions ──────────────────────────────────────── */}
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Create Coupon'}
              </button>
              <button onClick={() => setModal(null)} className="btn-outline px-6">Cancel</button>
            </div>

          </div>
        </Modal>
      )}
    </div>
  );
}