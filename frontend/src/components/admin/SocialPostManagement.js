import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import API from '../../utils/api';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const STATUS_STYLE = {
  draft:'bg-gray-100 text-gray-700', scheduled:'bg-blue-100 text-blue-700', running:'bg-emerald-100 text-emerald-700',
  paused:'bg-amber-100 text-amber-700', completed:'bg-green-100 text-green-700', stopped:'bg-slate-100 text-slate-600',
  failed:'bg-red-100 text-red-700', pending:'bg-blue-100 text-blue-700', processing:'bg-violet-100 text-violet-700',
  published:'bg-green-100 text-green-700', skipped:'bg-gray-100 text-gray-600', cancelled:'bg-slate-100 text-slate-600',
  needs_review:'bg-amber-100 text-amber-800', awaiting:'bg-blue-100 text-blue-700', confirmed:'bg-green-100 text-green-700', invalid:'bg-red-100 text-red-700',
};

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const initialConfig = timezone => ({
  name: '', platforms: ['facebook'], startDate: tomorrow(), dailyStartTime: '18:30', timezone,
  postGapMinutes: 5, postsPerDay: 5, postingDays: [0,1,2,3,4,5,6], productOrder: 'selected',
  repeat: false, sinhalaEnabled: false, cta: 'none', voucherId: '', additionalDiscountPercent: 0,
  changePolicy: 'needs_review',
});

