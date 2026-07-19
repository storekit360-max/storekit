import React, { useCallback, useEffect, useState } from 'react';
import API from '../../utils/api';
import SuperAdminBillingCommercial from './SuperAdminBillingCommercial';

const STATUS_META = {
  trial:     { label: 'Trial',      color: '#2563eb', bg: '#eff6ff' },
  active:    { label: 'Active',     color: '#059669', bg: '#ecfdf5' },
  past_due:  { label: 'Past Due',   color: '#d97706', bg: '#fffbeb' },
  suspended: { label: 'Suspended',  color: '#dc2626', bg: '#fef2f2' },
  cancelled: { label: 'Cancelled',  color: '#6b7280', bg: '#f9fafb' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(amount, currency = 'LKR') {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.trial;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ color: meta.color, background: meta.bg }}>
      {meta.label}
    </span>
  );
}

export default function SuperAdminBilling({ notify }) {
  const [overview, setOverview] = useState(null);
  const [payments, setPayments] = useState([]);
  const [lifecycle, setLifecycle] = useState({ metrics: {}, invoices: [], refunds: [], attempts: [], dunningEvents: [] });
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const toast = useCallback(function toast(type, text) {
    if (notify) notify(type, text);
    else if (type === 'error') window.alert(text);
  }, [notify]);

  const loadAll = useCallback(async function loadAll() {
    setLoading(true);
    try {
      const [overviewRes, paymentsRes, lifecycleRes] = await Promise.all([
        API.get('/superadmin/billing/overview'),
        API.get('/superadmin/billing/payments', { params: filter ? { status: filter } : {} }),
        API.get('/superadmin/billing/lifecycle', { skipCache: true }),
      ]);
      setOverview(overviewRes.data);
      setPayments(paymentsRes.data);
      setLifecycle(lifecycleRes.data);
    } catch (err) {
      toast('error', err.response?.data?.message || 'Could not load billing data');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function approve(id) {
    setBusyId(id);
    try {
      await API.post(`/superadmin/billing/payments/${id}/approve`);
      toast('success', 'Payment approved — plan reactivated');
      loadAll();
    } catch (err) {
      toast('error', err.response?.data?.message || 'Could not approve payment');
    } finally { setBusyId(null); }
  }

  async function reject(id) {
    const reason = window.prompt('Reason for rejecting this payment (optional):') || '';
    setBusyId(id);
    try {
      await API.post(`/superadmin/billing/payments/${id}/reject`, { reason });
      toast('success', 'Payment rejected');
      loadAll();
    } catch (err) {
      toast('error', err.response?.data?.message || 'Could not reject payment');
    } finally { setBusyId(null); }
  }

  async function deactivateTenant(id) {
    const reason = window.prompt('Reason for deactivating this store:', 'Business stopped by tenant') || '';
    setBusyId(id);
    try {
      await API.post(`/superadmin/tenants/${id}/deactivate`, { reason });
      toast('success', 'Tenant manually deactivated');
      loadAll();
    } catch (err) {
      toast('error', err.response?.data?.message || 'Could not deactivate tenant');
    } finally { setBusyId(null); }
  }

  async function reactivateTenant(id) {
    setBusyId(id);
    try {
      await API.post(`/superadmin/tenants/${id}/reactivate`);
      toast('success', 'Tenant reactivated');
      loadAll();
    } catch (err) {
      toast('error', err.response?.data?.message || 'Could not reactivate tenant');
    } finally { setBusyId(null); }
  }

  async function refundPayment(payment) {
    const remaining = Number(payment.amount || 0) - Number(payment.refundedAmount || 0);
    const raw = window.prompt(`Refund amount (maximum ${fmtMoney(remaining, payment.currency)}). Manual refunds remain pending until you confirm the external transfer:`, remaining.toFixed(2));
    if (raw === null) return;
    const note = window.prompt('Refund note or external transfer reference:') || '';
    setBusyId(payment._id);
    try {
      await API.post('/superadmin/billing/refunds', { paymentId: payment._id, amount: Number(raw), reason: 'requested_by_customer', note }, { headers: { 'Idempotency-Key': `${payment._id}-${Date.now()}` } });
      toast('success', payment.provider === 'stripe' ? 'Stripe refund submitted' : 'Manual refund recorded; confirm it after transferring funds');
      await loadAll();
    } catch (err) { toast('error', err.response?.data?.message || 'Could not create refund'); }
    finally { setBusyId(null); }
  }

  async function confirmRefund(refund) {
    if (!window.confirm(`Confirm that ${fmtMoney(refund.amount, refund.currency)} was returned outside StoreKit?`)) return;
    setBusyId(refund._id);
    try { await API.post(`/superadmin/billing/refunds/${refund._id}/confirm-manual`); toast('success', 'Manual refund confirmed'); await loadAll(); }
    catch (err) { toast('error', err.response?.data?.message || 'Could not confirm refund'); }
    finally { setBusyId(null); }
  }

  async function configureStripe(tenant) {
    const customerId = window.prompt('Stripe customer ID (cus_…):', tenant.billing?.stripeCustomerId || ''); if (customerId === null) return;
    const subscriptionId = window.prompt('Stripe subscription ID (sub_…, optional):', tenant.billing?.stripeSubscriptionId || ''); if (subscriptionId === null) return;
    setBusyId(tenant._id);
    try { await API.put(`/superadmin/billing/stripe/tenants/${tenant._id}`, { customerId, subscriptionId }); toast('success', 'Stripe mapping saved'); await loadAll(); }
    catch (err) { toast('error', err.response?.data?.message || 'Could not configure Stripe mapping'); }
    finally { setBusyId(null); }
  }

  async function syncStripe(tenant) {
    setBusyId(tenant._id);
    try { const { data } = await API.post(`/superadmin/billing/stripe/tenants/${tenant._id}/sync`); toast('success', `Stripe synchronized: ${data.invoicesImported} invoices`); await loadAll(); }
    catch (err) { toast('error', err.response?.data?.message || 'Could not synchronize Stripe'); }
    finally { setBusyId(null); }
  }

  async function openBillingPortal(tenant) {
    setBusyId(tenant._id);
    try { const { data } = await API.post(`/superadmin/billing/stripe/tenants/${tenant._id}/portal`); window.open(data.url, '_blank', 'noopener,noreferrer'); toast('success', 'Secure Stripe billing portal opened'); }
    catch (err) { toast('error', err.response?.data?.message || 'Could not open Stripe billing portal'); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-6">
      {/* ── Income / pending stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500 mb-2">Total Income (approved)</div>
          <div className="text-2xl font-extrabold text-emerald-600">
            {overview ? fmtMoney(overview.totalIncome.total) : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-1">{overview?.totalIncome.count || 0} payments</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500 mb-2">Pending Payments</div>
          <div className="text-2xl font-extrabold text-amber-600">
            {overview ? fmtMoney(overview.pendingPayments.total) : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-1">{overview?.pendingPayments.count || 0} awaiting review</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500 mb-2">Active Tenants</div>
          <div className="text-2xl font-extrabold text-indigo-600">{overview?.tenantStatus?.active || 0}</div>
          <div className="text-xs text-slate-400 mt-1">MRR {fmtMoney(overview?.recurring?.monthly || 0)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500 mb-2">Trial / Past Due / Suspended</div>
          <div className="text-sm font-semibold text-slate-700">
            {overview?.tenantsByStatus?.trial || 0} trial · {overview?.tenantsByStatus?.past_due || 0} past due · {overview?.tenantStatus?.suspended || 0} suspended
          </div>
          <div className="text-xs text-slate-400 mt-1">Yearly active {fmtMoney(overview?.recurring?.yearly || 0)}</div>
        </div>
      </div>

      {/* ── Full tenant billing monitor ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Tenant Billing Monitor</h2>
        {!overview || !overview.tenants || overview.tenants.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No tenants found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Store</th>
                  <th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3">Subscription</th>
                  <th className="py-2 pr-3">Next Payment</th>
                  <th className="py-2 pr-3">Trial / Grace</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.tenants.map(t => (
                  <tr key={t._id}>
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-800">{t.storeName}</div>
                      <div className="text-xs text-slate-400">{t.owner?.email || t.slug}</div>
                    </td>
                    <td className="py-3 pr-3 text-slate-600">
                      <div>{t.plan?.name || '-'}</div>
                      <div className="text-xs text-slate-400">{fmtMoney(t.plan?.price, t.plan?.currency)} / {t.billing?.billingCycle || t.plan?.billingCycle}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge status={t.billing?.subscriptionStatus || 'active'} />
                      <div className="text-xs text-slate-400 mt-1">Store {t.status}</div>
                    </td>
                    <td className="py-3 pr-3 text-slate-600">
                      <div className="font-semibold">{fmtMoney(t.billing?.nextPaymentAmount, t.plan?.currency)}</div>
                      <div className="text-xs text-slate-400">Due {fmtDate(t.billing?.nextPaymentDate)}</div>
                    </td>
                    <td className="py-3 pr-3 text-slate-600">
                      <div>Trial {fmtDate(t.billing?.trialEndsAt)}</div>
                      <div className="text-xs text-slate-400">Grace {fmtDate(t.billing?.gracePeriodEndsAt)}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-2">{t.status === 'suspended' || t.billing?.subscriptionStatus === 'cancelled' ? (
                        <button disabled={busyId === t._id} onClick={() => reactivateTenant(t._id)} className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold">
                          Reactivate
                        </button>
                      ) : (
                        <button disabled={busyId === t._id} onClick={() => deactivateTenant(t._id)} className="h-8 px-3 rounded-lg bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 text-xs font-semibold">
                          Deactivate
                        </button>
                      )}<button disabled={busyId === t._id} onClick={() => configureStripe(t)} className="h-8 rounded-lg border px-2 text-xs font-semibold text-slate-600">Stripe ID</button>{t.billing?.stripeCustomerId && <><button disabled={busyId === t._id} onClick={() => syncStripe(t)} className="h-8 rounded-lg bg-violet-50 px-2 text-xs font-semibold text-violet-700">Sync</button><button disabled={busyId === t._id} onClick={() => openBillingPortal(t)} className="h-8 rounded-lg bg-blue-50 px-2 text-xs font-semibold text-blue-700">Portal</button></>}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Upcoming payments ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Upcoming Payments (next 7 days)</h2>
        {!overview || overview.upcomingPayments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Nothing due in the next 7 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Store</th>
                  <th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3">Amount Due</th>
                  <th className="py-2 pr-3">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.upcomingPayments.map(t => (
                  <tr key={t._id}>
                    <td className="py-3 pr-3 font-semibold text-slate-800">{t.storeName}</td>
                    <td className="py-3 pr-3 text-slate-600">{t.plan?.name || '-'}</td>
                    <td className="py-3 pr-3 text-slate-600">{fmtMoney(t.billing?.nextPaymentAmount, t.plan?.currency)}</td>
                    <td className="py-3 pr-3 text-slate-600">{fmtDate(t.billing?.nextPaymentDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Payment approvals ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Payments</h2>
          <select
            className="h-9 border border-slate-300 rounded-lg px-3 text-xs"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No payments found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Store</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Method / Ref</th>
                  <th className="py-2 pr-3">Proof</th>
                  <th className="py-2 pr-3">Submitted</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map(p => (
                  <tr key={p._id}>
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-800">{p.tenant?.storeName || '-'}</div>
                      {p.tenant?.billing?.subscriptionStatus && (
                        <div className="mt-0.5"><StatusBadge status={p.tenant.billing.subscriptionStatus} /></div>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-semibold text-slate-800">{fmtMoney(p.amount, p.currency)}</td>
                    <td className="py-3 pr-3 text-slate-600">
                      <div className="capitalize">{(p.method || '').replace('_', ' ')}</div>
                      <div className="text-xs text-slate-400">{p.reference}</div>
                    </td>
                    <td className="py-3 pr-3">
                      {p.proofUrl ? (
                        <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 font-semibold text-xs whitespace-nowrap">
                          Open file
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-slate-600">{fmtDate(p.submittedAt || p.createdAt)}</td>
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
                    </td>
                    <td className="py-3 pr-3">
                      {p.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <button
                            disabled={busyId === p._id}
                            onClick={() => approve(p._id)}
                            className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Approve
                          </button>
                          <button
                            disabled={busyId === p._id}
                            onClick={() => reject(p._id)}
                            className="h-8 px-3 rounded-lg bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 text-xs font-semibold"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2"><span className="text-xs text-slate-400">
                          {p.reviewedBy ? `by ${p.reviewedBy.firstName || ''} ${p.reviewedBy.lastName || ''}`.trim() : '-'}
                        </span>{['approved', 'partially_refunded'].includes(p.status) && Number(p.refundedAmount || 0) < Number(p.amount) && <button disabled={busyId === p._id} onClick={() => refundPayment(p)} className="rounded bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">Refund</button>}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-900">Invoice ledger</h2><p className="mt-1 text-xs text-slate-500">Invoices are linked to approved subscription payments and retained independently.</p></div><div className="max-h-96 divide-y overflow-auto">{lifecycle.invoices.map(invoice => <div key={invoice._id} className="flex items-center justify-between gap-4 p-4 text-sm"><div><strong className="block text-slate-900">{invoice.invoiceNumber}</strong><span className="text-xs text-slate-500">{invoice.tenantId?.storeName || 'Deleted tenant'} · {fmtDate(invoice.createdAt)}</span></div><div className="text-right"><strong>{fmtMoney(invoice.amount, invoice.currency)}</strong><span className="block text-xs capitalize text-slate-500">{invoice.status.replace('_', ' ')}</span></div></div>)}</div>{!lifecycle.invoices.length && <p className="p-8 text-center text-sm text-slate-400">No subscription invoices yet.</p>}</section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-900">Refund ledger</h2><p className="mt-1 text-xs text-slate-500">Stripe refunds are provider-confirmed; manual transfers require explicit confirmation.</p></div><div className="max-h-96 divide-y overflow-auto">{lifecycle.refunds.map(refund => <div key={refund._id} className="flex items-center justify-between gap-4 p-4 text-sm"><div><strong className="block">{refund.tenantId?.storeName || 'Deleted tenant'}</strong><span className="text-xs text-slate-500">{refund.provider} · {fmtDate(refund.createdAt)} · {refund.note || 'No note'}</span></div><div className="text-right"><strong>{fmtMoney(refund.amount, refund.currency)}</strong>{refund.provider === 'manual' && refund.status === 'pending' ? <button disabled={busyId === refund._id} onClick={() => confirmRefund(refund)} className="mt-1 block rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Confirm transfer</button> : <span className="block text-xs capitalize text-slate-500">{refund.status}</span>}</div></div>)}</div>{!lifecycle.refunds.length && <p className="p-8 text-center text-sm text-slate-400">No refunds recorded.</p>}</section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-900">Payment attempts</h2><p className="mt-1 text-xs text-slate-500">Every approval attempt records its own success or failure without changing historical entries.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Tenant</th><th className="p-3">Provider</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Time</th><th className="p-3">Failure</th></tr></thead><tbody className="divide-y">{lifecycle.attempts.map(attempt => <tr key={attempt._id}><td className="p-3 font-semibold">{attempt.tenantId?.storeName || 'Deleted tenant'}</td><td className="p-3 capitalize">{attempt.provider}</td><td className="p-3">{fmtMoney(attempt.amount, attempt.currency)}</td><td className="p-3 capitalize">{attempt.status.replace('_', ' ')}</td><td className="p-3 text-xs text-slate-500">{fmtDate(attempt.occurredAt)}</td><td className="p-3 text-xs text-red-600">{attempt.failureMessage || '—'}</td></tr>)}</tbody></table></div>{!lifecycle.attempts.length && <p className="p-8 text-center text-sm text-slate-400">No payment attempts recorded.</p>}</section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-900">Dunning timeline</h2><p className="mt-1 text-xs text-slate-500">Due dates, grace starts, retries, recovery, and automatic suspension are durable events.</p></div><div className="divide-y">{lifecycle.dunningEvents.map(event => <div key={event._id} className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_180px_120px]"><div><strong>{event.tenantId?.storeName || 'Deleted tenant'}</strong><p className="text-xs text-slate-500">{event.message}</p></div><span className="text-xs text-slate-500">{fmtDate(event.occurredAt)}<br />Deadline {fmtDate(event.scheduledFor)}</span><span className="self-start rounded bg-amber-50 px-2 py-1 text-center text-xs font-bold capitalize text-amber-700">{event.event.replace('_', ' ')}</span></div>)}</div>{!lifecycle.dunningEvents.length && <p className="p-8 text-center text-sm text-slate-400">No dunning events recorded.</p>}</section>
      <SuperAdminBillingCommercial notify={toast} tenants={overview?.tenants || []} />
    </div>
  );
}
