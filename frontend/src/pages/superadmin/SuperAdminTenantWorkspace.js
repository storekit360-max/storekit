import React, { useCallback, useEffect, useRef, useState } from 'react';
import API from '../../utils/api';
import { useSearchParams } from 'react-router-dom';

const messageOf = error => error.response?.data?.message || error.message || 'Tenant request failed';
const money = (value, currency = 'LKR') => `${currency} ${Number(value || 0).toLocaleString()}`;
const dateTime = value => value ? new Date(value).toLocaleString() : '—';
const healthStyle = band => ({ healthy: 'bg-emerald-50 text-emerald-700', attention: 'bg-amber-50 text-amber-700', 'at-risk': 'bg-orange-50 text-orange-700', critical: 'bg-red-50 text-red-700' }[band] || 'bg-slate-100 text-slate-600');

export default function SuperAdminTenantWorkspace({ notify, canEdit = false }) {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState({ number: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({ search: '', status: '', archived: 'false' });
  const [selectedId, setSelectedId] = useState(searchParams.get('tenant') || '');
  const [details, setDetails] = useState(null);
  const [activity, setActivity] = useState([]);
  const [notes, setNotes] = useState([]);
  const [detailTab, setDetailTab] = useState('overview');
  const [noteBody, setNoteBody] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedViews, setSavedViews] = useState([]);
  const [savedViewName, setSavedViewName] = useState('');
  const [activeSavedViewId, setActiveSavedViewId] = useState('');
  const [inlineEdit, setInlineEdit] = useState(null);
  const [inlineSaving, setInlineSaving] = useState(false);
  const defaultViewApplied = useRef(false);

  const loadSavedViews = useCallback(async () => {
    try {
      const { data } = await API.get('/superadmin/tenant-workspace/saved-views/list', { skipCache: true });
      const views = data.views || []; setSavedViews(views);
      if (!defaultViewApplied.current) {
        defaultViewApplied.current = true;
        const defaultView = views.find(view => view.isDefault);
        if (defaultView) { setFilters(defaultView.state.filters); setActiveSavedViewId(defaultView._id); }
      }
    } catch (error) { notify('error', messageOf(error)); }
  }, [notify]);

  const loadDirectory = useCallback(async (number = 1) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, page: number, limit: 25 }).filter(([, value]) => value !== ''));
      const { data } = await API.get('/superadmin/tenant-workspace', { params, skipCache: true });
      setRows(data.tenants); setPage(data.page);
    } catch (error) { notify('error', messageOf(error)); }
    finally { setLoading(false); }
  }, [filters, notify]);

  const loadTenant = useCallback(async id => {
    if (!id) return;
    try {
      const [detailResult, activityResult, noteResult] = await Promise.all([
        API.get(`/superadmin/tenant-workspace/${id}`, { skipCache: true }),
        API.get(`/superadmin/tenant-workspace/${id}/activity`, { skipCache: true }),
        API.get(`/superadmin/tenant-workspace/${id}/notes`, { skipCache: true }),
      ]);
      setDetails(detailResult.data); setActivity(activityResult.data.events || []); setNotes(noteResult.data || []);
      setTagInput((detailResult.data.tenant.management?.tags || []).join(', '));
    } catch (error) { notify('error', messageOf(error)); }
  }, [notify]);

  useEffect(() => { const timer = window.setTimeout(() => loadDirectory(1), 250); return () => window.clearTimeout(timer); }, [loadDirectory]);
  useEffect(() => { loadTenant(selectedId); }, [loadTenant, selectedId]);
  useEffect(() => { loadSavedViews(); }, [loadSavedViews]);

  function applySavedView(id) {
    setActiveSavedViewId(id);
    const view = savedViews.find(item => item._id === id);
    if (view) setFilters(view.state.filters);
  }
  async function saveCurrentView(event) {
    event.preventDefault();
    try {
      const { data } = await API.post('/superadmin/tenant-workspace/saved-views', { name: savedViewName, state: { filters } });
      setSavedViewName(''); setActiveSavedViewId(data._id); notify('success', 'Tenant view saved'); await loadSavedViews();
    } catch (error) { notify('error', messageOf(error)); }
  }
  async function makeDefaultView() {
    if (!activeSavedViewId) return;
    try { await API.put(`/superadmin/tenant-workspace/saved-views/${activeSavedViewId}/default`); notify('success', 'Default tenant view updated'); await loadSavedViews(); }
    catch (error) { notify('error', messageOf(error)); }
  }
  async function deleteSavedView() {
    const view = savedViews.find(item => item._id === activeSavedViewId);
    if (!view || !window.confirm(`Delete saved view “${view.name}”?`)) return;
    try { await API.delete(`/superadmin/tenant-workspace/saved-views/${view._id}`); setActiveSavedViewId(''); notify('success', 'Tenant view deleted'); await loadSavedViews(); }
    catch (error) { notify('error', messageOf(error)); }
  }

  async function addNote(event) {
    event.preventDefault();
    try { await API.post(`/superadmin/tenant-workspace/${selectedId}/notes`, { body: noteBody }); setNoteBody(''); notify('success', 'Internal note added'); await loadTenant(selectedId); }
    catch (error) { notify('error', messageOf(error)); }
  }
  async function saveTags() {
    try { await API.put(`/superadmin/tenant-workspace/${selectedId}/tags`, { tags: tagInput.split(',') }); notify('success', 'Tenant tags updated'); await Promise.all([loadTenant(selectedId), loadDirectory(page.number)]); }
    catch (error) { notify('error', messageOf(error)); }
  }
  function beginInlineEdit(row) {
    setInlineEdit({ id: row._id, storeName: row.storeName, tags: (row.management?.tags || []).join(', '), expectedUpdatedAt: row.updatedAt });
  }
  async function saveInlineEdit(event) {
    event.preventDefault(); setInlineSaving(true);
    try {
      const { data } = await API.put(`/superadmin/tenant-workspace/${inlineEdit.id}/metadata`, { storeName: inlineEdit.storeName, tags: inlineEdit.tags.split(','), expectedUpdatedAt: inlineEdit.expectedUpdatedAt });
      setRows(current => current.map(row => row._id === inlineEdit.id ? { ...row, ...data.tenant, management: { ...row.management, ...data.tenant.management } } : row));
      if (selectedId === inlineEdit.id) await loadTenant(inlineEdit.id);
      setInlineEdit(null); notify('success', 'Tenant metadata updated');
    } catch (error) { notify('error', messageOf(error)); if (error.response?.status === 409) await loadDirectory(page.number); }
    finally { setInlineSaving(false); }
  }
  async function changeArchive(archive) {
    const reason = archive ? window.prompt('Archive reason (recorded in audit):') : '';
    if (archive && reason === null) return;
    try { await API.post(`/superadmin/tenant-workspace/${selectedId}/${archive ? 'archive' : 'restore'}`, { reason }); notify('success', archive ? 'Tenant archived' : 'Tenant restored'); await Promise.all([loadTenant(selectedId), loadDirectory(1)]); }
    catch (error) { notify('error', messageOf(error)); }
  }
  async function impersonateTenant() {
    const reason = window.prompt('Why do you need to access this tenant? This reason is written to the audit trail.');
    if (reason === null) return;
    if (reason.trim().length < 10) return notify('error', 'Enter an impersonation reason of at least 10 characters');
    try {
      const { data } = await API.post(`/superadmin/tenant-workspace/${selectedId}/impersonate`, { reason });
      sessionStorage.setItem('storekit:platform-token', localStorage.getItem('token') || '');
      sessionStorage.setItem('storekit:platform-user', localStorage.getItem('user') || '');
      sessionStorage.setItem('storekit:impersonation', JSON.stringify({ tenant: data.tenant, expiresAt: data.expiresAt }));
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.assign('/admin');
    } catch (error) { notify('error', messageOf(error)); }
  }

  return <div className="space-y-5">
    <section className="rounded-2xl bg-gradient-to-r from-slate-950 via-violet-950 to-slate-900 p-6 text-white"><p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Tenant operations</p><h2 className="mt-2 text-2xl font-extrabold">Tenant workspace</h2><p className="mt-2 text-sm text-slate-300">Search the portfolio, understand health signals, inspect usage and billing, and maintain an auditable internal timeline.</p><div className="mt-4 flex gap-3 text-xs"><span className="rounded-full bg-white/10 px-3 py-1.5">{page.total} matching tenants</span><span className="rounded-full bg-white/10 px-3 py-1.5">Measured database usage</span><span className="rounded-full bg-white/10 px-3 py-1.5">Explainable risk scoring</span></div></section>

    {details && <div className="flex justify-end"><button onClick={impersonateTenant} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-sm">Impersonate {details.tenant.storeName} for 15 minutes</button></div>}

    <div className="grid min-h-[620px] gap-5 xl:grid-cols-[0.9fr_1.4fr]">
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div className="sticky top-0 z-10 space-y-2 border-b border-slate-200 bg-white p-4"><div className="grid gap-2 md:grid-cols-[1fr_130px_130px]"><input aria-label="Search tenants" value={filters.search} onChange={event => { setActiveSavedViewId(''); setFilters(value => ({ ...value, search: event.target.value })); }} placeholder="Store, slug, or domain" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" /><select aria-label="Tenant status" value={filters.status} onChange={event => { setActiveSavedViewId(''); setFilters(value => ({ ...value, status: event.target.value })); }} className="h-10 rounded-lg border border-slate-300 px-2 text-sm"><option value="">All status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="pending">Pending</option></select><select aria-label="Tenant archive state" value={filters.archived} onChange={event => { setActiveSavedViewId(''); setFilters(value => ({ ...value, archived: event.target.value })); }} className="h-10 rounded-lg border border-slate-300 px-2 text-sm"><option value="false">Current</option><option value="true">Archived</option><option value="all">All</option></select></div><div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2"><select aria-label="Saved tenant view" value={activeSavedViewId} onChange={event=>applySavedView(event.target.value)} className="h-9 min-w-40 flex-1 rounded-lg border border-slate-300 px-2 text-xs"><option value="">Unsaved filters</option>{savedViews.map(view=><option key={view._id} value={view._id}>{view.isDefault?'★ ':''}{view.name}</option>)}</select><form onSubmit={saveCurrentView} className="flex min-w-56 flex-1 gap-2"><input required minLength="2" maxLength="80" aria-label="New saved view name" value={savedViewName} onChange={event=>setSavedViewName(event.target.value)} placeholder="Name this view" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-xs"/><button className="rounded-lg bg-violet-600 px-3 text-xs font-bold text-white">Save</button></form><button disabled={!activeSavedViewId} onClick={makeDefaultView} className="h-9 rounded-lg border px-3 text-xs font-bold text-slate-600 disabled:opacity-40">Make default</button><button disabled={!activeSavedViewId} onClick={deleteSavedView} aria-label="Delete selected saved tenant view" className="h-9 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-700 disabled:opacity-40">Delete</button></div></div>
        <div className="divide-y divide-slate-100">{rows.map(row => <article key={row._id} className={`relative p-4 transition hover:bg-slate-50 ${selectedId === row._id ? 'bg-violet-50' : ''}`}>{inlineEdit?.id === row._id ? <form onSubmit={saveInlineEdit} className="space-y-3" aria-label={`Edit ${row.storeName} metadata`}><label className="block text-xs font-bold text-slate-600">Store name<input autoFocus required minLength="2" maxLength="120" value={inlineEdit.storeName} onChange={event => setInlineEdit(value => ({ ...value, storeName: event.target.value }))} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label><label className="block text-xs font-bold text-slate-600">Tags<input value={inlineEdit.tags} onChange={event => setInlineEdit(value => ({ ...value, tags: event.target.value }))} placeholder="vip, onboarding, at-risk" className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label><div className="flex justify-end gap-2"><button type="button" disabled={inlineSaving} onClick={() => setInlineEdit(null)} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50">Cancel</button><button disabled={inlineSaving} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{inlineSaving ? 'Saving…' : 'Save metadata'}</button></div></form> : <><button onClick={() => { setSelectedId(row._id); setDetailTab('overview'); }} aria-label={`Open ${row.storeName} tenant details`} className="w-full text-left"><div className={`flex items-start justify-between gap-3 ${canEdit ? 'pr-14' : ''}`}><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{row.storeName}</p><p className="truncate text-xs text-slate-500">{row.slug} · {row.plan?.name || 'No plan'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${healthStyle(row.health?.band)}`}>{row.health?.score}/100</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><span className="rounded-lg bg-slate-50 p-2"><strong className="block text-slate-900">{row.usage?.activeProducts || 0}</strong>products</span><span className="rounded-lg bg-slate-50 p-2"><strong className="block text-slate-900">{row.usage?.orders || 0}</strong>orders</span><span className="rounded-lg bg-slate-50 p-2"><strong className="block text-slate-900">{row.usage?.activeAdmins || 0}</strong>admins</span></div></button>{canEdit && <button onClick={() => beginInlineEdit(row)} aria-label={`Edit ${row.storeName} metadata inline`} className="absolute right-4 top-4 rounded-md border bg-white px-2 py-1 text-[10px] font-bold text-violet-700 shadow-sm">Edit</button>}</>}</article>)}</div>{!rows.length && !loading && <p className="p-10 text-center text-sm text-slate-500">No tenants match these filters.</p>}<div className="flex items-center justify-between border-t border-slate-100 p-3 text-xs text-slate-500"><button disabled={page.number <= 1} onClick={() => loadDirectory(page.number - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Previous</button><span>Page {page.number} of {Math.max(page.pages, 1)}</span><button disabled={page.number >= page.pages} onClick={() => loadDirectory(page.number + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next</button></div></section>

      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">{!details ? <div className="grid h-full place-items-center p-12 text-center text-slate-500"><div><p className="text-lg font-bold text-slate-700">Select a tenant</p><p className="mt-1 text-sm">Usage, billing, health, activity, and notes will appear here.</p></div></div> : <><div className="border-b border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h3 className="text-xl font-extrabold text-slate-900">{details.tenant.storeName}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${healthStyle(details.health.band)}`}>{details.health.band}</span></div><p className="mt-1 text-sm text-slate-500">{details.tenant.owner?.email || 'No owner'} · {details.tenant.plan?.name || 'No plan'}</p></div><button onClick={() => changeArchive(!details.tenant.management?.archivedAt)} className={`rounded-lg px-3 py-2 text-xs font-bold ${details.tenant.management?.archivedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{details.tenant.management?.archivedAt ? 'Restore tenant' : 'Archive tenant'}</button></div><div className="mt-4 flex gap-1 overflow-x-auto">{['overview', 'billing', 'activity', 'notes'].map(tab => <button key={tab} onClick={() => setDetailTab(tab)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize ${detailTab === tab ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{tab}</button>)}</div></div>
        <div className="p-5">{detailTab === 'overview' && <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Health', `${details.health.score}/100`], ['Risk', `${details.health.riskScore}/100`], ['Gross sales', money(details.usage.grossSales, details.tenant.settings?.currency)], ['Last order', dateTime(details.usage.lastOrderAt)]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>)}</div><div><h4 className="text-sm font-bold text-slate-900">Health signals</h4><div className="mt-2 space-y-2">{details.health.signals.length ? details.health.signals.map(signal => <div key={signal.code} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>{signal.label}</span><span className="text-xs font-bold text-red-600">−{signal.points}</span></div>) : <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">No active risk signals.</p>}</div></div><div><div className="flex items-center justify-between"><h4 className="text-sm font-bold text-slate-900">Tags</h4><button onClick={saveTags} className="text-xs font-bold text-violet-600">Save tags</button></div><input value={tagInput} onChange={event => setTagInput(event.target.value)} placeholder="vip, onboarding, at-risk" className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><strong>Storage:</strong> {details.storage.message}</div></div>}
          {detailTab === 'billing' && <div className="space-y-5"><div><h4 className="text-sm font-bold text-slate-900">Subscription</h4><pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-200">{JSON.stringify(details.tenant.billing || details.tenant.subscription, null, 2)}</pre></div><div><h4 className="text-sm font-bold text-slate-900">Recent payments</h4><div className="mt-2 divide-y rounded-xl border">{details.billing.payments.map(payment => <div key={payment._id} className="flex justify-between gap-3 p-3 text-sm"><span>{dateTime(payment.createdAt)} · {payment.method}</span><strong>{money(payment.amount, payment.currency)} · {payment.status}</strong></div>)}{!details.billing.payments.length && <p className="p-4 text-sm text-slate-500">No subscription payments.</p>}</div></div></div>}
          {detailTab === 'activity' && <div className="space-y-2">{activity.map(event => <div key={event._id} className="rounded-xl border border-slate-200 p-3"><div className="flex justify-between gap-3"><code className="text-xs font-bold text-violet-700">{event.action}</code><span className="text-xs text-slate-400">{dateTime(event.occurredAt)}</span></div><p className="mt-1 text-xs text-slate-500">{event.actor?.email || 'System'} · {event.outcome?.status} · {event.correlationId}</p></div>)}{!activity.length && <p className="p-8 text-center text-sm text-slate-500">No platform activity recorded yet.</p>}</div>}
          {detailTab === 'notes' && <div><form onSubmit={addNote} className="flex gap-2"><textarea required value={noteBody} onChange={event => setNoteBody(event.target.value)} maxLength={5000} placeholder="Add an internal note…" className="min-h-20 flex-1 rounded-xl border border-slate-300 p-3 text-sm" /><button className="self-end rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white">Add note</button></form><div className="mt-4 space-y-3">{notes.map(note => <article key={note._id} className="rounded-xl border border-slate-200 p-3"><p className="whitespace-pre-wrap text-sm text-slate-700">{note.body}</p><p className="mt-2 text-xs text-slate-400">{note.authorId?.email} · {dateTime(note.createdAt)}</p></article>)}</div></div>}</div></>}
      </section>
    </div>
  </div>;
}
