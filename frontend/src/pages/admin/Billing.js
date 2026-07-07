import React, { useEffect, useMemo, useState } from 'react';
import API from '../../utils/api';

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString();
}
function fmtMoney(v, c = 'LKR') {
  return `${c} ${Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
}
function statusClass(status) {
  if (['active', 'paid', 'succeeded'].includes(status)) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (['trialing'].includes(status)) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (['grace', 'pending', 'issued'].includes(status)) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

export default function AdminBilling() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ invoiceId: '', amount: '', method: 'bank_transfer', transactionId: '', notes: '' });

  async function loadBilling() {
    setLoading(true);
    try {
      const res = await API.get('/admin/billing/status');
      setData(res.data);
      const open = res.data.invoices?.find(i => ['issued', 'overdue'].includes(i.status));
      if (open) setPaymentForm(prev => ({ ...prev, invoiceId: open._id, amount: open.total }));
    } catch (err) {
      setMessage(err.response?.data?.message || err.message || 'Failed to load billing details');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBilling(); }, []);

  const openInvoice = useMemo(() => data?.invoices?.find(i => ['issued', 'overdue'].includes(i.status)), [data]);
  const sub = data?.subscription || {};
  const plan = data?.plan || {};

  async function submitPaymentRequest(e) {
    e.preventDefault();
    setRequesting(true);
    setMessage('');
    try {
      const payload = { ...paymentForm, amount: Number(paymentForm.amount || openInvoice?.total || 0) };
      const res = await API.post('/admin/billing/payment-request', payload);
      setMessage(res.data?.message || 'Payment request submitted');
      await loadBilling();
    } catch (err) {
      setMessage(err.response?.data?.message || err.message || 'Could not submit payment request');
    } finally {
      setRequesting(false);
    }
  }

  if (loading) return <div className="p-6">Loading billing status...</div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-sm text-white/60">Store Subscription</p>
            <h1 className="text-2xl md:text-3xl font-bold">{plan.name || 'Current Plan'}</h1>
            <p className="text-white/70 mt-1">Billing cycle: {sub.billingCycle || plan.billingCycle || 'monthly'}</p>
          </div>
          <div className={`inline-flex px-4 py-2 rounded-full border text-sm font-semibold ${statusClass(sub.status)}`}>
            {String(sub.status || 'active').toUpperCase()}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-6">
          <div className="bg-white/10 rounded-2xl p-4"><p className="text-white/60 text-xs">Period Start</p><p className="font-semibold">{fmtDate(sub.currentPeriodStart)}</p></div>
          <div className="bg-white/10 rounded-2xl p-4"><p className="text-white/60 text-xs">Period End</p><p className="font-semibold">{fmtDate(sub.currentPeriodEnd)}</p></div>
          <div className="bg-white/10 rounded-2xl p-4"><p className="text-white/60 text-xs">Trial End</p><p className="font-semibold">{fmtDate(sub.trialEnd)}</p></div>
          <div className="bg-white/10 rounded-2xl p-4"><p className="text-white/60 text-xs">Grace Until</p><p className="font-semibold">{fmtDate(sub.graceUntil)}</p></div>
        </div>
      </div>

      {message && <div className="rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 p-4">{message}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-lg">Invoices</h2>
            {openInvoice && <span className="text-sm text-amber-600 font-semibold">Open invoice: {fmtMoney(openInvoice.total, openInvoice.currency)}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-3">Invoice</th><th className="text-left p-3">Due</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Status</th></tr></thead>
              <tbody>
                {(data?.invoices || []).map(inv => (
                  <tr key={inv._id} className="border-t border-slate-100">
                    <td className="p-3 font-semibold">{inv.invoiceNumber}</td>
                    <td className="p-3">{fmtDate(inv.dueDate)}</td>
                    <td className="p-3">{fmtMoney(inv.total, inv.currency)}</td>
                    <td className="p-3"><span className={`px-2 py-1 rounded-full border text-xs ${statusClass(inv.status)}`}>{inv.status}</span></td>
                  </tr>
                ))}
                {!data?.invoices?.length && <tr><td className="p-4 text-slate-500" colSpan="4">No invoices yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <form onSubmit={submitPaymentRequest} className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 space-y-4">
          <h2 className="font-bold text-lg">Submit Payment</h2>
          <p className="text-sm text-slate-500">Submit bank transfer / manual payment details. Super Admin will verify and activate next period.</p>
          <input className="w-full rounded-xl border border-slate-200 p-3" placeholder="Invoice ID" value={paymentForm.invoiceId} onChange={e=>setPaymentForm({...paymentForm, invoiceId:e.target.value})}/>
          <input className="w-full rounded-xl border border-slate-200 p-3" placeholder="Amount" type="number" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm, amount:e.target.value})}/>
          <select className="w-full rounded-xl border border-slate-200 p-3" value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm, method:e.target.value})}>
            <option value="bank_transfer">Bank Transfer</option><option value="cash">Cash</option><option value="manual_request">Other Manual Payment</option>
          </select>
          <input className="w-full rounded-xl border border-slate-200 p-3" placeholder="Transaction / slip reference" value={paymentForm.transactionId} onChange={e=>setPaymentForm({...paymentForm, transactionId:e.target.value})}/>
          <textarea className="w-full rounded-xl border border-slate-200 p-3" rows="3" placeholder="Notes" value={paymentForm.notes} onChange={e=>setPaymentForm({...paymentForm, notes:e.target.value})}/>
          <button disabled={requesting} className="w-full rounded-xl bg-slate-900 text-white font-semibold py-3 disabled:opacity-60">{requesting ? 'Submitting...' : 'Submit Payment Request'}</button>
        </form>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100"><h2 className="font-bold text-lg">Payment History</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-3">Date</th><th className="text-left p-3">Method</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Status</th><th className="text-left p-3">Ref</th></tr></thead>
            <tbody>
              {(data?.payments || []).map(p => <tr key={p._id} className="border-t border-slate-100"><td className="p-3">{fmtDate(p.paidAt || p.createdAt)}</td><td className="p-3">{p.method}</td><td className="p-3">{fmtMoney(p.amount, p.currency)}</td><td className="p-3"><span className={`px-2 py-1 rounded-full border text-xs ${statusClass(p.status)}`}>{p.status}</span></td><td className="p-3">{p.transactionId || '—'}</td></tr>)}
              {!data?.payments?.length && <tr><td className="p-4 text-slate-500" colSpan="5">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
