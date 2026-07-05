import React, { useEffect, useState } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';
import ImageUpload from '../../components/ImageUpload';

const PRESETS = {
  christmas: { name:'🎄 Christmas', type:'christmas', theme:{ primaryColor:'#15803d', secondaryColor:'#dc2626', bgColor:'#052e16', snowEffect:true, confettiEffect:false }, announcement:'🎄 Merry Christmas! Special discounts all week!', announcementBg:'#15803d', featuredBannerTitle:'Christmas Sale 🎄', featuredBannerSubtitle:'Up to 50% off selected items', discountPercent:25, couponCode:'XMAS25', couponType:'percentage', couponValue:25 },
  newyear: { name:'🎊 New Year', type:'new_year', theme:{ primaryColor:'#7c3aed', secondaryColor:'#f59e0b', bgColor:'#1e1b4b', snowEffect:false, confettiEffect:true }, announcement:'🎊 Happy New Year! Use NEWYEAR20 for 20% off!', announcementBg:'#7c3aed', featuredBannerTitle:'New Year Sale 🎊', featuredBannerSubtitle:'Start the year with amazing deals', discountPercent:20, couponCode:'NEWYEAR20', couponType:'percentage', couponValue:20 },
  blackfriday: { name:'🖤 Black Friday', type:'black_friday', isFlashSale:true, theme:{ primaryColor:'#111827', secondaryColor:'#f59e0b', bgColor:'#030712', snowEffect:false, confettiEffect:false }, announcement:'🖤 BLACK FRIDAY — Biggest sale of the year!', announcementBg:'#111827', featuredBannerTitle:'Black Friday 🖤', featuredBannerSubtitle:'Unbeatable deals — today only', discountPercent:50, couponCode:'BLACK50', couponType:'percentage', couponValue:50 },
  valentines: { name:'💝 Valentine\'s', type:'valentines', theme:{ primaryColor:'#be185d', secondaryColor:'#fb7185', bgColor:'#1f0a14', snowEffect:false, confettiEffect:true }, announcement:'💝 Valentine\'s Day — Show love with special gifts!', announcementBg:'#be185d', featuredBannerTitle:'Valentine\'s Day 💝', featuredBannerSubtitle:'Perfect gifts for your loved ones', discountPercent:15, couponCode:'LOVE15', couponType:'percentage', couponValue:15 },
  eid: { name:'☪️ Eid', type:'eid', theme:{ primaryColor:'#b45309', secondaryColor:'#fbbf24', bgColor:'#1c0a00', snowEffect:false, confettiEffect:true }, announcement:'☪️ Eid Mubarak! Special Eid discounts!', announcementBg:'#b45309', featuredBannerTitle:'Eid Mubarak ☪️', featuredBannerSubtitle:'Celebrate with amazing deals', discountPercent:20, couponCode:'EID20', couponType:'percentage', couponValue:20 },
  halloween: { name:'🎃 Halloween', type:'halloween', theme:{ primaryColor:'#ea580c', secondaryColor:'#a16207', bgColor:'#0c0500', snowEffect:false, confettiEffect:false }, announcement:'🎃 Halloween Sale — Spooky deals inside!', announcementBg:'#ea580c', featuredBannerTitle:'Halloween 🎃', featuredBannerSubtitle:'Frighteningly good deals', discountPercent:30, couponCode:'SPOOKY30', couponType:'percentage', couponValue:30 },
  easter: { name:'🐣 Easter', type:'easter', theme:{ primaryColor:'#059669', secondaryColor:'#a78bfa', bgColor:'#022c22', snowEffect:false, confettiEffect:true }, announcement:'🐣 Happy Easter! Egg-citing deals await!', announcementBg:'#059669', featuredBannerTitle:'Easter 🐣', featuredBannerSubtitle:'Egg-stra special deals this Easter', discountPercent:20, couponCode:'EASTER20', couponType:'percentage', couponValue:20 },
  flashsale: { name:'⚡ Flash Sale', type:'flash_sale', isFlashSale:true, theme:{ primaryColor:'#dc2626', secondaryColor:'#f59e0b', bgColor:'#0f0a00', snowEffect:false, confettiEffect:false }, announcement:'⚡ FLASH SALE — Limited time only!', announcementBg:'#dc2626', featuredBannerTitle:'Flash Sale ⚡', featuredBannerSubtitle:'Grab the deals before time runs out!', discountPercent:40, couponCode:'FLASH40', couponType:'percentage', couponValue:40, flashSaleTitle:'⚡ Flash Sale', flashSaleSubtitle:'Hurry — limited time!' },
};

