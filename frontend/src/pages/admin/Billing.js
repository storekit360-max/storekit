import React, { useEffect, useState } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const STATUS_META = {
  trial:      { label: 'Free Trial',        color: '#2563eb', bg: '#eff6ff' },
  active:     { label: 'Active',            color: '#059669', bg: '#ecfdf5' },
  past_due:   { label: 'Payment Due',       color: '#d97706', bg: '#fffbeb' },
  suspended:  { label: 'Suspended',         color: '#dc2626', bg: '#fef2f2' },
  cancelled:  { label: 'Cancelled',         color: '#6b7280', bg: '#f9fafb' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(amount, currency = 'LKR') {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [plan, setPlan] = useState(null);
  const [billing, setBilling] = useState(null);
  const [payments, setPayments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ method: 'bank_transfer', reference: '', amount: '', note: '' });
  const [proofFile, setProofFile] = useState(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [statusRes, paymentsRes] = await Promise.all([
        API.get('/billing/status'),
        API.get('/billing/payments'),
      ]);
      setTenant(statusRes.data.tenant);
      setPlan(statusRes.data.plan);
      setBilling(statusRes.data.billing);
      setPayments(paymentsRes.data || []);
      setForm(f => ({ ...f, amount: statusRes.data.billing?.nextPaymentAmount || '' }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load billing information');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function submitPayment(e) {
    e.preventDefault();
    if (!form.reference.trim()) return toast.error('Please enter a payment reference / slip number');
    if (!proofFile) return toast.error('Please upload the payment slip/proof file');
    setSubmitting(true);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value ?? ''));
      payload.append('proof', proofFile);
      await API.post('/billing/payments', payload);
      toast.success('Payment submitted — awaiting super admin approval');
      setForm(f => ({ ...f, reference: '', note: '' }));
      setProofFile(null);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit payment');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-400">Loading billing information…</div>;
  }
  if (!tenant || !plan) {
    return <div className="p-6 text-sm text-slate-400">No billing information available.</div>;
  }

  const status = billing?.subscriptionStatus || 'trial';
  const meta = STATUS_META[status] || STATUS_META.trial;
  const currency = plan.currency || 'LKR';
  const isFree = Number(plan.price || 0) === 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Billing & Subscription</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your plan and payments.</p>
      </div>

      {tenant.status === 'suspended' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Your store is currently <strong>suspended</strong>. Submit a payment below and your store will be
          reactivated once the super admin approves it.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500 mb-2">Current Plan</div>
          <div className="text-lg font-extrabold text-slate-900">{plan.name}</div>
          <div className="text-sm text-slate-500 mt-1">
            {isFree ? 'Free' : `${fmtMoney(plan.price, currency)} / ${billing?.billingCycle || plan.billingCycle}`}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500 mb-2">Subscription Status</div>
          <span
            className="inline-block px-3 py-1 rounded-full text-xs font-bold"
            style={{ color: meta.color, background: meta.bg }}
          >
            {meta.label}
          </span>
          {status === 'trial' && (
            <div className="text-sm text-slate-500 mt-2">Trial ends {fmtDate(billing.trialEndsAt)}</div>
          )}
          {status === 'past_due' && (
            <div className="text-sm text-amber-600 mt-2">Grace period ends {fmtDate(billing.gracePeriodEndsAt)}</div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500 mb-2">Next Payment</div>
          {isFree ? (
            <div className="text-sm text-slate-500">No payment required</div>
          ) : (
            <>
              <div className="text-lg font-extrabold text-slate-900">{fmtMoney(billing?.nextPaymentAmount, currency)}</div>
              <div className="text-sm text-slate-500 mt-1">Due {fmtDate(billing?.nextPaymentDate)}</div>
            </>
          )}
        </div>
      </div>

      {!isFree && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Submit a Payment</h2>
          <form onSubmit={submitPayment} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              Payment Method
              <select
                className="h-10 border border-slate-300 rounded-lg px-3 text-sm"
                value={form.method}
                onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="payhere">PayHere</option>
                <option value="cash">Cash / In Person</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
              Amount Paid ({currency})
              <input
                type="number" step="0.01" min="0"
                className="h-10 border border-slate-300 rounded-lg px-3 text-sm"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600 sm:col-span-2">
              Payment Reference / Slip Number
              <input
                className="h-10 border border-slate-300 rounded-lg px-3 text-sm"
                placeholder="e.g. bank slip no. or transaction ID"
                value={form.reference}
                onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600 sm:col-span-2">
              Upload Payment Slip / Proof
              <input
                type="file"
                accept="image/*,application/pdf"
                className="h-10 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                onChange={e => setProofFile(e.target.files?.[0] || null)}
              />
              {proofFile && <span className="text-xs text-slate-400">{proofFile.name}</span>}
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600 sm:col-span-2">
              Note (optional)
              <textarea
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                rows={2}
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                disabled={submitting}
                className="h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Payment History</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No payments submitted yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Submitted</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Proof</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map(p => (
                  <tr key={p._id}>
                    <td className="py-3 pr-3 text-slate-600">{fmtDate(p.submittedAt || p.createdAt)}</td>
                    <td className="py-3 pr-3 font-semibold text-slate-800">{fmtMoney(p.amount, p.currency)}</td>
                    <td className="py-3 pr-3 text-slate-600 capitalize">{(p.method || '').replace('_', ' ')}</td>
                    <td className="py-3 pr-3 text-slate-600">{p.reference || '-'}</td>
                    <td className="py-3 pr-3">
                      {p.proofUrl ? (
                        <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 font-semibold text-xs">
                          Open file
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{
                          color: p.status === 'approved' ? '#059669' : p.status === 'rejected' ? '#dc2626' : '#d97706',
                          background: p.status === 'approved' ? '#ecfdf5' : p.status === 'rejected' ? '#fef2f2' : '#fffbeb',
                        }}
                      >
                        {p.status}
                      </span>
                      {p.status === 'rejected' && p.rejectionReason && (
                        <div className="text-xs text-red-500 mt-1">{p.rejectionReason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
