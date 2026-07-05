import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import API from '../../utils/api';
import toast from 'react-hot-toast';
import PrintBill from '../../components/PrintBill';
import PrintWaybill from '../../components/PrintWaybill';

const STATUSES = ['pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled','refunded'];
const STATUS_LABELS = { pending:'Pending', confirmed:'Confirmed', processing:'Processing', shipped:'Shipped', out_for_delivery:'Out for Delivery', delivered:'Delivered', cancelled:'Cancelled', refunded:'Refunded' };
const STATUS_COLORS = { pending:'status-pending', confirmed:'status-confirmed', processing:'status-processing', shipped:'status-shipped', out_for_delivery:'status-out_for_delivery', delivered:'status-delivered', cancelled:'status-cancelled', refunded:'status-refunded' };

export default function AdminOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusUpdate, setStatusUpdate] = useState({ status: '', note: '', trackingNumber: '', deliveryPartner: '' });
  const [saving, setSaving] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  // ── Follow-up & Notes state ──
  const [newNote, setNewNote]         = useState('');
  const [addingNote, setAddingNote]   = useState(false);
  const [followUpNote, setFollowUpNote] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);

  useEffect(() => {
    API.get(`/orders/${id}`).then(r => {
      setOrder(r.data);
      setStatusUpdate(p => ({ ...p, status: r.data.orderStatus }));
      setPaymentStatus(r.data.paymentStatus);
      API.put(`/orders/admin/${id}/read`, {}).catch(() => {});
    }).finally(() => setLoading(false));
  }, [id]);

  const handleStatusUpdate = async () => {
    if (!statusUpdate.status) return;
    setSaving(true);
    try {
      const { data } = await API.put(`/orders/admin/${id}/status`, statusUpdate);
      setOrder(data);
      toast.success('Order status updated!');
    } catch { toast.error('Update failed'); }
    finally { setSaving(false); }
  };

  const handleCancelDecision = async (decision) => {
    try {
      const { data } = await API.put(`/orders/admin/${id}/cancel-decision`, { decision });
      setOrder(data);
      toast.success(decision === 'approved' ? '🚫 Order cancelled & customer notified' : '✅ Cancellation rejected & customer notified');
    } catch { toast.error('Action failed'); }
  };

  const handleFollowUpSave = async () => {
    try {
      const { data } = await API.put(`/orders/admin/${id}/followup`, {
        followUpFlag: !order.followUpFlag || !!followUpNote,
        followUpNote,
        priority: order.priority,
      });
      setOrder(data);
      setShowFollowUp(false);
      setFollowUpNote('');
      toast.success(data.followUpFlag ? '🔔 Flagged for follow-up' : 'Follow-up removed');
    } catch { toast.error('Failed'); }
  };

  const handlePriority = async (priority) => {
    try {
      const { data } = await API.put(`/orders/admin/${id}/followup`, { priority });
      setOrder(data);
      toast.success(`Priority set to ${priority}`);
    } catch { toast.error('Failed'); }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const { data } = await API.post(`/orders/admin/${id}/notes`, { note: newNote });
      setOrder(data);
      setNewNote('');
      toast.success('Note added');
    } catch { toast.error('Failed to add note'); } finally { setAddingNote(false); }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      const { data } = await API.delete(`/orders/admin/${id}/notes/${noteId}`);
      setOrder(data);
    } catch { toast.error('Failed'); }
  };

  if (loading) return <div className="text-center py-20 text-gray-400">Loading order...</div>;
  if (!order) return <div className="text-center py-20">Order not found. <Link to="/admin/orders" className="text-primary hover:underline">Back to orders</Link></div>;

  const stepIndex = STATUSES.indexOf(order.orderStatus);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button onClick={() => navigate('/admin/orders')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold text-gray-900">Order {order.orderNumber}</h1>
          <p className="text-sm text-gray-400">{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <span className={`badge ${STATUS_COLORS[order.orderStatus]} capitalize text-sm px-3 py-1`}>{STATUS_LABELS[order.orderStatus]}</span>
        {/* ── Print Actions ── */}
        <div className="flex items-center gap-2">
          <PrintBill order={order} />
          <PrintWaybill order={order} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left */}
        <div className="lg:col-span-2 space-y-5">
          {/* Progress */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Order Progress</h2>
            <div className="relative flex justify-between overflow-x-auto pb-2">
              <div className="absolute top-3.5 left-0 right-0 h-0.5 bg-gray-200">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, (stepIndex / (STATUSES.length - 3))) * 100}%` }} />
              </div>
              {STATUSES.slice(0, -2).map((s, i) => (
                <div key={s} className="flex flex-col items-center gap-1.5 z-10 min-w-[60px]">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i <= stepIndex ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs text-center leading-tight ${i <= stepIndex ? 'text-primary font-medium' : 'text-gray-400'}`}>{STATUS_LABELS[s]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Order Items</h2>
            <div className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <img src={item.image || 'https://via.placeholder.com/50'} alt={item.name} className="w-12 h-12 rounded-lg object-cover bg-white" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-500">Rs. {item.price?.toLocaleString()} × {item.quantity}</p>
                  </div>
                  <p className="font-bold text-gray-800 text-sm">Rs. {item.subtotal?.toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 mt-4 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>Rs. {order.subtotal?.toLocaleString()}</span></div>
              {order.couponDiscount > 0 && <div className="flex justify-between text-green-600"><span>🏷️ Coupon Discount ({order.couponCode})</span><span>−Rs. {order.couponDiscount?.toLocaleString()}</span></div>}
              <div className="flex justify-between text-gray-600"><span>Shipping</span><span>Rs. {order.shippingCost?.toLocaleString()}</span></div>
              {(order.giftCardDeduction > 0 || order.giftCardDiscount > 0) && (
                <div className="flex justify-between text-purple-600">
                  <span>🎁 Gift Card Payment {order.giftCard ? `(${order.giftCard})` : ''}</span>
                  <span>−Rs. {(order.giftCardDeduction || order.giftCardDiscount)?.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t border-gray-100">
                <span>Total</span><span>Rs. {order.total?.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Update Status */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Update Order</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="form-label">Order Status</label>
                <select value={statusUpdate.status} onChange={e => setStatusUpdate(p => ({...p, status: e.target.value}))} className="form-input">
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Note</label>
                <input value={statusUpdate.note} onChange={e => setStatusUpdate(p => ({...p, note: e.target.value}))} className="form-input" placeholder="Optional note..." />
              </div>
              <div>
                <label className="form-label">Tracking Number</label>
                <input value={statusUpdate.trackingNumber} onChange={e => setStatusUpdate(p => ({...p, trackingNumber: e.target.value}))} className="form-input font-mono" placeholder="e.g. TRK123456" />
              </div>
              <div>
                <label className="form-label">Delivery Partner</label>
                <input value={statusUpdate.deliveryPartner} onChange={e => setStatusUpdate(p => ({...p, deliveryPartner: e.target.value}))} className="form-input" placeholder="e.g. DHL, FedEx" />
              </div>
            </div>
            <button onClick={handleStatusUpdate} disabled={saving} className="btn-primary">{saving ? 'Updating...' : 'Update Status'}</button>
          </div>

          {/* Status History */}
          {order.statusHistory?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Status History</h2>
              <div className="space-y-3">
                {[...order.statusHistory].reverse().map((h, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800 capitalize">{h.status?.replace(/_/g, ' ')}</p>
                      {h.note && <p className="text-xs text-gray-600">{h.note}</p>}
                      <p className="text-xs text-gray-400">{new Date(h.updatedAt).toLocaleString()} by {h.updatedBy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Follow-up & Priority Panel ─────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-semibold text-gray-900">🔔 Follow-up & Priority</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Priority selector */}
                <select
                  value={order.priority || 'normal'}
                  onChange={e => handlePriority(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 font-medium"
                >
                  <option value="normal">Normal</option>
                  <option value="high">🔶 High Priority</option>
                  <option value="urgent">🚨 Urgent</option>
                </select>
                {/* Follow-up toggle */}
                <button
                  onClick={() => order.followUpFlag
                    ? API.put(`/orders/admin/${id}/followup`, { followUpFlag: false }).then(r => setOrder(r.data))
                    : setShowFollowUp(v => !v)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${order.followUpFlag ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600'}`}
                >
                  {order.followUpFlag ? '🔔 Flagged' : '+ Flag for Follow-up'}
                </button>
              </div>
            </div>

            {/* SLA info */}
            {order.slaDeadline && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-3 text-sm ${order.slaBreached ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-blue-50 border border-blue-100 text-blue-700'}`}>
                <span>{order.slaBreached ? '⚠️ SLA BREACHED' : '⏱ SLA Deadline'}:</span>
                <span className="font-semibold font-mono">{new Date(order.slaDeadline).toLocaleString()}</span>
              </div>
            )}
            {order.stuckSince && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3 text-sm bg-orange-50 border border-orange-200 text-orange-700">
                🔴 <span>Order stuck since <strong>{new Date(order.stuckSince).toLocaleString()}</strong> — no admin action recorded</span>
              </div>
            )}

            {/* Follow-up note input */}
            {showFollowUp && (
              <div className="space-y-2 mb-3">
                <textarea
                  value={followUpNote}
                  onChange={e => setFollowUpNote(e.target.value)}
                  rows={2}
                  className="form-input resize-none text-sm"
                  placeholder="Why is this flagged? (optional)"
                />
                <div className="flex gap-2">
                  <button onClick={handleFollowUpSave} className="btn-primary text-sm py-1.5 px-4">Save Flag</button>
                  <button onClick={() => setShowFollowUp(false)} className="text-sm text-gray-400 hover:text-gray-600 px-3">Cancel</button>
                </div>
              </div>
            )}

            {order.followUpNote && (
              <p className="text-sm text-gray-600 italic bg-blue-50 rounded-xl px-3 py-2">
                📌 {order.followUpNote}
              </p>
            )}
          </div>

          {/* ── Internal Admin Notes ───────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">📝 Internal Admin Notes</h2>
            <p className="text-xs text-gray-400 mb-3">These notes are private — customers cannot see them.</p>

            {/* Existing notes */}
            {order.adminNotes?.length > 0 ? (
              <div className="space-y-2 mb-4">
                {[...order.adminNotes].reverse().map((n) => (
                  <div key={n._id} className="flex gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                    <div className="flex-1">
                      <p className="text-sm text-gray-800">{n.note}</p>
                      <p className="text-xs text-gray-400 mt-1">{n.addedBy} · {new Date(n.addedAt).toLocaleString()}</p>
                    </div>
                    <button onClick={() => handleDeleteNote(n._id)} className="text-xs text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic mb-4">No internal notes yet.</p>
            )}

            {/* Add note */}
            <div className="flex gap-2">
              <input
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddNote()}
                className="form-input text-sm flex-1"
                placeholder="Add an internal note… (Enter to save)"
              />
              <button
                onClick={handleAddNote}
                disabled={addingNote || !newNote.trim()}
                className="btn-primary text-sm py-2 px-4 disabled:opacity-50"
              >
                {addingNote ? '…' : 'Add'}
              </button>
            </div>
          </div>

          {/* Cancel Request Panel */}
          {order.cancelRequest?.requested && (
            <div className={`bg-white rounded-2xl border-2 p-5 ${
              order.cancelRequest.status === 'pending' ? 'border-red-300' :
              order.cancelRequest.status === 'approved' ? 'border-red-200' : 'border-gray-200'}`}>
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                🚫 Cancellation Request
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  order.cancelRequest.status === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
                  order.cancelRequest.status === 'approved' ? 'bg-red-100 text-red-600' :
                                                               'bg-gray-100 text-gray-500'}`}>
                  {order.cancelRequest.status}
                </span>
              </h2>
              <div className="space-y-2 text-sm mb-4">
                <p className="text-gray-500">Requested: <span className="text-gray-800">{new Date(order.cancelRequest.requestedAt).toLocaleString()}</span></p>
                {order.cancelRequest.reason && <p className="text-gray-500">Reason: <span className="text-gray-800">{order.cancelRequest.reason}</span></p>}
                {order.cancelRequest.resolvedBy && <p className="text-gray-500">Resolved by: <span className="text-gray-800">{order.cancelRequest.resolvedBy}</span></p>}
              </div>
              {order.cancelRequest.status === 'pending' && (
                <div className="flex gap-3">
                  <button onClick={() => handleCancelDecision('approved')}
                    className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors">
                    ✅ Approve Cancellation
                  </button>
                  <button onClick={() => handleCancelDecision('rejected')}
                    className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                    ❌ Reject Request
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right */}
        <div className="space-y-5">
          {/* Customer */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Customer</h2>
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-gray-800">{order.billing?.firstName} {order.billing?.lastName}</p>
              <p className="text-gray-500">📧 {order.billing?.email}</p>
              <p className="text-gray-500">📞 {order.billing?.phone}</p>
              {order.customer && <Link to={`/admin/customers`} className="text-xs text-primary hover:underline">View customer profile →</Link>}
            </div>
          </div>

          {/* Billing */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Billing Address</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <p>{order.billing?.street}</p>
              <p>{order.billing?.city}</p>
              <p>{order.billing?.country}</p>
            </div>
          </div>

          {/* Shipping */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Shipping Address</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <p>{order.shipping?.firstName} {order.shipping?.lastName}</p>
              <p>{order.shipping?.street}</p>
              <p>{order.shipping?.city}</p>
              <p>{order.shipping?.country}</p>
              {order.shipping?.phone && <p>📞 {order.shipping.phone}</p>}
            </div>
          </div>

          {/* Payment */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Payment</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Method</span><span className="font-medium capitalize">{order.paymentMethod?.replace('_',' ')}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Status</span>
                {/* FIX: was calling /admin/:id/status (order status endpoint) which never
                    saved paymentStatus. Now calls the dedicated /payment-status endpoint. */}
                <select value={paymentStatus} onChange={async (e) => {
                  const newStatus = e.target.value;
                  setPaymentStatus(newStatus);
                  try {
                    await API.put(`/orders/admin/${id}/payment-status`, { paymentStatus: newStatus });
                    setOrder(prev => prev ? { ...prev, paymentStatus: newStatus } : prev);
                    toast.success('Payment status updated');
                  } catch { toast.error('Failed to update payment status'); }
                }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 font-medium capitalize">
                  {['pending','paid','failed','refunded'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {order.trackingNumber && <div className="flex justify-between"><span className="text-gray-500">Tracking</span><span className="font-mono text-xs">{order.trackingNumber}</span></div>}
              {order.deliveryPartner && <div className="flex justify-between"><span className="text-gray-500">Courier</span><span>{order.deliveryPartner}</span></div>}
            </div>

            {/* Payment Slip Section */}
            {order.paymentMethod === 'bank_transfer' && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-700 mb-3">📎 Payment Slip</p>
                {order.paymentSlip ? (
                  <div className="space-y-3">
                    {order.paymentSlipUploadedAt && (
                      <p className="text-xs text-gray-400">Uploaded {new Date(order.paymentSlipUploadedAt).toLocaleString()}</p>
                    )}
                    {(() => {
                      // Build absolute URL: works both locally and in production
                      const apiBase = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:5001`;
                      const slipUrl = order.paymentSlip.startsWith('http') ? order.paymentSlip : `${apiBase}${order.paymentSlip}`;
                      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(order.paymentSlip);
                      const isPdf = /\.pdf$/i.test(order.paymentSlip);
                      return (
                        <div>
                          {/* Toolbar: Open + Download */}
                          <div className="flex items-center justify-end gap-2 mb-2">
                            <a href={slipUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                              Open
                            </a>
                            <a href={slipUrl} download
                              className="inline-flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-2.5 py-1 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                              Download
                            </a>
                          </div>
                          {/* Preview */}
                          {isImage ? (
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                              <img
                                src={slipUrl}
                                alt="Payment slip"
                                className="w-full object-contain max-h-64"
                                onError={e => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                              <div style={{ display: 'none' }}
                                className="p-5 flex-col items-center justify-center text-center gap-2">
                                <p className="text-xs text-gray-400">Image could not load — use Open or Download above</p>
                              </div>
                            </div>
                          ) : isPdf ? (
                            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                              <iframe
                                src={`https://docs.google.com/viewer?url=${encodeURIComponent(slipUrl)}&embedded=true`}
                                title="Payment Slip PDF"
                                className="w-full"
                                style={{ height: '500px', border: 'none' }}
                              />
                              <div className="px-3 py-2 bg-white border-t border-gray-100 flex items-center gap-2">
                                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
                                <span className="text-xs text-gray-400">If PDF doesn't load above, use Open or Download buttons</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
                              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                              <span className="text-sm text-gray-600">Use Open or Download buttons to view this file</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {order.paymentStatus !== 'paid' && (
                      <button
                        onClick={async () => {
                          try {
                            const { data } = await API.put(`/orders/admin/${id}/confirm-slip`, {});
                            setOrder(data);
                            setPaymentStatus('paid');
                            toast.success('✅ Payment confirmed! Customer has been emailed.');
                          } catch { toast.error('Failed to confirm payment'); }
                        }}
                        className="w-full py-2.5 rounded-xl text-white text-sm font-bold bg-green-500 hover:bg-green-600 transition-colors"
                      >
                        ✅ Confirm Payment from Slip
                      </button>
                    )}
                    {order.paymentStatus === 'paid' && (
                      <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Payment Verified ✓
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400 italic">No slip uploaded yet by customer.</p>
                    {order.paymentStatus !== 'paid' && (
                      <button
                        onClick={async () => {
                          try {
                            const { data } = await API.put(`/orders/admin/${id}/confirm-slip`, {});
                            setOrder(data);
                            setPaymentStatus('paid');
                            toast.success('✅ Payment confirmed manually! Customer emailed.');
                          } catch { toast.error('Failed to confirm payment'); }
                        }}
                        className="w-full py-2 rounded-xl text-white text-xs font-bold bg-green-500 hover:bg-green-600 transition-colors"
                      >
                        ✅ Mark as Paid Manually
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
              <h2 className="font-semibold text-amber-800 mb-2">Customer Note</h2>
              <p className="text-sm text-amber-700">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}