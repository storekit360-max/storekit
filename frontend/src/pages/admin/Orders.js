import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import API from '../../utils/api';
import toast from 'react-hot-toast';
import PrintBill from '../../components/PrintBill';
import PrintWaybill from '../../components/PrintWaybill';

const STATUS_COLORS = {
  pending: 'status-pending', confirmed: 'status-confirmed', processing: 'status-processing',
  shipped: 'status-shipped', out_for_delivery: 'status-out_for_delivery',
  delivered: 'status-delivered', cancelled: 'status-cancelled', refunded: 'status-refunded'
};
const PAYMENT_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700'
};
const ALL_STATUSES = ['all','pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled'];
const PRIORITY_BADGE = {
  high: <span className="text-xs font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">HIGH</span>,
  urgent: <span className="text-xs font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded animate-pulse">URGENT</span>,
};

// ── SLA countdown helper ──────────────────────────────────────────────────────
function SlaCell({ order }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!order.slaDeadline) return;
    const tick = () => {
      const diff = new Date(order.slaDeadline) - Date.now();
      if (diff <= 0) {
        setLabel('⚠️ SLA breached');
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        setLabel(h > 0 ? `${h}h ${m}m left` : `${m}m left`);
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [order.slaDeadline]);

  if (!order.slaDeadline) return null;
  const breached = order.slaBreached || new Date(order.slaDeadline) < Date.now();
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${breached ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-600'}`}>
      {label}
    </span>
  );
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [showSlaOnly, setShowSlaOnly] = useState(false);
  const [showStuckOnly, setShowStuckOnly] = useState(false);
  const [showPendingPayment, setShowPendingPayment] = useState(false);
  const [stats, setStats] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await API.get('/orders/admin/followup/stats');
      setStats(data);
    } catch {}
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter, search, page, limit: 20,
      });
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (showFlaggedOnly) params.set('followUpFlag', 'true');
      if (showSlaOnly) params.set('slaBreached', 'true');
      if (showStuckOnly) params.set('stuck', 'true');
      if (showPendingPayment) params.set('pendingPayment', 'true');

      const { data } = await API.get(`/orders/admin/all?${params}`);
      setOrders(data.orders);
      setTotalPages(data.pages);
      setTotal(data.total);
    } catch {} finally { setLoading(false); }
  }, [statusFilter, search, page, priorityFilter, showFlaggedOnly, showSlaOnly, showStuckOnly, showPendingPayment]);

  useEffect(() => { fetchOrders(); fetchStats(); }, [fetchOrders, fetchStats]);

  const quickStatus = async (orderId, status) => {
    try {
      await API.put(`/orders/admin/${orderId}/status`, { status });
      toast.success(`Order marked as ${status}`);
      fetchOrders(); fetchStats();
    } catch { toast.error('Update failed'); }
  };

  const toggleFollowUp = async (order) => {
    try {
      await API.put(`/orders/admin/${order._id}/followup`, { followUpFlag: !order.followUpFlag });
      toast.success(order.followUpFlag ? 'Follow-up removed' : '🔔 Order flagged for follow-up');
      fetchOrders(); fetchStats();
    } catch { toast.error('Failed'); }
  };

  const setPriority = async (orderId, priority) => {
    try {
      await API.put(`/orders/admin/${orderId}/followup`, { priority });
      toast.success(`Priority set to ${priority}`);
      fetchOrders();
    } catch { toast.error('Failed'); }
  };

  // Quick-filter toggle handler
  const toggleQuickFilter = (filter) => {
    setShowFlaggedOnly(false); setShowSlaOnly(false);
    setShowStuckOnly(false); setShowPendingPayment(false);
    setPage(1);
    if (filter === 'flagged') setShowFlaggedOnly(true);
    if (filter === 'sla') setShowSlaOnly(true);
    if (filter === 'stuck') setShowStuckOnly(true);
    if (filter === 'payment') setShowPendingPayment(true);
  };

  const activeQuickFilter = showFlaggedOnly ? 'flagged' : showSlaOnly ? 'sla' : showStuckOnly ? 'stuck' : showPendingPayment ? 'payment' : null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Orders</h2>
          <p className="text-sm text-gray-500">{total} total orders</p>
        </div>
      </div>

      {/* ── Alert dashboard ─────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {[
            { key: 'flagged', label: '🔔 Flagged', value: stats.flagged, color: 'blue' },
            { key: 'payment', label: '🏦 Pending Payment', value: stats.pendingPayment, color: 'yellow' },
            { key: 'sla', label: '⚠️ SLA Breached', value: stats.slaBreached, color: 'red' },
            { key: 'stuck', label: '🔴 Stuck Orders', value: stats.stuckOrders, color: 'orange' },
            { key: 'urgent', label: '🚨 Urgent', value: stats.urgent, color: 'red' },
          ].map(card => (
            <button
              key={card.key}
              onClick={() => card.key !== 'urgent' ? toggleQuickFilter(card.key) : (setPriorityFilter('urgent'), setPage(1))}
              className={`rounded-xl border p-3 text-left transition-all hover:shadow-md ${
                activeQuickFilter === card.key || (card.key === 'urgent' && priorityFilter === 'urgent')
                  ? `bg-${card.color}-100 border-${card.color}-400 shadow-sm`
                  : 'bg-white border-gray-100'
              }`}
            >
              <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              <p className={`text-2xl font-bold ${card.value > 0 ? `text-${card.color}-600` : 'text-gray-300'}`}>
                {card.value}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 space-y-3">
        <div className="flex gap-3 flex-wrap">
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by order number, email, name…"
            className="form-input text-sm flex-1 min-w-[200px]"
          />
          <select
            value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}
            className="form-input text-sm w-36"
          >
            <option value="all">All Priority</option>
            <option value="urgent">🚨 Urgent</option>
            <option value="high">🔶 High</option>
            <option value="normal">Normal</option>
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          {ALL_STATUSES.map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all border ${statusFilter === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'}`}>
              {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
            </button>
          ))}
          {activeQuickFilter && (
            <button onClick={() => { setShowFlaggedOnly(false); setShowSlaOnly(false); setShowStuckOnly(false); setShowPendingPayment(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-primary text-primary bg-primary/5 flex items-center gap-1">
              ✕ Clear filter
            </button>
          )}
        </div>
      </div>

      {/* ── Orders Table ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-gray-500">No orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>SLA</th>
                  <th>Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const isStuck = !!order.stuckSince;
                  const isSlaBreached = order.slaBreached;
                  const pendingSlip = order.paymentMethod === 'bank_transfer' && order.paymentStatus === 'pending';

                  return (
                    <tr key={order._id}
                      className={`transition-colors ${
                        order.priority === 'urgent' ? 'bg-red-50/40' :
                        order.priority === 'high'   ? 'bg-orange-50/40' :
                        order.followUpFlag         ? 'bg-blue-50/30' :
                        !order.isRead             ? 'bg-blue-50/20' : ''
                      }`}
                    >
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {!order.isRead && <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />}
                          {order.followUpFlag && <span title="Flagged for follow-up" className="text-blue-500 text-xs">🔔</span>}
                          {isSlaBreached && <span title="SLA breached" className="text-red-500 text-xs">⚠️</span>}
                          {isStuck && !isSlaBreached && <span title="Order stuck" className="text-orange-500 text-xs">🔴</span>}
                          {pendingSlip && <span title="Awaiting payment slip" className="text-amber-500 text-xs">🏦</span>}
                          <Link to={`/admin/orders/${order._id}`} className="font-mono text-sm font-semibold text-primary hover:underline">
                            {order.orderNumber}
                          </Link>
                        </div>
                        {PRIORITY_BADGE[order.priority]}
                      </td>
                      <td>
                        <p className="text-sm font-medium text-gray-800">{order.billing?.firstName} {order.billing?.lastName}</p>
                        <p className="text-xs text-gray-400">{order.billing?.email}</p>
                      </td>
                      <td><span className="text-sm text-gray-600">{order.items?.length} item{order.items?.length !== 1 ? 's' : ''}</span></td>
                      <td><span className="text-sm font-bold text-gray-900">Rs. {order.total?.toLocaleString()}</span></td>
                      <td>
                        <div className="space-y-1">
                          <span className={`badge ${PAYMENT_COLORS[order.paymentStatus] || ''} text-xs capitalize`}>{order.paymentStatus}</span>
                          <p className="text-xs text-gray-400">{order.paymentMethod === 'bank_transfer' ? 'Bank' : 'COD'}</p>
                        </div>
                      </td>
                      <td><span className={`badge ${STATUS_COLORS[order.orderStatus] || ''} capitalize text-xs`}>{order.orderStatus?.replace(/_/g,' ')}</span></td>
                      <td><SlaCell order={order} /></td>
                      <td><span className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</span></td>
                      <td>
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {/* Follow-up flag toggle */}
                          <button
                            onClick={() => toggleFollowUp(order)}
                            title={order.followUpFlag ? 'Remove follow-up flag' : 'Flag for follow-up'}
                            className={`p-1.5 rounded-lg transition-colors text-sm ${order.followUpFlag ? 'text-blue-600 bg-blue-50' : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50'}`}
                          >🔔</button>

                          {/* Priority selector */}
                          <select
                            value={order.priority || 'normal'}
                            onChange={e => setPriority(order._id, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 font-medium"
                            title="Set priority"
                          >
                            <option value="normal">—</option>
                            <option value="high">🔶 High</option>
                            <option value="urgent">🚨 Urgent</option>
                          </select>

                          {/* View button */}
                          <Link to={`/admin/orders/${order._id}`} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </Link>

                          {/* Print Bill */}
                          <PrintBill order={order} />

                          {/* Print Waybill */}
                          <PrintWaybill order={order} />

                          {order.orderStatus === 'pending' && (
                            <button onClick={() => quickStatus(order._id, 'confirmed')} className="text-xs text-green-600 hover:bg-green-50 px-2 py-1 rounded-lg transition-colors font-medium">Confirm</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-gray-100">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-sm font-medium ${page === p ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{p}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}