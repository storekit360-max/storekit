import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import API from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import useSEO, { trackPurchase } from '../../hooks/useSEO';
import { generateEventId, getFbCookies } from '../../utils/metaPixelHelpers';
import toast from 'react-hot-toast';


// ── Cancel helpers (shared with OrderTracking) ────────────────────────────────
// Returns:
//   null                              → settings not yet loaded
//   { eligible: false }               → order not in cancellable status
//   { eligible: true, open: false }   → window expired OR cancellations disabled
//   { eligible: true, open: true, minutes, seconds, totalMs } → active timed window
function useCancelCountdownOT(orderId, orderCreatedAt, orderStatus, cancelRequested, windowMinutes) {
  const [state, setState] = React.useState(null);
  React.useEffect(() => {
    const cancellable = ['pending', 'confirmed'];

    // Not a cancellable status — hide button entirely
    if (!cancellable.includes(orderStatus)) { setState({ eligible: false }); return; }

    // Already has a cancel request — show badge not button
    if (cancelRequested) { setState({ eligible: true, open: false, hasCancelRequest: true }); return; }

    // Settings not yet loaded
    if (windowMinutes === null || windowMinutes === undefined) { setState(null); return; }

    const winNum = Number(windowMinutes);

    // Admin disabled cancellations
    if (winNum === 0) { setState({ eligible: true, open: false }); return; }

    // Guard invalid createdAt
    const placed = new Date(orderCreatedAt).getTime();
    if (!isFinite(placed) || placed <= 0) { setState({ eligible: true, open: false }); return; }

    const deadline = placed + winNum * 60 * 1000;
    const tick = () => {
      const diff = deadline - Date.now();
      if (!isFinite(diff) || diff <= 0) {
        setState({ eligible: true, open: false });
      } else {
        setState({
          eligible: true, open: true,
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

function TrackingCancelButton({ order, windowMinutes, onCancelled }) {
  const [open, setOpen]       = React.useState(false);
  const [reason, setReason]   = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const cs = useCancelCountdownOT(
    order._id, order.createdAt, order.orderStatus,
    !!order.cancelRequest?.requested, windowMinutes
  );

  // Order cancelled
  if (order.orderStatus === 'cancelled') return null;

  // Not in a cancellable status
  if (cs && !cs.eligible) return null;

  // Already submitted a cancel request
  if (order.cancelRequest?.requested) {
    const s = order.cancelRequest.status;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full ${
        s === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
        s === 'approved' ? 'bg-red-100 text-red-600' :
                           'bg-gray-100 text-gray-500'}`}>
        {s === 'pending'  ? '⏳ Cancel Requested' :
         s === 'approved' ? '🚫 Cancellation Approved' :
                            '❌ Request Rejected'}
      </span>
    );
  }

  // Settings still loading
  if (cs === null) return <span className="inline-block w-28 h-7 rounded-lg bg-gray-100 animate-pulse" />;

  // Window closed
  if (cs && !cs.open) {
    if (Number(windowMinutes) === 0) return null;
    return <span className="inline-flex items-center gap-1 text-xs text-gray-400 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">🔒 Cancel window closed</span>;
  }

  const mm = cs.minutes !== undefined ? String(cs.minutes).padStart(2, '0') : null;
  const ss = cs.seconds !== undefined ? String(cs.seconds).padStart(2, '0') : null;
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
    } finally { setLoading(false); }
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
        {mm !== null && (
          <span className={`font-mono px-1.5 py-0.5 rounded-md text-[11px] ${
            isUrgent ? 'bg-red-200 text-red-700' : 'bg-red-100 text-red-600'
          }`}>
            {mm}:{ss}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-xl">✕</div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight">Cancel this order?</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{order.orderNumber}</p>
              </div>
            </div>

            {mm !== null && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-4 text-sm font-medium ${
                isUrgent ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                <span>⏱</span>
                <span>Cancel window closes in <strong className="font-mono">{mm}:{ss}</strong></span>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-gray-600">Order Total</span>
              <span className="font-bold text-gray-900">Rs. {order.total?.toLocaleString()}</span>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="form-input resize-none" placeholder="e.g. Changed my mind, found a better price..." />
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-5 text-xs text-amber-700">
              ⚠️ Your request will be reviewed by our team. You'll receive an email with the decision.
            </div>

            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Keep Order</button>
              <button onClick={handleRequest} disabled={loading} className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting...</> : 'Request Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


export function OrderSuccess() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { settings } = useTheme();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const sym = settings?.currencySymbol || 'Rs.';
  const gateway = searchParams.get('gateway');
  // Prevent duplicate Purchase events on re-render / strict-mode double-effect
  const purchaseTracked = useRef(false);

  useSEO({ title: 'Order Confirmed', noindex: true });

  useEffect(() => {
    let attempts = 0;
    const fetchOrder = async () => {
      try {
        const { data } = await API.get(`/orders/${id}`);
        setOrder(data);
        setLoading(false);
        if (data && data.paymentStatus !== 'failed' && !purchaseTracked.current) {
          purchaseTracked.current = true;
          // Deduplication: Checkout.js fires trackPurchase immediately when the
          // order is created (same browser session). It stores the eventId it used
          // in sessionStorage so we can reuse it here for CAPI dedup instead of
          // generating a new one — Meta will count only ONE Purchase conversion.
          //
          // For PayHere redirect flows, Checkout.js runs in the previous page so
          // sessionStorage carries the eventId across the redirect. If it's absent
          // (direct link, refresh, cross-device) we generate a fresh eventId and
          // fire the event — it's better to count it than to drop it.
          const ssKey = `sz_purchase_eid_${data._id || id}`;
          const existingEventId = sessionStorage.getItem(ssKey);
          if (!existingEventId) {
            // Checkout.js did NOT already fire in this browser session.
            // This happens on PayHere redirect, page refresh, or direct link.
            // Use the eventId the backend stored on the order (metaEventId) so
            // the browser pixel deduplicates with the CAPI event already sent
            // by routes/orders.js when the order was created.
            // If the order has no metaEventId (very old order), generate fresh.
            const { fbp, fbc } = getFbCookies();
            const newEventId = data.metaEventId || generateEventId('Purchase', data._id || id);
            sessionStorage.setItem(ssKey, newEventId);
            trackPurchase(data, data.items || [], {
              billing: data.billing || {},
              eventId: newEventId,
              fbp,
              fbc,
            });
          }
          // If existingEventId is present, Checkout.js already fired trackPurchase
          // (browser pixel) with that eventId and the backend CAPI already used
          // the same key — Meta deduplicates them. Do NOT fire again.
        }
        if (gateway && data.paymentStatus === 'pending' && attempts === 0) {
          attempts++;
        }
      } catch { setLoading(false); }
    };
    fetchOrder();
  }, [id, gateway]);

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}/>
        <p className="text-gray-500">Loading your order...</p>
      </div>
    </div>
  );

  const isPaid         = order?.paymentStatus === 'paid';
  const isBankTransfer = order?.paymentMethod === 'bank_transfer';
  const isCOD          = order?.paymentMethod === 'cod';
  const isGateway      = ['payhere','stripe','paypal'].includes(order?.paymentMethod);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16" style={{ background: 'var(--body-bg)' }}>
      <div className="w-full max-w-lg fade-in">

        {/* Success Icon */}
        <div className="text-center mb-6">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 bounce-in ${isPaid ? 'bg-green-100' : 'bg-amber-100'}`}>
            {isPaid ? (
              <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
            ) : (
              <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            {isPaid ? 'Payment Confirmed! 🎉' : 'Order Placed!'}
          </h1>
          {order && (
            <p className="text-gray-500 mt-1">
              Order: <span className="font-mono font-bold text-lg" style={{ color: 'var(--color-primary)' }}>{order.orderNumber}</span>
            </p>
          )}
          <p className="text-gray-400 text-sm mt-1">Thank you! We'll send a confirmation to {order?.billing?.email}</p>
        </div>

        {/* Gateway confirmed */}
        {isGateway && isPaid && (
          <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-5 mb-4">
            <h3 className="font-bold text-green-800 mb-1 flex items-center gap-2">✅ Payment Successful</h3>
            <p className="text-sm text-green-700">Your payment was received and your order is now confirmed. We'll start processing it right away!</p>
            {order?.paymentReference && <p className="text-xs text-green-600 mt-1 font-mono">Ref: {order.paymentReference}</p>}
          </div>
        )}

        {/* Gateway pending */}
        {isGateway && !isPaid && (
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 mb-4">
            <h3 className="font-bold text-amber-800 mb-1">⏳ Awaiting Payment Confirmation</h3>
            <p className="text-sm text-amber-700">Your order has been placed. Once payment is confirmed it will be processed automatically.</p>
          </div>
        )}

        {/* Bank Transfer */}
        {isBankTransfer && (
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 mb-4">
            <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2 text-base">🏦 Bank Transfer Instructions</h3>
            <p className="text-sm text-amber-700 mb-4">
              Transfer <strong>{sym} {order.total?.toLocaleString()}</strong> using{' '}
              <span className="font-mono font-bold bg-amber-100 px-1.5 py-0.5 rounded">{order.orderNumber}</span> as reference.
            </p>
            <div className="bg-white rounded-xl p-4 space-y-2.5 border border-amber-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Bank Account Details</p>
              {[
                ['Bank',           settings?.bankName],
                ['Account Name',   settings?.bankAccountName],
                ['Account Number', settings?.bankAccountNumber],
                ['Branch',         settings?.bankBranch],
              ].filter(([,v]) => v).map(([label, value]) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">{label}</span>
                  <span className={`text-sm font-bold text-gray-900 ${label==='Account Number'?'font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200':''}`}>{value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center border-t border-gray-100 pt-2">
                <span className="text-sm text-gray-500">Amount</span>
                <span className="text-base font-bold" style={{ color: 'var(--color-primary)' }}>{sym} {order.total?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Reference</span>
                <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">{order.orderNumber}</span>
              </div>
            </div>
            <p className="text-xs text-amber-600 mt-3">⚠️ Your order will be processed after payment confirmation.</p>
          </div>
        )}

        {/* COD */}
        {isCOD && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 mb-4">
            <p className="font-bold text-green-800 mb-1">💵 Cash on Delivery</p>
            <p className="text-sm text-green-700">Please have <strong>{sym} {order.total?.toLocaleString()}</strong> ready when your order arrives.</p>
          </div>
        )}

        {/* Order Summary */}
        {order && (
          <div className="rounded-2xl border border-gray-100 p-5 mb-4" style={{ background: 'var(--card-bg)' }}>
            <h3 className="font-semibold text-gray-800 mb-3 text-sm">Order Summary</h3>
            <div className="space-y-2 mb-3">
              {order.items?.slice(0,4).map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <img src={item.image || 'https://via.placeholder.com/40'} alt={item.name} className="w-10 h-10 rounded-lg object-cover bg-gray-50 flex-shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">× {item.quantity}</p>
                  </div>
                  <p className="text-sm font-bold">{sym} {item.subtotal?.toLocaleString()}</p>
                </div>
              ))}
              {order.items?.length > 4 && <p className="text-xs text-gray-400 text-center">+ {order.items.length - 4} more items</p>}
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
              {order.couponDiscount > 0 && <div className="flex justify-between text-green-600"><span>Coupon</span><span>−{sym} {order.couponDiscount?.toLocaleString()}</span></div>}
              {order.giftCardDiscount > 0 && <div className="flex justify-between text-purple-600"><span>Gift Card</span><span>−{sym} {order.giftCardDiscount?.toLocaleString()}</span></div>}
              <div className="flex justify-between text-gray-600"><span>Delivery</span><span>{sym} {order.shippingCost?.toLocaleString()}</span></div>
              <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100">
                <span>Total</span><span>{sym} {order.total?.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-center flex-wrap">
          <Link to={`/track-order/${id}`} className="btn-primary text-sm">Track Order →</Link>
          <Link to="/shop" className="btn-outline text-sm">Continue Shopping</Link>
        </div>
      </div>
    </div>
  );
}

export function OrderTracking() {
  const { id } = useParams();
  const { settings } = useTheme();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slipFile, setSlipFile] = useState(null);
  const [slipPreview, setSlipPreview] = useState(null);
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipDone, setSlipDone] = useState(false);
  const [cancelWindowMinutes, setCancelWindowMinutes] = useState(null);
  const sym = settings?.currencySymbol || 'Rs.';

  useEffect(() => {
    API.get(`/orders/${id}`)
      .then(r => {
        setOrder(r.data);
        // If slip already uploaded, show done state
        if (r.data.paymentSlip) setSlipDone(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    API.get('/settings')
      .then(r => {
        const raw = r.data?.cancelWindowMinutes;
        const parsed = (raw !== undefined && raw !== null && String(raw).trim() !== '') ? Number(raw) : 60;
        setCancelWindowMinutes(isNaN(parsed) ? 60 : parsed);
      })
      .catch(() => setCancelWindowMinutes(60));
  }, []);

  const handleOrderCancelled = useCallback(() => {
    API.get(`/orders/${id}`).then(r => setOrder(r.data)).catch(() => {});
  }, [id]);

  const handleSlipChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSlipFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSlipPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSlipUpload = async () => {
    if (!slipFile || !id) return;
    setSlipUploading(true);
    try {
      const formData = new FormData();
      formData.append('slip', slipFile);
      await API.post(`/orders/${id}/payment-slip`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSlipDone(true);
      setSlipFile(null);
      setSlipPreview(null);
      // Refresh order to get updated paymentSlip field
      const { data } = await API.get(`/orders/${id}`);
      setOrder(data);
      alert('✅ Payment slip uploaded! We\'ll verify it shortly and email you confirmation.');
    } catch (err) {
      alert(err.response?.data?.message || '❌ Upload failed. Please try again or contact support.');
    } finally {
      setSlipUploading(false);
    }
  };

  const steps = ['pending','confirmed','processing','shipped','out_for_delivery','delivered'];
  const statusLabels = { pending:'Order Placed', confirmed:'Confirmed', processing:'Processing', shipped:'Shipped', out_for_delivery:'Out for Delivery', delivered:'Delivered', cancelled:'Cancelled' };
  const currentStep = steps.indexOf(order?.orderStatus);

  const isBankPending = order?.paymentMethod === 'bank_transfer' && order?.paymentStatus !== 'paid';

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>;
  if (!order) return <div className="text-center py-20 text-gray-500">Order not found</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10" style={{ background: 'var(--body-bg)' }}>
      <h1 className="text-2xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>Track Order</h1>
      <p className="text-gray-500 text-sm mb-6">
        <span className="font-mono font-semibold" style={{ color: 'var(--color-primary)' }}>{order.orderNumber}</span>
        {' · '}{order.deliveryServiceName || 'Standard Delivery'}
        {' · '}<span className={`font-medium ${order.paymentStatus==='paid'?'text-green-600':'text-amber-600'}`}>
          {order.paymentStatus==='paid'?'✅ Paid':'⏳ Payment Pending'}
        </span>
      </p>

      {/* Progress */}
      <div className="rounded-2xl border border-gray-100 p-6 mb-6" style={{ background: 'var(--card-bg)' }}>
        {order.orderStatus === 'cancelled' ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-2">❌</div>
            <p className="font-bold text-red-600">Order Cancelled</p>
          </div>
        ) : (
          <>
            <div className="relative flex justify-between">
              <div className="absolute top-4 left-0 right-0 h-1 bg-gray-200 -z-0 rounded-full">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0,(currentStep/(steps.length-1))*100)}%`, background: 'var(--theme-gradient)' }}/>
              </div>
              {steps.map((step, i) => (
                <div key={step} className="flex flex-col items-center gap-2 z-10">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm ${i<=currentStep?'text-white':'bg-gray-100 text-gray-400'}`}
                    style={i<=currentStep?{background:'var(--color-primary)'}:{}}>
                    {i<currentStep?'✓':i+1}
                  </div>
                  <span className={`text-xs font-medium text-center hidden sm:block ${i<=currentStep?'':'text-gray-400'}`}
                    style={i<=currentStep?{color:'var(--color-primary)'}:{}}>{statusLabels[step]}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 text-center">
              <p className="text-lg font-bold text-gray-900">{statusLabels[order.orderStatus]||order.orderStatus}</p>
              {order.trackingNumber && <p className="text-sm text-gray-500 mt-1">Tracking: <span className="font-mono font-bold" style={{color:'var(--color-primary)'}}>{order.trackingNumber}</span></p>}
            </div>
          </>
        )}
      </div>

      {/* Cancel button */}
      {order && !['delivered','cancelled'].includes(order.orderStatus) && (
        <div className="flex items-center justify-between mb-4 px-1">
          <Link to="/my-orders" className="text-sm font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>← My Orders</Link>
          <TrackingCancelButton order={order} windowMinutes={cancelWindowMinutes} onCancelled={handleOrderCancelled} />
        </div>
      )}

      {/* Bank Transfer: payment details + slip upload */}
      {isBankPending && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 mb-6">
          <h3 className="font-bold text-amber-800 mb-2 text-base">🏦 Payment Required</h3>
          <p className="text-sm text-amber-700 mb-4">
            Transfer <strong>{sym} {order.total?.toLocaleString()}</strong> with reference{' '}
            <strong className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">{order.orderNumber}</strong>
          </p>
          {settings?.bankAccountNumber && (
            <div className="bg-white rounded-xl p-3 text-sm space-y-1.5 border border-amber-100 mb-5">
              {settings.bankName        && <div className="flex justify-between"><span className="text-gray-400">Bank</span><span className="font-semibold text-gray-800">{settings.bankName}</span></div>}
              {settings.bankAccountName && <div className="flex justify-between"><span className="text-gray-400">Account Name</span><span className="font-semibold text-gray-800">{settings.bankAccountName}</span></div>}
              {settings.bankAccountNumber && <div className="flex justify-between"><span className="text-gray-400">Account No.</span><span className="font-mono font-black text-gray-900 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">{settings.bankAccountNumber}</span></div>}
              {settings.bankBranch      && <div className="flex justify-between"><span className="text-gray-400">Branch</span><span className="font-semibold text-gray-800">{settings.bankBranch}</span></div>}
            </div>
          )}

          {/* ── Slip Upload ── */}
          <div className="border-t border-amber-200 pt-4">
            <p className="text-sm font-bold text-amber-800 mb-3">
              📎 Upload Payment Slip
            </p>

            {slipDone ? (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <div>
                  <p className="text-sm font-semibold text-green-700">Slip uploaded successfully!</p>
                  <p className="text-xs text-green-600">We'll verify and confirm your order within 1–2 hours.</p>
                </div>
              </div>
            ) : (
              <>
                {slipPreview ? (
                  <div className="relative rounded-xl overflow-hidden border-2 border-amber-400 mb-3">
                    <img src={slipPreview} alt="Payment slip preview" className="w-full object-contain max-h-48 bg-white"/>
                    <button
                      onClick={() => { setSlipFile(null); setSlipPreview(null); }}
                      className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-600"
                    >✕</button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-white p-5 cursor-pointer hover:bg-amber-50 transition-colors mb-3">
                    <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <span className="text-sm font-medium text-amber-700">Click to select your payment slip</span>
                    <span className="text-xs text-amber-500">Image (JPG, PNG) or PDF — max 10MB</span>
                    <input type="file" accept="image/*,application/pdf" onChange={handleSlipChange} className="hidden"/>
                  </label>
                )}

                <button
                  onClick={handleSlipUpload}
                  disabled={!slipFile || slipUploading}
                  className="w-full py-3 rounded-xl text-white text-sm font-bold transition-opacity disabled:opacity-50"
                  style={{ background: slipFile ? 'var(--theme-gradient)' : '#9ca3af', cursor: slipFile ? 'pointer' : 'not-allowed' }}
                >
                  {slipUploading ? '⏳ Uploading…' : slipFile ? '📤 Upload Payment Slip' : 'Select a file first'}
                </button>
                <p className="text-xs text-amber-600 text-center mt-2">Uploading speeds up order confirmation ✓</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bank Transfer paid — show slip already uploaded note */}
      {order.paymentMethod === 'bank_transfer' && order.paymentStatus === 'paid' && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 mb-6 flex items-center gap-3">
          <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <div>
            <p className="font-bold text-green-800 text-sm">Payment Verified ✓</p>
            <p className="text-xs text-green-600">Your bank transfer has been confirmed by our team.</p>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="rounded-2xl border border-gray-100 p-6 mb-6" style={{ background: 'var(--card-bg)' }}>
        <h2 className="font-semibold text-gray-900 mb-4">Items</h2>
        <div className="space-y-3">
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <img src={item.image||'https://via.placeholder.com/48'} alt={item.name} className="w-12 h-12 rounded-lg object-cover bg-gray-50"/>
              <div className="flex-1"><p className="text-sm font-medium text-gray-800">{item.name}</p><p className="text-xs text-gray-500">× {item.quantity}</p></div>
              <p className="text-sm font-bold">{sym} {item.subtotal?.toLocaleString()}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 mt-4 pt-4 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{sym} {order.subtotal?.toLocaleString()}</span></div>
          {order.couponDiscount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>−{sym} {order.couponDiscount?.toLocaleString()}</span></div>}
          <div className="flex justify-between text-gray-600"><span>Delivery</span><span>{sym} {order.shippingCost?.toLocaleString()}</span></div>
          <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-2"><span>Total</span><span>{sym} {order.total?.toLocaleString()}</span></div>
        </div>
      </div>

      {/* History */}
      {order.statusHistory?.length > 0 && (
        <div className="rounded-2xl border border-gray-100 p-6" style={{ background: 'var(--card-bg)' }}>
          <h2 className="font-semibold text-gray-900 mb-4">History</h2>
          <div className="space-y-3">
            {[...order.statusHistory].reverse().map((h,i) => (
              <div key={i} className="flex gap-3">
                <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{background:'var(--color-primary)'}}/>
                <div>
                  <p className="text-sm font-semibold text-gray-800 capitalize">{h.status?.replace(/_/g,' ')}</p>
                  {h.note && <p className="text-xs text-gray-500">{h.note}</p>}
                  <p className="text-xs text-gray-400">{new Date(h.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}