const emptyForm = {
  name:'', type:'custom', isActive:false, isScheduled:false,
  announcement:'', announcementBg:'#15803d', announcementEnabled:true,
  discountPercent:0, couponCode:'', couponType:'percentage', couponValue:0,
  couponDescription:'', couponMinOrder:0, couponAutoCreate:false,
  isCouponCampaign:false,
  isFlashSale:false, flashSaleEndTime:'', flashSaleTitle:'', flashSaleSubtitle:'',
  featuredBannerTitle:'', featuredBannerSubtitle:'',
  startDate:'', endDate:'',
  pageSlug:'', pageTitle:'', pageDescription:'', pageBannerImage:'', pageContent:'',
  theme:{ primaryColor:'#15803d', secondaryColor:'#84cc16', bgColor:'#0f172a', snowEffect:false, confettiEffect:false, customCSS:'' }
};

// ── Countdown Timer Component ─────────────────────────────────────────────────
const CountdownTimer = ({ endTime, color = '#dc2626' }) => {
  const [time, setTime] = useState({ d:0, h:0, m:0, s:0 });
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const calc = () => {
      const diff = new Date(endTime) - Date.now();
      if (diff <= 0) { setExpired(true); return; }
      setTime({ d:Math.floor(diff/86400000), h:Math.floor((diff%86400000)/3600000), m:Math.floor((diff%3600000)/60000), s:Math.floor((diff%60000)/1000) });
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [endTime]);
  if (expired) return <span style={{color:'#ef4444',fontSize:12,fontWeight:700}}>⚡ Expired</span>;
  const Cell = ({v,label}) => (
    <div style={{textAlign:'center',minWidth:36}}>
      <div style={{background:color,color:'#fff',borderRadius:8,padding:'4px 8px',fontSize:16,fontWeight:800,fontVariantNumeric:'tabular-nums'}}>{String(v).padStart(2,'0')}</div>
      <div style={{fontSize:9,color:'#6b7280',marginTop:2,textTransform:'uppercase'}}>{label}</div>
    </div>
  );
  return (
    <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
      {time.d > 0 && <Cell v={time.d} label="days"/>}
      <Cell v={time.h} label="hrs"/>
      <Cell v={time.m} label="min"/>
      <Cell v={time.s} label="sec"/>
    </div>
  );
};

const SnowPreview = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    {Array.from({length:10},(_,i)=>({id:i,left:Math.random()*100,delay:Math.random()*5,dur:3+Math.random()*4})).map(f=>(
      <div key={f.id} style={{position:'absolute',top:-10,left:`${f.left}%`,animationName:'snowfall',animationDuration:`${f.dur}s`,animationDelay:`${f.delay}s`,animationTimingFunction:'linear',animationIterationCount:'infinite',color:'rgba(255,255,255,0.8)',fontSize:14}}>❄</div>
    ))}
  </div>
);

const ConfettiPreview = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    {Array.from({length:12},(_,i)=>({id:i,left:Math.random()*100,delay:Math.random()*4,dur:2+Math.random()*4,color:['#15803d','#84cc16','#3b82f6','#10b981','#8b5cf6','#ef4444'][i%6]})).map(p=>(
      <div key={p.id} style={{position:'absolute',top:-10,left:`${p.left}%`,width:8,height:8,borderRadius:2,background:p.color,animationName:'confetti-fall',animationDuration:`${p.dur}s`,animationDelay:`${p.delay}s`,animationTimingFunction:'linear',animationIterationCount:'infinite'}}/>
    ))}
  </div>
);

