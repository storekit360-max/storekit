import React, { useEffect, useMemo, useRef, useState } from 'react';
import API from '../../utils/api';
import useModalFocus from '../../hooks/useModalFocus';

const messageOf = error => error.response?.data?.message || error.message || 'Search failed';

export default function CommandPalette({ open, onClose, tabs, onNavigate, notify }) {
  const [query, setQuery] = useState(''); const [groups, setGroups] = useState([]); const [loading, setLoading] = useState(false); const [active, setActive] = useState(0); const inputRef = useRef(null);
  const modalRef = useModalFocus(open, onClose);
  const navigation = useMemo(() => tabs.filter(tab => tab.keywords ? `${tab.label} ${tab.keywords}`.toLowerCase().includes(query.toLowerCase()) : tab.label.toLowerCase().includes(query.toLowerCase())).map(tab => ({ type: 'navigation', id: tab.key, title: tab.label, subtitle: 'Open Control Center module', tab: tab.key, query: {} })), [query, tabs]);
  const visibleGroups = useMemo(() => [{ type: 'Navigation', items: navigation }, ...groups].filter(group => group.items.length), [groups, navigation]);
  const flat = useMemo(() => visibleGroups.flatMap(group => group.items), [visibleGroups]);

  useEffect(() => { if (!open) return; setQuery(''); setGroups([]); setActive(0); window.setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => {
    if (!open || query.trim().length < 2) { setGroups([]); setLoading(false); return undefined; }
    const controller = new AbortController(); const timer = window.setTimeout(async () => { setLoading(true); try { const { data } = await API.get('/superadmin/search', { params: { q: query.trim() }, signal: controller.signal, skipCache: true }); setGroups(data.groups || []); } catch (error) { if (error.code !== 'ERR_CANCELED' && error.name !== 'CanceledError') notify('error', messageOf(error)); } finally { setLoading(false); } }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [notify, open, query]);
  useEffect(() => { setActive(index => Math.min(index, Math.max(flat.length - 1, 0))); }, [flat.length]);

  if (!open) return null;
  const choose = result => { onNavigate(result.tab, result.query || {}); onClose(); };
  const onKeyDown = event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => flat.length ? (index + 1) % flat.length : 0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => flat.length ? (index - 1 + flat.length) % flat.length : 0); }
    else if (event.key === 'Enter' && flat[active]) { event.preventDefault(); choose(flat[active]); }
  };

  let offset = 0;
  return <div className="fixed inset-0 z-[10000] bg-slate-950/60 p-4 backdrop-blur-sm sm:p-16" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section ref={modalRef} tabIndex="-1" role="dialog" aria-modal="true" aria-label="Global command search" className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onKeyDown={onKeyDown}><div className="flex items-center gap-3 border-b p-4"><svg aria-hidden="true" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"/></svg><input ref={inputRef} aria-label="Search the Control Center" value={query} onChange={event=>{setQuery(event.target.value);setActive(0);}} role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="superadmin-command-results" aria-activedescendant={flat[active]?`command-${flat[active].type}-${flat[active].id}`:undefined} placeholder="Search tenants, users, tickets, flags, audit…" className="h-10 min-w-0 flex-1 border-0 text-base outline-none"/><kbd className="rounded border bg-slate-50 px-2 py-1 text-[10px] text-slate-500">ESC</kbd></div><div id="superadmin-command-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">{visibleGroups.map(group=>{const start=offset;offset+=group.items.length;return <section key={group.type} aria-label={group.type}><h3 className="px-3 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{group.type}</h3>{group.items.map((result,index)=>{const flatIndex=start+index;return <button id={`command-${result.type}-${result.id}`} role="option" aria-selected={active===flatIndex} key={`${result.type}-${result.id}`} onMouseEnter={()=>setActive(flatIndex)} onClick={()=>choose(result)} className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left ${active===flatIndex?'bg-indigo-50 text-indigo-900':'hover:bg-slate-50'}`}><span className="min-w-0"><strong className="block truncate text-sm">{result.title}</strong><span className="block truncate text-xs text-slate-500">{result.subtitle}</span></span><span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{result.type.replace('-', ' ')}</span></button>;})}</section>;})}{loading&&<p className="p-8 text-center text-sm text-slate-500" role="status">Searching authorized records…</p>}{!loading&&!flat.length&&<p className="p-8 text-center text-sm text-slate-500">No authorized results match this search.</p>}</div><footer className="flex gap-4 border-t bg-slate-50 px-4 py-2 text-[10px] text-slate-500"><span>↑↓ navigate</span><span>Enter open</span><span>Ctrl/⌘ K toggle</span></footer></section></div>;
}
