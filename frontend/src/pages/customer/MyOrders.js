import React, { useEffect, useState, useCallback } from 'react';
import useSEO from '../../hooks/useSEO';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const statusColors = {
  pending: 'status-pending', confirmed: 'status-confirmed',
  processing: 'status-processing', shipped: 'status-shipped',
  out_for_delivery: 'status-out_for_delivery', delivered: 'status-delivered',
  cancelled: 'status-cancelled',
};

const statusIcons = {
  pending: '🕐', confirmed: '✅', processing: '⚙️', shipped: '🚚',
  out_for_delivery: '🛵', delivered: '📦', cancelled: '✕', refunded: '↩️',
};

// ── Countdown hook ────────────────────────────────────────────────────────────
// Returns:
//   null                              → settings not yet loaded
//   { eligible: false }               → order not in cancellable status
//   { eligible: true, open: false }   → window has expired OR cancellations disabled
//   { eligible: true, open: true, minutes, seconds }          → active timed window
function useCancelCountdown(orderId, orderCreatedAt, orderStatus, cancelRequested, windowMinutes) {
  const [state, setState] = useState(null);

  useEffect(() => {
    const cancellable = ['pending', 'confirmed'];

    // Not in a cancellable status — hide button entirely
    if (!cancellable.includes(orderStatus)) {
      setState({ eligible: false });
      return;
    }

    // Already has a cancel request (any status) — show badge not button
    if (cancelRequested) {
      setState({ eligible: true, open: false, hasCancelRequest: true });
      return;
    }

    // Settings not yet loaded — show skeleton
    if (windowMinutes === null || windowMinutes === undefined) {
      setState(null);
      return;
    }

    const winNum = Number(windowMinutes);

    // Admin disabled cancellations entirely
    if (winNum === 0) {
      setState({ eligible: true, open: false });
      return;
    }

    // Guard: invalid createdAt means we can't compute window — hide button
    const placed = new Date(orderCreatedAt).getTime();
    if (!isFinite(placed) || placed <= 0) {
      setState({ eligible: true, open: false });
      return;
    }

    const winMs    = winNum * 60 * 1000;
    const deadline = placed + winMs;

    const tick = () => {
      const diff = deadline - Date.now();
      if (!isFinite(diff) || diff <= 0) {
        setState({ eligible: true, open: false });
      } else {
        setState({
          eligible: true,
          open: true,
          minutes: Math.floor(diff / 60000),
          seconds: Math.floor((diff % 60000) / 1000),
          totalMs: diff,
        });
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, orderCreatedAt, orderStatus, cancelRequested, windowMinutes]);

  return state;
}

// ── CancelButton component ────────────────────────────────────────────────────
function CancelButton({ order, windowMinutes, onCancelled }) {
  const [open, setOpen]       = useState(false);
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);

  const cs = useCancelCountdown(
    order._id,
    order.createdAt,
    order.orderStatus,
    !!order.cancelRequest?.requested,
    windowMinutes,
  );

  // ── Early returns (order-level guards) ──

  // Order is cancelled — show nothing
  if (order.orderStatus === 'cancelled') return null;

  // Not in a cancellable status
  if (cs && !cs.eligible) return null;

  // Already submitted a cancel request — show status badge
  if (order.cancelRequest?.requested) {
    const s = order.cancelRequest.status;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full ${
        s === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
        s === 'approved' ? 'bg-red-100 text-red-600'       :
                           'bg-gray-100 text-gray-500'}`}>
        {s === 'pending'  ? '⏳ Cancel Requested' :
         s === 'approved' ? '🚫 Cancellation Approved' :
                            '❌ Request Rejected'}
      </span>
    );
  }

  // Settings still loading
  if (cs === null) {
    return <span className="inline-block w-28 h-7 rounded-lg bg-gray-100 animate-pulse" />;
  }

  // Window is closed
  if (cs && !cs.open) {
    // Admin disabled cancellations — show nothing at all
    if (Number(windowMinutes) === 0) return null;
    // Window has expired
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
        🔒 Cancel window closed
      </span>
    );
  }

  // ── Active window — show Cancel button with countdown ──
  const mm = cs.minutes !== undefined ? String(cs.minutes).padStart(2, '0') : null;
  const ss = cs.seconds !== undefined ? String(cs.seconds).padStart(2, '0') : null;

  // Urgency colour: red when < 5 min left
  const isUrgent = cs.totalMs !== undefined && cs.totalMs < 5 * 60 * 1000;

  const handleRequest = async () => {
    setLoading(true);
    try {
      await API.post(`/orders/${order._id}/cancel-request`, { reason });
      toast.success('Cancellation request sent to admin');
      setOpen(false);
      onCancelled();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit cancel request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold border px-3 py-1.5 rounded-lg transition-all ${
          isUrgent
            ? 'text-red-600 hover:text-red-800 border-red-300 hover:border-red-500 bg-red-50 hover:bg-red-100'
            : 'text-red-500 hover:text-red-700 border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100'
        }`}
      >
        <span>✕ Cancel Order</span>
        {/* Show countdown timer when in timed window */}
        {mm !== null && (
          <span className={`font-mono px-1.5 py-0.5 rounded-md text-[11px] ${
            isUrgent ? 'bg-red-200 text-red-700' : 'bg-red-100 text-red-600'
          }`}>
            {mm}:{ss}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={e => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-xl">✕</div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight">Cancel this order?</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{order.orderNumber}</p>
              </div>
            </div>

            {/* Countdown warning inside modal */}
            {mm !== null && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-4 text-sm font-medium ${
                isUrgent ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                <span>⏱</span>
                <span>
                  Cancel window closes in{' '}
                  <strong className="font-mono">{mm}:{ss}</strong>
                </span>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-gray-600">Order Total</span>
              <span className="font-bold text-gray-900">Rs. {order.total?.toLocaleString()}</span>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Reason for cancellation <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                className="form-input resize-none"
                placeholder="e.g. Changed my mind, found a better price, ordered by mistake..."
              />
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-5 text-xs text-amber-700">
              ⚠️ Your request will be reviewed by our team. You'll receive an email with the decision.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Keep Order
              </button>
              <button
                onClick={handleRequest}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting...</>
                ) : 'Request Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// ── GiftCardSlipUpload component ──────────────────────────────────────────────
function GiftCardSlipUpload({ cardId, cardCode, onUploaded }) {
  const [slipFile, setSlipFile]     = useState(null);
  const [slipPreview, setSlipPreview] = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [done, setDone]             = useState(false);

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSlipFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSlipPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!slipFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('slip', slipFile);
      await API.post(`/gift-cards/${cardId}/payment-slip`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('✅ Payment slip uploaded! We\'ll verify it shortly.');
      setDone(true);
      onUploaded();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700 font-medium">
        ✅ Slip uploaded! Our team will review and activate your gift card.
      </div>
    );
  }

  return (
    <div>
      {slipPreview ? (
        <div className="relative rounded-xl overflow-hidden border-2 border-amber-300 mb-3 max-h-40">
          <img src={slipPreview} alt="Payment slip" className="w-full object-contain max-h-40"/>
          <button onClick={() => { setSlipFile(null); setSlipPreview(null); }}
            className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-600">✕</button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 p-3 cursor-pointer hover:bg-amber-50 transition-colors mb-3 bg-white text-sm text-amber-700 font-medium">
          <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          📎 Attach payment slip (image or PDF)
          <input type="file" accept="image/*,application/pdf" onChange={handleChange} className="hidden"/>
        </label>
      )}
      {slipFile && (
        <button onClick={handleUpload} disabled={uploading}
          className="w-full py-2.5 rounded-xl text-white font-bold text-sm transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: 'var(--theme-gradient)' }}>
          {uploading
            ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Uploading…</>
            : '📤 Upload Slip'
          }
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyOrders() {
  const { user }       = useAuth();
  useSEO({ title: 'My Orders', noindex: true });
  const { settings }   = useTheme();
  const [searchParams] = useSearchParams();

  const [orders, setOrders]                             = useState([]);
  const [loading, setLoading]                           = useState(true);
  const [slipFile, setSlipFile]                         = useState(null);
  const [slipPreview, setSlipPreview]                   = useState(null);
  const [slipUploading, setSlipUploading]               = useState(false);
  const [slipUploaded, setSlipUploaded]                 = useState(false);
  // null = not loaded yet — prevents premature "expired" state on first render
  const [cancelWindowMinutes, setCancelWindowMinutes]   = useState(null);
  const [giftCards, setGiftCards]                       = useState([]);
  const [gcLoading, setGcLoading]                       = useState(true);
  const [expandedOrders, setExpandedOrders]             = useState(new Set());
  const [visibleCount, setVisibleCount]                 = useState(5);

  const sym      = settings?.currencySymbol || 'Rs.';
  const primary  = 'var(--color-primary)';
  const newOrderId    = searchParams.get('new');
  const newPaymentMethod = searchParams.get('payment'); // e.g. 'bank_transfer'

  const fetchOrders = useCallback(() => {
    setLoading(true);
    API.get('/orders/my-orders')
      .then(r => setOrders(r.data || []))
      .catch(() => toast.error('Could not load orders'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-expand the newly placed order so its details are immediately visible
  useEffect(() => {
    if (newOrderId) setExpandedOrders(prev => new Set(prev).add(newOrderId));
  }, [newOrderId]);

  // Load cancel window setting — keep null until response arrives so the
  // countdown hook doesn't flash "window closed" before we know the real value.
  useEffect(() => {
    API.get('/settings')
      .then(r => {
        const raw    = r.data?.cancelWindowMinutes;
        // Treat missing/empty/null/undefined as the default (60 min)
        const parsed = (raw !== undefined && raw !== null && String(raw).trim() !== '')
          ? Number(raw)
          : 60;
        setCancelWindowMinutes(isNaN(parsed) ? 60 : parsed);
      })
      .catch(() => setCancelWindowMinutes(60)); // fallback on API error
  }, []);

  // Fetch customer gift card purchases
  useEffect(() => {
    setGcLoading(true);
    API.get('/gift-cards/my-cards')
      .then(r => setGiftCards(r.data || []))
      .catch(() => {})
      .finally(() => setGcLoading(false));
  }, []);

  // Slip upload for bank transfer orders landing from checkout
  const handleSlipChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSlipFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSlipPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSlipUpload = async () => {
    if (!newOrderId || !slipFile) return;
    setSlipUploading(true);
    try {
      const formData = new FormData();
      formData.append('slip', slipFile);
      await API.post(`/orders/${newOrderId}/payment-slip`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('✅ Payment slip uploaded! We\'ll verify it shortly.');
      setSlipUploaded(true);
      setSlipFile(null);
      setSlipPreview(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed. Try again or contact support.');
    } finally {
      setSlipUploading(false);
    }
  };

  const pendingPaymentOrders = orders.filter(
    o => o.paymentMethod === 'bank_transfer' && o.paymentStatus !== 'paid'
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8" style={{ background: 'var(--body-bg)' }}>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg"
          style={{ background: 'var(--theme-gradient)' }}>
          {user?.firstName?.[0] || '?'}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>My Orders</h1>
          <p className="text-gray-500 text-sm">{user?.email}</p>
        </div>
        <Link to="/account" className="ml-auto text-sm font-medium hover:underline" style={{ color: primary }}>
          ← My Account
        </Link>
      </div>

      {/* Payment pending compact notice */}
      {pendingPaymentOrders.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <span className="text-lg">🏦</span>
          <p className="text-sm text-amber-800 font-medium flex-1">
            <strong>{pendingPaymentOrders.length} order{pendingPaymentOrders.length > 1 ? 's' : ''}</strong> awaiting bank transfer payment — click <strong>Upload Slip</strong> on any highlighted order below.
          </p>
        </div>
      )}

      {/* New order success banner — enhanced for bank transfer */}
      {newOrderId && !slipUploaded && newPaymentMethod === 'bank_transfer' && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 mb-6">
          {/* Success header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: 'var(--theme-gradient)' }}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <p className="font-bold text-amber-900 text-base">Order placed! Complete your bank transfer</p>
              <p className="text-xs text-amber-700 mt-0.5">Your order is confirmed — please transfer the amount below</p>
            </div>
          </div>

          {/* Bank details */}
          <div className="rounded-xl bg-white border border-amber-200 p-4 mb-4 space-y-1.5 text-sm">
            <p className="font-bold text-gray-800 mb-2">🏦 Bank Transfer Details</p>
            {settings?.bankName && <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Bank</span><span className="font-semibold text-gray-800">{settings.bankName}</span></div>}
            {settings?.bankAccountName && <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Account Name</span><span className="font-semibold text-gray-800">{settings.bankAccountName}</span></div>}
            {settings?.bankAccountNumber && (
              <div className="flex gap-2 items-center">
                <span className="text-gray-400 w-28 flex-shrink-0">Account No.</span>
                <span className="font-mono font-black text-gray-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg tracking-widest">{settings.bankAccountNumber}</span>
              </div>
            )}
            {settings?.bankBranch && <div className="flex gap-2"><span className="text-gray-400 w-28 flex-shrink-0">Branch</span><span className="font-semibold text-gray-800">{settings.bankBranch}</span></div>}
            <div className="pt-2 mt-2 border-t border-amber-100 text-xs text-amber-700 font-medium">
              ⚠️ Use your order number as the transfer reference so we can match your payment.
            </div>
          </div>

          {/* Slip upload */}
          <p className="text-sm font-semibold text-gray-800 mb-2">📎 Upload Payment Slip <span className="font-normal text-gray-400">(optional — speeds up verification)</span></p>
          {slipPreview ? (
            <div className="relative rounded-xl overflow-hidden border-2 border-amber-300 mb-3 max-h-48">
              <img src={slipPreview} alt="Payment slip" className="w-full object-contain max-h-48"/>
              <button onClick={() => { setSlipFile(null); setSlipPreview(null); }}
                className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-600">✕</button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-amber-300 p-4 cursor-pointer hover:bg-amber-100 transition-colors mb-3 bg-white">
              <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              <span className="text-sm font-medium text-amber-700">Click to attach your slip (image or PDF)</span>
              <input type="file" accept="image/*,application/pdf" onChange={handleSlipChange} className="hidden"/>
            </label>
          )}
          {slipFile && (
            <button onClick={handleSlipUpload} disabled={slipUploading}
              className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'var(--theme-gradient)' }}>
              {slipUploading
                ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Uploading…</>
                : '📤 Upload Slip'
              }
            </button>
          )}
        </div>
      )}

      {/* Slip uploaded confirmation */}
      {newOrderId && slipUploaded && (
        <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-4 mb-6 flex items-center gap-3">
          <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <p className="font-bold text-green-800 text-sm">Slip uploaded! We'll verify your payment shortly.</p>
            <p className="text-xs text-green-600">You'll receive a confirmation once it's approved.</p>
          </div>
        </div>
      )}

      {/* Normal success banner for non-bank-transfer orders */}
      {newOrderId && newPaymentMethod !== 'bank_transfer' && (
        <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-4 mb-6 flex items-center gap-3">
          <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div className="flex-1">
            <p className="font-bold text-green-800 text-sm">Order placed successfully!</p>
            <p className="text-xs text-green-600">A confirmation email has been sent to you.</p>
          </div>
          <Link to={`/track-order/${newOrderId}`} className="text-xs font-semibold hover:underline" style={{ color: primary }}>
            Track →
          </Link>
        </div>
      )}

      {/* Cancel window info banner (only when window is finite and set) */}
      {cancelWindowMinutes !== null && Number(cancelWindowMinutes) > 0 && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 mb-5 text-xs text-blue-700">
          <span>⏱</span>
          <span>Orders can be cancelled within <strong>{cancelWindowMinutes} minute{cancelWindowMinutes !== 1 ? 's' : ''}</strong> of placing. After that, please contact support.</span>
        </div>
      )}

      {/* Orders list */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: primary, borderTopColor: 'transparent' }} />
          Loading your orders…
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-gray-600 font-medium mb-1">No orders yet</p>
          <p className="text-gray-400 text-sm mb-4">When you place an order, it will appear here.</p>
          <Link to="/shop" className="btn-primary inline-block">Start Shopping →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.slice(0, visibleCount).map(order => {
            const isNew        = order._id === newOrderId;
            const needsPayment = order.paymentMethod === 'bank_transfer' && order.paymentStatus !== 'paid';
            const isExpanded   = expandedOrders.has(order._id);
            const toggleExpand = () => {
              setExpandedOrders(prev => {
                const next = new Set(prev);
                next.has(order._id) ? next.delete(order._id) : next.add(order._id);
                return next;
              });
            };
            const itemCount = order.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0;

            return (
              <div key={order._id}
                className="rounded-2xl border transition-all overflow-hidden"
                style={{
                  background:  'var(--card-bg)',
                  borderColor: isNew ? primary : needsPayment ? '#fcd34d' : 'var(--card-border, #e5e7eb)',
                  borderWidth: (isNew || needsPayment) ? '2px' : '1px',
                  boxShadow: isNew ? `0 0 0 4px ${primary}15` : 'none',
                }}>

                {/* Compact summary row — always visible, click to expand */}
                <button onClick={toggleExpand} className="w-full text-left p-4 flex items-center gap-3 sm:gap-4 hover:bg-black/[0.02] transition-colors">
                  {/* Item thumbnails stack */}
                  <div className="flex -space-x-3 flex-shrink-0">
                    {order.items?.slice(0, 3).map((item, i) => (
                      item.image
                        ? <img key={i} src={item.image} alt="" className="w-11 h-11 rounded-xl object-cover border-2"
                            style={{ borderColor: 'var(--card-bg)', zIndex: 3 - i }} />
                        : <div key={i} className="w-11 h-11 rounded-xl border-2 bg-gray-100 flex items-center justify-center text-gray-300 text-lg"
                            style={{ borderColor: 'var(--card-bg)', zIndex: 3 - i }}>📦</div>
                    ))}
                    {order.items?.length > 3 && (
                      <div className="w-11 h-11 rounded-xl border-2 flex items-center justify-center text-xs font-bold text-gray-500 bg-gray-100"
                        style={{ borderColor: 'var(--card-bg)' }}>
                        +{order.items.length - 3}
                      </div>
                    )}
                  </div>

                  {/* Order info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-sm font-bold truncate" style={{ color: primary }}>{order.orderNumber}</p>
                      {isNew && (
                        <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: primary }}>NEW</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(order.createdAt).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' })}
                      {' · '}{itemCount} item{itemCount !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Status + total */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900 text-sm sm:text-base">{sym} {order.total?.toLocaleString()}</p>
                    <span className={`badge ${statusColors[order.orderStatus] || ''} capitalize text-[11px] mt-1 inline-block`}>
                      {statusIcons[order.orderStatus] || ''} {order.orderStatus?.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Expand chevron */}
                  <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--card-border, #e5e7eb)' }}>
                    {needsPayment && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full mt-3">
                        ⏳ Awaiting Payment
                      </span>
                    )}

                    {/* Full items list */}
                    <div className="flex flex-col gap-1.5 mt-3">
                      {order.items?.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                          {item.image && <img src={item.image} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />}
                          <span className="truncate flex-1">{item.name}</span>
                          <span className="text-gray-400 text-xs">×{item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {/* Review prompt — encourage feedback once delivered */}
                    {order.orderStatus === 'delivered' && order.items?.some(item => item.product?.slug) && (
                      <div className="mt-3 p-3 rounded-xl border flex flex-wrap items-center gap-2" style={{ background: `${primary}0d`, borderColor: `${primary}30` }}>
                        <span className="text-sm font-semibold" style={{ color: 'var(--color-dark)' }}>⭐ How was it?</span>
                        <div className="flex gap-2 flex-wrap">
                          {order.items?.filter(item => item.product?.slug).map((item, i) => (
                            <Link key={i} to={`/product/${item.product.slug}#reviews`}
                              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:opacity-90"
                              style={{ color: primary, borderColor: `${primary}40`, background: 'var(--card-bg)' }}>
                              Review {item.name?.length > 18 ? item.name.slice(0, 18) + '…' : item.name} →
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Footer row */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t flex-wrap gap-3" style={{ borderColor: 'var(--card-border, #e5e7eb)' }}>
                      <p className="text-xs text-gray-400 capitalize">
                        {order.paymentMethod?.replace(/_/g, ' ')} ·{' '}
                        <span className={order.paymentStatus === 'paid' ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                          {order.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Payment Pending'}
                        </span>
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CancelButton
                          order={order}
                          windowMinutes={cancelWindowMinutes}
                          onCancelled={fetchOrders}
                        />
                        <Link to={`/track-order/${order._id}`}
                          className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:opacity-90"
                          style={{ color: primary, borderColor: `${primary}40`, background: `${primary}0d` }}>
                          {needsPayment ? '📤 Upload Slip' : '📍 Track Order'} →
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Load more */}
          {visibleCount < orders.length && (
            <button onClick={() => setVisibleCount(c => c + 5)}
              className="w-full py-3 rounded-xl border text-sm font-semibold transition-colors hover:opacity-90"
              style={{ color: primary, borderColor: `${primary}40`, background: `${primary}0d` }}>
              Show more orders ({orders.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
      {/* ── Gift Card Purchases — always shown ────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
          🎁 Gift Card Purchases
        </h2>

        {gcLoading ? (
          <div className="text-center py-10 text-gray-400">
            <div className="w-6 h-6 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-2"
              style={{ borderColor: primary, borderTopColor: 'transparent' }} />
            Loading gift cards…
          </div>
        ) : giftCards.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
            <div className="text-4xl mb-3">🎁</div>
            <p className="font-medium text-gray-500 mb-1">No gift card purchases yet</p>
            <p className="text-sm text-gray-400 mb-4">When you purchase a gift card it will appear here.</p>
            <Link to="/gift-cards" className="text-sm font-semibold hover:underline" style={{ color: primary }}>Browse Gift Cards →</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {giftCards.map(card => {
              const DESIGN_EMOJIS = { default: '🎁', birthday: '🎂', christmas: '🎄', anniversary: '💝', thankyou: '💙' };

              const deadlineMs   = card.slipDeadlineAt ? new Date(card.slipDeadlineAt).getTime() - Date.now() : null;
              const deadlinePassed  = deadlineMs !== null && deadlineMs <= 0;
              const deadlineHours   = deadlineMs !== null && deadlineMs > 0 ? Math.floor(deadlineMs / 3600000) : null;
              const deadlineMins    = deadlineMs !== null && deadlineMs > 0 ? Math.floor((deadlineMs % 3600000) / 60000) : null;

              const statusLabel =
                card.paymentExpired       ? '⏰ Expired — No Slip Uploaded' :
                card.isActive             ? '✅ Active' :
                card.paymentStatus==='paid'? '✅ Paid' :
                card.paymentSlip          ? '⏳ Slip Uploaded — Awaiting Activation' :
                                            '🏦 Awaiting Payment';

              const statusColor =
                card.paymentExpired ? 'bg-red-100 text-red-600' :
                card.isActive       ? 'bg-green-100 text-green-700' :
                card.paymentSlip    ? 'bg-blue-100 text-blue-700' :
                                      'bg-amber-100 text-amber-700';

              return (
                <div key={card._id} className="rounded-2xl border p-5 transition-all"
                  style={{
                    background: 'var(--card-bg)',
                    borderColor: card.paymentExpired ? '#fecaca' : card.isActive ? '#86efac' : '#fcd34d',
                    borderWidth: '1.5px',
                  }}>

                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{DESIGN_EMOJIS[card.design] || '🎁'}</span>
                        <p className="font-mono text-sm font-bold tracking-widest" style={{ color: primary }}>{card.code}</p>
                      </div>
                      <p className="text-xs text-gray-400">
                        Purchased {new Date(card.createdAt).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                      {card.recipientEmail && card.recipientEmail !== card.purchaserEmail && (
                        <p className="text-xs text-gray-500 mt-1">🎁 For: <strong>{card.recipientName || card.recipientEmail}</strong></p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900 text-lg">{sym} {card.initialValue?.toLocaleString()}</p>
                      {card.isActive && card.balance < card.initialValue && (
                        <p className="text-xs text-gray-400">Balance: {sym} {card.balance?.toLocaleString()}</p>
                      )}
                      <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full mt-1 ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  {/* Deadline countdown */}
                  {!card.paymentSlip && !card.isActive && !card.paymentExpired && card.slipDeadlineAt && (
                    <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border ${
                      deadlinePassed || (deadlineHours !== null && deadlineHours < 2)
                        ? 'bg-red-50 text-red-600 border-red-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      <span>⏱</span>
                      {deadlinePassed
                        ? 'Upload deadline has passed — your order may be cancelled.'
                        : deadlineHours !== null
                          ? `Slip upload deadline: ${deadlineHours}h ${deadlineMins}m remaining`
                          : `Deadline: ${new Date(card.slipDeadlineAt).toLocaleString('en-LK')}`}
                    </div>
                  )}

                  {/* Slip upload */}
                  {!card.paymentSlip && !card.isActive && !card.paymentExpired && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                        ⚠️ Please transfer <strong>{sym} {card.initialValue?.toLocaleString()}</strong> to the store bank account using <strong>{card.code}</strong> as the reference, then upload your slip below.
                      </p>
                      <GiftCardSlipUpload cardId={card._id} cardCode={card.code} onUploaded={() => {
                        setGiftCards(prev => prev.map(c => c._id === card._id ? { ...c, paymentSlip: 'uploaded' } : c));
                      }} />
                    </div>
                  )}

                  {/* Slip uploaded, awaiting review */}
                  {card.paymentSlip && !card.isActive && !card.paymentExpired && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700 font-medium">
                        ✅ Payment slip uploaded — our team is reviewing your payment. You'll get an email once activated.
                      </div>
                    </div>
                  )}

                  {/* Expired */}
                  {card.paymentExpired && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                        ⏰ This order was cancelled because no payment slip was uploaded in time.
                        If you made a bank transfer, contact support with your transfer reference.
                      </div>
                    </div>
                  )}

                  {/* Usage history */}
                  {card.isActive && card.usageHistory?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-2">Usage History</p>
                      <div className="space-y-1">
                        {card.usageHistory.map((u, i) => (
                          <div key={i} className="flex justify-between text-xs text-gray-500">
                            <span>Used on {new Date(u.date).toLocaleDateString('en-LK', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span className="font-semibold text-red-500">−{sym} {u.amount?.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}