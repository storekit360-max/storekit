import React, { useEffect, useMemo, useState } from 'react';
import API from '../../utils/api';

function formatDate(value) { return value ? new Date(value).toLocaleDateString() : 'Not set'; }
function statusColor(status) {
  return status === 'active' ? 'bg-emerald-100 text-emerald-700' : status === 'trial' ? 'bg-blue-100 text-blue-700' : status === 'grace' ? 'bg-amber-100 text-amber-700' : status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700';
}

export default function Billing() {
  const [data, setData] = useState(null);
  const [proofUrl, setProofUrl] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const res = await API.get('/admin/billing/status');
    setData(res.data);
    setProofUrl('');
  }
  useEffect(() => { load().catch(err => setMessage(err.response?.data?.message || err.message)); }, []);

  const activeDateLabel = useMemo(() => {
    const st = data?.subscription?.status;
    if (st === 'trial') return 'Trial ends';
    if (st === 'grace') return 'Grace ends';
    return 'Next billing';
  }, [data]);

  async function uploadProof(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    setUploading(true);
    try {
      const { data: upload } = await API.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setProofUrl(upload.url);
      setMessage('Payment proof uploaded. Submit it for review.');
    } catch (err) { setMessage(err.response?.data?.message || err.message); }
    finally { setUploading(false); }
  }

  async function submitProof(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await API.post('/admin/billing/payment-proof', { proofUrl, note, amount: data?.amount });
      setMessage('Payment proof submitted for Super Admin review.');
      setNote('');
      await load();
    } catch (err) { setMessage(err.response?.data?.message || err.message); }
    finally { setSaving(false); }
  }

  if (!data) return <div className="p-6 bg-white rounded-2xl border border-slate-200">Loading billing details…</div>;

  return (
    <div className="space-y-6">
      {message && <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-700">{message}</div>}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-900 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-indigo-200">Current subscription</p>
            <h1 className="text-3xl font-black mt-1">{data.plan?.name || 'No plan assigned'}</h1>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor(data.subscription?.status)}`}>{data.subscription?.status || 'not set'}</span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10">{data.billingCycle}</span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10">{data.currency} {Number(data.amount || 0).toLocaleString()}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-indigo-200">Days left</p>
            <p className="text-5xl font-black">{data.daysLeft ?? '-'}</p>
            <p className="text-xs text-indigo-200 mt-1">{activeDateLabel}: {formatDate(data.nextBillingAt || data.trialEndsAt || data.graceEndsAt)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Info label="Next billing" value={formatDate(data.nextBillingAt)} />
        <Info label="Trial ends" value={formatDate(data.trialEndsAt)} />
        <Info label="Grace ends" value={formatDate(data.graceEndsAt)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={submitProof} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h2 className="font-bold text-slate-900">Submit monthly payment proof</h2>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Upload payment proof
            <input type="file" accept="image/*,.pdf" onChange={e => uploadProof(e.target.files?.[0])} className="block w-full text-sm" />
            {uploading && <span className="text-xs text-blue-600">Uploading…</span>}
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Payment Proof URL
            <input className="h-10 border rounded-lg px-3 text-sm" value={proofUrl} onChange={e=>setProofUrl(e.target.value)} placeholder="Upload file or paste URL" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-600">
            Note
            <textarea className="border rounded-lg px-3 py-2 text-sm" rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Bank reference / month / notes" />
          </label>
          <button disabled={!proofUrl || saving} className="h-11 px-5 rounded-xl bg-indigo-600 disabled:opacity-50 text-white font-bold">{saving ? 'Submitting…' : 'Submit for Review'}</button>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-900 mb-4">Payment history</h2>
          <div className="space-y-3 max-h-[380px] overflow-auto">
            {(data.payments || []).map(p => <div key={p._id} className="p-3 rounded-xl border border-slate-100 flex justify-between gap-3"><div><p className="font-semibold text-sm">{p.currency} {Number(p.amount).toLocaleString()}</p><p className="text-xs text-slate-500">{formatDate(p.createdAt)}</p>{p.proofUrl && <a className="text-xs text-indigo-600" href={p.proofUrl} target="_blank" rel="noreferrer">View proof</a>}</div><span className={`h-fit px-2 py-1 rounded-full text-xs font-bold ${statusColor(p.status)}`}>{p.status}</span></div>)}
            {(!data.payments || data.payments.length === 0) && <p className="text-sm text-slate-400">No payments yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
function Info({ label, value }) { return <div className="bg-white rounded-2xl border border-slate-200 p-5"><p className="text-xs font-bold uppercase text-slate-400">{label}</p><p className="text-lg font-black text-slate-900 mt-1">{value}</p></div>; }
