import React, { useCallback, useEffect, useState } from 'react';
import API from '../../utils/api';
import useModalFocus from '../../hooks/useModalFocus';

const messageOf = error => error.response?.data?.detail || error.response?.data?.message || error.message || 'Integration request failed';
const statusStyle = status => ({ healthy: 'bg-emerald-50 text-emerald-700', configuration_only: 'bg-blue-50 text-blue-700', failed: 'bg-red-50 text-red-700', degraded: 'bg-amber-50 text-amber-700', never: 'bg-slate-100 text-slate-600' }[status] || 'bg-slate-100 text-slate-600');

export default function SuperAdminIntegrations({ notify }) {
  const [integrations, setIntegrations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [testing, setTesting] = useState('');
  const [saving, setSaving] = useState(false);
  const modalRef = useModalFocus(!!editing, () => setEditing(null));

  const load = useCallback(async () => {
    try { const { data } = await API.get('/superadmin/integrations', { skipCache: true }); setIntegrations(data.integrations || []); setCategories(data.categories || []); }
    catch (error) { notify('error', messageOf(error)); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  function edit(item) {
    setEditing(item.provider);
    setForm({ enabled: item.enabled, config: { ...item.config }, secrets: Object.fromEntries(item.secretFields.map(field => [field.key, ''])) });
  }
  async function save(event) {
    event.preventDefault(); setSaving(true);
    try { await API.put(`/superadmin/integrations/${editing}`, form); notify('success', 'Integration configuration saved'); setEditing(null); await load(); }
    catch (error) { notify('error', messageOf(error)); }
    finally { setSaving(false); }
  }
  async function test(item) {
    setTesting(item.provider);
    try { const { data } = await API.post(`/superadmin/integrations/${item.provider}/test`, {}); notify('success', data.message); await load(); }
    catch (error) { notify('error', messageOf(error)); await load(); }
    finally { setTesting(''); }
  }

  const visible = category === 'all' ? integrations : integrations.filter(item => item.category === category);
  const healthy = integrations.filter(item => item.lastTest?.status === 'healthy').length;
  const configured = integrations.filter(item => item.secretFields.every(field => field.configured)).length;
  return <div className="space-y-6">
    <section className="rounded-2xl bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-900 p-6 text-white"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Connected services</p><h2 className="mt-2 text-2xl font-extrabold">Integration Center</h2><p className="mt-2 max-w-3xl text-sm text-slate-300">Encrypted credentials, redacted configuration, environment fallback, and real provider connection tests.</p></div><div className="flex gap-3 text-center"><div className="rounded-xl bg-white/10 px-4 py-3"><strong className="block text-xl">{configured}/{integrations.length}</strong><span className="text-[10px] text-slate-300">Configured</span></div><div className="rounded-xl bg-white/10 px-4 py-3"><strong className="block text-xl">{healthy}</strong><span className="text-[10px] text-slate-300">Remote healthy</span></div></div></div></section>

    <div className="flex flex-wrap gap-2"><button onClick={() => setCategory('all')} className={`rounded-full px-3 py-1.5 text-xs font-bold ${category === 'all' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border'}`}>All</button>{categories.map(item => <button key={item} onClick={() => setCategory(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${category === item ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border'}`}>{item}</button>)}</div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(item => <article key={item.provider} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{item.label}</h3><p className="text-xs capitalize text-slate-500">{item.category} · {item.testMode === 'remote' ? 'Remote test' : 'Configuration validation'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.enabled ? 'Enabled' : 'Disabled'}</span></div><div className="mt-4 space-y-2">{item.secretFields.map(field => <div key={field.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><code>{field.key}</code><span className={field.configured ? 'text-emerald-700' : 'text-red-600'}>{field.configured ? `Configured · ${field.source}` : 'Missing'}</span></div>)}</div><div className="mt-4 rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusStyle(item.lastTest?.status || 'never')}`}>{(item.lastTest?.status || 'never').replace('_', ' ')}</span><span className="text-[10px] text-slate-400">{item.lastTest?.testedAt ? new Date(item.lastTest.testedAt).toLocaleString() : 'Never tested'}</span></div><p className="mt-2 text-xs text-slate-500">{item.lastTest?.message || 'Run a connection test after configuring credentials.'}</p></div><div className="mt-4 flex gap-2"><button onClick={() => edit(item)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Configure</button><button disabled={testing === item.provider} onClick={() => test(item)} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{testing === item.provider ? 'Testing…' : 'Test connection'}</button></div></article>)}</div>

    {editing && form && <form onSubmit={save} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null); }}><div ref={modalRef} tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby="integration-dialog-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 id="integration-dialog-title" className="text-lg font-extrabold text-slate-900">Configure {integrations.find(item => item.provider === editing)?.label}</h3><p className="mt-1 text-xs text-slate-500">Secret fields are write-only and encrypted before storage. Leave blank to preserve the current value.</p></div><button type="button" aria-label="Close integration configuration" onClick={() => setEditing(null)} className="text-slate-400">✕</button></div><label className="mt-5 flex items-center justify-between rounded-xl border p-3 text-sm font-bold text-slate-700">Integration enabled<input type="checkbox" checked={form.enabled} onChange={event => setForm(value => ({ ...value, enabled: event.target.checked }))} /></label><div className="mt-4 space-y-4">{Object.keys(form.config).map(field => <label key={field} className="block text-xs font-bold text-slate-600"><span className="capitalize">{field}</span><input value={form.config[field] ?? ''} onChange={event => setForm(value => ({ ...value, config: { ...value.config, [field]: event.target.value } }))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label>)}{Object.keys(form.secrets).map(field => { const existing = integrations.find(item => item.provider === editing)?.secretFields.find(item => item.key === field); return <label key={field} className="block text-xs font-bold text-slate-600"><span className="capitalize">{field} {existing?.configured && <span className="font-normal text-emerald-600">· currently configured</span>}</span><input type="password" autoComplete="new-password" value={form.secrets[field]} onChange={event => setForm(value => ({ ...value, secrets: { ...value.secrets, [field]: event.target.value } }))} placeholder={existing?.configured ? 'Leave blank to preserve' : 'Required secret'} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label>; })}</div><button disabled={saving} className="mt-6 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving encrypted configuration…' : 'Save integration'}</button></div></form>}
  </div>;
}
