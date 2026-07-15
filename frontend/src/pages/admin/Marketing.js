import React, { useEffect, useState } from 'react';
import API from '../../utils/api';

export default function Marketing() {
  const [data,setData]=useState(null);const [error,setError]=useState('');
  useEffect(()=>{API.get('/marketing/admin/analytics').then(r=>setData(r.data)).catch(e=>setError(e?.response?.data?.message||'Could not load marketing analytics'));},[]);
  if(error)return <div className="p-5 bg-red-50 text-red-700 rounded-2xl">{error}</div>;
  if(!data)return <div className="py-16 text-center text-gray-400">Loading behavior analytics…</div>;
  const cards=[['Total events',data.total],['Last 24 hours',data.last24],['Tracked customers',data.trackedCustomers],['Marketing consent',data.consentedCustomers]];
  return <div className="space-y-5">
    <div><h1 className="font-display text-xl font-bold text-gray-900">Customer Behavior</h1><p className="text-sm text-gray-500">Consent-based storefront activity for this store only.</p></div>
    {data.diagnostic&&<div className={`p-4 rounded-xl border text-sm ${data.enabled?'bg-blue-50 border-blue-200 text-blue-800':'bg-amber-50 border-amber-200 text-amber-800'}`}>{data.diagnostic}</div>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{cards.map(([label,value])=><div key={label} className="bg-white border border-gray-100 rounded-2xl p-5"><p className="text-xs text-gray-500">{label}</p><p className="text-2xl font-bold text-gray-900 mt-1">{value||0}</p></div>)}</div>
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="bg-white border border-gray-100 rounded-2xl p-5"><h2 className="font-semibold mb-4">Events by type</h2>{data.byType.length?data.byType.map(row=><div className="flex justify-between py-2 border-b border-gray-50" key={row.type}><span className="text-sm capitalize">{row.type.replace(/_/g,' ')}</span><strong>{row.count}</strong></div>):<p className="text-sm text-gray-400">No events</p>}</div>
      <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl overflow-hidden"><div className="p-5 border-b"><h2 className="font-semibold">Recent behavior</h2><p className="text-xs text-gray-400">Names only; contact details are not exposed here.</p></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Event</th><th>Customer</th><th>Product</th><th>Device / source</th><th>Time</th></tr></thead><tbody>{data.recent.map(row=><tr key={row._id}><td className="capitalize">{row.eventType.replace(/_/g,' ')}</td><td>{row.customer}</td><td>{row.product||'—'}</td><td><span className="text-xs">{row.device||'Unknown'}<br/>{row.source||'storefront'}</span></td><td className="text-xs whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody></table>{!data.recent.length&&<p className="p-8 text-center text-gray-400">No recent consented activity.</p>}</div></div>
    </div>
  </div>;
}
