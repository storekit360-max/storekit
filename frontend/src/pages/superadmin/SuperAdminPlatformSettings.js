import React, { useCallback, useEffect, useMemo, useState } from 'react';
import API from '../../utils/api';

const messageOf = error => error.response?.data?.message || error.message || 'Settings request failed';

function SettingInput({ definition, value, onChange }) {
  if (definition.type === 'boolean') return <button type="button" role="switch" aria-checked={value === true} onClick={() => onChange(!value)} className={`relative h-7 w-12 rounded-full transition ${value ? 'bg-indigo-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${value ? 'left-6' : 'left-1'}`} /></button>;
  if (definition.type === 'enum') return <select value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">{definition.options.map(option => <option key={option} value={option}>{option}</option>)}</select>;
  if (definition.type === 'color') return <div className="flex gap-2"><input type="color" value={value} onChange={event => onChange(event.target.value)} className="h-10 w-12 rounded border border-slate-300 p-1" /><input value={value} onChange={event => onChange(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" /></div>;
  return <input type={definition.type === 'email' ? 'email' : definition.type === 'url' ? 'url' : definition.type === 'number' ? 'number' : 'text'} value={value ?? ''} onChange={event => onChange(definition.type === 'number' ? Number(event.target.value) : event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />;
}

export default function SuperAdminPlatformSettings({ notify }) {
  const [groups, setGroups] = useState({});
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState({});
  const [metadata, setMetadata] = useState({});
  const [activeGroup, setActiveGroup] = useState('platform');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await API.get('/superadmin/platform-settings', { skipCache: true }); setGroups(data.groups || {}); setValues(data.values || {}); setSaved(data.values || {}); setMetadata(data.metadata || {}); }
    catch (error) { notify('error', messageOf(error)); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const changes = useMemo(() => Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(saved[key]))), [saved, values]);
  const changeCount = Object.keys(changes).length;

  async function save() {
    if (!changeCount) return;
    if (changes['maintenance.enabled'] === true && !window.confirm('Enable maintenance mode? Customer-facing APIs and logins will return a maintenance response while Super Admin recovery remains available.')) return;
    setSaving(true);
    try { await API.put('/superadmin/platform-settings', { settings: changes }); notify('success', `${changeCount} platform setting${changeCount === 1 ? '' : 's'} updated`); await load(); }
    catch (error) { notify('error', messageOf(error)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">Loading platform configuration…</div>;
  const definitions = groups[activeGroup] || [];
  return <div className="space-y-6">
    <section className="rounded-2xl bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 p-6 text-white"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">Global configuration</p><h2 className="mt-2 text-2xl font-extrabold">Platform Settings</h2><p className="mt-2 max-w-3xl text-sm text-slate-300">Typed, validated, audited controls for platform identity, localization, support, legal links, registration, and maintenance operations.</p></div><button disabled={!changeCount || saving} onClick={save} className="rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-bold disabled:opacity-40">{saving ? 'Saving…' : changeCount ? `Save ${changeCount} changes` : 'No changes'}</button></div></section>

    {values['maintenance.enabled'] && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">Maintenance mode is active. Customer-facing API requests are currently gated. Health checks and Super Admin recovery remain available.</div>}
    {values['registration.invitationOnly'] && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">Invitation-only registration is active. Open registration requests are rejected.</div>}

    <div className="grid gap-5 lg:grid-cols-[220px_1fr]"><nav className="rounded-2xl border border-slate-200 bg-white p-2 h-fit">{Object.keys(groups).map(group => <button key={group} onClick={() => setActiveGroup(group)} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold capitalize ${activeGroup === group ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>{group}<span className="float-right rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{groups[group].length}</span></button>)}</nav>
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div className="border-b border-slate-200 px-5 py-4"><h3 className="font-bold capitalize text-slate-900">{activeGroup}</h3><p className="mt-1 text-xs text-slate-500">Changes are validated and recorded in the platform audit trail.</p></div><div className="divide-y divide-slate-100">{definitions.map(definition => <div key={definition.key} className="grid gap-3 p-5 md:grid-cols-[1fr_minmax(240px,0.9fr)] md:items-center"><div><label htmlFor={definition.key} className="text-sm font-bold text-slate-800">{definition.label}</label><code className="mt-1 block text-[10px] text-slate-400">{definition.key}</code>{metadata[definition.key] && <p className="mt-1 text-[10px] text-slate-400">Updated {new Date(metadata[definition.key].updatedAt).toLocaleString()} by {metadata[definition.key].updatedBy?.email || 'system'}</p>}</div><SettingInput definition={definition} value={values[definition.key]} onChange={value => setValues(current => ({ ...current, [definition.key]: value }))} /></div>)}</div></section></div>
  </div>;
}
