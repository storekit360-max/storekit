import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function Returns() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [myReturns, setMyReturns] = useState([]);
  const [step, setStep] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [form, setForm] = useState({ reason: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  const REASONS = ['Defective/Damaged product','Wrong item received','Item not as described','Changed my mind','Size/fit issue','Better price found elsewhere'];
  const STATUS_COLORS = { pending:'status-pending', approved:'status-confirmed', rejected:'status-cancelled', received:'status-processing', refunded:'badge-new' };

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    API.get('/orders/my-orders').then(r => setOrders(r.data.filter(o => o.orderStatus === 'delivered'))).catch(() => {});
    API.get('/returns/my-returns').then(r => setMyReturns(r.data)).catch(() => {});
  }, [user, navigate]);

  // ── Helpers to determine return eligibility ────────────────────────────────

  // Returns the return request for a given orderId (if any)
  const getReturnForOrder = (orderId) =>
    myReturns.find(r => (r.order?._id || r.order) === orderId);

  // An order is blocked from a NEW return if it already has a pending/approved/received/refunded request
  // Rejected orders ARE allowed to re-request (returns false for rejected)
  const isOrderReturnBlocked = (orderId) => {
    const ret = getReturnForOrder(orderId);
    if (!ret) return false;
    // Only 'rejected' allows re-request; all others block
    return ret.status !== 'rejected';
  };

  // Returns a human-friendly label for why an order is blocked
  const getOrderBlockReason = (orderId) => {
    const ret = getReturnForOrder(orderId);
    if (!ret) return null;
    const labels = {
      pending:  'Return request pending review',
      approved: 'Return already approved',
      received: 'Return item received',
      refunded: 'Already refunded',
    };
    return labels[ret.status] || null;
  };

  // Returns the set of product IDs that are locked in an active/completed return for a given order
  const getLockedProductIds = (orderId) => {
    const ret = getReturnForOrder(orderId);
    if (!ret || ret.status === 'rejected') return new Set();
    return new Set((ret.items || []).map(i => (i.product?._id || i.product)?.toString()));
  };

  const toggleItem = (item) => {
    setSelectedItems(prev => {
      const productId = item.product?._id;
      const exists = prev.find(i => i.product === productId);
      if (exists) return prev.filter(i => i.product !== productId);
      return [...prev, { product: productId, name: item.name, quantity: item.quantity, reason: '', condition: 'opened' }];
    });
  };

  const handleOrderSelect = (order) => {
    if (isOrderReturnBlocked(order._id)) return; // safety guard
    setSelectedOrder(order);
    setSelectedItems([]);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!form.reason) { toast.error('Select a reason'); return; }
    if (selectedItems.length === 0) { toast.error('Select at least one item to return'); return; }
    setSubmitting(true);
    try {
      await API.post('/returns', { order: selectedOrder._id, items: selectedItems, reason: form.reason, description: form.description });
      toast.success('Return request submitted! We will review it within 24 hours.');
      setStep(1); setSelectedOrder(null); setSelectedItems([]); setForm({ reason: '', description: '' });
      API.get('/returns/my-returns').then(r => setMyReturns(r.data));
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">Returns & Refunds</h1>
      <p className="text-gray-500 mb-8">Easy returns within 7 days of delivery</p>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* New Return */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">Request a Return</h2>

            {step === 1 && (
              <div>
                <p className="text-sm text-gray-500 mb-4">Select an order to return (only delivered orders eligible)</p>
                {orders.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>No delivered orders eligible for return</p>
                    <Link to="/shop" className="text-primary hover:underline text-sm mt-2 block">Continue Shopping</Link>
                  </div>
                ) : orders.map(order => {
                  const blocked = isOrderReturnBlocked(order._id);
                  const blockReason = getOrderBlockReason(order._id);
                  const ret = getReturnForOrder(order._id);
                  return (
                    <div
                      key={order._id}
                      onClick={() => !blocked && handleOrderSelect(order)}
                      className={`w-full text-left p-4 border-2 rounded-xl transition-all mb-3 group
                        ${blocked
                          ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-70'
                          : 'border-gray-100 hover:border-primary hover:bg-primary/5 cursor-pointer'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-bold text-primary">{order.orderNumber}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(order.createdAt).toLocaleDateString()} · {order.items?.length} item(s)</p>
                          {blockReason && (
                            <p className="text-xs mt-1 font-medium text-amber-600 flex items-center gap-1">
                              <svg className="w-3 h-3 inline" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                              {blockReason}
                            </p>
                          )}
                          {/* Show re-request hint for rejected */}
                          {ret?.status === 'rejected' && (
                            <p className="text-xs mt-1 font-medium text-blue-500">Previous request rejected — you may submit a new request</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-800">Rs. {order.total?.toLocaleString()}</p>
                          {!blocked && (
                            <svg className="w-4 h-4 text-gray-400 group-hover:text-primary ml-auto mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          )}
                          {blocked && (
                            <svg className="w-4 h-4 text-gray-300 ml-auto mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {step === 2 && selectedOrder && (() => {
              const lockedIds = getLockedProductIds(selectedOrder._id);
              return (
                <div>
                  <button onClick={() => { setStep(1); setSelectedItems([]); }} className="text-sm text-gray-400 hover:text-primary mb-4 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg> Back
                  </button>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Select items to return:</p>
                  <div className="space-y-3 mb-5">
                    {selectedOrder.items?.map((item, i) => {
                      const productId = item.product?._id?.toString();
                      const isLocked = lockedIds.has(productId);
                      const selected = selectedItems.find(s => s.product === item.product?._id);
                      return (
                        <label
                          key={i}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all
                            ${isLocked
                              ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                              : selected
                                ? 'border-primary bg-primary/5 cursor-pointer'
                                : 'border-gray-100 hover:border-gray-200 cursor-pointer'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!selected}
                            disabled={isLocked}
                            onChange={() => !isLocked && toggleItem(item)}
                            className="accent-primary w-4 h-4"
                          />
                          <img src={item.image || 'https://via.placeholder.com/50'} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                            <p className="text-xs text-gray-400">Qty: {item.quantity} · Rs. {item.price?.toLocaleString()}</p>
                            {isLocked && (
                              <p className="text-xs text-amber-500 mt-0.5">Already in a return request</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="form-label">Reason for Return *</label>
                      <select value={form.reason} onChange={e => setForm(p => ({...p, reason: e.target.value}))} className="form-input">
                        <option value="">Select a reason...</option>
                        {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Additional Details</label>
                      <textarea value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} rows={3} className="form-input resize-none" placeholder="Describe the issue in detail..." />
                    </div>
                    <button onClick={handleSubmit} disabled={submitting || selectedItems.length === 0 || !form.reason} className="btn-primary w-full py-3">
                      {submitting ? 'Submitting...' : 'Submit Return Request'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* My Returns */}
        <div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-4">My Return Requests</h2>
            {myReturns.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No return requests yet</p>
            ) : myReturns.map(ret => (
              <div key={ret._id} className="border-b border-gray-50 pb-3 mb-3 last:border-0 last:mb-0">
                <p className="text-xs font-mono text-primary">{ret.order?.orderNumber}</p>
                <p className="text-xs text-gray-500 mt-0.5">{ret.reason}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={`badge text-xs ${STATUS_COLORS[ret.status] || ''} capitalize`}>{ret.status}</span>
                  <span className="text-xs text-gray-400">{new Date(ret.createdAt).toLocaleDateString()}</span>
                </div>
                {ret.adminNote && <p className="text-xs text-gray-500 mt-1 bg-gray-50 rounded p-2">{ret.adminNote}</p>}
              </div>
            ))}
          </div>

          {/* Policy */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mt-4">
            <h3 className="font-semibold text-blue-800 text-sm mb-2">Return Policy</h3>
            <ul className="text-xs text-blue-600 space-y-1">
              <li>✓ 7 days from delivery date</li>
              <li>✓ Item must be in original condition</li>
              <li>✓ Original packaging preferred</li>
              <li>✓ Refund within 5-7 business days</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}