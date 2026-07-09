import React, { useCallback, useEffect, useState } from 'react';
import API from '../../utils/api';

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
      const [overviewRes, paymentsRes] = await Promise.all([
        API.get('/superadmin/billing/overview'),
        API.get('/superadmin/billing/payments', { params: filter ? { status: filter } : {} }),
      ]);
      setOverview(overviewRes.data);
      setPayments(paymentsRes.data);
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
          <div className="text-2xl font-extrabold text-indigo-600">{overview?.tenantsByStatus?.active || 0}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-xs font-semibold text-slate-500 mb-2">Trial / Past Due / Suspended</div>
          <div className="text-sm font-semibold text-slate-700">
            {overview?.tenantsByStatus?.trial || 0} trial · {overview?.tenantsByStatus?.past_due || 0} past due · {overview?.tenantsByStatus?.suspended || 0} suspended
          </div>
        </div>
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
                        <span className="text-xs text-slate-400">
                          {p.reviewedBy ? `by ${p.reviewedBy.firstName || ''} ${p.reviewedBy.lastName || ''}`.trim() : '-'}
                        </span>
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
