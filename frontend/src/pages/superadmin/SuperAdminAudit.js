import React, { useCallback, useEffect, useState } from 'react';
import API from '../../utils/api';
import { useSearchParams } from 'react-router-dom';

const dateTime = value => value ? new Date(value).toLocaleString() : '—';
const messageOf = error => error.response?.data?.message || error.message || 'Audit request failed';

export default function SuperAdminAudit({ notify }) {
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [page, setPage] = useState({ hasMore: false, nextCursor: null });
  const [filters, setFilters] = useState({ search: searchParams.get('correlationId') || '', status: '', resource: '' });
  const [facets, setFacets] = useState({ resources: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (cursor = null, append = false) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, cursor }).filter(([, value]) => value));
      const { data } = await API.get('/superadmin/audit', { params, skipCache: true });
      setEvents(current => append ? [...current, ...data.events] : data.events); setPage(data.page);
    } catch (error) { notify('error', messageOf(error)); }
    finally { setLoading(false); }
  }, [filters, notify]);

  useEffect(() => { API.get('/superadmin/audit/facets').then(({ data }) => setFacets(data)).catch(() => {}); }, []);
  useEffect(() => { const timer = window.setTimeout(() => load(), 250); return () => window.clearTimeout(timer); }, [load]);

  function exportAudit() {
    const query = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)));
    const token = localStorage.getItem('token');
    API.get(`/superadmin/audit/export.csv?${query}`, { responseType: 'blob', headers: { Authorization: `Bearer ${token}` }, skipCache: true }).then(response => {
      const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `storekit-audit-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
    }).catch(error => notify('error', messageOf(error)));
  }

  return <div className="space-y-5"><section className="rounded-2xl bg-gradient-to-r from-slate-950 via-cyan-950 to-slate-900 p-6 text-white"><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Accountability</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-extrabold">Platform audit trail</h2><p className="mt-2 text-sm text-slate-300">Search persistent operator actions by actor, target, outcome, and correlation ID.</p></div><button onClick={exportAudit} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold hover:bg-cyan-400">Export CSV</button></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white"><div className="sticky top-0 z-10 grid gap-3 border-b border-slate-200 bg-white p-4 md:grid-cols-[1fr_180px_180px]"><input value={filters.search} onChange={event => setFilters(value => ({ ...value, search: event.target.value }))} placeholder="Actor email, correlation ID, resource ID" className="h-10 rounded-lg border border-slate-300 px-3 text-sm" /><select value={filters.status} onChange={event => setFilters(value => ({ ...value, status: event.target.value }))} className="h-10 rounded-lg border border-slate-300 px-3 text-sm"><option value="">All outcomes</option><option value="success">Success</option><option value="failure">Failure</option></select><select value={filters.resource} onChange={event => setFilters(value => ({ ...value, resource: event.target.value }))} className="h-10 rounded-lg border border-slate-300 px-3 text-sm"><option value="">All resources</option>{facets.resources?.map(resource => <option key={resource}>{resource}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Request</th></tr></thead><tbody className="divide-y divide-slate-100">{events.map(event => <tr key={event._id} className="align-top hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{dateTime(event.occurredAt)}</td><td className="px-4 py-3"><strong className="block text-slate-900">{event.actor?.email || 'Unauthenticated'}</strong><span className="text-xs text-slate-500">{event.request?.ip}</span></td><td className="px-4 py-3"><code className="rounded bg-slate-100 px-2 py-1 text-xs">{event.action}</code></td><td className="px-4 py-3"><span className="block font-medium text-slate-800">{event.resource}</span><span className="text-xs text-slate-400">{event.resourceId || '—'}</span></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${event.outcome?.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{event.outcome?.status} · {event.outcome?.statusCode}</span><span className="mt-1 block text-xs text-slate-400">{event.outcome?.durationMs} ms</span></td><td className="px-4 py-3"><span className="block text-xs text-slate-700">{event.request?.method} {event.request?.path}</span><code className="text-[10px] text-slate-400">{event.correlationId}</code></td></tr>)}</tbody></table></div>
      {!events.length && !loading && <p className="p-10 text-center text-sm text-slate-500">No audit events match these filters.</p>}{page.hasMore && <div className="border-t border-slate-100 p-4 text-center"><button disabled={loading} onClick={() => load(page.nextCursor, true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{loading ? 'Loading…' : 'Load more'}</button></div>}
    </section></div>;
}