// Campaign status badge
const StatusBadge = ({ c }) => {
  const now = new Date();
  if (!c.isActive) return <span className="badge bg-gray-100 text-gray-500 text-xs">Inactive</span>;
  if (c.startDate && new Date(c.startDate) > now) return <span className="badge bg-blue-100 text-blue-700 text-xs">⏰ Scheduled</span>;
  if (c.endDate && new Date(c.endDate) < now) return <span className="badge bg-red-100 text-red-600 text-xs">Expired</span>;
  return <span className="badge bg-green-100 text-green-700 text-xs font-bold">● LIVE</span>;
};

const TABS_FORM = [
  { id:'basic', label:'📋 Basic' },
  { id:'flash', label:'⚡ Flash Sale' },
  { id:'coupon', label:'🏷️ Coupon' },
  { id:'theme', label:'🎨 Theme' },
  { id:'page', label:'📄 Campaign Page' },
  { id:'schedule', label:'📅 Schedule' },
];

const Toggle = ({ label, desc, value, onChange }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
    <div>
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
    </div>
    <div onClick={onChange} className={`w-11 h-6 rounded-full cursor-pointer relative flex-shrink-0 transition-all ${value ? 'bg-primary' : 'bg-gray-200'}`} style={{background: value ? 'var(--color-primary)' : undefined}}>
      <div className={`w-4.5 h-4.5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all`} style={{width:18,height:18,left:value?22:2}}/>
    </div>
  </div>
);

