import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  pending:  'status-pending',
  approved: 'status-confirmed',
  rejected: 'status-cancelled',
  received: 'status-processing',
  refunded: 'badge-new',
};

const CONDITION_LABELS = {
  restockable:   { label: 'Restockable',   emoji: '✅', color: 'text-green-600 bg-green-50 border-green-200',  note: 'Stock will be added back' },
  refurbishable: { label: 'Refurbishable', emoji: '🔧', color: 'text-amber-600 bg-amber-50 border-amber-200',  note: 'No stock change (will be refurbished)' },
  damaged:       { label: 'Damaged',       emoji: '🗑️', color: 'text-red-500   bg-red-50   border-red-200',    note: 'No stock change (written off)' },
};

function ConditionBadge({ condition }) {
  if (!condition) return <span className="text-xs text-gray-400 italic">Not set</span>;
  const c = CONDITION_LABELS[condition];
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${c.color}`}>
      {c.emoji} {c.label}
    </span>
  );
}

export default function AdminReturns() {
  const [returns,      setReturns]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState({
    status:        '',
    adminNote:     '',
    refundAmount:  '',
    courierCharge: '',
    refundMethod:  'original',
    itemConditions: {}, // { [itemIndex]: 'restockable' | 'refurbishable' | 'damaged' }
  });
  const [saving, setSaving] = useState(false);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get(`/returns/admin/all?status=${statusFilter}`);
      setReturns(data.returns);
    } catch {
      toast.error('Failed to load returns');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  const openDetail = async (ret) => {
    try {
      const { data } = await API.get(`/returns/admin/${ret._id}`);
      setSelected(data);

      // Pre-fill itemConditions from saved data
      const savedConditions = {};
      (data.items || []).forEach((item, i) => {
        if (item.itemConditionOnReturn) savedConditions[i] = item.itemConditionOnReturn;
      });

      setForm({
        status:         data.status,
        adminNote:      data.adminNote     || '',
        refundAmount:   data.refundAmount  || '',
        courierCharge:  data.courierCharge || '',
        refundMethod:   data.refundMethod  || 'original',
        itemConditions: savedConditions,
      });
    } catch {
      toast.error('Failed to load return details');
    }
  };

  const handleUpdate = async () => {
    // Require item conditions when marking as received or refunded
    if (form.status === 'received' || form.status === 'refunded') {
      const allSet = selected.items.every((_, i) => form.itemConditions[i]);
      if (!allSet) {
        toast.error('Please mark the condition of every item before proceeding.');
        return;
      }
    }
    if (form.status === 'refunded' && !form.refundAmount) {
      toast.error('Please enter the refund amount.');
      return;
    }

    setSaving(true);
    try {
      await API.put(`/returns/admin/${selected._id}`, {
        status:         form.status,
        adminNote:      form.adminNote,
        refundAmount:   form.refundAmount,
        courierCharge:  form.courierCharge || 0,
        refundMethod:   form.refundMethod,
        itemConditions: form.itemConditions,
      });
      toast.success('Return updated!');
      setSelected(null);
      fetchReturns();
    } catch {
      toast.error('Update failed');
    } finally {
      setSaving(false);
    }
  };

  // Computed: net refund for display
  const grossRefund  = parseFloat(form.refundAmount)  || 0;
  const courierFee   = parseFloat(form.courierCharge) || 0;
  const netRefund    = Math.max(0, grossRefund - courierFee);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">Returns &amp; Refunds</h2>
          <p className="text-sm text-gray-500">Manage customer return requests — stock adjusts automatically on refund</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        <div className="flex gap-2 flex-wrap">
          {['all','pending','approved','rejected','received','refunded'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all border ${
                statusFilter === s
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Returns table — overflow-x-auto enables horizontal scroll on small screens */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : returns.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-5xl mb-3">📦</div>
            <p className="text-gray-400">No return requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[860px] w-full">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Reason</th>
                  <th>Items</th>
                  <th>Refund</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.map(ret => (
                  <tr key={ret._id}>
                    <td>
                      <span className="font-mono text-xs text-primary">#{ret._id.slice(-6).toUpperCase()}</span>
                    </td>
                    <td>
                      <div>
                        <p className="text-sm font-medium">{ret.customer?.firstName} {ret.customer?.lastName}</p>
                        <p className="text-xs text-gray-400">{ret.customerEmail}</p>
                      </div>
                    </td>
                    <td>
                      <div>
                        <Link
                          to={`/admin/orders/${ret.order?._id}`}
                          className="font-mono text-xs text-primary hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          {ret.order?.orderNumber}
                        </Link>
                        {ret.order?.orderStatus && (
                          <p className="text-xs text-gray-400 mt-0.5 capitalize">{ret.order.orderStatus}</p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-gray-600 line-clamp-1 max-w-[140px]">{ret.reason}</span>
                    </td>
                    <td>
                      <span className="text-sm text-gray-600">{ret.items?.length} item(s)</span>
                    </td>
                    <td>
                      {ret.netRefundAmount != null ? (
                        <div>
                          <p className="text-sm font-semibold text-green-600">Rs. {ret.netRefundAmount.toLocaleString()}</p>
                          {ret.courierCharge > 0 && (
                            <p className="text-xs text-gray-400">−Rs. {ret.courierCharge.toLocaleString()} courier</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[ret.status]} capitalize text-xs`}>{ret.status}</span>
                    </td>
                    <td>
                      <span className="text-xs text-gray-400">{new Date(ret.createdAt).toLocaleDateString()}</span>
                    </td>
                    <td>
                      <button onClick={() => openDetail(ret)} className="text-xs text-primary hover:underline font-medium">
                        Review →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detail Modal ─────────────────────────────────────────────────────── */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-display font-bold text-xl text-gray-900">Return Request</h2>
              <button
                onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Customer + Order info */}
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Customer</p>
                  <p className="font-semibold">{selected.customer?.firstName} {selected.customer?.lastName}</p>
                  <p className="text-gray-500">{selected.customer?.email}</p>
                  {selected.customer?.phone && <p className="text-gray-400 text-xs">{selected.customer.phone}</p>}
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Linked Order</p>
                  <Link
                    to={`/admin/orders/${selected.order?._id}`}
                    className="font-mono font-bold text-primary hover:underline block"
                    onClick={() => setSelected(null)}
                  >
                    {selected.order?.orderNumber} ↗
                  </Link>
                  <p className="text-gray-500">Rs. {selected.order?.total?.toLocaleString()}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`badge text-xs capitalize ${STATUS_COLORS[selected.order?.orderStatus] || ''}`}>
                      {selected.order?.orderStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Reason</p>
                <p className="text-sm font-medium text-gray-800">{selected.reason}</p>
                {selected.description && <p className="text-sm text-gray-500 mt-1">{selected.description}</p>}
              </div>

              {/* Return Images */}
              {selected.images?.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Customer Images</p>
                  <div className="flex gap-2 flex-wrap">
                    {selected.images.map((img, i) => (
                      <a key={i} href={img} target="_blank" rel="noreferrer">
                        <img src={img} alt="return" className="w-16 h-16 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Return Items with Condition Marking ───────────────────── */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Return Items — Mark Condition on Receipt</p>
                <div className="space-y-3">
                  {selected.items?.map((item, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                          <p className="text-xs text-gray-400">Qty: {item.quantity} · Customer condition: <span className="capitalize">{item.condition}</span></p>
                          {item.price > 0 && <p className="text-xs text-gray-500">Unit price: Rs. {item.price?.toLocaleString()}</p>}
                        </div>
                        <ConditionBadge condition={form.itemConditions[i] || item.itemConditionOnReturn} />
                      </div>

                      {/* Condition selector */}
                      <div>
                        <p className="text-xs text-gray-500 mb-2 font-medium">Set inventory condition:</p>
                        <div className="grid grid-cols-3 gap-2">
                          {Object.entries(CONDITION_LABELS).map(([key, meta]) => (
                            <button
                              key={key}
                              onClick={() => setForm(p => ({
                                ...p,
                                itemConditions: { ...p.itemConditions, [i]: key }
                              }))}
                              className={`text-xs px-2 py-2 rounded-lg border-2 font-semibold transition-all text-left ${
                                (form.itemConditions[i] || item.itemConditionOnReturn) === key
                                  ? `${meta.color} border-current`
                                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              <span className="block text-base mb-0.5">{meta.emoji}</span>
                              {meta.label}
                              <span className="block text-[10px] font-normal opacity-70 mt-0.5">{meta.note}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Stock adjustment legend */}
                <div className="mt-2 text-xs text-gray-400 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                  💡 Stock adjustments run automatically when status is set to <strong>Refunded</strong>.
                  Only <strong>Restockable</strong> items return to inventory. Damaged &amp; Refurbishable items are not restocked.
                </div>
              </div>

              {/* ── Update Panel ─────────────────────────────────────────── */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <h3 className="font-semibold text-gray-800">Update Return</h3>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Status</label>
                    <select
                      value={form.status}
                      onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                      className="form-input"
                    >
                      {['pending','approved','rejected','received','refunded'].map(s => (
                        <option key={s} value={s} className="capitalize">{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Refund Method</label>
                    <select
                      value={form.refundMethod}
                      onChange={e => setForm(p => ({ ...p, refundMethod: e.target.value }))}
                      className="form-input"
                    >
                      <option value="original">Original Payment Method</option>
                      <option value="store_credit">Store Credit</option>
                      <option value="gift_card">Gift Card</option>
                    </select>
                  </div>
                </div>

                {/* Refund financials */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Gross Refund Amount (Rs.)</label>
                    <input
                      type="number"
                      value={form.refundAmount}
                      onChange={e => setForm(p => ({ ...p, refundAmount: e.target.value }))}
                      className="form-input"
                      placeholder={`Max: ${selected.order?.total?.toLocaleString()}`}
                    />
                    <p className="text-xs text-gray-400 mt-0.5">Order total: Rs. {selected.order?.total?.toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="form-label">Return Courier Charge Deduction (Rs.)</label>
                    <input
                      type="number"
                      value={form.courierCharge}
                      onChange={e => setForm(p => ({ ...p, courierCharge: e.target.value }))}
                      className="form-input"
                      placeholder="0 (optional)"
                    />
                    <p className="text-xs text-gray-400 mt-0.5">Deducted from refund if customer shipped the item</p>
                  </div>
                </div>

                {/* Net refund preview */}
                {form.refundAmount && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="text-xs text-green-600 font-medium mb-2">Refund Breakdown</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Gross refund</span>
                        <span className="font-semibold">Rs. {grossRefund.toLocaleString()}</span>
                      </div>
                      {courierFee > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>Courier deduction</span>
                          <span>− Rs. {courierFee.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-green-200 pt-1 mt-1">
                        <span className="font-bold text-green-700">Net refund to customer</span>
                        <span className="font-bold text-green-700 text-base">Rs. {netRefund.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="form-label">Admin Note (visible to customer)</label>
                  <textarea
                    value={form.adminNote}
                    onChange={e => setForm(p => ({ ...p, adminNote: e.target.value }))}
                    rows={3}
                    className="form-input resize-none"
                    placeholder="Explain the decision..."
                  />
                </div>

                {/* Warning for refund: order will be marked refunded */}
                {form.status === 'refunded' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    ⚠️ Setting status to <strong>Refunded</strong> will automatically:
                    <ul className="mt-1 ml-3 list-disc space-y-0.5">
                      <li>Mark the linked order as <strong>Refunded</strong></li>
                      <li>Add returned stock back for <strong>Restockable</strong> items</li>
                      <li>Exclude this order from revenue calculations in the dashboard</li>
                    </ul>
                  </div>
                )}

                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className="btn-primary w-full"
                >
                  {saving ? 'Saving...' : 'Update Return Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}