const Badge = ({ status }) => <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLE[status] || 'bg-gray-100 text-gray-600'}`}>{String(status || '').replace('_',' ')}</span>;
const money = value => `Rs. ${Number(value || 0).toLocaleString()}`;
const displayTime = (value, timezone) => value ? new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short', timeZone: timezone }).format(new Date(value)) : '—';
const messageOf = error => error.response?.data?.message || error.message || 'Request failed';

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 p-4 flex items-center justify-center" onMouseDown={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} max-h-[92vh] overflow-hidden flex flex-col`} onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b"><h3 className="font-bold text-gray-900">{title}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-800 text-xl">×</button></div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function SetupPanel({ connectedPlatforms, onGenerated }) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Colombo';
  const [config, setConfig] = useState(initialConfig(timezone));
  const [filters, setFilters] = useState({ search:'', brand:'', category:'' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [excluded, setExcluded] = useState(new Set());

  useEffect(() => {
    Promise.all([
      API.get('/categories'),
      API.get('/coupons/admin/all'),
      API.get('/settings').catch(() => ({ data:{} })),
    ]).then(([cats, voucherRes, settings]) => {
      setCategories(cats.data || []);
      setCoupons((voucherRes.data || []).filter(c => c.isActive && new Date(c.validUntil) >= new Date()));
      const storeZone = settings.data?.timezone || settings.data?.settings?.timezone;
      if (storeZone) setConfig(current => ({ ...current, timezone: storeZone }));
    }).catch(() => toast.error('Some scheduling options could not be loaded'));
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ ...appliedFilters, page, limit: 30 });
      Object.keys(appliedFilters).forEach(key => { if (!appliedFilters[key]) params.delete(key); });
      const { data } = await API.get(`/social-scheduling/products?${params}`);
      setProducts(data.products || []); setTotal(data.total || 0); setPages(data.pages || 1);
    } catch (error) { toast.error(messageOf(error)); }
    finally { setLoading(false); }
  }, [appliedFilters, page]);
  useEffect(() => { loadProducts(); }, [loadProducts]);

  const activePlatforms = ['facebook','instagram'].filter(platform => connectedPlatforms.includes(platform));
  const selectedCount = selectAllFiltered ? Math.max(0, total - excluded.size) : selected.size;
  const togglePlatform = platform => setConfig(current => ({ ...current, platforms: current.platforms.includes(platform) ? current.platforms.filter(value => value !== platform) : [...current.platforms, platform] }));
  const toggleProduct = id => {
    if (selectAllFiltered) setExcluded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
    else setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const productChecked = id => selectAllFiltered ? !excluded.has(id) : selected.has(id);

  const generate = async () => {
    if (!selectedCount) return toast.error('Select at least one product');
    if (!config.name.trim()) return toast.error('Enter a schedule name');
    if (!config.platforms.length) return toast.error('Select at least one connected platform');
    if (products.some(product => productChecked(product._id) && product.stock <= 0) && !window.confirm('Some selected products are out of stock. Generate drafts with warnings?')) return;
    setGenerating(true);
    try {
      const selection = selectAllFiltered
        ? { selectAllFiltered:true, filters:appliedFilters, excludedProductIds:[...excluded] }
        : { productIds:[...selected] };
      const { data } = await API.post('/social-scheduling/draft-batches', { selection, config });
      toast.success(`${data.count} description drafts generated for review`);
      setSelected(new Set()); setSelectAllFiltered(false); setExcluded(new Set());
      onGenerated(data.draftGroup);
    } catch (error) { toast.error(messageOf(error)); }
    finally { setGenerating(false); }
  };

  return <div className="space-y-5">
    {activePlatforms.length === 0 && <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">Connect and enable Facebook or Instagram in Account Settings before creating a schedule.</div>}
    <div className="grid xl:grid-cols-[1.1fr_.9fr] gap-5">
      <section className="bg-white border rounded-2xl overflow-hidden">
        <div className="p-4 border-b space-y-3">
          <div className="flex gap-2"><input className="form-input flex-1" placeholder="Search products, brands or SKU" value={filters.search} onChange={e => setFilters(v => ({...v,search:e.target.value}))}/><button className="btn-secondary" onClick={() => { setPage(1); setAppliedFilters(filters); }}>Search</button></div>
          <div className="grid grid-cols-2 gap-2">
            <input className="form-input" placeholder="Brand" value={filters.brand} onChange={e => setFilters(v => ({...v,brand:e.target.value}))}/>
            <select className="form-input" value={filters.category} onChange={e => setFilters(v => ({...v,category:e.target.value}))}><option value="">All categories</option>{categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={selectAllFiltered} onChange={e => { setSelectAllFiltered(e.target.checked); setSelected(new Set()); setExcluded(new Set()); }}/>{selectAllFiltered ? `All ${total} filtered products selected` : 'Select all filtered products'}</label>
        </div>
        <div className="max-h-[580px] overflow-y-auto divide-y">
          {loading ? <div className="p-8 text-center text-gray-400">Loading products…</div> : products.map(product => <label key={product._id} className={`p-3 flex gap-3 cursor-pointer hover:bg-gray-50 ${productChecked(product._id) ? 'bg-blue-50/50' : ''}`}>
            <input className="mt-4" type="checkbox" checked={productChecked(product._id)} onChange={() => toggleProduct(product._id)}/>
            <img src={product.thumbnail || product.images?.[0]} alt="" className="w-16 h-16 rounded-xl object-contain bg-gray-50 border"/>
            <div className="min-w-0 flex-1"><p className="font-semibold text-sm truncate">{product.name}</p><p className="text-xs text-gray-500">{product.brand || 'No brand'} · {product.category?.name || 'No category'}</p><p className="text-sm mt-1">{product.salePrice > 0 && product.salePrice < product.price ? <><span className="line-through text-gray-400 mr-2">{money(product.price)}</span><span className="text-red-600 font-semibold">{money(product.salePrice)}</span></> : money(product.price)}</p><div className="flex gap-1 mt-1 flex-wrap"><span className={`text-xs ${product.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>{product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</span>{product.applicableVouchers?.map(v => <span key={v._id} className="text-xs bg-violet-50 text-violet-700 px-1.5 rounded">{v.code}</span>)}</div></div>
          </label>)}
          {!loading && !products.length && <div className="p-8 text-center text-gray-400">No active products match these filters.</div>}
        </div>
        <div className="p-3 border-t flex items-center justify-between text-sm"><span>{total} products · {selectedCount} selected</span><div className="flex gap-2"><button className="btn-secondary" disabled={page<=1} onClick={() => setPage(v=>v-1)}>Previous</button><span className="py-2">{page}/{pages}</span><button className="btn-secondary" disabled={page>=pages} onClick={() => setPage(v=>v+1)}>Next</button></div></div>
      </section>

      <section className="bg-white border rounded-2xl p-5 space-y-4 self-start xl:sticky xl:top-4">
        <h3 className="font-bold">Schedule configuration</h3>
        <div><label className="form-label">Schedule name</label><input className="form-input" value={config.name} onChange={e=>setConfig(v=>({...v,name:e.target.value}))} placeholder="Evening new arrivals" maxLength={120}/></div>
        <div><label className="form-label">Platforms</label><div className="flex gap-2">{['facebook','instagram'].map(platform => <button key={platform} disabled={!activePlatforms.includes(platform)} onClick={()=>togglePlatform(platform)} className={`px-3 py-2 rounded-lg border text-sm capitalize ${config.platforms.includes(platform) ? 'bg-primary text-white border-primary' : 'bg-white'} disabled:opacity-40`}>{platform}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="form-label">Start date</label><input type="date" min={new Date().toISOString().slice(0,10)} className="form-input" value={config.startDate} onChange={e=>setConfig(v=>({...v,startDate:e.target.value}))}/></div><div><label className="form-label">Daily start</label><input type="time" className="form-input" value={config.dailyStartTime} onChange={e=>setConfig(v=>({...v,dailyStartTime:e.target.value}))}/></div></div>
        <div><label className="form-label">Timezone</label><input className="form-input" value={config.timezone} onChange={e=>setConfig(v=>({...v,timezone:e.target.value}))}/></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="form-label">Gap (minutes)</label><input type="number" min="1" className="form-input" value={config.postGapMinutes} onChange={e=>setConfig(v=>({...v,postGapMinutes:+e.target.value}))}/></div><div><label className="form-label">Products/day</label><input type="number" min="1" className="form-input" value={config.postsPerDay} onChange={e=>setConfig(v=>({...v,postsPerDay:+e.target.value}))}/></div></div>
        <div><label className="form-label">Posting days</label><div className="flex flex-wrap gap-1">{DAYS.map((day,index)=><button key={day} onClick={()=>setConfig(v=>({...v,postingDays:v.postingDays.includes(index)?v.postingDays.filter(d=>d!==index):[...v.postingDays,index]}))} className={`px-2 py-1 rounded text-xs border ${config.postingDays.includes(index)?'bg-primary text-white':''}`}>{day}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="form-label">Posting order</label><select className="form-input" value={config.productOrder} onChange={e=>setConfig(v=>({...v,productOrder:e.target.value}))}><option value="selected">Selected order</option><option value="newest">Newest</option><option value="random">Random</option><option value="price_asc">Price low-high</option><option value="price_desc">Price high-low</option></select></div><div><label className="form-label">Change policy</label><select className="form-input" value={config.changePolicy} onChange={e=>setConfig(v=>({...v,changePolicy:e.target.value}))}><option value="needs_review">Needs review</option><option value="regenerate">Regenerate safe fields</option></select></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="form-label">Facebook CTA</label><select className="form-input" value={config.cta} onChange={e=>setConfig(v=>({...v,cta:e.target.value}))}><option value="none">No button</option><option value="shop_now">Shop Now</option><option value="whatsapp">WhatsApp</option></select></div><div><label className="form-label">Extra discount %</label><input type="number" min="0" max="99" className="form-input" value={config.additionalDiscountPercent} onChange={e=>setConfig(v=>({...v,additionalDiscountPercent:+e.target.value}))}/></div></div>
        <div><label className="form-label">Voucher</label><select className="form-input" value={config.voucherId} onChange={e=>setConfig(v=>({...v,voucherId:e.target.value}))}><option value="">No voucher</option>{coupons.map(c=><option key={c._id} value={c._id}>{c.code} · {c.type==='percentage'?`${c.value}%`:`Rs. ${c.value}`}</option>)}</select></div>
        {config.cta !== 'none' && config.platforms.includes('instagram') && <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">Instagram organic posts cannot show a native CTA button. The link/WhatsApp action is included in the caption preview.</p>}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.sinhalaEnabled} onChange={e=>setConfig(v=>({...v,sinhalaEnabled:e.target.checked}))}/>Sinhala + English mixed caption</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.repeat} onChange={e=>setConfig(v=>({...v,repeat:e.target.checked}))}/>Repeat after all products are posted</label>
        <button disabled={generating || !activePlatforms.length} onClick={generate} className="btn-primary w-full disabled:opacity-50">{generating ? 'Generating verified drafts…' : `Generate ${selectedCount ? selectedCount * config.platforms.length : ''} drafts for review`}</button>
        <p className="text-xs text-gray-500">Nothing is scheduled or published until valid drafts are reviewed, confirmed, and the activity is created.</p>
      </section>
    </div>
  </div>;
}

function DraftEditor({ draft, onClose, onSaved }) {
  const [content,setContent]=useState(draft.editedContent || draft.generatedContent);
  const [features,setFeatures]=useState((draft.verifiedFeatures||[]).join('\n'));
  const [hashtags,setHashtags]=useState((draft.hashtags||[]).join(' '));
  const [cta,setCta]=useState(draft.cta);
  const [media,setMedia]=useState(draft.media||[]);
  const [offerPrice,setOfferPrice]=useState(draft.priceSnapshot?.finalPrice || '');
  const [saving,setSaving]=useState(false);
  const save=async()=>{setSaving(true);try{const {data}=await API.put(`/social-scheduling/drafts/${draft._id}`,{editedContent:content,verifiedFeatures:features.split('\n'),hashtags:hashtags.split(/\s+/),cta,media});toast.success('Draft saved');onSaved(data);onClose();}catch(e){toast.error(messageOf(e));}finally{setSaving(false)}};
  const regenerate=async()=>{setSaving(true);try{const {data}=await API.post(`/social-scheduling/drafts/${draft._id}/regenerate`,{offerPrice,cta});toast.success('Draft regenerated from verified product data');onSaved(data);setContent(data.generatedContent);setFeatures((data.verifiedFeatures||[]).join('\n'));setHashtags((data.hashtags||[]).join(' '));setMedia(data.media||[]);}catch(e){toast.error(messageOf(e));}finally{setSaving(false)}};
  const move=(index,delta)=>setMedia(current=>{const next=[...current];const target=index+delta;if(target<0||target>=next.length)return next;[next[index],next[target]]=[next[target],next[index]];return next;});
  return <Modal title={`${draft.platform} draft · ${draft.productName}`} onClose={onClose} wide><div className="grid lg:grid-cols-2 gap-5">
    <div className="space-y-4"><div><label className="form-label">Complete description</label><textarea className="form-input min-h-[360px] font-mono text-xs" value={content} onChange={e=>setContent(e.target.value)}/><p className="text-xs text-gray-400">{content.length} characters</p></div><div><label className="form-label">Verified features (one per line)</label><textarea className="form-input min-h-32" value={features} onChange={e=>setFeatures(e.target.value)}/></div><div><label className="form-label">Hashtags</label><input className="form-input" value={hashtags} onChange={e=>setHashtags(e.target.value)}/></div></div>
    <div className="space-y-4"><div className="bg-gray-50 p-4 rounded-xl"><p className="text-xs uppercase text-gray-500 font-semibold mb-2">Platform preview</p><div className="bg-white border rounded-xl p-4 whitespace-pre-wrap text-sm max-h-72 overflow-y-auto">{content}</div>{draft.platform==='instagram'&&cta!=='none'&&<p className="text-xs text-amber-700 mt-2">Instagram will show caption text, not a native CTA button.</p>}{draft.platform==='facebook'&&media.filter(m=>m.included!==false).length>1&&cta!=='none'&&<p className="text-xs text-amber-700 mt-2">All selected images will be preserved; the URL remains clickable in text instead of a native link card.</p>}</div>
      <div className="grid grid-cols-2 gap-3"><div><label className="form-label">CTA</label><select className="form-input" value={cta} onChange={e=>setCta(e.target.value)}><option value="none">No button</option><option value="shop_now">Shop Now</option><option value="whatsapp">WhatsApp</option></select></div><div><label className="form-label">Offer price</label><input type="number" className="form-input" value={offerPrice} onChange={e=>setOfferPrice(e.target.value)}/></div></div>
      <div><label className="form-label">Media order and inclusion</label><div className="space-y-2">{media.map((item,index)=><div key={`${item.url}-${index}`} className="flex items-center gap-2 border rounded-lg p-2"><input type="checkbox" checked={item.included!==false} onChange={e=>setMedia(v=>v.map((m,i)=>i===index?{...m,included:e.target.checked}:m))}/><img src={item.url} alt="" className="w-12 h-12 object-contain"/><span className="text-xs truncate flex-1">{index===0?'Primary image':'Image '+(index+1)}</span><button onClick={()=>move(index,-1)}>↑</button><button onClick={()=>move(index,1)}>↓</button></div>)}</div></div>
      <div className="bg-blue-50 p-3 rounded-xl text-sm"><p><strong>Regular:</strong> {money(draft.priceSnapshot?.regularPrice)}</p><p><strong>Final:</strong> {money(draft.priceSnapshot?.finalPrice)} · {draft.priceSnapshot?.discountPercent||0}% off</p><p className="truncate"><strong>URL:</strong> {draft.productUrl}</p></div>
    </div></div><div className="sticky bottom-0 bg-white border-t mt-5 pt-4 flex justify-end gap-2"><button className="btn-secondary" disabled={saving} onClick={regenerate}>Regenerate template</button><button className="btn-primary" disabled={saving} onClick={save}>{saving?'Saving…':'Save draft'}</button></div></Modal>;
}

function DraftsPanel({ preferredGroup, onScheduled }) {
  const [batches,setBatches]=useState([]);const [group,setGroup]=useState(preferredGroup||'');const [drafts,setDrafts]=useState([]);const [loading,setLoading]=useState(false);const [editing,setEditing]=useState(null);
  const loadBatches=useCallback(async()=>{try{const {data}=await API.get('/social-scheduling/draft-batches');setBatches(data||[]);setGroup(current=>current||preferredGroup||data?.[0]?._id||'');}catch(e){toast.error(messageOf(e));}},[preferredGroup]);
  const loadDrafts=useCallback(async()=>{if(!group){setDrafts([]);return;}setLoading(true);try{const {data}=await API.get(`/social-scheduling/draft-batches/${group}`);setDrafts(data||[]);}catch(e){toast.error(messageOf(e));}finally{setLoading(false)}},[group]);
  useEffect(()=>{loadBatches()},[loadBatches]);useEffect(()=>{loadDrafts()},[loadDrafts]);
  const mutate=async(fn,msg)=>{try{await fn();toast.success(msg);await Promise.all([loadDrafts(),loadBatches()]);}catch(e){toast.error(messageOf(e));}};
  const confirmAll=()=>mutate(()=>API.post(`/social-scheduling/draft-batches/${group}/confirm-all`),'All valid drafts confirmed');
  const createSchedule=()=>mutate(async()=>{const {data}=await API.post(`/social-scheduling/draft-batches/${group}/schedule`);onScheduled(data._id);},'Schedule created — the backend worker will publish it');
  const removeBatch=()=>{if(window.confirm('Delete this entire unscheduled draft batch?'))mutate(()=>API.delete(`/social-scheduling/draft-batches/${group}`),'Draft batch deleted').then(()=>setGroup(''));};
  return <div className="space-y-4"><div className="bg-white border rounded-2xl p-4 flex flex-wrap gap-3 items-end"><div className="flex-1 min-w-64"><label className="form-label">Description Drafts Awaiting Confirmation</label><select className="form-input" value={group} onChange={e=>setGroup(e.target.value)}><option value="">No draft batch selected</option>{batches.map(batch=><option key={batch._id} value={batch._id}>{batch.name} · {batch.confirmed}/{batch.total} confirmed</option>)}</select></div>{group&&<><button className="btn-secondary" onClick={confirmAll}>Confirm all valid</button><button className="btn-primary" onClick={createSchedule}>Create schedule</button><button className="text-red-600 px-3 py-2" onClick={removeBatch}>Delete batch</button></>}</div>
    {loading?<div className="p-8 text-center">Loading drafts…</div>:<div className="grid lg:grid-cols-2 gap-4">{drafts.map(draft=><article key={draft._id} className="bg-white border rounded-2xl p-4 space-y-3"><div className="flex gap-3"><img src={draft.media?.find(m=>m.included!==false)?.url} alt="" className="w-16 h-16 object-contain rounded-lg border"/><div className="min-w-0 flex-1"><p className="font-semibold truncate">{draft.productName}</p><div className="flex gap-2 items-center mt-1"><Badge status={draft.confirmationStatus}/><span className="text-xs capitalize">{draft.platform}</span></div><p className="text-xs text-gray-500 mt-1">{displayTime(draft.scheduledFor,draft.configSnapshot?.timezone)}</p></div></div><div className="text-xs bg-gray-50 rounded-xl p-3 whitespace-pre-wrap line-clamp-6">{draft.editedContent||draft.generatedContent}</div><div className="text-xs flex gap-3"><span>{money(draft.priceSnapshot?.regularPrice)}</span><span className="text-red-600">{money(draft.priceSnapshot?.finalPrice)}</span><span>{draft.priceSnapshot?.discountPercent||0}% off</span></div>{draft.validation?.warnings?.map((w,i)=><p key={i} className="text-xs text-amber-700">⚠ {w}</p>)}{draft.validation?.errors?.map((e,i)=><p key={i} className="text-xs text-red-700">✕ {e}</p>)}<div className="flex gap-2"><button className="btn-secondary flex-1" onClick={()=>setEditing(draft)}>Open & edit</button>{draft.confirmationStatus!=='confirmed'&&<button disabled={!draft.validation?.valid} className="btn-primary disabled:opacity-40" onClick={()=>mutate(()=>API.post(`/social-scheduling/drafts/${draft._id}/confirm`),'Draft confirmed')}>Confirm</button>}<button className="text-red-500 px-2" onClick={()=>window.confirm('Delete this draft?')&&mutate(()=>API.delete(`/social-scheduling/drafts/${draft._id}`),'Draft deleted')}>Delete</button></div></article>)}</div>}
    {editing&&<DraftEditor draft={editing} onClose={()=>setEditing(null)} onSaved={saved=>setDrafts(v=>v.map(d=>d._id===saved._id?saved:d))}/>}</div>;
}

function ActivitiesPanel({ focusId, onViewQueue }) {
  const [data,setData]=useState({schedules:[]});const [filter,setFilter]=useState('');
  const load=useCallback(async()=>{try{const {data}=await API.get('/social-scheduling/schedules',{params:{status:filter||undefined,limit:100}});setData(data);}catch(e){toast.error(messageOf(e));}},[filter]);
  useEffect(()=>{load();const timer=setInterval(load,30000);return()=>clearInterval(timer)},[load]);
  const action=async(id,name)=>{if((name==='stop'||name==='delete')&&!window.confirm(`${name} this activity? Pending posts will be cancelled.`))return;try{name==='delete'?await API.delete(`/social-scheduling/schedules/${id}`):await API.post(`/social-scheduling/schedules/${id}/${name}`);toast.success(`Activity ${name}d`);load();}catch(e){toast.error(messageOf(e));}};
  return <div className="space-y-4"><div className="bg-white border rounded-2xl p-4 flex items-center justify-between"><h3 className="font-bold">Scheduling Activities</h3><select className="form-input max-w-48" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All statuses</option>{['draft','scheduled','running','paused','completed','stopped','failed'].map(v=><option key={v}>{v}</option>)}</select></div><div className="grid lg:grid-cols-2 gap-4">{data.schedules.map(s=><article key={s._id} className={`bg-white border rounded-2xl p-4 space-y-3 ${focusId===s._id?'ring-2 ring-primary':''}`}><div className="flex justify-between gap-2"><div><h4 className="font-bold">{s.name}</h4><p className="text-xs text-gray-500">{s.platforms.join(', ')} · {s.timezone}</p></div><Badge status={s.status}/></div><div className="grid grid-cols-5 gap-1 text-center text-xs"><div><b>{s.counts?.total||0}</b><br/>Total</div><div className="text-green-700"><b>{s.counts?.published||0}</b><br/>Posted</div><div className="text-blue-700"><b>{s.counts?.pending||0}</b><br/>Pending</div><div className="text-red-700"><b>{s.counts?.failed||0}</b><br/>Failed</div><div className="text-amber-700"><b>{(s.counts?.skipped||0)+(s.counts?.needsReview||0)}</b><br/>Review</div></div><p className="text-xs"><strong>Next:</strong> {displayTime(s.nextRunAt,s.timezone)} · <strong>Last:</strong> {displayTime(s.lastExecutionAt,s.timezone)}</p><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>onViewQueue(s._id)}>View queue</button>{['scheduled','running'].includes(s.status)&&<button className="btn-secondary" onClick={()=>action(s._id,'pause')}>Pause</button>}{s.status==='paused'&&<button className="btn-primary" onClick={()=>action(s._id,'resume')}>Resume</button>}{!['completed','stopped'].includes(s.status)&&<button className="text-amber-700 px-2" onClick={()=>action(s._id,'stop')}>Stop</button>}<button className="text-red-600 px-2" onClick={()=>action(s._id,'delete')}>Delete</button></div></article>)}</div>{!data.schedules.length&&<div className="p-10 text-center text-gray-400">No scheduling activities yet.</div>}</div>;
}

function QueueEditor({ item,onClose,onSaved }){const[content,setContent]=useState(item.content);const[scheduledFor,setScheduledFor]=useState(new Date(item.scheduledFor).toISOString().slice(0,16));const[cta,setCta]=useState(item.cta);const save=async()=>{try{const{data}=await API.put(`/social-scheduling/queue/${item._id}`,{content,scheduledFor:new Date(scheduledFor).toISOString(),cta});toast.success('Queue item updated');onSaved(data);onClose();}catch(e){toast.error(messageOf(e));}};return <Modal title={`Queue item · ${item.productName}`} onClose={onClose}><div className="space-y-4"><textarea className="form-input min-h-[360px]" value={content} onChange={e=>setContent(e.target.value)}/><div className="grid grid-cols-2 gap-3"><div><label className="form-label">Scheduled time</label><input type="datetime-local" className="form-input" value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)}/></div><div><label className="form-label">CTA</label><select className="form-input" value={cta} onChange={e=>setCta(e.target.value)}><option value="none">None</option><option value="shop_now">Shop Now</option><option value="whatsapp">WhatsApp</option></select></div></div><button className="btn-primary w-full" onClick={save}>Save pending item</button></div></Modal>}

function QueuePanel({ scheduleId }){const[filters,setFilters]=useState({schedule:scheduleId||'',status:'',platform:'',date:''});const[data,setData]=useState({items:[],page:1,pages:1,total:0});const[page,setPage]=useState(1);const[editing,setEditing]=useState(null);useEffect(()=>setFilters(v=>({...v,schedule:scheduleId||v.schedule})),[scheduleId]);const load=useCallback(async()=>{try{const params={...filters,page,limit:50};Object.keys(params).forEach(k=>!params[k]&&delete params[k]);const{data}=await API.get('/social-scheduling/queue',{params});setData(data);}catch(e){toast.error(messageOf(e));}},[filters,page]);useEffect(()=>{load()},[load]);const act=async(item,name)=>{if(name==='cancel'&&!window.confirm('Cancel this unpublished queue item?'))return;try{name==='retry'?await API.post(`/social-scheduling/queue/${item._id}/retry`):await API.delete(`/social-scheduling/queue/${item._id}`);toast.success(name==='retry'?'Retry queued':'Queue item cancelled');load();}catch(e){toast.error(messageOf(e));}};return <div className="space-y-4"><div className="bg-white border rounded-2xl p-4"><h3 className="font-bold mb-3">Scheduled Queue</h3><div className="grid sm:grid-cols-4 gap-2"><input className="form-input" placeholder="Schedule ID" value={filters.schedule} onChange={e=>setFilters(v=>({...v,schedule:e.target.value}))}/><select className="form-input" value={filters.status} onChange={e=>setFilters(v=>({...v,status:e.target.value}))}><option value="">All statuses</option>{['pending','processing','published','failed','skipped','cancelled','needs_review'].map(v=><option key={v}>{v}</option>)}</select><select className="form-input" value={filters.platform} onChange={e=>setFilters(v=>({...v,platform:e.target.value}))}><option value="">All platforms</option><option>facebook</option><option>instagram</option></select><input type="date" className="form-input" value={filters.date} onChange={e=>setFilters(v=>({...v,date:e.target.value}))}/></div></div><div className="bg-white border rounded-2xl overflow-x-auto"><table className="min-w-[1050px] w-full text-sm"><thead className="bg-gray-50 text-left"><tr><th className="p-3">Product</th><th>Platform</th><th>Scheduled</th><th>Status</th><th>Description</th><th>CTA</th><th>Attempts</th><th>Error / Published</th><th></th></tr></thead><tbody className="divide-y">{data.items.map(item=><tr key={item._id}><td className="p-3 font-medium max-w-48 truncate">{item.productName}</td><td className="capitalize">{item.platform}</td><td>{displayTime(item.scheduledFor,item.schedule?.timezone)}</td><td><Badge status={item.status}/></td><td className="max-w-64 truncate">{item.content}</td><td>{item.cta}</td><td>{item.attempts}/{item.maxAttempts}</td><td className="max-w-56"><span className="text-xs text-red-600 line-clamp-2">{item.lastError}</span>{item.publishedUrl&&<a href={item.publishedUrl} target="_blank" rel="noreferrer" className="text-blue-600 text-xs">Open published post ↗</a>}{item.publishedPostId&&<p className="text-xs text-gray-400 truncate">{item.publishedPostId}</p>}</td><td><div className="flex gap-2">{['pending','failed','needs_review'].includes(item.status)&&<button className="text-blue-600" onClick={()=>setEditing(item)}>Open</button>}{item.status==='failed'&&<button className="text-amber-700" onClick={()=>act(item,'retry')}>Retry</button>}{['pending','failed','needs_review'].includes(item.status)&&<button className="text-red-600" onClick={()=>act(item,'cancel')}>Cancel</button>}</div></td></tr>)}</tbody></table>{!data.items.length&&<div className="p-10 text-center text-gray-400">No queue items match these filters.</div>}</div><div className="flex justify-between text-sm"><span>{data.total} queue items</span><div className="flex gap-2"><button className="btn-secondary" disabled={page<=1} onClick={()=>setPage(v=>v-1)}>Previous</button><span className="py-2">{page}/{data.pages||1}</span><button className="btn-secondary" disabled={page>=data.pages} onClick={()=>setPage(v=>v+1)}>Next</button></div></div>{editing&&<QueueEditor item={editing} onClose={()=>setEditing(null)} onSaved={()=>load()}/>}</div>}

export default function SocialPostManagement({ connectedPlatforms=[] }){
  const[tab,setTab]=useState('create');const[draftGroup,setDraftGroup]=useState('');const[focusSchedule,setFocusSchedule]=useState('');
  const openDrafts=group=>{setDraftGroup(group);setTab('drafts')};const openActivity=id=>{setFocusSchedule(id);setTab('activities')};const openQueue=id=>{setFocusSchedule(id);setTab('queue')};
  return <div className="space-y-5"><div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">{[['create','Create schedule'],['drafts','Draft review'],['activities','Activities'],['queue','Scheduled queue']].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-semibold ${tab===id?'bg-white shadow text-primary':'text-gray-600'}`}>{label}</button>)}</div>{tab==='create'&&<SetupPanel connectedPlatforms={connectedPlatforms} onGenerated={openDrafts}/>} {tab==='drafts'&&<DraftsPanel preferredGroup={draftGroup} onScheduled={openActivity}/>} {tab==='activities'&&<ActivitiesPanel focusId={focusSchedule} onViewQueue={openQueue}/>} {tab==='queue'&&<QueuePanel scheduleId={focusSchedule}/>}</div>;
}
