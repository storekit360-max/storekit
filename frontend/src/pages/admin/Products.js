import React, { useEffect, useState, useCallback, useRef } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';
import ImageUpload from '../../components/ImageUpload';

const VARIANT_TYPES = [
  { value:'size',     label:'Size',          icon:'📏', defaultValues:['XS','S','M','L','XL','XXL'] },
  { value:'color',    label:'Color',         icon:'🎨', defaultValues:['Red','Blue','Green','Black','White','Yellow'] },
  { value:'material', label:'Material',      icon:'🧵', defaultValues:['Cotton','Polyester','Silk','Leather','Wool'] },
  { value:'style',    label:'Style',         icon:'✨', defaultValues:['Classic','Modern','Vintage','Slim Fit','Regular Fit'] },
  { value:'storage',  label:'Storage',       icon:'💾', defaultValues:['64GB','128GB','256GB','512GB','1TB'] },
  { value:'weight',   label:'Weight',        icon:'⚖️', defaultValues:['Light','Medium','Heavy'] },
  { value:'flavor',   label:'Flavor',        icon:'🍫', defaultValues:['Chocolate','Vanilla','Strawberry','Mint'] },
  { value:'button',   label:'Custom Option', icon:'🔘', defaultValues:[] },
];

const DRAFT_KEY = 'storekit_product_draft';

const emptyProduct = {
  name:'', description:'', shortDescription:'', price:'', salePrice:'',
  costPrice:'', sku:'', category:'', subCategory:'', brand:'', stock:'5', lowStockThreshold:5,
  weight:'', thumbnail:'', images:[],
  tags:'', isFeatured:false, isActive:true, isOnSale:false,
  specifications:[], variants:[]
};

