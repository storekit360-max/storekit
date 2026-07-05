import ImageUpload from '../../components/ImageUpload';
import React, { useEffect, useState, useCallback } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto scale-in`} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <h2 className="font-display font-bold text-xl text-gray-900">{title}</h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">✕</button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

export function AdminCategories() {
  const [cats, setCats] = useState([]);
  const [modal, setModal] = useState(false);       // 'single' | 'bulk' | false
  const [form, setForm] = useState({ name: '', description: '', image: '', isActive: true, parent: null });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedParent, setExpandedParent] = useState(null);

  // Bulk paste state
  const [bulkParentId, setBulkParentId] = useState(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkParsed, setBulkParsed] = useState([]);  // preview list
  const [bulkSaving, setBulkSaving] = useState(false);

  const fetchAll = async () => {
    try {
      const { data } = await API.get('/categories/admin/all');
      setCats(data);
    } catch { toast.error('Failed to load categories'); }
  };
  useEffect(() => { fetchAll(); }, []);

  const parentCats = cats.filter(c => !c.parent);
  const subCatsOf  = (parentId) => cats.filter(c => c.parent && (c.parent._id || c.parent) === parentId);

  // ── Single add/edit ──────────────────────────────────────────────────────
  const openAddParent = () => {
    setForm({ name: '', description: '', image: '', isActive: true, parent: null });
    setEditing(null);
    setModal('single');
  };

  const openAddSub = (parentId) => {
    setForm({ name: '', description: '', image: '', isActive: true, parent: parentId });
    setEditing(null);
    setModal('single');
    setExpandedParent(parentId);
  };

  const openEdit = (c) => {
    setForm({
      name: c.name,
      description: c.description || '',
      image: c.image || '',
      isActive: c.isActive,
      parent: c.parent?._id || c.parent || null,
    });
    setEditing(c);
    setModal('single');
  };

  const save = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.parent) payload.parent = null;
      if (editing) {
        await API.put(`/categories/${editing._id}`, payload);
        toast.success('Updated!');
      } else {
        await API.post('/categories', payload);
        toast.success('Created!');
      }
      setModal(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this category? Its subcategories will also be hidden.')) return;
    await API.delete(`/categories/${id}`);
    toast.success('Deleted');
    fetchAll();
  };

  // ── Bulk paste ────────────────────────────────────────────────────────────
  const openBulkPaste = (parentId) => {
    setBulkParentId(parentId);
    setBulkText('');
    setBulkParsed([]);
    setModal('bulk');
    setExpandedParent(parentId);
  };

  // Parse the textarea: supports *, -, •, numbers, plain lines
  const parseBulkText = (text) => {
    return text
      .split('\n')
      .map(line => line.replace(/^[\s*\-•\d.]+/, '').trim())
      .filter(Boolean);
  };

  const handleBulkTextChange = (text) => {
    setBulkText(text);
    setBulkParsed(parseBulkText(text));
  };

  const removeBulkItem = (idx) => {
    const updated = bulkParsed.filter((_, i) => i !== idx);
    setBulkParsed(updated);
  };

  const saveBulk = async () => {
    if (bulkParsed.length === 0) { toast.error('Nothing to add'); return; }
    setBulkSaving(true);
    let created = 0;
    let failed  = 0;
    for (const name of bulkParsed) {
      try {
        await API.post('/categories', { name, isActive: true, parent: bulkParentId || null });
        created++;
      } catch {
        failed++;
      }
    }
    setBulkSaving(false);
    if (created > 0) toast.success(`Added ${created} subcategor${created > 1 ? 'ies' : 'y'}!`);
    if (failed  > 0) toast.error(`${failed} failed — they may already exist`);
    setModal(false);
    fetchAll();
  };

  const parentNameFor = (id) => cats.find(c => c._id === id)?.name || '';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Categories</h2>
          <p className="text-sm text-gray-500">Organize your product catalog with categories &amp; subcategories</p>
        </div>
        <button onClick={openAddParent} className="btn-primary text-sm">+ Add Category</button>
      </div>

      {/* Category list */}
      <div className="space-y-3">
        {parentCats.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">No categories yet</div>
        ) : (
          parentCats.map(parent => {
            const subs = subCatsOf(parent._id);
            const isExpanded = expandedParent === parent._id;
            return (
              <div key={parent._id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Parent row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => setExpandedParent(isExpanded ? null : parent._id)}
                    className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0 w-6 text-xs"
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                  {parent.image
                    ? <img src={parent.image} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    : <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-lg flex-shrink-0">🗂️</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{parent.name}</p>
                    <p className="text-xs text-gray-400">{subs.length} subcategor{subs.length !== 1 ? 'ies' : 'y'}</p>
                  </div>
                  <code className="text-xs bg-gray-100 px-2 py-0.5 rounded hidden sm:block">{parent.slug}</code>
                  <span className={`badge text-xs ${parent.isActive ? 'badge-new' : 'bg-gray-100 text-gray-500'}`}>
                    {parent.isActive ? 'Active' : 'Hidden'}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openBulkPaste(parent._id)}
                      className="p-1.5 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600 text-xs font-bold"
                      title="Bulk add subcategories by pasting a list"
                    >
                      📋 Bulk
                    </button>
                    <button
                      onClick={() => openAddSub(parent._id)}
                      className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 text-xs font-bold"
                      title="Add subcategory"
                    >
                      + Sub
                    </button>
                    <button onClick={() => openEdit(parent)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600">✏️</button>
                    <button onClick={() => del(parent._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">🗑️</button>
                  </div>
                </div>

                {/* Subcategory rows */}
                {isExpanded && (
                  <div className="border-t border-gray-50">
                    {subs.length === 0 ? (
                      <div className="px-8 py-4 text-sm text-gray-400 italic flex items-center gap-3">
                        No subcategories yet —
                        <button onClick={() => openAddSub(parent._id)} className="text-primary hover:underline font-medium">add one</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => openBulkPaste(parent._id)} className="text-purple-600 hover:underline font-medium">paste a list</button>
                      </div>
                    ) : (
                      subs.map(sub => (
                        <div key={sub._id} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50/60 border-t border-gray-100 first:border-t-0">
                          <div className="w-6 flex-shrink-0" />
                          <div className="w-1 h-6 bg-gray-200 rounded flex-shrink-0" />
                          {sub.image
                            ? <img src={sub.image} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                            : <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center text-sm flex-shrink-0">📁</div>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-800">{sub.name}</p>
                          </div>
                          <code className="text-xs bg-gray-100 px-2 py-0.5 rounded hidden sm:block">{sub.slug}</code>
                          <span className={`badge text-xs ${sub.isActive ? 'badge-new' : 'bg-gray-100 text-gray-500'}`}>
                            {sub.isActive ? 'Active' : 'Hidden'}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => openEdit(sub)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600">✏️</button>
                            <button onClick={() => del(sub._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">🗑️</button>
                          </div>
                        </div>
                      ))
                    )}
                    {/* Footer actions */}
                    <div className="flex items-center gap-4 px-4 py-2 bg-gray-50/60 border-t border-gray-100">
                      <button onClick={() => openAddSub(parent._id)} className="text-xs text-primary hover:underline font-medium flex items-center gap-1">
                        <span>＋</span> Add one
                      </button>
                      <button onClick={() => openBulkPaste(parent._id)} className="text-xs text-purple-600 hover:underline font-medium flex items-center gap-1">
                        <span>📋</span> Paste list
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Single Add / Edit Modal ── */}
      {modal === 'single' && (
        <Modal
          title={editing ? `Edit ${editing.parent ? 'Subcategory' : 'Category'}` : (form.parent ? 'Add Subcategory' : 'Add Category')}
          onClose={() => setModal(false)}
        >
          <div className="space-y-4">
            {form.parent && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-sm text-blue-700 flex items-center gap-2">
                <span>📁</span>
                <span>Subcategory of: <strong>{parentNameFor(form.parent)}</strong></span>
              </div>
            )}
            <div>
              <label className="form-label">Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="form-input"
                placeholder={form.parent ? 'Subcategory name' : 'Category name'}
                autoFocus
              />
            </div>
            <div>
              <label className="form-label">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2}
                className="form-input resize-none"
              />
            </div>
            <div>
              <label className="form-label">Parent Category</label>
              <select
                value={form.parent || ''}
                onChange={e => setForm(p => ({ ...p, parent: e.target.value || null }))}
                className="form-input"
              >
                <option value="">— Top-level category (no parent) —</option>
                {parentCats.filter(c => !editing || c._id !== editing._id).map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <ImageUpload label="Category Image" value={form.image} onChange={url => setForm(p => ({ ...p, image: url }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                className="accent-primary"
              />
              <span className="text-sm">Active</span>
            </label>
            <div className="flex gap-3 pt-2 border-t">
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setModal(false)} className="btn-outline">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Bulk Paste Subcategories Modal ── */}
      {modal === 'bulk' && (
        <Modal
          title={`Bulk Add Subcategories${bulkParentId ? ` → ${parentNameFor(bulkParentId)}` : ''}`}
          onClose={() => setModal(false)}
          wide
        >
          <div className="space-y-4">
            {/* Instructions */}
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-sm text-purple-700 space-y-1">
              <p className="font-semibold">📋 Paste your list — any format works:</p>
              <div className="text-xs font-mono bg-white/70 rounded-lg p-2 space-y-0.5 text-purple-800">
                <p>* Cables &amp; Adapters</p>
                <p>- Chargers</p>
                <p>• Power Banks</p>
                <p>1. Phone Cases</p>
                <p>Screen Protectors</p>
              </div>
            </div>

            {/* Parent selector */}
            <div>
              <label className="form-label">Add to Category</label>
              <select
                value={bulkParentId || ''}
                onChange={e => setBulkParentId(e.target.value || null)}
                className="form-input"
              >
                <option value="">— Top-level (no parent) —</option>
                {parentCats.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Paste area */}
            <div>
              <label className="form-label">Paste your list</label>
              <textarea
                value={bulkText}
                onChange={e => handleBulkTextChange(e.target.value)}
                rows={8}
                className="form-input resize-none font-mono text-sm"
                placeholder={"* Cables & Adapters\n* Chargers\n* Power Banks\n* Phone Cases & Covers\n* Screen Protectors"}
                autoFocus
              />
            </div>

            {/* Preview */}
            {bulkParsed.length > 0 && (
              <div>
                <p className="form-label mb-2">Preview — {bulkParsed.length} subcategor{bulkParsed.length !== 1 ? 'ies' : 'y'} to add</p>
                <div className="border border-gray-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {bulkParsed.map((name, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 group">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}</span>
                        <span className="text-sm font-medium text-gray-800">{name}</span>
                      </div>
                      <button
                        onClick={() => removeBulkItem(idx)}
                        className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none"
                        title="Remove this item"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Hover a row and click × to remove it before saving.</p>
              </div>
            )}

            {bulkParsed.length === 0 && bulkText.trim().length > 0 && (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-3 py-2">Could not parse any names. Make sure each subcategory is on its own line.</p>
            )}

            <div className="flex gap-3 pt-2 border-t">
              <button
                onClick={saveBulk}
                disabled={bulkSaving || bulkParsed.length === 0}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {bulkSaving
                  ? `Adding... (${bulkParsed.length} items)`
                  : `Add ${bulkParsed.length > 0 ? bulkParsed.length : ''} Subcategor${bulkParsed.length !== 1 ? 'ies' : 'y'}`
                }
              </button>
              <button onClick={() => setModal(false)} className="btn-outline">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get(`/admin/customers?search=${search}&page=${page}&limit=20`);
      setCustomers(data.customers); setTotal(data.total); setTotalPages(data.pages);
    } catch {} finally { setLoading(false); }
  }, [search, page]);
  useEffect(() => { fetch(); }, [fetch]);

  const toggleStatus = async (id) => {
    const { data } = await API.put(`/admin/customers/${id}/status`);
    setCustomers(prev => prev.map(c => c._id === id ? { ...c, isActive: data.isActive } : c));
    toast.success('Status updated');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="font-display text-xl font-bold text-gray-900">Customers</h2><p className="text-sm text-gray-500">{total} registered</p></div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or email..." className="form-input text-sm" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? <div className="p-8 text-center text-gray-400">Loading...</div> : (
          <table className="data-table">
            <thead><tr><th>Customer</th><th>Username</th><th>Phone</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {customers.map(c => (
                <tr key={c._id}>
                  <td><div className="flex items-center gap-3"><div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm">{c.firstName?.[0]}</div><div><p className="font-medium text-sm">{c.firstName} {c.lastName}</p><p className="text-xs text-gray-400">{c.email}</p></div></div></td>
                  <td><code className="text-xs">@{c.username}</code></td>
                  <td><span className="text-sm text-gray-600">{c.phone || '—'}</span></td>
                  <td><span className={`badge ${c.isActive ? 'badge-new' : 'bg-gray-100 text-gray-500'}`}>{c.isActive ? 'Active' : 'Suspended'}</span></td>
                  <td><span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</span></td>
                  <td><button onClick={() => toggleStatus(c._id)} className={`text-xs px-2.5 py-1 rounded-lg font-medium ${c.isActive ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>{c.isActive ? 'Suspend' : 'Activate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm font-medium ${page === p ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{p}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [simPanel, setSimPanel] = useState(null); // coupon being simulated
  const [simAmount, setSimAmount] = useState('');
  const [simResult, setSimResult] = useState(null);

  const emptyForm = {
    code: '', description: '', type: 'percentage', value: '',
    minOrderAmount: '', maxDiscount: '', usageLimit: '', userLimit: 1,
    validFrom: new Date().toISOString().slice(0, 10),
    validUntil: '',
    isActive: true, isNewUserOnly: false, excludeSaleItems: false,
    applicableCategories: [], applicableBrands: [],
    maxDiscountPercentOfProfit: 0,
  };
  const [form, setForm] = useState(emptyForm);
  const [brandInput, setBrandInput] = useState('');

  const fetchCoupons = async () => {
    const { data } = await API.get('/coupons/admin/all');
    setCoupons(data);
  };
  useEffect(() => {
    fetchCoupons();
    API.get('/categories/all').then(r => setCategories(r.data)).catch(() => {
      API.get('/categories').then(r => setCategories(r.data)).catch(() => {});
    });
  }, []);

  const openAdd = () => { setForm(emptyForm); setEditing(null); setBrandInput(''); setModal(true); };
  const openEdit = (c) => {
    setForm({
      ...emptyForm, ...c,
      validFrom: c.validFrom ? new Date(c.validFrom).toISOString().slice(0, 10) : emptyForm.validFrom,
      validUntil: c.validUntil ? new Date(c.validUntil).toISOString().slice(0, 10) : '',
      applicableCategories: (c.applicableCategories || []).map(x => x._id || x),
      applicableBrands: c.applicableBrands || [],
      maxDiscountPercentOfProfit: c.maxDiscountPercentOfProfit || 0,
      userLimit: c.userLimit || 1,
    });
    setEditing(c); setBrandInput(''); setModal(true);
  };

  const save = async () => {
    if (!form.code || !form.value || !form.validUntil) { toast.error('Fill required fields'); return; }
    setSaving(true);
    try {
      if (editing) { await API.put(`/coupons/${editing._id}`, form); toast.success('Updated!'); }
      else { await API.post('/coupons', form); toast.success('Created!'); }
      setModal(false); fetchCoupons();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };
  const del = async (id) => { if (!window.confirm('Delete this coupon?')) return; await API.delete(`/coupons/${id}`); fetchCoupons(); };

  const toggleCategory = (id) => setForm(p => ({
    ...p,
    applicableCategories: p.applicableCategories.includes(id)
      ? p.applicableCategories.filter(c => c !== id)
      : [...p.applicableCategories, id],
  }));
  const addBrand = () => { if (brandInput.trim()) { setForm(p => ({ ...p, applicableBrands: [...p.applicableBrands, brandInput.trim()] })); setBrandInput(''); } };
  const removeBrand = (b) => setForm(p => ({ ...p, applicableBrands: p.applicableBrands.filter(x => x !== b) }));

  // ── Discount Simulator ───────────────────────────────────────────────────────
  const openSim = (c) => { setSimPanel(c); setSimAmount(''); setSimResult(null); };
  const runSim = () => {
    const amount = parseFloat(simAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid order amount'); return; }
    const c = simPanel;
    const lines = [];
    let finalDiscount = 0;
    let blocked = null;

    // Step 1: Minimum order check
    if (amount < (c.minOrderAmount || 0)) {
      blocked = `Minimum order Rs. ${c.minOrderAmount} required (order is Rs. ${amount})`;
    }

    if (!blocked) {
      // Step 2: Raw discount
      let rawDiscount = 0;
      if (c.type === 'percentage') {
        rawDiscount = (amount * c.value) / 100;
        lines.push({ label: `${c.value}% of Rs. ${amount.toLocaleString()}`, value: rawDiscount, sign: '−' });
        // Step 3: Max discount cap
        if (c.maxDiscount && rawDiscount > c.maxDiscount) {
          lines.push({ label: `Capped at max discount`, value: c.maxDiscount, sign: '→', note: `(was Rs. ${rawDiscount.toFixed(2)})` });
          rawDiscount = c.maxDiscount;
        }
      } else {
        rawDiscount = c.value;
        lines.push({ label: 'Fixed discount', value: rawDiscount, sign: '−' });
      }
      finalDiscount = Math.round(rawDiscount);
    }

    const final = blocked ? null : {
      subtotal: amount,
      discount: finalDiscount,
      total: Math.max(0, amount - finalDiscount),
    };

    setSimResult({ lines, blocked, final });
  };

  const now = new Date();
  const getStatus = (c) => {
    if (!c.isActive) return { label: 'Disabled', cls: 'bg-gray-100 text-gray-500' };
    if (c.validUntil && new Date(c.validUntil) < now) return { label: 'Expired', cls: 'bg-red-100 text-red-600' };
    if (c.validFrom && new Date(c.validFrom) > now) return { label: 'Scheduled', cls: 'bg-blue-100 text-blue-600' };
    if (c.usageLimit && c.usedCount >= c.usageLimit) return { label: 'Exhausted', cls: 'bg-orange-100 text-orange-600' };
    return { label: 'Active', cls: 'bg-green-100 text-green-700' };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Coupons</h2>
          <p className="text-sm text-gray-500">Manage discount codes and simulate outcomes</p>
        </div>
        <button onClick={openAdd} className="btn-primary text-sm">+ Add Coupon</button>
      </div>

      {/* Coupons Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
        {coupons.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No coupons yet. Create one to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Conditions</th>
                  <th>Usage</th>
                  <th>Validity</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => {
                  const status = getStatus(c);
                  const usagePct = c.usageLimit ? Math.round((c.usedCount / c.usageLimit) * 100) : null;
                  return (
                    <tr key={c._id}>
                      <td>
                        <div className="space-y-1">
                          <code className="font-mono font-bold text-sm text-primary bg-primary/10 px-2 py-0.5 rounded">{c.code}</code>
                          {c.description && <p className="text-xs text-gray-400 max-w-[160px] truncate">{c.description}</p>}
                          <div className="flex flex-wrap gap-1">
                            {c.isNewUserOnly && <span className="badge badge-featured text-xs">New Users</span>}
                            {c.excludeSaleItems && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">No Sale Items</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-0.5">
                          <span className="font-bold text-sm text-gray-900">
                            {c.type === 'percentage' ? `${c.value}% OFF` : `Rs. ${c.value} OFF`}
                          </span>
                          {c.type === 'percentage' && c.maxDiscount > 0 && (
                            <p className="text-xs text-gray-400">Max: Rs. {c.maxDiscount}</p>
                          )}
                          {c.minOrderAmount > 0 && (
                            <p className="text-xs text-gray-400">Min order: Rs. {c.minOrderAmount}</p>
                          )}
                          {c.maxDiscountPercentOfProfit > 0 && (
                            <p className="text-xs text-amber-600">Profit cap: {c.maxDiscountPercentOfProfit}%</p>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="text-xs text-gray-500 space-y-0.5">
                          {c.applicableCategories?.length > 0 && (
                            <p>📂 {c.applicableCategories.map(x => x.name || x).join(', ')}</p>
                          )}
                          {c.applicableBrands?.length > 0 && (
                            <p>🏷️ {c.applicableBrands.join(', ')}</p>
                          )}
                          {!c.applicableCategories?.length && !c.applicableBrands?.length && (
                            <p className="text-gray-400 italic">All products</p>
                          )}
                          <p>👤 Limit: {c.userLimit || 1}/user</p>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <span className="text-sm font-medium">{c.usedCount} / {c.usageLimit || '∞'}</span>
                          {usagePct !== null && (
                            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${usagePct >= 90 ? 'bg-red-500' : usagePct >= 60 ? 'bg-amber-400' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(100, usagePct)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="text-xs text-gray-500 space-y-0.5">
                          {c.validFrom && <p>From: {new Date(c.validFrom).toLocaleDateString()}</p>}
                          <p>Until: {new Date(c.validUntil).toLocaleDateString()}</p>
                        </div>
                      </td>
                      <td>
                        <span className={`badge text-xs ${status.cls}`}>{status.label}</span>
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openSim(c)}
                            title="Simulate discount"
                            className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600"
                          >🧮</button>
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600">✏️</button>
                          <button onClick={() => del(c._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Discount Simulator Panel ──────────────────────────────────────────── */}
      {simPanel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSimPanel(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-display font-bold text-xl text-gray-900">
                  🧮 Discount Simulator
                </h2>
                <p className="text-sm text-gray-500">
                  <code className="font-mono bg-primary/10 text-primary px-1.5 rounded">{simPanel.code}</code>
                  {' — '}
                  {simPanel.type === 'percentage' ? `${simPanel.value}% off` : `Rs. ${simPanel.value} off`}
                </p>
              </div>
              <button onClick={() => setSimPanel(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">✕</button>
            </div>
            <div className="p-5 space-y-4">
              {/* Coupon Rules Summary */}
              <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1 text-gray-600">
                <p className="font-semibold text-gray-700 mb-1">📋 Coupon Rules</p>
                <p>• Type: <strong>{simPanel.type === 'percentage' ? `${simPanel.value}% percentage` : `Rs. ${simPanel.value} fixed`}</strong></p>
                {simPanel.minOrderAmount > 0 && <p>• Min order: <strong>Rs. {simPanel.minOrderAmount}</strong></p>}
                {simPanel.maxDiscount > 0 && <p>• Max discount cap: <strong>Rs. {simPanel.maxDiscount}</strong></p>}
                {simPanel.maxDiscountPercentOfProfit > 0 && <p>• Profit-based cap: <strong>{simPanel.maxDiscountPercentOfProfit}% of margin</strong></p>}
                {simPanel.isNewUserOnly && <p>• <strong>New customers only</strong></p>}
                {simPanel.excludeSaleItems && <p>• <strong>Cannot stack with sale prices</strong></p>}
                {simPanel.usageLimit && <p>• Total uses: <strong>{simPanel.usedCount}/{simPanel.usageLimit}</strong></p>}
                <p>• Per-user limit: <strong>{simPanel.userLimit || 1}</strong></p>
              </div>

              {/* Amount Input */}
              <div>
                <label className="form-label">Enter Order Amount (Rs.)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={simAmount}
                    onChange={e => { setSimAmount(e.target.value); setSimResult(null); }}
                    onKeyDown={e => e.key === 'Enter' && runSim()}
                    placeholder="e.g. 5000"
                    className="form-input flex-1"
                    min="0"
                  />
                  <button onClick={runSim} className="btn-primary px-4">Calculate</button>
                </div>
              </div>

              {/* Quick Amount Buttons */}
              <div className="flex flex-wrap gap-2">
                {[1000, 2500, 5000, 10000, 25000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => { setSimAmount(String(amt)); setSimResult(null); }}
                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 hover:border-primary hover:text-primary transition-colors"
                  >
                    Rs. {amt.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Result */}
              {simResult && (
                <div className={`rounded-xl border-2 p-4 space-y-3 ${simResult.blocked ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                  {simResult.blocked ? (
                    <div className="flex items-start gap-2">
                      <span className="text-lg">❌</span>
                      <div>
                        <p className="font-semibold text-red-700 text-sm">Coupon Not Applicable</p>
                        <p className="text-xs text-red-600 mt-0.5">{simResult.blocked}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold text-green-800 text-sm flex items-center gap-1.5">✅ Discount Breakdown</p>
                      {/* Line-by-line breakdown */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Order Subtotal</span>
                          <span className="font-medium">Rs. {parseFloat(simAmount).toLocaleString()}</span>
                        </div>
                        {simResult.lines.map((l, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-600">
                              {l.sign === '−' ? '🏷️' : '→'} {l.label}
                              {l.note && <span className="text-gray-400 ml-1">{l.note}</span>}
                            </span>
                            <span className={`font-semibold ${l.sign === '−' ? 'text-red-600' : 'text-blue-600'}`}>
                              {l.sign} Rs. {Math.round(l.value).toLocaleString()}
                            </span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-green-200 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Discount</span>
                            <span className="font-bold text-red-600">− Rs. {simResult.final.discount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-base font-bold">
                            <span className="text-gray-900">Final Price</span>
                            <span className="text-green-700 text-lg">Rs. {simResult.final.total.toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-green-600 text-right">
                            Customer saves {simPanel.type === 'percentage'
                              ? `${simPanel.value}%`
                              : `${((simResult.final.discount / parseFloat(simAmount)) * 100).toFixed(1)}%`
                            } on this order
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ───────────────────────────────────────────────── */}
      {modal && (
        <Modal title={editing ? 'Edit Coupon' : 'Create Coupon'} onClose={() => setModal(false)} wide>
          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="form-label">Code * <span className="text-gray-400 font-normal text-xs">(auto-uppercase)</span></label>
                <input
                  value={form.code}
                  onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                  className="form-input font-mono"
                  placeholder="SAVE50"
                />
              </div>
              <div className="col-span-2">
                <label className="form-label">Description</label>
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="form-input" placeholder="Shown to customers" />
              </div>
            </div>

            {/* Discount Config */}
            <div className="border border-gray-100 rounded-xl p-4 space-y-3">
              <p className="font-semibold text-sm text-gray-700">💸 Discount Configuration</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Type *</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="form-input">
                    <option value="percentage">Percentage %</option>
                    <option value="fixed">Fixed Rs.</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Value *</label>
                  <input type="number" min="0" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} className="form-input" placeholder={form.type === 'percentage' ? '10' : '500'} />
                </div>
                <div>
                  <label className="form-label">Min Order (Rs.)</label>
                  <input type="number" min="0" value={form.minOrderAmount} onChange={e => setForm(p => ({ ...p, minOrderAmount: e.target.value }))} className="form-input" placeholder="0 = no minimum" />
                </div>
                <div>
                  <label className="form-label">Max Discount Cap (Rs.)</label>
                  <input type="number" min="0" value={form.maxDiscount} onChange={e => setForm(p => ({ ...p, maxDiscount: e.target.value }))} className="form-input" placeholder="Blank = unlimited" />
                </div>
                <div>
                  <label className="form-label">Max Discount % of Profit</label>
                  <input type="number" min="0" max="100" value={form.maxDiscountPercentOfProfit} onChange={e => setForm(p => ({ ...p, maxDiscountPercentOfProfit: e.target.value }))} className="form-input" placeholder="0 = disabled" />
                  <p className="text-xs text-gray-400 mt-1">Caps discount to X% of order margin. 0 = off.</p>
                </div>
              </div>
            </div>

            {/* Usage Limits */}
            <div className="border border-gray-100 rounded-xl p-4 space-y-3">
              <p className="font-semibold text-sm text-gray-700">🔢 Usage Limits</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Total Usage Limit</label>
                  <input type="number" min="1" value={form.usageLimit} onChange={e => setForm(p => ({ ...p, usageLimit: e.target.value }))} className="form-input" placeholder="Unlimited" />
                </div>
                <div>
                  <label className="form-label">Uses Per Customer</label>
                  <input type="number" min="1" value={form.userLimit} onChange={e => setForm(p => ({ ...p, userLimit: e.target.value }))} className="form-input" placeholder="1" />
                </div>
                <div>
                  <label className="form-label">Valid From *</label>
                  <input type="date" value={form.validFrom} onChange={e => setForm(p => ({ ...p, validFrom: e.target.value }))} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Valid Until *</label>
                  <input type="date" value={form.validUntil} onChange={e => setForm(p => ({ ...p, validUntil: e.target.value }))} className="form-input" />
                </div>
              </div>
            </div>

            {/* Eligibility */}
            <div className="border border-gray-100 rounded-xl p-4 space-y-3">
              <p className="font-semibold text-sm text-gray-700">🎯 Eligibility <span className="text-gray-400 font-normal">(leave blank = all products)</span></p>
              <div>
                <label className="form-label text-xs">Applicable Categories</label>
                <div className="grid grid-cols-2 gap-1 mt-1 max-h-32 overflow-y-auto">
                  {categories.map(cat => (
                    <label key={cat._id} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={form.applicableCategories.includes(cat._id)} onChange={() => toggleCategory(cat._id)} className="accent-primary w-3.5 h-3.5" />
                      <span className="text-xs text-gray-600">{cat.parent ? '  ↳ ' : ''}{cat.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label text-xs">Applicable Brands</label>
                <div className="flex gap-2 mt-1">
                  <input value={brandInput} onChange={e => setBrandInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addBrand())} placeholder="Brand name" className="form-input text-sm flex-1 py-1.5" />
                  <button type="button" onClick={addBrand} className="btn-outline text-xs py-1.5 px-3">Add</button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.applicableBrands.map(b => (
                    <span key={b} className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                      {b}<button onClick={() => removeBrand(b)} className="text-primary/60 hover:text-primary">×</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Flags */}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="accent-primary" />
                <span className="text-sm">Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isNewUserOnly} onChange={e => setForm(p => ({ ...p, isNewUserOnly: e.target.checked }))} className="accent-primary" />
                <span className="text-sm">New customers only</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.excludeSaleItems} onChange={e => setForm(p => ({ ...p, excludeSaleItems: e.target.checked }))} className="accent-primary" />
                <span className="text-sm">Exclude sale items</span>
              </label>
            </div>

            {/* Live Preview */}
            {form.value && (
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 border border-gray-100">
                <p className="font-semibold text-gray-700 mb-1">👁️ Preview</p>
                <p>
                  Code <code className="font-mono bg-white px-1 rounded border">{form.code || 'CODE'}</code> gives{' '}
                  <strong>{form.type === 'percentage' ? `${form.value}%` : `Rs. ${form.value}`} off</strong>
                  {form.minOrderAmount > 0 && ` on orders over Rs. ${form.minOrderAmount}`}
                  {form.maxDiscount > 0 && form.type === 'percentage' && `, capped at Rs. ${form.maxDiscount}`}
                  {form.isNewUserOnly ? ' (new customers only)' : ''}
                  {form.excludeSaleItems ? ', cannot stack with sale prices' : ''}
                  .
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t">
              <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save Coupon'}</button>
              <button onClick={() => setModal(false)} className="btn-outline">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}