import React, { useEffect, useMemo, useState } from 'react';
import API from '../../utils/api';

function fmtDate(v) { return v ? new Date(v).toLocaleDateString() : 'Not set'; }
function money(v, c = 'LKR') { return `${c || 'LKR'} ${Number(v || 0).toLocaleString()}`; }
function daysLeft(v) { if (!v) return null; return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000); }

export default function Billing() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [payment, setPayment] = useState({ method: 'manual_bank', amount: '', reference: '', proofUrl: '', note: '' });
  const [toast, setToast] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await API.get('/admin/billing/status');
      setData(res.data);
      setPayment(prev => ({
        ...prev,
        amount: res.data.openInvoice?.total || res.data.plan?.monthlyPrice || res.data.plan?.price || '',
      }));
    } catch (err) {
      setToast({ type: 'error', text: err.response?.data?.message || err.message || 'Billing failed to load' });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const status = data?.subscription?.status || 'unknown';
  const dueDays = daysLeft(data?.subscription?.nextBillingAt || data?.openInvoice?.dueDate);
  const statusClass = useMemo(() => ({
    trialing: 'bg-blue-50 text-blue-700 border-blue-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    past_due: 'bg-orange-50 text-orange-700 border-orange-200',
    grace: 'bg-amber-50 text-amber-700 border-amber-200',
    suspended: 'bg-red-50 text-red-700 border-red-200',
    cancelled: 'bg-slate-50 text-slate-700 border-slate-200',
  }[status] || 'bg-slate-50 text-slate-700 border-slate-200'), [status]);

  async function uploadProof(file) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('proof', file);
      const res = await API.post('/admin/billing/proof-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPayment(p => ({ ...p, proofUrl: res.data.url }));
      setToast({ type: 'success', text: 'Payment proof uploaded successfully.' });
    } catch (err) {
      setToast({ type: 'error', text: err.response?.data?.message || err.message || 'Upload failed' });
    } finally { setUploading(false); }
  }

  async function submitPayment(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await API.post('/admin/billing/payments', { ...payment, invoiceId: data?.openInvoice?._id });
      setToast({ type: 'success', text: 'Payment proof submitted. Super Admin will review and approve/reject it.' });
      setPayment({ method: 'manual_bank', amount: '', reference: '', proofUrl: '', note: '' });
      await load();
    } catch (err) { setToast({ type: 'error', text: err.response?.data?.message || err.message || 'Could not submit payment' }); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 bg-white rounded-2xl border">Loading billing…</div>;
  if (!data) return <div className="p-6 bg-white rounded-2xl border text-red-600">Billing information unavailable.</div>;

  const features = data.plan?.features || {};
  const enabledFeatures = Object.keys(features).filter(k => features[k]);

  return (
    <div className="space-y-6">
      {toast && <div className={`p-4 rounded-xl border text-sm ${toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{toast.text}</div>}

      <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white p-6 md:p-8 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-200 font-black">Subscription Status</p>
            <h1 className="text-3xl md:text-4xl font-black mt-2">{data.plan?.name || 'No plan'}</h1>
            <p className="text-indigo-100 mt-2 max-w-2xl">{data.plan?.description || 'Your selected StoreKit SaaS plan and billing information.'}</p>
          </div>
          <span className={`px-4 py-2 rounded-full border text-xs font-black uppercase bg-white ${statusClass}`}>{status.replace('_', ' ')}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-7">
          <DarkInfo label="Cycle" value={data.subscription?.billingCycle || 'monthly'} />
          <DarkInfo label="Monthly" value={money(data.plan?.monthlyPrice || data.plan?.price, data.plan?.currency)} />
          <DarkInfo label="Yearly" value={money(data.plan?.yearlyPrice, data.plan?.currency)} />
          <DarkInfo label="Next billing" value={fmtDate(data.subscription?.nextBillingAt)} />
          <DarkInfo label="Days left" value={dueDays == null ? 'Not set' : `${dueDays} day(s)`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <InfoCard title="Trial Ends" value={fmtDate(data.subscription?.trialEndsAt)} sub={data.planDates?.daysUntilTrialEnd == null ? 'No active trial countdown' : `${data.planDates.daysUntilTrialEnd} day(s) remaining`} />
        <InfoCard title="Current Period Ends" value={fmtDate(data.subscription?.currentPeriodEnd)} sub="Plan access end date" />
        <InfoCard title="Grace Ends" value={fmtDate(data.subscription?.graceEndsAt)} sub={data.planDates?.daysUntilGraceEnd == null ? 'No grace period active' : `${data.planDates.daysUntilGraceEnd} day(s) remaining`} />
        <InfoCard title="Last Payment" value={fmtDate(data.subscription?.lastPaidAt)} sub={`Auto renew: ${data.subscription?.autoRenew ? 'enabled' : 'manual approval'}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={submitPayment} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
          <div>
            <h2 className="font-black text-slate-900 text-lg">Submit Payment for Review</h2>
            <p className="text-sm text-slate-500 mt-1">Upload bank slip / proof image or PDF. Super Admin can review, approve, or reject.</p>
          </div>
          <Field label="Amount" type="number" value={payment.amount} onChange={v => setPayment(p => ({ ...p, amount: v }))} required />
          <Field label="Reference / Bank Slip Number" value={payment.reference} onChange={v => setPayment(p => ({ ...p, reference: v }))} required />

          <div className="grid gap-2 text-xs font-semibold text-slate-600">
            <span>Payment Proof File</span>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl p-5 bg-slate-50 hover:bg-slate-100 cursor-pointer transition">
              <span className="text-2xl">📎</span>
              <span>{uploading ? 'Uploading…' : 'Click to upload payment proof'}</span>
              <span className="text-[11px] text-slate-400">JPG, PNG, WebP, GIF or PDF up to 8MB</span>
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={e => uploadProof(e.target.files?.[0])} disabled={uploading} />
            </label>
          </div>

          <Field label="Payment Proof URL" value={payment.proofUrl} onChange={v => setPayment(p => ({ ...p, proofUrl: v }))} placeholder="Auto-filled after upload or paste URL" />
          {payment.proofUrl && <a href={payment.proofUrl} target="_blank" rel="noreferrer" className="block text-xs text-indigo-600 font-bold hover:underline">Open uploaded proof</a>}
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">Note<textarea className="border rounded-xl p-3 text-sm" rows="3" value={payment.note} onChange={e => setPayment(p => ({ ...p, note: e.target.value }))}/></label>
          <button disabled={saving || uploading} className="w-full h-11 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-60">{saving ? 'Submitting…' : 'Submit Payment for Approval'}</button>
        </form>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-black text-slate-900 mb-4">Payment History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b"><th className="py-2">Date</th><th>Amount</th><th>Reference</th><th>Proof</th><th>Status</th></tr></thead>
              <tbody>{(data.payments || []).map(p => <tr key={p._id} className="border-b"><td className="py-3">{fmtDate(p.createdAt)}</td><td>{money(p.amount, p.currency)}</td><td>{p.reference || '-'}</td><td>{p.proofUrl ? <a className="text-indigo-600 font-bold" href={p.proofUrl} target="_blank" rel="noreferrer">Open</a> : '-'}</td><td><Badge status={p.status}/></td></tr>)}</tbody>
            </table>
            {(!data.payments || data.payments.length === 0) && <p className="text-center py-8 text-slate-400">No payments submitted yet.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-black text-slate-900 mb-4">Invoices</h2>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-400 border-b"><th className="py-2">Invoice</th><th>Period</th><th>Due</th><th>Total</th><th>Status</th></tr></thead><tbody>{(data.invoices || []).map(i => <tr key={i._id} className="border-b"><td className="py-3 font-semibold">{i.invoiceNumber}</td><td>{fmtDate(i.periodStart)} → {fmtDate(i.periodEnd)}</td><td>{fmtDate(i.dueDate)}</td><td>{money(i.total, i.currency)}</td><td><Badge status={i.status}/></td></tr>)}</tbody></table></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="font-black text-slate-900 mb-4">Allowed Plan Features</h2>
          <div className="flex flex-wrap gap-2">
            {enabledFeatures.map(k => <span key={k} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-bold">{k}</span>)}
            {enabledFeatures.length === 0 && <p className="text-sm text-slate-400">No enabled features found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function DarkInfo({ label, value }) { return <div className="rounded-2xl bg-white/10 border border-white/10 p-4"><p className="text-[11px] text-indigo-200 font-black uppercase tracking-wide">{label}</p><p className="text-sm font-black text-white mt-1 truncate">{value}</p></div>; }
function InfoCard({ title, value, sub }) { return <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"><p className="text-xs text-slate-400 font-black uppercase">{title}</p><p className="text-lg font-black text-slate-900 mt-2">{value}</p><p className="text-xs text-slate-500 mt-1">{sub}</p></div>; }
function Field({ label, value, onChange, type='text', placeholder='', required=false }) { return <label className="grid gap-1.5 text-xs font-semibold text-slate-600">{label}<input className="h-10 border rounded-xl px-3 text-sm" type={type} value={value || ''} placeholder={placeholder} onChange={e=>onChange(e.target.value)} required={required}/></label>; }
function Badge({ status }) { const cls = status === 'approved' || status === 'paid' || status === 'active' ? 'bg-emerald-50 text-emerald-700' : status === 'pending' || status === 'pending_review' || status === 'trialing' ? 'bg-amber-50 text-amber-700' : status === 'rejected' || status === 'failed' || status === 'overdue' || status === 'suspended' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'; return <span className={`px-2 py-1 rounded-full text-xs font-bold ${cls}`}>{String(status || 'unknown').replace('_',' ')}</span>; }