const F = ({ label, value, onChange, type='text', placeholder, hint, col2 }) => (
  <div className={col2 ? 'sm:col-span-2' : ''}>
    <label className="form-label">{label}</label>
    <input type={type} value={value||''} onChange={onChange} placeholder={placeholder} className="form-input"/>
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

export default function AdminSeasonal() {
  const [campaigns, setCampaigns] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [viewMode, setViewMode] = useState('grid'); // grid | list

  useEffect(() => { fetchCampaigns(); }, []);

  const fetchCampaigns = async () => {
    try { const { data } = await API.get('/seasonal/admin/all'); setCampaigns(data); } catch {}
  };

  const applyPreset = (key) => {
    const p = PRESETS[key];
    if (!p) return;
    setForm(prev => ({
      ...prev,
      name: p.name, type: p.type || 'custom',
      announcement: p.announcement, announcementBg: p.announcementBg, announcementEnabled: true,
      featuredBannerTitle: p.featuredBannerTitle, featuredBannerSubtitle: p.featuredBannerSubtitle,
      discountPercent: p.discountPercent, couponCode: p.couponCode,
      couponType: p.couponType || 'percentage', couponValue: p.couponValue || p.discountPercent,
      isFlashSale: p.isFlashSale || false,
      flashSaleTitle: p.flashSaleTitle || '',
      flashSaleSubtitle: p.flashSaleSubtitle || '',
      pageSlug: p.name?.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || '',
      pageTitle: p.featuredBannerTitle || '',
      theme: { ...prev.theme, ...p.theme }
    }));
    toast.success(`${p.name} preset applied!`);
  };

  const save = async () => {
    if (!form.name) { toast.error('Campaign name required'); return; }
    setSaving(true);
    try {
      if (editingId) { await API.put(`/seasonal/admin/${editingId}`, form); toast.success('Campaign updated!'); }
      else { await API.post('/seasonal/admin', form); toast.success('Campaign created!'); }
      setModal(false); fetchCampaigns();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (id) => {
    const campaign = campaigns.find(c => c._id === id);
    if (!campaign.isActive) {
      await API.put(`/seasonal/admin/${id}/toggle`);
      toast.success('Campaign activated!');
    } else {
      await API.put('/seasonal/admin/deactivate-all');
      toast.success('Campaign deactivated');
    }
    fetchCampaigns();
  };

  const deleteCampaign = async (id) => {
    if (!window.confirm('Delete this campaign?')) return;
    await API.delete(`/seasonal/admin/${id}`);
    fetchCampaigns();
    toast.success('Deleted');
  };

  const openEdit = (campaign) => {
    setForm({
      ...emptyForm, ...campaign,
      startDate: campaign.startDate ? new Date(campaign.startDate).toISOString().slice(0,16) : '',
      endDate: campaign.endDate ? new Date(campaign.endDate).toISOString().slice(0,16) : '',
      flashSaleEndTime: campaign.flashSaleEndTime ? new Date(campaign.flashSaleEndTime).toISOString().slice(0,16) : '',
      theme: { ...emptyForm.theme, ...campaign.theme }
    });
    setEditingId(campaign._id);
    setActiveTab('basic');
    setModal(true);
  };

  const openNew = () => { setForm(emptyForm); setEditingId(null); setActiveTab('basic'); setModal(true); };

  // Stats
  const live = campaigns.filter(c => c.isActive).length;
  const scheduled = campaigns.filter(c => !c.isActive && c.startDate && new Date(c.startDate) > new Date()).length;
  const flashSales = campaigns.filter(c => c.isFlashSale).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Seasonal Campaigns</h2>
          <p className="text-sm text-gray-500">Flash sales, seasonal themes, coupon campaigns & more</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode==='grid'?'bg-white shadow text-gray-800':'text-gray-500'}`}>⊞ Grid</button>
            <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode==='list'?'bg-white shadow text-gray-800':'text-gray-500'}`}>≡ List</button>
          </div>
          <button onClick={openNew} className="btn-primary text-sm">+ New Campaign</button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label:'Total', value:campaigns.length, icon:'📋', color:'#6366f1' },
          { label:'Live', value:live, icon:'🟢', color:'#10b981' },
          { label:'Scheduled', value:scheduled, icon:'⏰', color:'#3b82f6' },
          { label:'Flash Sales', value:flashSales, icon:'⚡', color:'#f59e0b' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
            <div className="text-2xl">{s.icon}</div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <div className="text-5xl mb-3">🎄</div>
          <h3 className="font-bold text-gray-800 mb-2">No campaigns yet</h3>
          <p className="text-gray-400 mb-5 text-sm">Create seasonal promotions with countdowns, flash sales, and themed pages</p>
          <button onClick={openNew} className="btn-primary text-sm">Create your first campaign</button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map(c => (
            <div key={c._id} className={`rounded-2xl overflow-hidden border-2 transition-all ${c.isActive ? 'border-green-400 shadow-lg shadow-green-100' : 'border-gray-100'}`}>
              <div className="p-5 text-white relative overflow-hidden min-h-[120px]" style={{background:`linear-gradient(135deg, ${c.theme?.primaryColor||'#15803d'}, ${c.theme?.bgColor||'#0f172a'})`}}>
                {c.theme?.snowEffect && <SnowPreview/>}
                {c.theme?.confettiEffect && <ConfettiPreview/>}
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-lg leading-tight">{c.name}</h3>
                    <StatusBadge c={c}/>
                  </div>
                  {c.featuredBannerTitle && <p className="text-white/80 text-sm">{c.featuredBannerTitle}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {c.couponCode && <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-lg font-mono font-bold">{c.couponCode}</span>}
                    {c.discountPercent > 0 && <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-lg">{c.discountPercent}% off</span>}
                    {c.isFlashSale && <span className="bg-yellow-400 text-yellow-900 text-xs px-2 py-0.5 rounded-lg font-bold">⚡ Flash</span>}
                    {c.isCouponCampaign && <span className="bg-purple-400 text-white text-xs px-2 py-0.5 rounded-lg">🏷️ Coupon</span>}
                    {c.pageSlug && <span className="bg-blue-400 text-white text-xs px-2 py-0.5 rounded-lg">📄 Page</span>}
                    {c.theme?.snowEffect && <span className="text-sm">❄️</span>}
                    {c.theme?.confettiEffect && <span className="text-sm">🎊</span>}
                  </div>
                  {c.isFlashSale && c.flashSaleEndTime && (
                    <div className="mt-3">
                      <CountdownTimer endTime={c.flashSaleEndTime} color={c.theme?.primaryColor||'#dc2626'}/>
                    </div>
                  )}
                </div>
              </div>
              {c.startDate && (
                <div className="bg-blue-50 px-4 py-1.5 text-xs text-blue-700 flex gap-4 border-b border-blue-100">
                  {c.startDate && <span>▶ {new Date(c.startDate).toLocaleDateString()}</span>}
                  {c.endDate && <span>⏹ {new Date(c.endDate).toLocaleDateString()}</span>}
                </div>
              )}
              <div className="bg-white p-4 flex items-center gap-2 flex-wrap">
                <button onClick={() => toggleActive(c._id)} className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex-1 transition-all ${c.isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                  {c.isActive ? '⏹ Deactivate' : '▶ Activate'}
                </button>
                {c.pageSlug && (
                  <a href={`/campaign/${c.pageSlug}`} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100">👁 View</a>
                )}
                <button onClick={() => openEdit(c)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">✏️ Edit</button>
                <button onClick={() => deleteCampaign(c._id)} className="text-xs px-2 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">🗑</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">Campaign</th>
              <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">Type</th>
              <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">Status</th>
              <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">Duration</th>
              <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex-shrink-0" style={{background:`linear-gradient(135deg,${c.theme?.primaryColor||'#15803d'},${c.theme?.bgColor||'#0f172a'})`}}/>
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{c.name}</p>
                        {c.couponCode && <p className="text-xs text-gray-400 font-mono">{c.couponCode}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {c.isFlashSale && <span className="badge bg-yellow-100 text-yellow-700 text-xs">⚡ Flash</span>}
                      {c.isCouponCampaign && <span className="badge bg-purple-100 text-purple-700 text-xs">🏷️ Coupon</span>}
                      {c.pageSlug && <span className="badge bg-blue-100 text-blue-700 text-xs">📄 Page</span>}
                      {!c.isFlashSale && !c.isCouponCampaign && !c.pageSlug && <span className="badge bg-gray-100 text-gray-500 text-xs">{c.type||'custom'}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge c={c}/></td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {c.startDate ? new Date(c.startDate).toLocaleDateString() : '∞'} → {c.endDate ? new Date(c.endDate).toLocaleDateString() : '∞'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => toggleActive(c._id)} className={`text-xs px-2 py-1 rounded-lg ${c.isActive ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>{c.isActive ? 'Off' : 'On'}</button>
                      <button onClick={() => openEdit(c)} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600">Edit</button>
                      <button onClick={() => deleteCampaign(c._id)} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Campaign Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] overflow-y-auto scale-in" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h3 className="font-bold text-xl text-gray-900">{editingId ? 'Edit Campaign' : 'New Campaign'}</h3>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">✕</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Presets */}
              <div>
                <p className="form-label mb-2">Quick Presets</p>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {Object.entries(PRESETS).map(([key,p]) => (
                    <button key={key} type="button" onClick={() => applyPreset(key)}
                      className="p-2 rounded-xl border border-gray-200 hover:border-primary hover:shadow-sm transition-all text-center group">
                      <div className="text-xl mb-0.5">{p.name.split(' ')[0]}</div>
                      <div className="text-[9px] text-gray-500 font-medium leading-tight group-hover:text-primary">{p.name.slice(p.name.indexOf(' ')+1)}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 overflow-x-auto bg-gray-100 rounded-xl p-1">
                {TABS_FORM.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${activeTab===t.id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── BASIC TAB ── */}
              {activeTab === 'basic' && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <F label="Campaign Name *" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} placeholder="Christmas Sale 2025"/>
                    <div>
                      <label className="form-label">Type</label>
                      <select value={form.type||'custom'} onChange={e=>setForm(p=>({...p,type:e.target.value}))} className="form-input">
                        <option value="custom">Custom</option>
                        <option value="christmas">Christmas</option>
                        <option value="new_year">New Year</option>
                        <option value="black_friday">Black Friday</option>
                        <option value="valentines">Valentine's Day</option>
                        <option value="easter">Easter</option>
                        <option value="halloween">Halloween</option>
                        <option value="eid">Eid</option>
                        <option value="flash_sale">Flash Sale</option>
                        <option value="coupon">Coupon Campaign</option>
                      </select>
                    </div>
                    <F label="Discount %" type="number" value={form.discountPercent} onChange={e=>setForm(p=>({...p,discountPercent:Number(e.target.value)}))} placeholder="25"/>
                    <F label="Coupon Code" value={form.couponCode} onChange={e=>setForm(p=>({...p,couponCode:e.target.value.toUpperCase()}))} placeholder="XMAS25"/>
                  </div>
                  <div><label className="form-label">Announcement Text</label><input value={form.announcement||''} onChange={e=>setForm(p=>({...p,announcement:e.target.value}))} className="form-input" placeholder="🎄 Christmas Sale! 25% off everything!"/></div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1"><label className="form-label">Announcement BG Color</label>
                      <div className="flex gap-2 items-center"><input type="color" value={form.announcementBg||'#15803d'} onChange={e=>setForm(p=>({...p,announcementBg:e.target.value}))} className="w-11 h-10 rounded-xl border-2 border-gray-200 cursor-pointer p-0.5"/><input value={form.announcementBg||''} onChange={e=>setForm(p=>({...p,announcementBg:e.target.value}))} className="form-input font-mono text-sm flex-1"/></div>
                    </div>
                    <div className="pb-0.5"><Toggle label="Show Announcement" value={form.announcementEnabled!==false} onChange={()=>setForm(p=>({...p,announcementEnabled:!p.announcementEnabled}))}/></div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <F label="Banner Title" value={form.featuredBannerTitle} onChange={e=>setForm(p=>({...p,featuredBannerTitle:e.target.value}))} placeholder="Christmas Sale"/>
                    <F label="Banner Subtitle" value={form.featuredBannerSubtitle} onChange={e=>setForm(p=>({...p,featuredBannerSubtitle:e.target.value}))} placeholder="Up to 50% off!"/>
                  </div>
                  <Toggle label="Activate campaign immediately" value={form.isActive} onChange={()=>setForm(p=>({...p,isActive:!p.isActive}))}/>
                </div>
              )}

              {/* ── FLASH SALE TAB ── */}
              {activeTab === 'flash' && (
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-2xl">
                    <Toggle label="⚡ Enable Flash Sale" desc="Adds countdown timer banner to storefront" value={form.isFlashSale} onChange={()=>setForm(p=>({...p,isFlashSale:!p.isFlashSale}))}/>
                  </div>
                  {form.isFlashSale && (
                    <>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <F label="Flash Sale Title" value={form.flashSaleTitle} onChange={e=>setForm(p=>({...p,flashSaleTitle:e.target.value}))} placeholder="⚡ Flash Sale"/>
                        <F label="Flash Sale Subtitle" value={form.flashSaleSubtitle} onChange={e=>setForm(p=>({...p,flashSaleSubtitle:e.target.value}))} placeholder="Limited time only!"/>
                        <div>
                          <label className="form-label">⏰ Sale End Date & Time *</label>
                          <input type="datetime-local" value={form.flashSaleEndTime||''} onChange={e=>setForm(p=>({...p,flashSaleEndTime:e.target.value}))} className="form-input"/>
                          <p className="text-xs text-gray-400 mt-1">Countdown timer will appear on storefront</p>
                        </div>
                      </div>
                      {form.flashSaleEndTime && (
                        <div className="p-4 bg-white border border-gray-100 rounded-2xl">
                          <p className="text-xs text-gray-500 font-medium mb-3">Live preview:</p>
                          <div className="rounded-xl p-4 text-white" style={{background:`linear-gradient(135deg,${form.theme?.primaryColor||'#dc2626'},${form.theme?.bgColor||'#0f172a'})`}}>
                            <p className="font-bold text-lg mb-2">{form.flashSaleTitle||'⚡ Flash Sale'}</p>
                            <p className="text-white/80 text-sm mb-3">{form.flashSaleSubtitle||'Limited time only!'}</p>
                            <CountdownTimer endTime={form.flashSaleEndTime} color={form.theme?.primaryColor||'#dc2626'}/>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── COUPON TAB ── */}
              {activeTab === 'coupon' && (
                <div className="space-y-4">
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl">
                    <Toggle label="🏷️ Enable Coupon Campaign" desc="Highlights a coupon code on the storefront" value={form.isCouponCampaign} onChange={()=>setForm(p=>({...p,isCouponCampaign:!p.isCouponCampaign}))}/>
                  </div>
                  {form.isCouponCampaign && (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <F label="Coupon Code *" value={form.couponCode} onChange={e=>setForm(p=>({...p,couponCode:e.target.value.toUpperCase()}))} placeholder="SAVE20"/>
                        <div>
                          <label className="form-label">Discount Type</label>
                          <select value={form.couponType||'percentage'} onChange={e=>setForm(p=>({...p,couponType:e.target.value}))} className="form-input">
                            <option value="percentage">Percentage (%)</option>
                            <option value="fixed">Fixed Amount</option>
                          </select>
                        </div>
                        <F label="Discount Value" type="number" value={form.couponValue} onChange={e=>setForm(p=>({...p,couponValue:Number(e.target.value)}))} placeholder={form.couponType==='percentage'?'20':'500'}/>
                        <F label="Minimum Order Amount" type="number" value={form.couponMinOrder} onChange={e=>setForm(p=>({...p,couponMinOrder:Number(e.target.value)}))} placeholder="0 = no minimum"/>
                      </div>
                      <div>
                        <label className="form-label">Coupon Description</label>
                        <input value={form.couponDescription||''} onChange={e=>setForm(p=>({...p,couponDescription:e.target.value}))} className="form-input" placeholder="Use this code for 20% off your order!"/>
                      </div>
                      <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl">
                        <Toggle label="🤖 Auto-create coupon in system" desc="Automatically creates/updates this coupon in the Coupons module" value={form.couponAutoCreate} onChange={()=>setForm(p=>({...p,couponAutoCreate:!p.couponAutoCreate}))}/>
                      </div>
                      {/* Coupon Preview */}
                      {form.couponCode && (
                        <div className="p-4 bg-white border-2 border-dashed border-purple-200 rounded-2xl text-center">
                          <p className="text-xs text-gray-500 mb-2">Coupon badge preview on storefront</p>
                          <div className="inline-flex items-center gap-3 bg-purple-600 text-white px-6 py-3 rounded-2xl">
                            <span className="text-2xl">🏷️</span>
                            <div className="text-left">
                              <p className="text-xs opacity-80">{form.couponDescription||'Use this code for'}</p>
                              <p className="font-mono font-black text-xl tracking-widest">{form.couponCode}</p>
                              <p className="text-xs opacity-80">{form.couponValue}{form.couponType==='percentage'?'% OFF':' OFF'}{form.couponMinOrder>0?` on orders above ${form.couponMinOrder}`:''}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── THEME TAB ── */}
              {activeTab === 'theme' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[['primaryColor','🎨 Primary'],['secondaryColor','✨ Accent'],['bgColor','🌑 Dark BG']].map(([key,label]) => (
                      <div key={key}>
                        <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                        <div className="flex gap-1.5 items-center">
                          <input type="color" value={form.theme?.[key]||'#000000'} onChange={e=>setForm(p=>({...p,theme:{...p.theme,[key]:e.target.value}}))} className="w-10 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5 flex-shrink-0"/>
                          <input value={form.theme?.[key]||''} onChange={e=>setForm(p=>({...p,theme:{...p.theme,[key]:e.target.value}}))} className="form-input font-mono text-xs flex-1"/>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border border-gray-100 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-800 mb-3">✨ Visual Effects</p>
                    <Toggle label="❄️ Snow Effect" value={form.theme?.snowEffect} onChange={()=>setForm(p=>({...p,theme:{...p.theme,snowEffect:!p.theme?.snowEffect}}))}/>
                    <Toggle label="🎊 Confetti Effect" value={form.theme?.confettiEffect} onChange={()=>setForm(p=>({...p,theme:{...p.theme,confettiEffect:!p.theme?.confettiEffect}}))}/>
                    {/* Live Preview */}
                    <div className="mt-3 rounded-xl overflow-hidden relative h-24" style={{background:`linear-gradient(135deg,${form.theme?.primaryColor||'#15803d'},${form.theme?.bgColor||'#0f172a'})`}}>
                      {form.theme?.snowEffect && <SnowPreview/>}
                      {form.theme?.confettiEffect && <ConfettiPreview/>}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white font-bold text-sm z-10 relative">{form.name||'Campaign Preview'}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Custom CSS</label>
                    <textarea value={form.theme?.customCSS||''} onChange={e=>setForm(p=>({...p,theme:{...p.theme,customCSS:e.target.value}}))} rows={3} className="form-input font-mono text-xs resize-none" placeholder=".campaign-hero { ... }"/>
                  </div>
                </div>
              )}

              {/* ── CAMPAIGN PAGE TAB ── */}
              {activeTab === 'page' && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
                    📄 Create a dedicated campaign page at <strong>/campaign/[slug]</strong> to showcase all sale products
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Page URL Slug</label>
                      <input value={form.pageSlug||''} onChange={e=>setForm(p=>({...p,pageSlug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-')}))} className="form-input font-mono text-sm" placeholder="christmas-sale"/>
                      <p className="text-xs text-gray-400 mt-1">Will be accessible at /campaign/{form.pageSlug||'slug'}</p>
                    </div>
                    <F label="Page Title" value={form.pageTitle} onChange={e=>setForm(p=>({...p,pageTitle:e.target.value}))} placeholder="Christmas Sale 2025"/>
                  </div>
                  <div>
                    <label className="form-label">Page Description</label>
                    <textarea value={form.pageDescription||''} onChange={e=>setForm(p=>({...p,pageDescription:e.target.value}))} rows={2} className="form-input resize-none" placeholder="Discover amazing deals this Christmas season..."/>
                  </div>
                  <ImageUpload label="Campaign Page Banner" hint="Recommended: 1400×400px" value={form.pageBannerImage} onChange={url=>setForm(p=>({...p,pageBannerImage:url}))}/>
                  <div>
                    <label className="form-label">Page Content (HTML)</label>
                    <textarea value={form.pageContent||''} onChange={e=>setForm(p=>({...p,pageContent:e.target.value}))} rows={5} className="form-input font-mono text-xs resize-none" placeholder="<h2>🎄 Christmas Sale</h2><p>Your campaign content...</p>"/>
                  </div>
                  {form.pageSlug && (
                    <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">
                      ✅ Campaign page will be available at: <strong>/campaign/{form.pageSlug}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* ── SCHEDULE TAB ── */}
              {activeTab === 'schedule' && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                    <Toggle label="📅 Schedule this campaign" desc="Campaign will auto-activate when start date arrives" value={form.isScheduled} onChange={()=>setForm(p=>({...p,isScheduled:!p.isScheduled}))}/>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Start Date & Time</label>
                      <input type="datetime-local" value={form.startDate||''} onChange={e=>setForm(p=>({...p,startDate:e.target.value}))} className="form-input"/>
                      <p className="text-xs text-gray-400 mt-1">Leave blank for no start restriction</p>
                    </div>
                    <div>
                      <label className="form-label">End Date & Time</label>
                      <input type="datetime-local" value={form.endDate||''} onChange={e=>setForm(p=>({...p,endDate:e.target.value}))} className="form-input"/>
                      <p className="text-xs text-gray-400 mt-1">Leave blank for no end restriction</p>
                    </div>
                  </div>
                  {form.startDate && form.endDate && (
                    <div className="p-4 bg-white border border-gray-100 rounded-xl">
                      <p className="text-xs text-gray-500 font-medium mb-2">Duration preview:</p>
                      <div className="text-sm text-gray-700">
                        <span className="font-semibold">{new Date(form.startDate).toLocaleString()}</span>
                        <span className="mx-2 text-gray-400">→</span>
                        <span className="font-semibold">{new Date(form.endDate).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {Math.round((new Date(form.endDate) - new Date(form.startDate)) / 86400000)} day(s) duration
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-5 pt-0 sticky bottom-0 bg-white border-t mt-4">
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving...' : editingId ? '✓ Save Changes' : '+ Create Campaign'}
              </button>
              <button onClick={() => setModal(false)} className="btn-outline px-6">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}