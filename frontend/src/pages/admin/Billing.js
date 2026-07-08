import React, { useEffect, useMemo, useState } from 'react';
import API from '../../utils/api';

function fmtDate(v) { return v ? new Date(v).toLocaleDateString() : 'Not set'; }
function money(v, c = 'LKR') { return `${c} ${Number(v || 0).toLocaleString()}`; }
function daysLeft(v) { if (!v) return null; return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000); }

export default function Billing() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payment, setPayment] = useState({ method: 'manual_bank', amount: '', reference: '', proofUrl: '', note: '' });
  const [toast, setToast] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await API.get('/admin/billing/status');
      setData(res.data);
      setPayment(prev => ({ ...prev, amount: res.data.openInvoice?.total || res.data.plan?.monthlyPrice || res.data.plan?.price || '' }));
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

  async function submitPayment(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await API.post('/admin/billing/payments', { ...payment, invoiceId: data?.openInvoice?._id });
      setToast({ type: 'success', text: 'Payment proof submitted. Super Admin will review it.' });
      setPayment({ method: 'manual_bank', amount: '', reference: '', proofUrl: '', note: '' });
      await load();
    } catch (err) { setToast({ type: 'error', text: err.response?.data?.message || err.message || 'Could not submit payment' }); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 bg-white rounded-2xl border">Loading billing…</div>;
  if (!data) return <div className="p-6 bg-white rounded-2xl border text-red-600">Billing information unavailable.</div>;

  return (
    <div className="space-y-6">
      {toast && <div className={`p-4 rounded-xl border text-sm ${toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{toast.text}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current Plan</p>
              <h1 className="text-2xl font-extrabold text-slate-900">{data.plan?.name || 'No plan'}</h1>
              <p className="text-sm text-slate-500 mt-1">{data.plan?.description || 'Subscription details for this store.'}</p>
            </div>
            <span className={`px-3 py-1 rounded-full border text-xs font-bold uppercase ${statusClass}`}>{status.replace('_', ' ')}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Info label="Billing Cycle" value={data.subscription?.billingCycle || 'monthly'} />
            <Info label="Amount" value={money(data.openInvoice?.total || data.plan?.monthlyPrice || data.plan?.price, data.plan?.currency)} />
            <Info label="Trial Ends" value={fmtDate(data.subscription?.trialEndsAt)} />
            <Info label="Next Billing" value={fmtDate(data.subscription?.nextBillingAt)} />
            <Info label="Grace Ends" value={fmtDate(data.subscription?.graceEndsAt)} />
            <Info label="Days Remaining" value={dueDays == null ? 'Not set' : `${dueDays} day(s)`} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Open Invoice</p>
          <p className="text-xl font-extrabold text-slate-900 mt-2">{data.openInvoice?.invoiceNumber || 'None'}</p>
          <p className="text-sm text-slate-500 mt-2">Due: {fmtDate(data.openInvoice?.dueDate)}</p>
          <p className="text-2xl font-extrabold text-indigo-600 mt-4">{money(data.openInvoice?.total, data.openInvoice?.currency)}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Store Status</p>
          <p className="text-xl font-extrabold text-slate-900 mt-2">{data.tenant?.status}</p>
          <p className="text-sm text-slate-500 mt-2">Auto renew: {data.subscription?.autoRenew ? 'Enabled' : 'Manual approval'}</p>
          <button onClick={load} className="mt-5 w-full h-10 rounded-xl bg-slate-900 text-white text-sm font-bold">Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={submitPayment} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-slate-900">Submit Monthly Payment</h2>
          <Field label="Amount" type="number" value={payment.amount} onChange={v => setPayment(p => ({ ...p, amount: v }))} required />
          <Field label="Reference / Bank Slip Number" value={payment.reference} onChange={v => setPayment(p => ({ ...p, reference: v }))} required />
          <Field label="Payment Proof URL" value={payment.proofUrl} onChange={v => setPayment(p => ({ ...p, proofUrl: v }))} placeholder="Cloudinary / image URL" />
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">Note<textarea className="border rounded-xl p-3 text-sm" rows="3" value={payment.note} onChange={e => setPayment(p => ({ ...p, note: e.target.value }))}/></label>
          <button disabled={saving} className="w-full h-11 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-60">{saving ? 'Submitting…' : 'Submit Payment for Review'}</button>
        </form>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-900 mb-4">Payment History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b"><th className="py-2">Date</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead>
              <tbody>{(data.payments || []).map(p => <tr key={p._id} className="border-b"><td className="py-3">{fmtDate(p.createdAt)}</td><td>{money(p.amount, p.currency)}</td><td>{p.reference || '-'}</td><td><Badge status={p.status}/></td></tr>)}</tbody>
            </table>
            {(!data.payments || data.payments.length === 0) && <p className="text-center py-8 text-slate-400">No payments submitted yet.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-bold text-slate-900 mb-4">Invoices</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-400 border-b"><th className="py-2">Invoice</th><th>Period</th><th>Due</th><th>Total</th><th>Status</th></tr></thead><tbody>{(data.invoices || []).map(i => <tr key={i._id} className="border-b"><td className="py-3 font-semibold">{i.invoiceNumber}</td><td>{fmtDate(i.periodStart)} → {fmtDate(i.periodEnd)}</td><td>{fmtDate(i.dueDate)}</td><td>{money(i.total, i.currency)}</td><td><Badge status={i.status}/></td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}

function Info({ label, value }) { return <div className="p-4 rounded-xl bg-slate-50"><p className="text-xs text-slate-400 font-bold uppercase">{label}</p><p className="text-sm font-bold text-slate-900 mt-1">{value}</p></div>; }
function Field({ label, value, onChange, type='text', placeholder='', required=false }) { return <label className="grid gap-1.5 text-xs font-semibold text-slate-600">{label}<input className="h-10 border rounded-xl px-3 text-sm" type={type} value={value || ''} placeholder={placeholder} onChange={e=>onChange(e.target.value)} required={required}/></label>; }
function Badge({ status }) { const cls = status === 'approved' || status === 'paid' ? 'bg-emerald-50 text-emerald-700' : status === 'pending' || status === 'pending_review' ? 'bg-amber-50 text-amber-700' : status === 'rejected' || status === 'failed' || status === 'overdue' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'; return <span className={`px-2 py-1 rounded-full text-xs font-bold ${cls}`}>{String(status || 'unknown').replace('_',' ')}</span>; }