/* ── Modal ── */
const Modal = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide?'max-w-4xl':'max-w-2xl'} max-h-[92vh] overflow-y-auto`} onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
        <h2 className="font-display font-bold text-xl text-gray-900">{title}</h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">✕</button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

/* ── Rich Text Editor ── */
function RichEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const lastVal   = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (value !== lastVal.current) {
      lastVal.current = value;
      editorRef.current.innerHTML = value || '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const fire = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastVal.current = html;
    onChange(html);
  };

  const exec = (cmd, val = null) => { editorRef.current?.focus(); document.execCommand(cmd, false, val); fire(); };

  const insertTable = () => {
    const rows = parseInt(window.prompt('Rows?', '3')) || 3;
    const cols = parseInt(window.prompt('Columns?', '3')) || 3;
    let html = '<table border="1" style="border-collapse:collapse;width:100%;margin:8px 0"><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += r === 0
          ? '<th style="border:1px solid #ddd;padding:6px 10px;background:#f3f4f6;font-weight:600">&nbsp;</th>'
          : '<td style="border:1px solid #ddd;padding:6px 10px">&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';
    document.execCommand('insertHTML', false, html);
    fire();
  };

  const TB = ({ title: t, icon, onClick }) => (
    <button type="button" title={t} onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded text-xs font-bold hover:bg-gray-100 text-gray-700 transition-colors">
      {icon}
    </button>
  );
  const Div = () => <div className="w-px h-5 bg-gray-200 mx-0.5 self-center" />;

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 p-2 bg-gray-50 border-b border-gray-200">
        <select onChange={e=>{exec('formatBlock',e.target.value);e.target.value='';}} defaultValue=""
          className="text-xs border border-gray-200 rounded px-1 py-0.5 mr-1 bg-white">
          <option value="" disabled>Heading</option>
          <option value="h1">H1</option><option value="h2">H2</option>
          <option value="h3">H3</option><option value="h4">H4</option>
          <option value="p">Normal</option>
        </select>
        <TB title="Bold"           icon="B"    onClick={()=>exec('bold')} />
        <TB title="Italic"         icon={<em>I</em>} onClick={()=>exec('italic')} />
        <TB title="Underline"      icon={<u>U</u>}   onClick={()=>exec('underline')} />
        <TB title="Strikethrough"  icon={<s>S</s>}   onClick={()=>exec('strikeThrough')} />
        <Div/>
        <TB title="Align Left"     icon="⬅"   onClick={()=>exec('justifyLeft')} />
        <TB title="Align Center"   icon="☰"   onClick={()=>exec('justifyCenter')} />
        <TB title="Align Right"    icon="➡"   onClick={()=>exec('justifyRight')} />
        <Div/>
        <TB title="Bullet List"    icon="•≡"  onClick={()=>exec('insertUnorderedList')} />
        <TB title="Numbered List"  icon="1≡"  onClick={()=>exec('insertOrderedList')} />
        <TB title="Indent"         icon="→"   onClick={()=>exec('indent')} />
        <TB title="Outdent"        icon="←"   onClick={()=>exec('outdent')} />
        <Div/>
        <TB title="Insert Table"   icon="⊞"   onClick={insertTable} />
        <TB title="Insert Link"    icon="🔗"  onClick={()=>{const u=window.prompt('URL:','https://');if(u)exec('createLink',u);}} />
        <TB title="Remove Link"    icon="✂"   onClick={()=>exec('unlink')} />
        <TB title="Horiz. Rule"    icon="—"   onClick={()=>exec('insertHorizontalRule')} />
        <TB title="Clear Format"   icon="✕"   onClick={()=>exec('removeFormat')} />
        <select onChange={e=>{exec('fontSize',e.target.value);e.target.value='';}} defaultValue=""
          className="text-xs border border-gray-200 rounded px-1 py-0.5 ml-1 bg-white">
          <option value="" disabled>Size</option>
          {[1,2,3,4,5,6,7].map(s=><option key={s} value={s}>{['8','10','12','14','18','24','36'][s-1]}px</option>)}
        </select>
        <label title="Text Color" className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 cursor-pointer">
          <span className="text-xs font-bold text-gray-700">A</span>
          <input type="color" className="w-0 h-0 opacity-0 absolute" onChange={e=>exec('foreColor',e.target.value)} />
        </label>
        <label title="Highlight" className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 cursor-pointer">
          <span className="text-xs font-bold" style={{background:'#fef08a',padding:'1px 2px'}}>H</span>
          <input type="color" className="w-0 h-0 opacity-0 absolute" onChange={e=>exec('hiliteColor',e.target.value)} />
        </label>
      </div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={fire}
        className="min-h-[180px] p-3 text-sm text-gray-800 outline-none overflow-y-auto"
        style={{maxHeight:'340px',lineHeight:'1.7'}} />
    </div>
  );
}

/* ── Specifications Panel ── */
function SpecsPanel({ specs, onChange, onAIGenerate, aiGeneratingSpecs }) {
  const [specKey,    setSpecKey]   = useState('');
  const [specVal,    setSpecVal]   = useState('');
  const [pasteText,  setPasteText] = useState('');
  const [showPaste,  setShowPaste] = useState(false);

  const specsRef = useRef(specs);
  useEffect(() => { specsRef.current = specs; }, [specs]);

  const addOne = () => {
    if (!specKey.trim() || !specVal.trim()) { toast.error('Enter both name and value'); return; }
    onChange([...specsRef.current, { key: specKey.trim(), value: specVal.trim() }]);
    setSpecKey(''); setSpecVal('');
  };

  const parseAndAdd = () => {
    if (!pasteText.trim()) { toast.error('Nothing to paste'); return; }
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];
    lines.forEach(line => {
      let key = '', value = '';
      const ci = line.indexOf(':');
      const pi = line.indexOf('|');
      const di = line.search(/\s-\s/);
      const ti = line.indexOf('\t');
      if      (ci > 0) { key = line.slice(0,ci).trim();  value = line.slice(ci+1).trim(); }
      else if (pi > 0) { key = line.slice(0,pi).trim();  value = line.slice(pi+1).trim(); }
      else if (di > 0) { key = line.slice(0,di).trim();  value = line.slice(di).replace(/^[\s-]+/,'').trim(); }
      else if (ti > 0) { key = line.slice(0,ti).trim();  value = line.slice(ti+1).trim(); }
      if (key && value) parsed.push({ key, value });
    });
    if (parsed.length === 0) { toast.error('Could not parse. Use format: Name: Value'); return; }
    onChange([...specsRef.current, ...parsed]);
    setPasteText(''); setShowPaste(false);
    toast.success(`Added ${parsed.length} spec${parsed.length>1?'s':''}`);
  };

  const remove   = i => onChange(specsRef.current.filter((_,si)=>si!==i));
  const moveUp   = i => { if(i===0)return; const s=[...specsRef.current];[s[i-1],s[i]]=[s[i],s[i-1]];onChange(s); };
  const moveDown = i => { if(i===specs.length-1)return; const s=[...specsRef.current];[s[i],s[i+1]]=[s[i+1],s[i]];onChange(s); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Add technical specifications shown on the product page.</p>
        {onAIGenerate && (
          <button
            onClick={onAIGenerate}
            disabled={aiGeneratingSpecs}
            style={{fontSize:11,padding:'4px 12px',borderRadius:20,border:'1.5px solid var(--color-primary)',color:'var(--color-primary)',background:'transparent',cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:5,opacity:aiGeneratingSpecs?0.5:1,flexShrink:0}}
          >
            {aiGeneratingSpecs
              ? <><span style={{display:'inline-block',width:10,height:10,border:'2px solid var(--color-primary)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}></span>Generating…</>
              : <>✨ AI Generate Specs</>}
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input value={specKey} onChange={e=>setSpecKey(e.target.value)}
          onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();document.getElementById('spec-val')?.focus();}}}
          className="form-input text-sm flex-1" placeholder="Spec name (e.g. Battery)"/>
        <input id="spec-val" value={specVal} onChange={e=>setSpecVal(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')addOne();}}
          className="form-input text-sm flex-1" placeholder="Value (e.g. 4000mAh)"/>
        <button onClick={addOne} className="btn-primary text-sm px-4 flex-shrink-0">+ Add</button>
      </div>
      <div>
        <button onClick={()=>setShowPaste(p=>!p)} className="text-xs text-blue-600 hover:underline">
          📋 {showPaste?'Hide':'Paste a full list instead'}
        </button>
        {showPaste && (
          <div className="mt-2 space-y-2">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">Paste specs below — one per line:</p>
              <p className="font-mono">Battery: 4000mAh &nbsp;·&nbsp; Display | 6.5 inch &nbsp;·&nbsp; RAM - 8GB</p>
            </div>
            <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
              className="form-input text-sm resize-none" rows={6}
              placeholder={"Battery: 4000mAh\nDisplay: 6.5 inch AMOLED\nRAM: 8GB\nStorage: 256GB"}/>
            <div className="flex gap-2">
              <button onClick={parseAndAdd} className="btn-primary text-sm">✓ Parse & Add All</button>
              <button onClick={()=>{setPasteText('');setShowPaste(false);}} className="btn-outline text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
      {specs.length > 0 ? (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {specs.map((spec,i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <button onClick={()=>moveUp(i)} className="text-gray-300 hover:text-gray-500 text-xs leading-none">▲</button>
                <button onClick={()=>moveDown(i)} className="text-gray-300 hover:text-gray-500 text-xs leading-none">▼</button>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-gray-700">{spec.key}</span>
                <span className="text-gray-300 mx-2">·</span>
                <span className="text-sm text-gray-600">{spec.value}</span>
              </div>
              <button onClick={()=>remove(i)} className="text-red-300 hover:text-red-500 text-sm">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-4 border-2 border-dashed border-gray-200 rounded-xl">
          No specifications yet.
        </p>
      )}
    </div>
  );
}

/* ── Draft Banner ── */
function DraftBanner({ savedAt, onRestore, onDiscard }) {
  if (!savedAt) return null;
  return (
    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
      <div className="flex items-center gap-2">
        <span>💾</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">Draft saved</p>
          <p className="text-xs text-amber-600">{savedAt}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onRestore} className="text-xs font-semibold text-amber-700 underline">Restore</button>
        <button onClick={onDiscard} className="text-xs text-gray-400">Discard</button>
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function AdminProducts() {
  const [products, setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState(emptyProduct);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand]       = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterStock, setFilterStock]       = useState('');
  const [brandsList, setBrandsList]         = useState([]);
  const [duplicateProductCount, setDuplicateProductCount] = useState(0);
  const [quickUpdating, setQuickUpdating] = useState({});
  const [activeTab, setActiveTab] = useState('basic');
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [hasDraft, setHasDraft]   = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');

  // ── Excel export state ────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  // ── SKU Image Bulk Upload state ───────────────────────────────────────────
  const [skuImageModal, setSkuImageModal]       = useState(false);
  const [skuZipFile, setSkuZipFile]             = useState(null);
  const [skuUploading, setSkuUploading]         = useState(false);
  const [skuResult, setSkuResult]               = useState(null);

  // ── Image Processing settings (Sharp pipeline + AI upscale) ──────────────
  const [imgSettings, setImgSettings]           = useState(null);
  const [imgSettingsLoading, setImgSettingsLoading] = useState(false);
  const [imgSettingsSaving, setImgSettingsSaving]   = useState(false);
  const [imgSettingsOpen, setImgSettingsOpen]       = useState(false);

  // ── Bulk import state ─────────────────────────────────────────────────────
  const [bulkModal, setBulkModal]       = useState(false);
  const [bulkFile, setBulkFile]         = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkResult, setBulkResult]     = useState(null);

  const formRef       = useRef(emptyProduct);
  const autoSaveTimer = useRef(null);
  const isEditMode    = useRef(false);

  // AI autofill state
  const [aiFillingBrand, setAiFillingBrand]     = useState(false);
  const [aiFillingShort, setAiFillingShort]     = useState(false);
  const [tagSuggestions, setTagSuggestions]     = useState([]);
  const [loadingTags, setLoadingTags]           = useState(false);
  const [loadingDescription, setLoadingDescription] = useState(false);
  const [aiGeneratingSpecs, setAiGeneratingSpecs]   = useState(false);
  const aiNameTimer = useRef(null);

  // ── URL Import state ──────────────────────────────────────────────────────
  const [urlImportValue, setUrlImportValue]         = useState('');
  const [urlImporting, setUrlImporting]             = useState(false);
  const [urlImportResult, setUrlImportResult]       = useState(null);
  const [urlImportImages, setUrlImportImages]       = useState([]);
  const [urlImportSelImages, setUrlImportSelImages] = useState([]);

  // ── Bulk URL Import modal ──
  const [bulkUrlModal, setBulkUrlModal]             = useState(false);
  const [bulkUrlText, setBulkUrlText]               = useState('');
  const [bulkUrlCategory, setBulkUrlCategory]       = useState('');
  const [bulkUrlRunning, setBulkUrlRunning]         = useState(false);
  const [bulkUrlProgress, setBulkUrlProgress]       = useState([]);
  const [bulkUrlSummary, setBulkUrlSummary]         = useState(null);
  const [bulkUrlRate, setBulkUrlRate]               = useState(10);
  const [bulkUrlMinimized, setBulkUrlMinimized]     = useState(false);
  const bulkUrlAbortRef                             = useRef(false);

  const updateForm = useCallback((updater) => {
    setForm(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      formRef.current = next;
      return next;
    });
  }, []);

  const shortDescManuallyEdited = useRef(false);

  const autofillFromName = async (name) => {
    if (!name || name.length < 3) return;
    setAiFillingBrand(true);
    setAiFillingShort(true);
    try {
      const current = formRef.current;
      const categoryName = (() => {
        try {
          const catObj = categories.find(c => c._id === current.category);
          return catObj?.name || '';
        } catch { return ''; }
      })();
      const { data } = await API.post('/ai/autofill', {
        name,
        category:  categoryName,
        brand:     current.brand     || '',
        price:     current.price     || '',
        salePrice: current.salePrice || '',
      });
      updateForm(p => ({
        ...p,
        brand: (!p.brand && data.brand) ? data.brand : p.brand,
        shortDescription: (data.shortDescription && (!p.shortDescription || !shortDescManuallyEdited.current))
          ? data.shortDescription
          : p.shortDescription,
      }));
    } catch (err) {
      console.error('[AI autofill]', err?.response?.data?.message || err.message);
    } finally {
      setAiFillingBrand(false);
      setAiFillingShort(false);
    }
  };

  const fetchTagSuggestions = async (name, category, brand) => {
    if (!name || name.length < 3) return;
    setLoadingTags(true);
    setTagSuggestions([]);
    try {
      const { data } = await API.post('/ai/tags', { name, category, brand });
      if (Array.isArray(data.tags)) setTagSuggestions(data.tags.slice(0, 10));
    } catch (err) {
      console.error('[AI tags]', err?.response?.data?.message || err.message);
      toast.error('Could not fetch tag suggestions');
    } finally {
      setLoadingTags(false);
    }
  };

  const fetchAIDescription = async () => {
    const current = formRef.current;
    if (!current.name || current.name.trim().length < 3) {
      toast.error('Enter a product name first'); return;
    }
    setLoadingDescription(true);
    const toastId = toast.loading('✨ Generating description…');
    try {
      const categoryName = categories.find(c => c._id === current.category)?.name || '';
      const { data } = await API.post('/ai/description', {
        name:             current.name,
        category:         categoryName,
        brand:            current.brand || '',
        sku:              current.sku || '',
        price:            current.price || '',
        salePrice:        current.salePrice || '',
        shortDescription: current.shortDescription || '',
        tags:             current.tags || '',
      });
      if (data.description) {
        updateForm(p => ({ ...p, description: data.description }));
        toast.success('✅ Description generated!', { id: toastId });
      } else {
        throw new Error('Empty response');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not generate description', { id: toastId });
    } finally {
      setLoadingDescription(false);
    }
  };

  const generateAISpecs = async () => {
    const current = formRef.current;
    if (!current.name || current.name.trim().length < 3) {
      toast.error('Enter a product name first'); return;
    }
    setAiGeneratingSpecs(true);
    const toastId = toast.loading('✨ Generating specifications…');
    try {
      const categoryName = categories.find(c => c._id === current.category)?.name || '';
      const { data } = await API.post('/ai/specs', {
        name:        current.name,
        category:    categoryName,
        brand:       current.brand       || '',
        sku:         current.sku         || '',
        price:       current.price       || '',
        salePrice:   current.salePrice   || '',
        description: current.description || '',
      });
      if (Array.isArray(data.specs) && data.specs.length > 0) {
        updateForm(p => ({ ...p, specifications: data.specs }));
        toast.success(`✅ ${data.specs.length} specs generated!`, { id: toastId });
      } else {
        throw new Error('Empty response');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not generate specs', { id: toastId });
    } finally {
      setAiGeneratingSpecs(false);
    }
  };

  const handleNameChange = (name) => {
    updateForm(p => ({ ...p, name }));
    clearTimeout(aiNameTimer.current);
    aiNameTimer.current = setTimeout(() => {
      autofillFromName(name);
    }, 900);
  };

  const toggleTag = (tag) => {
    updateForm(p => {
      const existing = p.tags ? p.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
      const idx = existing.indexOf(tag);
      const updated = idx >= 0 ? existing.filter(t => t !== tag) : [...existing, tag];
      return { ...p, tags: updated.join(", ") };
    });
  };

  /* ── Fetch products ── */
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 15 });
      if (search)         params.set('search',   search);
      if (filterCategory) params.set('category', filterCategory);
      if (filterBrand)    params.set('brand',    filterBrand);
      if (filterStatus)   params.set('status',   filterStatus);
      if (filterStock)    params.set('stock',    filterStock);
      const { data } = await API.get(`/products/admin/all?${params.toString()}`);
      setProducts(data.products); setTotalPages(data.pages); setDuplicateProductCount(data.duplicateProductCount || 0);
    } catch {} finally { setLoading(false); }
  }, [search, page, filterCategory, filterBrand, filterStatus, filterStock]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { API.get('/categories/all').then(r=>setCategories(r.data)).catch(()=>{ API.get('/categories').then(r=>setCategories(r.data)).catch(()=>{}); }); }, []);
  useEffect(() => { API.get('/products/admin/brands').then(r=>setBrandsList(r.data)).catch(()=>{}); }, []);

  /* ── Check draft on mount ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setHasDraft(true);
        setDraftSavedAt(d.savedAt ? new Date(d.savedAt).toLocaleString() : 'Unknown');
      }
    } catch {}
  }, []);

  /* ── Auto-save (add mode only) ── */
  const saveDraft = useCallback((data) => {
    if (isEditMode.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
      setDraftSavedAt(new Date().toLocaleString());
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus(''), 2000);
    } catch {}
  }, []);

  useEffect(() => {
    if (!modal || modal === 'edit') return;
    setAutoSaveStatus('saving');
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveDraft(formRef.current), 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [form, modal, saveDraft]);

  /* ── Open Add ── */
  const openAdd = useCallback(() => {
    isEditMode.current = false;
    formRef.current = { ...emptyProduct };
    setForm({ ...emptyProduct });
    setModal('add');
    setActiveTab('basic');
  }, []);

  /* ── Restore draft ── */
  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      // eslint-disable-next-line no-unused-vars
      const { savedAt, ...data } = JSON.parse(raw);
      const restored = { ...emptyProduct, ...data };
      formRef.current = restored;
      setForm(restored);
      setHasDraft(false);
      toast.success('Draft restored!');
      isEditMode.current = false;
      setModal('add');
      setActiveTab('basic');
    } catch { toast.error('Could not restore draft'); }
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false); setDraftSavedAt(null);
    toast.success('Draft discarded');
  };

  /* ── Open Edit ── */
  const openEdit = (p) => {
    isEditMode.current = true;
    const ef = {
      ...emptyProduct, ...p,
      category: p.category?._id || p.category,
      subCategory: p.subCategory || '',
      tags: Array.isArray(p.tags) ? p.tags.join(', ') : '',
      price:             p.price        != null ? String(p.price)             : '',
      salePrice:         p.salePrice    != null ? String(p.salePrice)         : '',
      costPrice:         p.costPrice    != null ? String(p.costPrice)         : '',
      stock:             p.stock        != null ? String(p.stock)             : '',
      weight:            p.weight       != null ? String(p.weight)            : '',
      lowStockThreshold: p.lowStockThreshold != null ? String(p.lowStockThreshold) : '5',
      specifications: p.specifications || [], variants: p.variants || []
    };
    formRef.current = ef;
    setForm(ef);
    setModal('edit'); setActiveTab('basic');
  };

  const closeModal = () => {
    setModal(null);
    setTagSuggestions([]);
    shortDescManuallyEdited.current = false;
    setUrlImportValue('');
    setUrlImportResult(null);
    setUrlImportImages([]);
    setUrlImportSelImages([]);
  };

  /* ── URL Import: fetch product data from URL ── */
  const handleUrlImport = async () => {
    if (!urlImportValue.trim()) { toast.error('Enter a product URL'); return; }
    setUrlImporting(true);
    setUrlImportResult(null);
    setUrlImportImages([]);
    setUrlImportSelImages([]);
    try {
      const { data } = await API.post('/scrape/product', { url: urlImportValue.trim() });
      setUrlImportResult(data);
      setUrlImportImages(data.images || []);
      // Pre-select all images by default
      setUrlImportSelImages(data.images || []);
      toast.success('Product data fetched! Review and click "Apply to Form".');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not fetch product from that URL');
    } finally {
      setUrlImporting(false);
    }
  };

  /* ── URL Import: apply scraped data into the product form ── */
  const applyUrlImport = () => {
    if (!urlImportResult) return;
    const d = urlImportResult;
    const selectedImages = urlImportSelImages;
    updateForm(prev => ({
      ...prev,
      name:             d.name             || prev.name,
      price:            d.price != null    ? String(d.price)     : prev.price,
      salePrice:        d.salePrice != null ? String(d.salePrice) : prev.salePrice,
      description:      d.description      || prev.description,
      shortDescription: d.shortDescription || prev.shortDescription,
      brand:            d.brand            || prev.brand,
      sku:              d.sku              || prev.sku,
      thumbnail:        selectedImages[0]  || prev.thumbnail,
      images:           selectedImages.slice(1),
      specifications:   (Array.isArray(d.specifications) && d.specifications.length > 0)
                          ? d.specifications
                          : prev.specifications,
    }));
    toast.success('Fields filled from URL! Review them then save.');
    setActiveTab('basic');
  };


  /* ── Bulk URL Import ── */
  const handleBulkUrlStart = async () => {
    const urls = bulkUrlText.split(/\n/).map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) { toast.error('Paste at least one URL'); return; }
    if (!bulkUrlCategory) { toast.error('Select a category first'); return; }
    if (urls.length > 200) { toast.error('Max 200 URLs per batch'); return; }

    setBulkUrlRunning(true);
    setBulkUrlProgress([]);
    setBulkUrlSummary(null);
    setBulkUrlMinimized(false);
    bulkUrlAbortRef.current = false;

    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const baseURL = (API.defaults?.baseURL || '').replace(/\/$/, '');

    try {
      const resp = await fetch(`${baseURL}/scrape/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ urls, categoryId: bulkUrlCategory, uploadImages: true, ratePerMinute: bulkUrlRate }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: 'Server error' }));
        toast.error(err.message || 'Bulk import failed');
        setBulkUrlRunning(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        if (bulkUrlAbortRef.current) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, '').trim();
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'progress') {
              setBulkUrlProgress(prev => {
                const next = [...prev];
                next[msg.index] = { url: msg.url, status: msg.status, message: msg.message, product: msg.product };
                return next;
              });
            } else if (msg.type === 'complete') {
              setBulkUrlSummary({ saved: msg.saved, failed: msg.failed, errors: msg.errors });
              if (msg.saved > 0) fetchProducts();
            }
          } catch (_) {}
        }
      }
    } catch (err) {
      toast.error('Connection error: ' + err.message);
    } finally {
      setBulkUrlRunning(false);
    }
  };
  /* ── Save ── */
  const handleSave = async () => {
    const f = formRef.current;
    if (!f.name || !f.price || !f.category || !f.description) {
      toast.error('Fill required fields: name, price, category, description'); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...f,
        tags: f.tags ? f.tags.split(",").map(t=>t.trim()).filter(Boolean) : [],
        price:             Number(f.price),
        salePrice:         f.salePrice  ? Number(f.salePrice)  : undefined,
        costPrice:         f.costPrice  ? Number(f.costPrice)  : undefined,
        stock:             Number(f.stock) || 0,
        weight:            f.weight ? Number(f.weight) : undefined,
        lowStockThreshold: f.lowStockThreshold ? Number(f.lowStockThreshold) : 5,
        specifications: f.specifications || [],
      };
      if (modal === 'edit' && f._id) {
        await API.put(`/products/${f._id}`, payload);
        toast.success('Product updated!');
      } else {
        await API.post('/products', payload);
        toast.success('Product created!');
        localStorage.removeItem(DRAFT_KEY);
        setHasDraft(false); setDraftSavedAt(null);
      }
      setModal(null); fetchProducts();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (id, current) => {
    try {
      await API.put(`/products/${id}`, { isActive: !current });
      setProducts(p => p.map(x => x._id===id ? {...x,isActive:!current} : x));
    } catch { toast.error('Failed'); }
  };

  const toggleQuickFlag = async (product, field) => {
    const key = `${product._id}:${field}`;
    setQuickUpdating(p => ({...p, [key]: true}));
    try {
      const { data } = await API.patch(`/products/admin/${product._id}/quick-flags`, { [field]: !product[field] });
      setProducts(rows => rows.map(row => row._id === product._id ? { ...row, ...data, duplicateInfo: row.duplicateInfo } : row));
      toast.success(`${field === 'isFeatured' ? 'Featured' : 'On Sale'} ${data[field] ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update product');
    } finally {
      setQuickUpdating(p => ({...p, [key]: false}));
    }
  };

  /* ── Bulk Import: Download Template ── */
  const handleDownloadTemplate = async () => {
    setBulkDownloading(true);
    const toastId = toast.loading('⏳ Preparing template…');
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const baseURL = API.defaults?.baseURL || '';
      const response = await fetch(`${baseURL}/products/admin/import-template/excel`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to download template');
      }
      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'storekit-product-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('✅ Template downloaded!', { id: toastId });
    } catch (err) {
      toast.error(err.message || 'Failed to download template', { id: toastId });
    } finally {
      setBulkDownloading(false);
    }
  };

  /* ── Bulk Import: Upload filled file ── */
  const handleBulkUpload = async () => {
    if (!bulkFile) { toast.error('Please choose an Excel file first'); return; }
    setBulkUploading(true);
    setBulkResult(null);
    const toastId = toast.loading('⏳ Importing products…');
    try {
      const formData = new FormData();
      formData.append('file', bulkFile);
      const { data } = await API.post('/products/admin/import/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBulkResult(data);
      if (data.created > 0) {
        toast.success(`✅ Imported ${data.created} product${data.created === 1 ? '' : 's'}!`, { id: toastId });
        fetchProducts();
      } else {
        toast.error('No products were imported. See details below.', { id: toastId });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk import failed', { id: toastId });
    } finally {
      setBulkUploading(false);
    }
  };

  /* ── Image Processing Settings: fetch & save ── */
  const fetchImgSettings = async () => {
    setImgSettingsLoading(true);
    try {
      const { data } = await API.get('/upload/image-processing-settings');
      setImgSettings(data);
    } catch (err) {
      toast.error('Failed to load image processing settings');
    } finally {
      setImgSettingsLoading(false);
    }
  };

  const saveImgSettings = async () => {
    if (!imgSettings) return;
    setImgSettingsSaving(true);
    const toastId = toast.loading('Saving image processing settings…');
    try {
      const { data } = await API.put('/upload/image-processing-settings', imgSettings);
      setImgSettings(data.settings);
      toast.success('✅ Settings saved', { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings', { id: toastId });
    } finally {
      setImgSettingsSaving(false);
    }
  };

  /* ── SKU Image Bulk Upload: Upload ZIP ── */
  const handleSkuImageUpload = async () => {
    if (!skuZipFile) { toast.error('Please select a ZIP file first'); return; }
    setSkuUploading(true);
    setSkuResult(null);
    const toastId = toast.loading('⏳ Uploading SKU images…');
    try {
      const formData = new FormData();
      formData.append('zipfile', skuZipFile);
      const { data } = await API.post('/upload/sku-images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSkuResult(data);
      if (data.matched > 0) {
        toast.success(`✅ Updated ${data.matched} product(s)!`, { id: toastId });
        fetchProducts();
      } else {
        toast.error('No products were updated. Check SKU names match.', { id: toastId });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'SKU image upload failed', { id: toastId });
    } finally {
      setSkuUploading(false);
    }
  };

  const closeSkuImageModal = () => {
    setSkuImageModal(false);
    setSkuZipFile(null);
    setSkuResult(null);
  };

  const closeBulkModal = () => {
    setBulkModal(false);
    setBulkFile(null);
    setBulkResult(null);
  };

  /* ── Excel Export ── */
  const handleExportExcel = async () => {
    setExporting(true);
    const toastId = toast.loading('⏳ Generating Excel file…');
    try {
      // Use fetch directly so we can handle a binary (blob) response
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const baseURL = API.defaults?.baseURL || '';
      const response = await fetch(`${baseURL}/products/admin/export/excel`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Export failed');
      }

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      // Try to extract filename from Content-Disposition, else use a default
      const cd   = response.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `storekit-products-${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success('✅ Excel file downloaded!', { id: toastId });
    } catch (err) {
      toast.error(err.message || 'Export failed', { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  /* ── Publish to Social Media ── */
  const [publishModal, setPublishModal] = useState(null);
  const [publishPlatforms, setPublishPlatforms] = useState([]);
  const [publishMsg, setPublishMsg] = useState('');
  const [publishing, setPublishing] = useState(false);

  const PLATFORMS = [
    { id:'facebook',  label:'Facebook',  icon:'📘' },
    { id:'instagram', label:'Instagram', icon:'📸' },
    { id:'tiktok',    label:'TikTok',    icon:'🎵' },
    { id:'whatsapp',  label:'WhatsApp',  icon:'💬' },
    { id:'telegram',  label:'Telegram',  icon:'✈️' },
  ];

  const openPublishModal = (product) => {
    setPublishModal({ product });
    setPublishPlatforms([]);
    setPublishMsg('');
  };

  const togglePlatform = (id) =>
    setPublishPlatforms(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

  const handlePublish = async () => {
    if (!publishPlatforms.length) { toast.error('Select at least one platform'); return; }
    setPublishing(true);
    try {
      const { data } = await API.post(`/products/${publishModal.product._id}/publish`, {
        platforms: publishPlatforms,
        customMsg: publishMsg,
      });
      const ok  = data.logs.filter(l => l.status === 'success');
      const bad = data.logs.filter(l => l.status !== 'success');
      if (ok.length)  toast.success(`✅ Published to ${ok.map(l=>l.platform).join(', ')}`);
      if (bad.length) toast.error(`❌ Failed: ${bad.map(l=>`${l.platform} (${l.message})`).join(', ')}`);
      if (ok.length) setPublishModal(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this product? This cannot be undone.')) return;
    try {
      await API.delete(`/products/${id}`);
      toast.success('Product deleted');
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete product');
    }
  };

  /* ── Variant helpers ── */
  const addVariant       = () => updateForm(p=>({...p,variants:[...(p.variants||[]),{name:'',type:'button',required:true,values:[]}]}));
  const removeVariant    = i  => updateForm(p=>({...p,variants:p.variants.filter((_,vi)=>vi!==i)}));
  const updateVariant    = (i,k,v) => updateForm(p=>({...p,variants:p.variants.map((vt,vi)=>vi===i?{...vt,[k]:v}:vt)}));
  const addVariantValue  = vi => updateForm(p=>({...p,variants:p.variants.map((v,i)=>i===vi?{...v,values:[...v.values,{label:'',value:'',priceModifier:0,isAvailable:true}]}:v)}));
  const removeVariantValue = (vi,vvi) => updateForm(p=>({...p,variants:p.variants.map((v,i)=>i===vi?{...v,values:v.values.filter((_,j)=>j!==vvi)}:v)}));
  const updateVariantValue = (vi,vvi,k,val) => updateForm(p=>({...p,variants:p.variants.map((v,i)=>i===vi?{...v,values:v.values.map((vv,j)=>j===vvi?{...vv,[k]:val}:vv)}:v)}));
  const applyPreset = (vi,type) => {
    const preset = VARIANT_TYPES.find(t=>t.value===type);
    if (!preset) return;
    const newVals = preset.defaultValues.map(v=>({label:v,value:v.toLowerCase().replace(/\s/g,'-'),priceModifier:0,isAvailable:true}));
    updateForm(p=>({...p,variants:p.variants.map((v,i)=>i===vi?{...v,name:preset.label,type,values:newVals}:v)}));
  };

  const TABS = [
    {id:'urlImport', label:'🔗 Import URL'},
    {id:'basic',    label:'📝 Basic Info'},
    {id:'images',   label:'🖼️ Images'},
    {id:'variants', label:'🎨 Variants'},
    {id:'specs',    label:'📋 Specs'},
    {id:'seo',      label:'⚙️ Settings'},
  ];

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Products</h2>
          <p className="text-sm text-gray-500">Manage your product catalog</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasDraft && (
            <button onClick={restoreDraft}
              className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 flex items-center gap-1.5">
              💾 Resume Draft
            </button>
          )}
          {/* ── Export to Excel button ── */}
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all disabled:opacity-60"
            style={{
              background: exporting ? '#f0fdf4' : '#f0fdf4',
              borderColor: '#16a34a',
              color: '#15803d',
            }}
            title="Download full product list as Excel spreadsheet"
          >
            {exporting
              ? <><span style={{display:'inline-block',width:12,height:12,border:'2px solid #16a34a',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}></span> Exporting…</>
              : <>📊 Export Excel</>
            }
          </button>
          <button onClick={()=>{setSkuImageModal(true); setSkuResult(null); setSkuZipFile(null); fetchImgSettings();}}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all"
            style={{ background:'#fdf4ff', borderColor:'#a855f7', color:'#7e22ce' }}
            title="Bulk assign images to products by SKU folder">
            🗂️ SKU Images
          </button>
          <button onClick={()=>{setBulkModal(true); setBulkResult(null); setBulkFile(null);}}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all"
            style={{ background:'#eff6ff', borderColor:'#3b82f6', color:'#1d4ed8' }}
            title="Bulk upload products via Excel">
            📥 Bulk Upload
          </button>
          <button onClick={()=>{setBulkUrlModal(true); setBulkUrlProgress([]); setBulkUrlSummary(null); setBulkUrlRunning(false);}}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all"
            style={{ background:"#f0fdf4", borderColor:"#16a34a", color:"#15803d" }}
            title="Paste 100s of product URLs and auto-import them as drafts">
            🔗 Bulk URL Import
          </button>
          <button onClick={openAdd} className="btn-primary text-sm">+ Add Product</button>
        </div>
      </div>

      {hasDraft && !modal && (
        <DraftBanner savedAt={draftSavedAt} onRestore={restoreDraft} onDiscard={discardDraft} />
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        {/* Search row */}
        <div className="flex gap-2 mb-3">
          <input
            value={search}
            onChange={e=>{setSearch(e.target.value);setPage(1);}}
            placeholder="Search by name, brand or SKU…"
            className="form-input text-sm flex-1"
          />
          {(search||filterCategory||filterBrand||filterStatus||filterStock) && (
            <button
              onClick={()=>{setSearch('');setFilterCategory('');setFilterBrand('');setFilterStatus('');setFilterStock('');setPage(1);}}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 whitespace-nowrap"
              title="Clear all filters"
            >✕ Clear</button>
          )}
        </div>
        {/* Filter chips row */}
        <div className="flex flex-wrap gap-2">
          {/* Category */}
          <select
            value={filterCategory}
            onChange={e=>{setFilterCategory(e.target.value);setPage(1);}}
            className="text-xs font-medium border rounded-lg px-2.5 py-1.5 bg-white text-gray-600 hover:border-gray-300 focus:outline-none focus:ring-2 cursor-pointer"
            style={filterCategory ? {borderColor:'var(--color-primary)',color:'var(--color-primary)',background:'var(--color-primary)11'} : {borderColor:'#e5e7eb'}}
          >
            <option value="">All Categories</option>
            {categories.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}
          </select>

          {/* Brand */}
          <select
            value={filterBrand}
            onChange={e=>{setFilterBrand(e.target.value);setPage(1);}}
            className="text-xs font-medium border rounded-lg px-2.5 py-1.5 bg-white text-gray-600 hover:border-gray-300 focus:outline-none focus:ring-2 cursor-pointer"
            style={filterBrand ? {borderColor:'var(--color-primary)',color:'var(--color-primary)',background:'var(--color-primary)11'} : {borderColor:'#e5e7eb'}}
          >
            <option value="">All Brands</option>
            {brandsList.map(b=><option key={b} value={b}>{b}</option>)}
          </select>

          {/* Status */}
          <select
            value={filterStatus}
            onChange={e=>{setFilterStatus(e.target.value);setPage(1);}}
            className="text-xs font-medium border rounded-lg px-2.5 py-1.5 bg-white text-gray-600 hover:border-gray-300 focus:outline-none focus:ring-2 cursor-pointer"
            style={filterStatus ? {borderColor:'var(--color-primary)',color:'var(--color-primary)',background:'var(--color-primary)11'} : {borderColor:'#e5e7eb'}}
          >
            <option value="">All Statuses</option>
            <option value="active">✅ Active</option>
            <option value="hidden">🙈 Hidden</option>
            <option value="featured">⭐ Featured</option>
            <option value="sale">🏷️ On Sale</option>
            <option value="duplicates">🚨 Duplicates ({duplicateProductCount})</option>
          </select>

          {/* Stock */}
          <select
            value={filterStock}
            onChange={e=>{setFilterStock(e.target.value);setPage(1);}}
            className="text-xs font-medium border rounded-lg px-2.5 py-1.5 bg-white text-gray-600 hover:border-gray-300 focus:outline-none focus:ring-2 cursor-pointer"
            style={filterStock ? {borderColor:'#ef4444',color:'#ef4444',background:'#fef2f2'} : {borderColor:'#e5e7eb'}}
          >
            <option value="">All Stock</option>
            <option value="out">🚫 Out of Stock</option>
            <option value="low">⚠️ Low Stock</option>
          </select>

          {/* Active filter count badge */}
          {[filterCategory,filterBrand,filterStatus,filterStock].filter(Boolean).length > 0 && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full text-white" style={{background:'var(--color-primary)'}}>
              {[filterCategory,filterBrand,filterStatus,filterStock].filter(Boolean).length} filter{[filterCategory,filterBrand,filterStatus,filterStock].filter(Boolean).length>1?'s':''} on
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading...</div>
        ) : products.length === 0 ? (
          <div className="p-10 text-center text-gray-400">No products found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Quick actions</th><th>Variants</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {products.map(p => (
                  <tr key={p._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <img src={p.thumbnail||'https://via.placeholder.com/40'} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-gray-50 flex-shrink-0"/>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-gray-800 truncate max-w-xs">{p.name}</p>
                          <p className="text-xs text-gray-400">{p.category?.name}</p>
                          {p.duplicateInfo && <span className="inline-flex mt-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold" title={p.duplicateInfo.fields?.map(f=>`${f.kind}: ${f.value}`).join(', ')}>Duplicate · {p.duplicateInfo.count}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1.5 flex-wrap min-w-[150px]">
                        <button disabled={quickUpdating[`${p._id}:isFeatured`]} onClick={()=>toggleQuickFlag(p,'isFeatured')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold border disabled:opacity-50 ${p.isFeatured?'bg-amber-100 border-amber-300 text-amber-800':'bg-white border-gray-200 text-gray-500'}`}>★ Featured</button>
                        <button disabled={quickUpdating[`${p._id}:isOnSale`]} onClick={()=>toggleQuickFlag(p,'isOnSale')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold border disabled:opacity-50 ${p.isOnSale?'bg-green-100 border-green-300 text-green-800':'bg-white border-gray-200 text-gray-500'}`}>🏷 On Sale</button>
                      </div>
                    </td>
                    <td>
                      <p className="font-semibold text-sm">Rs. {p.price?.toLocaleString()}</p>
                      {p.salePrice && <p className="text-xs text-green-600">Sale: Rs. {p.salePrice.toLocaleString()}</p>}
                    </td>
                    <td><span className={`badge text-xs ${p.stock===0?'badge-hot':p.stock<=p.lowStockThreshold?'badge-sale':'badge-new'}`}>{p.stock===0?'Out':p.stock}</span></td>
                    <td>
                      <span className={`badge text-xs ${p.isActive?'badge-new':'bg-gray-100 text-gray-500'}`}>{p.isActive?'Active':'Hidden'}</span>
                      {p.isFeatured && <span className="badge badge-featured text-xs ml-1">Featured</span>}
                    </td>
                    <td>
                      {p.variants?.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {p.variants.slice(0,2).map((v,i)=><span key={i} className="badge badge-featured text-xs">{v.name}</span>)}
                          {p.variants.length > 2 && <span className="text-xs text-gray-400">+{p.variants.length-2}</span>}
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={()=>openEdit(p)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="Edit">✏️</button>
                        <button onClick={()=>openPublishModal(p)} className="p-1.5 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition-colors" title="Publish to Social Media">📢</button>
                        <button onClick={()=>toggleActive(p._id,p.isActive)} className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors" title={p.isActive?'Hide':'Show'}>{p.isActive?'🙈':'👁'}</button>
                        <button onClick={()=>deleteProduct(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Delete">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t">
            {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
              <button key={p} onClick={()=>setPage(p)}
                className={`w-8 h-8 rounded-lg text-sm font-medium ${page===p?'text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                style={page===p?{background:'var(--color-primary)'}:{}}>{p}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Publish to Social Media Modal ── */}
      {publishModal && (
        <Modal title={`📢 Publish: ${publishModal.product.name}`} onClose={()=>setPublishModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Choose platforms to publish this product to:</p>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map(pl => (
                <button
                  key={pl.id}
                  onClick={()=>togglePlatform(pl.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    publishPlatforms.includes(pl.id)
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="text-base">{pl.icon}</span>
                  {pl.label}
                  {publishPlatforms.includes(pl.id) && <span className="ml-auto">✅</span>}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Custom Message <span className="font-normal text-gray-400">(optional — overrides template)</span></label>
              <textarea
                value={publishMsg}
                onChange={e=>setPublishMsg(e.target.value)}
                rows={3}
                placeholder="Leave blank to use your saved post template..."
                className="form-input text-sm w-full resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={()=>setPublishModal(null)} className="btn-secondary flex-1 text-sm">Cancel</button>
              <button
                onClick={handlePublish}
                disabled={publishing || !publishPlatforms.length}
                className="flex-1 text-sm px-4 py-2 rounded-xl font-semibold text-white transition-all disabled:opacity-50"
                style={{background:'var(--color-primary)'}}
              >
                {publishing ? '⏳ Publishing...' : `📢 Publish to ${publishPlatforms.length || 0} Platform${publishPlatforms.length!==1?'s':''}`}
              </button>
            </div>
          </div>
        </Modal>
      )}


      {/* ── Bulk URL Import Modal (hidden when minimized, process keeps running) ── */}
      {bulkUrlModal && !bulkUrlMinimized && (
        <Modal title="🔗 Bulk URL Import" onClose={()=>{ setBulkUrlModal(false); }} wide>
          <div className="space-y-5">

            {/* Intro */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-green-800 mb-1">How it works</p>
              <ol className="list-decimal list-inside text-green-700 space-y-1">
                <li>Paste one product URL per line (up to 200 at a time)</li>
                <li>Select the default category for all imported products</li>
                <li>Set your fetch rate, then click <strong>Start Import</strong> — products are saved as drafts automatically</li>
                <li>You can minimize this window and keep working while import runs in the background</li>
              </ol>
            </div>

            {/* Category + Rate row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Default Category <span className="text-red-500">*</span></label>
                <select
                  value={bulkUrlCategory}
                  onChange={e => setBulkUrlCategory(e.target.value)}
                  className="form-input"
                  disabled={bulkUrlRunning}
                >
                  <option value="">— Select a category —</option>
                  {categories.filter(c=>!c.parent).map(c=>
                    <option key={c._id} value={c._id}>{c.name}</option>
                  )}
                </select>
                <p className="text-xs text-gray-400 mt-1">Editable per product later</p>
              </div>
              <div>
                <label className="form-label">Fetch Rate (products / min)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1} max={60}
                    value={bulkUrlRate}
                    onChange={e => setBulkUrlRate(Math.min(60, Math.max(1, Number(e.target.value) || 10)))}
                    className="form-input text-center"
                    disabled={bulkUrlRunning}
                    style={{width:80}}
                  />
                  <div className="text-xs text-gray-500 leading-tight">
                    <p>~{Math.round(60/bulkUrlRate)}s between each</p>
                    <p className="text-gray-400">Max 60 / min</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">Lower rate = less chance of being blocked</p>
              </div>
            </div>

            {/* URL textarea */}
            <div>
              <label className="form-label">Product URLs <span className="text-xs text-gray-400 font-normal">(one per line)</span></label>
              <textarea
                value={bulkUrlText}
                onChange={e => setBulkUrlText(e.target.value)}
                placeholder={"https://example.com/product-1\nhttps://example.com/product-2\nhttps://example.com/product-3"}
                className="form-input font-mono text-xs"
                rows={8}
                disabled={bulkUrlRunning}
              />
              <p className="text-xs text-gray-400 mt-1">
                {bulkUrlText.split("\n").filter(u=>u.trim()).length} URL{bulkUrlText.split("\n").filter(u=>u.trim()).length!==1?"s":""} entered
              </p>
            </div>

            {/* Progress list */}
            {bulkUrlProgress.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="form-label mb-0">Progress</label>
                  <span className="text-xs text-gray-500">
                    {bulkUrlProgress.filter(p=>p&&p.status==="done").length} done ·{" "}
                    {bulkUrlProgress.filter(p=>p&&p.status==="error").length} failed ·{" "}
                    {bulkUrlRunning ? "running…" : "finished"}
                  </span>
                </div>
                <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  {bulkUrlProgress.map((item, idx) => item && (
                    <div key={idx} className={"flex items-start gap-3 px-3 py-2 text-sm border-b border-gray-50 last:border-0 " + (item.status==="done"?"bg-green-50":item.status==="error"?"bg-red-50":"bg-white")}>
                      <span className="mt-0.5 flex-shrink-0 text-base">
                        {item.status==="done"?"✅":item.status==="error"?"❌":item.status==="scraping"?"🔍":"💾"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-gray-500 font-mono">{item.url}</p>
                        {item.product
                          ? <p className="text-xs font-semibold text-green-700 truncate">{item.product.name}</p>
                          : <p className="text-xs text-gray-600">{item.message}</p>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            {bulkUrlSummary && (
              <div className={"rounded-xl p-4 border " + (bulkUrlSummary.failed===0?"bg-green-50 border-green-200":"bg-amber-50 border-amber-200")}>
                <p className={"font-semibold mb-1 " + (bulkUrlSummary.failed===0?"text-green-800":"text-amber-800")}>
                  Import complete — {bulkUrlSummary.saved} saved as draft{bulkUrlSummary.saved!==1?"s":""}{bulkUrlSummary.failed>0?`, ${bulkUrlSummary.failed} failed`:""}
                </p>
                {bulkUrlSummary.errors.length > 0 && (
                  <ul className="text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                    {bulkUrlSummary.errors.map((e,i)=><li key={i}>{e}</li>)}
                  </ul>
                )}
                {bulkUrlSummary.saved > 0 && (
                  <p className="text-xs text-gray-600 mt-2">📋 Draft products are now in your product list with <strong>Hidden</strong> status. Click Edit on each one to review and publish.</p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {!bulkUrlRunning && !bulkUrlSummary && (
                <button
                  onClick={handleBulkUrlStart}
                  disabled={!bulkUrlCategory || !bulkUrlText.trim()}
                  className="btn-primary flex-1 disabled:opacity-60"
                >
                  🚀 Start Import
                </button>
              )}
              {bulkUrlRunning && (
                <>
                  <button
                    onClick={()=>{ bulkUrlAbortRef.current = true; }}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm border-2 border-red-300 text-red-600 hover:bg-red-50"
                  >
                    ⏹ Stop Import
                  </button>
                  <button
                    onClick={()=>{ setBulkUrlMinimized(true); setBulkUrlModal(false); }}
                    className="py-2.5 px-5 rounded-xl font-semibold text-sm border border-gray-200 hover:bg-gray-50"
                    title="Minimize — import keeps running in background"
                  >
                    ⬇ Minimize
                  </button>
                </>
              )}
              {bulkUrlSummary && (
                <button
                  onClick={()=>{ setBulkUrlText(""); setBulkUrlProgress([]); setBulkUrlSummary(null); setBulkUrlCategory(""); }}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-gray-200 hover:bg-gray-50"
                >
                  🔄 Import More URLs
                </button>
              )}
              <button
                onClick={()=>setBulkUrlModal(false)}
                className="py-2.5 px-5 rounded-xl font-semibold text-sm border border-gray-200 hover:bg-gray-50"
              >
                {bulkUrlRunning ? "Close (keeps running)" : "Close"}
              </button>
            </div>

          </div>
        </Modal>
      )}

      {/* ── Bulk Import Floating Widget (shown when minimized or running with modal closed) ── */}
      {bulkUrlRunning && !bulkUrlModal && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:9999,
          background:'#fff', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.18)',
          border:'1.5px solid #e5e7eb', minWidth:320, maxWidth:400, overflow:'hidden'
        }}>
          {/* Header */}
          <div style={{background:'var(--color-primary)',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{display:'inline-block',width:10,height:10,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0}}></span>
              <span style={{color:'#fff',fontWeight:700,fontSize:13}}>Bulk Import Running</span>
            </div>
            <div style={{display:'flex',gap:6}}>
              <button
                onClick={()=>{ setBulkUrlModal(true); setBulkUrlMinimized(false); }}
                style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:6,color:'#fff',fontSize:12,padding:'2px 8px',cursor:'pointer',fontWeight:600}}
                title="Expand"
              >⬆ Expand</button>
              <button
                onClick={()=>{ bulkUrlAbortRef.current = true; }}
                style={{background:'rgba(220,38,38,0.7)',border:'none',borderRadius:6,color:'#fff',fontSize:12,padding:'2px 8px',cursor:'pointer',fontWeight:600}}
                title="Stop import"
              >⏹ Stop</button>
            </div>
          </div>
          {/* Progress summary */}
          <div style={{padding:'10px 16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{fontSize:12,color:'#6b7280'}}>
                ✅ {bulkUrlProgress.filter(p=>p&&p.status==="done").length} done &nbsp;·&nbsp;
                ❌ {bulkUrlProgress.filter(p=>p&&p.status==="error").length} failed &nbsp;·&nbsp;
                🔄 {bulkUrlProgress.filter(p=>p&&(p.status==="scraping"||p.status==="saving")).length} active
              </span>
              <span style={{fontSize:12,color:'#6b7280'}}>
                {bulkUrlProgress.filter(Boolean).length} / {bulkUrlProgress.length || "?"}
              </span>
            </div>
            {/* Mini progress bar */}
            <div style={{background:'#f3f4f6',borderRadius:99,height:6,overflow:'hidden'}}>
              <div style={{
                height:'100%', borderRadius:99, background:'var(--color-primary)',
                width: bulkUrlProgress.length
                  ? `${Math.round(bulkUrlProgress.filter(p=>p&&(p.status==="done"||p.status==="error")).length / bulkUrlProgress.length * 100)}%`
                  : '0%',
                transition:'width 0.4s ease'
              }}></div>
            </div>
            {/* Last item */}
            {(() => {
              const last = [...bulkUrlProgress].reverse().find(p=>p);
              return last ? (
                <p style={{fontSize:11,color:'#9ca3af',marginTop:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {last.status==="done"?"✅":last.status==="error"?"❌":"🔍"} {last.product?.name || last.message || last.url}
                </p>
              ) : null;
            })()}
          </div>
        </div>
      )}
      {bulkModal && (
        <Modal title="📥 Bulk Upload Products" onClose={closeBulkModal}>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-gray-700">
              <p className="font-semibold text-blue-800 mb-1">How it works</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Download the Excel template below.</li>
                <li>Fill in one row per product (Category names must match an existing category).</li>
                <li>Save the file, then upload it here to create the products.</li>
              </ol>
            </div>

            <button
              onClick={handleDownloadTemplate}
              disabled={bulkDownloading}
              className="w-full text-sm font-semibold px-3 py-2.5 rounded-lg border flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
              style={{ background:'#f0fdf4', borderColor:'#16a34a', color:'#15803d' }}
            >
              {bulkDownloading ? '⏳ Preparing…' : '⬇️ Download Excel Template'}
            </button>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Upload filled template</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={e => { setBulkFile(e.target.files?.[0] || null); setBulkResult(null); }}
                className="block w-full text-sm border border-gray-300 rounded-lg cursor-pointer file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-semibold hover:file:bg-gray-200"
              />
              {bulkFile && <p className="text-xs text-gray-500 mt-1">Selected: {bulkFile.name}</p>}
            </div>

            <button
              onClick={handleBulkUpload}
              disabled={bulkUploading || !bulkFile}
              className="btn-primary text-sm w-full disabled:opacity-60"
            >
              {bulkUploading ? '⏳ Importing…' : '🚀 Upload & Create Products'}
            </button>

            {bulkResult && (
              <div className="border border-gray-200 rounded-xl p-3 text-sm space-y-2 max-h-64 overflow-y-auto">
                <p className="font-semibold text-emerald-700">✅ Created: {bulkResult.created}</p>
                <p className="font-semibold text-amber-700">⚠️ Skipped: {bulkResult.skipped}</p>
                {bulkResult.errors?.length > 0 && (
                  <div>
                    <p className="font-semibold text-gray-700 mb-1">Errors:</p>
                    <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
                      {bulkResult.errors.map((e, i) => (
                        <li key={i}>Row {e.row} ({e.name}): {e.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── SKU Image Bulk Upload Modal ── */}
      {skuImageModal && (
        <Modal title="🗂️ Bulk Image Upload by SKU" onClose={closeSkuImageModal}>
          <div className="space-y-4 text-sm">
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 space-y-2 text-purple-800">
              <p className="font-semibold text-purple-900">How it works:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Create a folder for each product named exactly after its <strong>SKU</strong>.</li>
                <li>Place the product images inside that folder (JPG, PNG, WebP, etc.).</li>
                <li>Zip all the SKU folders together into one <strong>.zip</strong> file.</li>
                <li>Upload the zip here — images are automatically assigned to matching products.</li>
              </ol>
              <div className="bg-white border border-purple-100 rounded-lg p-2 font-mono text-xs text-gray-600 mt-2">
                <p>📦 images.zip</p>
                <p className="ml-4">📁 SKU-001/</p>
                <p className="ml-8">🖼 front.jpg</p>
                <p className="ml-8">🖼 back.jpg</p>
                <p className="ml-4">📁 SKU-002/</p>
                <p className="ml-8">🖼 main.png</p>
              </div>
              <p className="text-xs text-purple-700 mt-1">💡 The first image in each folder also sets the product thumbnail if none is set.</p>
            </div>

            {/* ── Image Processing Settings ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setImgSettingsOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700"
              >
                <span>🖼️ Image Processing Settings {imgSettings && !imgSettings.enabled && <span className="text-amber-600 font-normal">(disabled)</span>}</span>
                <span className="text-gray-400">{imgSettingsOpen ? '▲' : '▼'}</span>
              </button>

              {imgSettingsOpen && (
                <div className="p-4 space-y-3 border-t border-gray-200">
                  {imgSettingsLoading || !imgSettings ? (
                    <p className="text-xs text-gray-500">Loading settings…</p>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={imgSettings.enabled}
                          onChange={e => setImgSettings({ ...imgSettings, enabled: e.target.checked })}
                        />
                        <span>Enable automatic resize / sharpen / compress before upload</span>
                      </label>

                      <div className={imgSettings.enabled ? '' : 'opacity-50 pointer-events-none'}>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <div>
                            <label className="form-label text-xs">Max Width (px)</label>
                            <input
                              type="number" min="100" max="4000"
                              value={imgSettings.maxWidth}
                              onChange={e => setImgSettings({ ...imgSettings, maxWidth: e.target.value })}
                              className="form-input text-sm"
                            />
                          </div>
                          <div>
                            <label className="form-label text-xs">Max Height (px)</label>
                            <input
                              type="number" min="100" max="4000"
                              value={imgSettings.maxHeight}
                              onChange={e => setImgSettings({ ...imgSettings, maxHeight: e.target.value })}
                              className="form-input text-sm"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <label className="form-label text-xs">Output Format</label>
                            <select
                              value={imgSettings.format}
                              onChange={e => setImgSettings({ ...imgSettings, format: e.target.value })}
                              className="form-input text-sm"
                            >
                              <option value="webp">WebP (recommended)</option>
                              <option value="jpeg">JPEG</option>
                              <option value="png">PNG</option>
                              <option value="original">Keep original format</option>
                            </select>
                          </div>
                          <div>
                            <label className="form-label text-xs">Quality ({imgSettings.quality})</label>
                            <input
                              type="range" min="1" max="100"
                              value={imgSettings.quality}
                              onChange={e => setImgSettings({ ...imgSettings, quality: e.target.value })}
                              className="w-full mt-2.5"
                            />
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm mt-3">
                          <input
                            type="checkbox"
                            checked={imgSettings.sharpen}
                            onChange={e => setImgSettings({ ...imgSettings, sharpen: e.target.checked })}
                          />
                          <span>Sharpen images (local filter, mild effect)</span>
                        </label>
                      </div>

                      <div className="border-t border-gray-100 pt-3 mt-3">
                        <p className="text-sm font-semibold text-gray-700 mb-1">✨ Cloudinary AI Effects</p>
                        <p className="text-xs text-gray-500 mb-2">These run as real AI models on Cloudinary's servers and have a much stronger visible effect than the local sharpen filter above — use these if uploaded images still look soft or unclear.</p>

                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={imgSettings.cloudinaryAI?.improve ?? true}
                            onChange={e => setImgSettings({ ...imgSettings, cloudinaryAI: { ...imgSettings.cloudinaryAI, improve: e.target.checked } })}
                          />
                          <span>AI Improve (auto contrast, lighting, color balance)</span>
                        </label>

                        <label className="flex items-center gap-2 text-sm mt-2">
                          <input
                            type="checkbox"
                            checked={imgSettings.cloudinaryAI?.sharpen ?? true}
                            onChange={e => setImgSettings({ ...imgSettings, cloudinaryAI: { ...imgSettings.cloudinaryAI, sharpen: e.target.checked } })}
                          />
                          <span>AI Sharpen (unsharp mask — noticeably crisper)</span>
                        </label>

                        {imgSettings.cloudinaryAI?.sharpen && (
                          <div className="ml-6 mt-2">
                            <label className="form-label text-xs">Sharpen Strength ({imgSettings.cloudinaryAI.sharpenStrength})</label>
                            <input
                              type="range" min="1" max="500"
                              value={imgSettings.cloudinaryAI.sharpenStrength}
                              onChange={e => setImgSettings({ ...imgSettings, cloudinaryAI: { ...imgSettings.cloudinaryAI, sharpenStrength: e.target.value } })}
                              className="w-full"
                            />
                            <p className="text-xs text-gray-400 mt-0.5">Higher = crisper, but can introduce halos around edges at extreme values.</p>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-gray-100 pt-3 mt-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={imgSettings.aiUpscale?.enabled || false}
                            onChange={e => setImgSettings({ ...imgSettings, aiUpscale: { ...imgSettings.aiUpscale, enabled: e.target.checked } })}
                          />
                          <span>🤖 AI Upscale low-resolution images (via Cloudinary)</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1 ml-6">Applies AI upscaling only to images smaller than the thresholds below. Uses your existing Cloudinary account — no extra API key needed.</p>

                        {imgSettings.aiUpscale?.enabled && (
                          <div className="grid grid-cols-2 gap-3 mt-2 ml-6">
                            <div>
                              <label className="form-label text-xs">Min Width Threshold (px)</label>
                              <input
                                type="number" min="50"
                                value={imgSettings.aiUpscale.minWidthThreshold}
                                onChange={e => setImgSettings({ ...imgSettings, aiUpscale: { ...imgSettings.aiUpscale, minWidthThreshold: e.target.value } })}
                                className="form-input text-sm"
                              />
                            </div>
                            <div>
                              <label className="form-label text-xs">Min Height Threshold (px)</label>
                              <input
                                type="number" min="50"
                                value={imgSettings.aiUpscale.minHeightThreshold}
                                onChange={e => setImgSettings({ ...imgSettings, aiUpscale: { ...imgSettings.aiUpscale, minHeightThreshold: e.target.value } })}
                                className="form-input text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={saveImgSettings}
                        disabled={imgSettingsSaving}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-60"
                      >
                        {imgSettingsSaving ? 'Saving…' : '💾 Save Settings'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="form-label">Select ZIP File</label>
              <input
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={e => setSkuZipFile(e.target.files[0] || null)}
                className="form-input text-sm"
              />
              {skuZipFile && <p className="text-xs text-gray-500 mt-1">Selected: {skuZipFile.name} ({(skuZipFile.size / 1024 / 1024).toFixed(1)} MB)</p>}
            </div>

            <button
              onClick={handleSkuImageUpload}
              disabled={skuUploading || !skuZipFile}
              className="btn-primary w-full text-sm disabled:opacity-60"
            >
              {skuUploading ? '⏳ Processing…' : '🚀 Upload & Assign Images'}
            </button>

            {skuResult && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <p className="font-semibold text-emerald-700">✅ Products updated: {skuResult.matched}</p>
                {skuResult.processing && (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                    <p>🖼️ Images processed: <strong>{skuResult.processing.processed}</strong> / {skuResult.processing.totalFiles}</p>
                    {skuResult.processing.bytesBefore > 0 && (
                      <p>📦 Size reduced by <strong>{skuResult.processing.bytesSavedPct}%</strong> ({(skuResult.processing.bytesBefore/1024).toFixed(0)}KB → {(skuResult.processing.bytesAfter/1024).toFixed(0)}KB)</p>
                    )}
                    {skuResult.processing.aiUpscaled > 0 && (
                      <p>🤖 AI-upscaled (low-res): <strong>{skuResult.processing.aiUpscaled}</strong></p>
                    )}
                  </div>
                )}
                {skuResult.unmatched > 0 && (
                  <p className="font-semibold text-amber-700">⚠️ Unmatched SKUs: {skuResult.unmatched}
                    <span className="ml-1 font-normal text-xs text-gray-500">({skuResult.unmatchedSkus?.join(', ')})</span>
                  </p>
                )}
                {skuResult.withErrors > 0 && (
                  <div>
                    <p className="font-semibold text-red-600 mb-1">❌ SKUs with errors: {skuResult.withErrors}</p>
                    <ul className="text-xs text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                      {Object.entries(skuResult.details || {}).flatMap(([sku, d]) =>
                        (d.errors || []).map((e, i) => <li key={`${sku}-${i}`}>• [{sku}] {e}</li>)
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal && (
        <Modal title={modal==='edit'?`Edit: ${form.name}`:'Add New Product'} onClose={closeModal} wide>
          {modal==='add' && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400">
                {autoSaveStatus==='saving' && '💾 Auto-saving...'}
                {autoSaveStatus==='saved'  && '✅ Draft saved'}
                {!autoSaveStatus && draftSavedAt && `Last saved: ${draftSavedAt}`}
              </span>
            </div>
          )}

          <div className="flex gap-1 bg-gray-50 p-1 rounded-xl mb-5 overflow-x-auto">
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab===t.id?'bg-white shadow-sm text-gray-900':'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* URL IMPORT */}
          {activeTab==='urlImport' && (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="font-semibold text-blue-800 text-sm mb-1">🔗 Import Product from URL</h3>
                <p className="text-xs text-blue-600">Paste a product page URL and we'll auto-fill the name, price, description, and images. You can review and edit everything before saving.</p>
              </div>

              {/* URL input */}
              <div>
                <label className="form-label">Product Page URL</label>
                <div className="flex gap-2">
                  <input
                    value={urlImportValue}
                    onChange={e => setUrlImportValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleUrlImport(); }}
                    className="form-input flex-1"
                    placeholder="https://example.com/products/some-product"
                    disabled={urlImporting}
                  />
                  <button
                    onClick={handleUrlImport}
                    disabled={urlImporting || !urlImportValue.trim()}
                    className="btn-primary px-5 flex-shrink-0 disabled:opacity-60"
                  >
                    {urlImporting ? (
                      <span className="flex items-center gap-2">
                        <span style={{display:'inline-block',width:12,height:12,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}></span>
                        Fetching…
                      </span>
                    ) : '🔍 Fetch'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Works with most e-commerce sites (Shopify, WooCommerce, Daraz, etc.)</p>
              </div>

              {/* Results */}
              {urlImportResult && (
                <div className="space-y-4">
                  <div className="border border-green-200 bg-green-50 rounded-xl p-4 space-y-3">
                    <h4 className="font-semibold text-green-800 text-sm">✅ Data Extracted — Review before applying</h4>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="form-label text-xs">Product Name</label>
                        <input
                          value={urlImportResult.name || ''}
                          onChange={e => setUrlImportResult(r => ({ ...r, name: e.target.value }))}
                          className="form-input text-sm"
                        />
                      </div>
                      <div>
                        <label className="form-label text-xs">Brand</label>
                        <input
                          value={urlImportResult.brand || ''}
                          onChange={e => setUrlImportResult(r => ({ ...r, brand: e.target.value }))}
                          className="form-input text-sm"
                        />
                      </div>
                      <div>
                        <label className="form-label text-xs">Price</label>
                        <input
                          type="number"
                          value={urlImportResult.price || ''}
                          onChange={e => setUrlImportResult(r => ({ ...r, price: e.target.value }))}
                          className="form-input text-sm"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="form-label text-xs">Sale Price</label>
                        <input
                          type="number"
                          value={urlImportResult.salePrice || ''}
                          onChange={e => setUrlImportResult(r => ({ ...r, salePrice: e.target.value }))}
                          className="form-input text-sm"
                          placeholder="Optional"
                        />
                      </div>
                      <div>
                        <label className="form-label text-xs">SKU</label>
                        <input
                          value={urlImportResult.sku || ''}
                          onChange={e => setUrlImportResult(r => ({ ...r, sku: e.target.value }))}
                          className="form-input text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="form-label text-xs">Description</label>
                      <textarea
                        value={urlImportResult.description || ''}
                        onChange={e => setUrlImportResult(r => ({ ...r, description: e.target.value }))}
                        className="form-input text-sm"
                        rows={4}
                      />
                    </div>
                  </div>

                  {/* Image selection */}
                  {urlImportImages.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="form-label mb-0">Select Images to Import ({urlImportSelImages.length} selected)</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setUrlImportSelImages([...urlImportImages])}
                            className="text-xs px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
                          >Select All</button>
                          <button
                            onClick={() => setUrlImportSelImages([])}
                            className="text-xs px-3 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
                          >None</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1">
                        {urlImportImages.map((img, idx) => {
                          const selected = urlImportSelImages.includes(img);
                          return (
                            <div
                              key={idx}
                              onClick={() => setUrlImportSelImages(prev =>
                                selected ? prev.filter(u => u !== img) : [...prev, img]
                              )}
                              className="relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all"
                              style={{ borderColor: selected ? 'var(--color-primary)' : '#e5e7eb', aspectRatio: '1' }}
                            >
                              <img
                                src={img} alt={`img-${idx}`}
                                className="w-full h-full object-cover"
                                onError={e => { e.target.parentElement.style.display = 'none'; }}
                              />
                              {idx === 0 && selected && (
                                <span className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded font-semibold">Main</span>
                              )}
                              {selected && (
                                <span className="absolute top-1 right-1 bg-green-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">✓</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">First selected image becomes the thumbnail. The rest go to additional images.</p>
                    </div>
                  )}

                  <button
                    onClick={applyUrlImport}
                    className="btn-primary w-full"
                  >
                    ✅ Apply to Product Form
                  </button>
                </div>
              )}
            </div>
          )}

          {/* BASIC */}
          {activeTab==='basic' && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="form-label">Product Name *</label>
                  <input value={form.name} onChange={e=>handleNameChange(e.target.value)} className="form-input" placeholder="Enter product name"/>
                </div>
                <div>
                  <label className="form-label">Category *</label>
                  <select value={form.category} onChange={e=>updateForm(p=>({...p,category:e.target.value,subCategory:''}))} className="form-input">
                    <option value="">Select category</option>
                    {categories.filter(c=>!c.parent).map(c=><option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
                {form.category && categories.filter(c=>(c.parent?._id||c.parent)===form.category).length > 0 && (
                  <div>
                    <label className="form-label">Subcategory</label>
                    <select value={form.subCategory||''} onChange={e=>updateForm(p=>({...p,subCategory:e.target.value}))} className="form-input">
                      <option value="">— None (top-level category only) —</option>
                      {categories.filter(c=>(c.parent?._id||c.parent)===form.category).map(c=><option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="form-label" style={{display:'flex',alignItems:'center',gap:6}}>
                    Brand
                    {aiFillingBrand && <span style={{fontSize:11,color:'var(--color-primary)',fontWeight:600,display:'flex',alignItems:'center',gap:3}}><span style={{display:'inline-block',width:10,height:10,border:'2px solid var(--color-primary)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}></span>AI filling…</span>}
                  </label>
                  <input value={form.brand} onChange={e=>updateForm(p=>({...p,brand:e.target.value}))} className="form-input" placeholder="Brand name"/>
                </div>
                <div><label className="form-label">Regular Price (Rs.) *</label><input type="number" min="0" value={form.price} onChange={e=>updateForm(p=>({...p,price:e.target.value}))} className="form-input"/></div>
                <div><label className="form-label">Sale Price (Rs.)</label><input type="number" min="0" value={form.salePrice} onChange={e=>updateForm(p=>({...p,salePrice:e.target.value}))} className="form-input" placeholder="Leave empty if not on sale"/></div>
                <div><label className="form-label">Cost Price (Rs.)</label><input type="number" min="0" value={form.costPrice} onChange={e=>updateForm(p=>({...p,costPrice:e.target.value}))} className="form-input"/></div>
                <div><label className="form-label">SKU</label><input value={form.sku} onChange={e=>updateForm(p=>({...p,sku:e.target.value}))} className="form-input" placeholder="Unique product code"/></div>
                <div>
                  <label className="form-label">Stock Quantity</label>
                  <input type="number" min="0" value={form.stock} onChange={e=>updateForm(p=>({...p,stock:e.target.value}))} className="form-input"/>
                </div>
                <div><label className="form-label">Low Stock Alert</label><input type="number" min="0" value={form.lowStockThreshold} onChange={e=>updateForm(p=>({...p,lowStockThreshold:e.target.value}))} className="form-input"/></div>
                <div><label className="form-label">Weight (g)</label><input type="number" min="0" value={form.weight} onChange={e=>updateForm(p=>({...p,weight:e.target.value}))} className="form-input"/></div>
                <div className="sm:col-span-2">
                  <label className="form-label" style={{display:'flex',alignItems:'center',gap:6}}>
                    Short Description
                    {aiFillingShort && <span style={{fontSize:11,color:'var(--color-primary)',fontWeight:600,display:'flex',alignItems:'center',gap:3}}><span style={{display:'inline-block',width:10,height:10,border:'2px solid var(--color-primary)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}></span>AI filling…</span>}
                  </label>
                  <input value={form.shortDescription} onChange={e=>{shortDescManuallyEdited.current=true; updateForm(p=>({...p,shortDescription:e.target.value}));}} className="form-input" placeholder="Brief product summary (50–160 chars recommended for SEO)"/>
                </div>
                <div className="sm:col-span-2">
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                    <label className="form-label" style={{margin:0}}>Full Description *</label>
                    <button type="button"
                      onClick={fetchAIDescription}
                      disabled={!form.name || loadingDescription}
                      style={{fontSize:11,padding:'3px 10px',borderRadius:20,border:'1.5px solid var(--color-primary)',color:'var(--color-primary)',background:'transparent',cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:5,opacity:(!form.name||loadingDescription)?0.5:1}}>
                      {loadingDescription
                        ? <><span style={{display:'inline-block',width:9,height:9,border:'2px solid var(--color-primary)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}></span>Generating…</>
                        : <>✨ AI Generate Description</>}
                    </button>
                  </div>
                  <RichEditor value={form.description} onChange={val=>updateForm(p=>({...p,description:val}))} />
                </div>
                <div className="sm:col-span-2">
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                    <label className="form-label" style={{margin:0}}>Tags (comma separated)</label>
                    <button type="button"
                      onClick={()=>fetchTagSuggestions(form.name, categories.find(c=>c._id===form.category)?.name, form.brand)}
                      disabled={!form.name || loadingTags}
                      style={{fontSize:11,padding:'3px 10px',borderRadius:20,border:'1.5px solid var(--color-primary)',color:'var(--color-primary)',background:'transparent',cursor:'pointer',fontWeight:600,display:'flex',alignItems:'center',gap:5,opacity:(!form.name||loadingTags)?0.5:1}}>
                      {loadingTags
                        ? <><span style={{display:'inline-block',width:9,height:9,border:'2px solid var(--color-primary)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}></span>Suggesting…</>
                        : <>✨ Suggest Tags</>}
                    </button>
                  </div>
                  <input value={form.tags} onChange={e=>updateForm(p=>({...p,tags:e.target.value}))} className="form-input" placeholder="electronics, gadget, trending"/>
                  {tagSuggestions.length > 0 && (
                    <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:6}}>
                      {tagSuggestions.map(tag => {
                        const active = form.tags.split(',').map(t=>t.trim()).includes(tag);
                        return (
                          <button key={tag} type="button" onClick={()=>toggleTag(tag)}
                            style={{fontSize:12,padding:'3px 10px',borderRadius:20,border:'1.5px solid',borderColor:active?'var(--color-primary)':'#d1d5db',background:active?'var(--color-primary)':'#f9fafb',color:active?'#fff':'#374151',cursor:'pointer',fontWeight:500,transition:'all 0.15s'}}>
                            {active ? '✓ ' : ''}{tag}
                          </button>
                        );
                      })}
                      <button type="button" onClick={()=>setTagSuggestions([])}
                        style={{fontSize:11,padding:'3px 8px',borderRadius:20,border:'1.5px solid #e5e7eb',background:'transparent',color:'#9ca3af',cursor:'pointer'}}>
                        ✕ clear
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {[['isFeatured','⭐ Featured'],['isActive','✅ Active'],['isOnSale','🔥 On Sale']].map(([k,label])=>(
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form[k]} onChange={e=>updateForm(p=>({...p,[k]:e.target.checked}))} style={{accentColor:'var(--color-primary)'}} className="w-4 h-4"/>
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* IMAGES */}
          {activeTab==='images' && (
            <div className="space-y-5">
              <ImageUpload label="Thumbnail (Main Image)" hint="First image customers see" value={form.thumbnail} onChange={url=>updateForm(p=>({...p,thumbnail:url}))}/>
              <ImageUpload label="Additional Images" hint="Upload multiple product images" value={Array.isArray(form.images)?form.images:[]} onChange={urls=>updateForm(p=>({...p,images:urls}))} multiple/>
            </div>
          )}

          {/* VARIANTS */}
          {activeTab==='variants' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
                💡 Add variants like <strong>Size</strong>, <strong>Color</strong> etc.
              </div>
              {(form.variants||[]).map((variant,vi)=>(
                <div key={vi} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-800 text-sm">Variant {vi+1}: {variant.name||'Unnamed'}</h4>
                    <button onClick={()=>removeVariant(vi)} className="text-red-400 hover:text-red-600 text-sm">✕ Remove</button>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="form-label text-xs">Variant Name *</label>
                      <input value={variant.name} onChange={e=>updateVariant(vi,'name',e.target.value)} className="form-input text-sm" placeholder="e.g. Size, Color"/>
                    </div>
                    <div>
                      <label className="form-label text-xs">Type</label>
                      <select value={variant.type} onChange={e=>updateVariant(vi,'type',e.target.value)} className="form-input text-sm">
                        {VARIANT_TYPES.map(t=><option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-1.5 cursor-pointer mb-2">
                        <input type="checkbox" checked={variant.required} onChange={e=>updateVariant(vi,'required',e.target.checked)} style={{accentColor:'var(--color-primary)'}} className="w-3.5 h-3.5"/>
                        <span className="text-xs text-gray-600">Required</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {VARIANT_TYPES.filter(t=>t.defaultValues.length>0).map(t=>(
                      <button key={t.value} type="button" onClick={()=>applyPreset(vi,t.value)}
                        className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                        {t.icon} {t.label} preset
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-1 text-xs font-semibold text-gray-400 px-1">
                      <span className="col-span-3">Label</span><span className="col-span-3">Value</span>
                      <span className="col-span-3">Price +/-</span><span className="col-span-2">Available</span>
                      <span className="col-span-1"></span>
                    </div>
                    {(variant.values||[]).map((val,vvi)=>(
                      <div key={vvi} className="grid grid-cols-12 gap-1 items-center">
                        <input value={val.label} onChange={e=>updateVariantValue(vi,vvi,'label',e.target.value)} className="form-input text-xs py-1.5 col-span-3" placeholder="Large"/>
                        <input value={val.value} onChange={e=>updateVariantValue(vi,vvi,'value',e.target.value)} className="form-input text-xs py-1.5 col-span-3" placeholder="L"/>
                        <input type="number" value={val.priceModifier} onChange={e=>updateVariantValue(vi,vvi,'priceModifier',Number(e.target.value))} className="form-input text-xs py-1.5 col-span-3" placeholder="0"/>
                        <div className="col-span-2 flex justify-center">
                          <input type="checkbox" checked={val.isAvailable!==false} onChange={e=>updateVariantValue(vi,vvi,'isAvailable',e.target.checked)} style={{accentColor:'var(--color-primary)'}} className="w-4 h-4"/>
                        </div>
                        <button onClick={()=>removeVariantValue(vi,vvi)} className="col-span-1 text-red-400 hover:text-red-600 text-xs text-center">✕</button>
                      </div>
                    ))}
                    <button onClick={()=>addVariantValue(vi)} className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 w-full">
                      + Add Option
                    </button>
                  </div>
                </div>
              ))}
              <button onClick={addVariant} className="btn-outline w-full text-sm">+ Add Variant (Size / Color / etc.)</button>
            </div>
          )}

          {/* SPECS */}
          {activeTab==='specs' && (
            <SpecsPanel
              specs={form.specifications || []}
              onChange={newSpecs => updateForm(p => ({ ...p, specifications: newSpecs }))}
              onAIGenerate={generateAISpecs}
              aiGeneratingSpecs={aiGeneratingSpecs}
            />
          )}

          {/* SETTINGS */}
          {activeTab==='seo' && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="form-label">Weight (grams)</label><input type="number" value={form.weight} onChange={e=>updateForm(p=>({...p,weight:e.target.value}))} className="form-input"/></div>
                <div><label className="form-label">Low Stock Alert</label><input type="number" value={form.lowStockThreshold} onChange={e=>updateForm(p=>({...p,lowStockThreshold:Number(e.target.value)}))} className="form-input"/></div>
              </div>
              <div className="flex flex-wrap gap-4">
                {[['isFeatured','⭐ Featured'],['isActive','✅ Active'],['isOnSale','🔥 On Sale']].map(([k,label])=>(
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form[k]} onChange={e=>updateForm(p=>({...p,[k]:e.target.checked}))} style={{accentColor:'var(--color-primary)'}} className="w-4 h-4"/>
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6 pt-5 border-t border-gray-100 sticky bottom-0 bg-white">
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving...' : modal==='edit' ? 'Save Changes' : 'Create Product'}
            </button>
            <button onClick={closeModal} className="btn-outline px-6">Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
