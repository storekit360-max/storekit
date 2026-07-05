import React, { useState, useEffect, useRef } from 'react';
import useSEO, { trackPurchase, applyAdvancedMatching } from '../../hooks/useSEO';
import { generateEventId, getFbCookies } from '../../utils/metaPixelHelpers';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSeasonal } from '../../context/SeasonalContext';
import API from '../../utils/api';
import toast from 'react-hot-toast';
import {
  resolveDeliveryFee,
  resolveBenefit,
  computeTotals,
} from '../../utils/discountEngine';

const COUNTRIES   = ['Sri Lanka','Australia','Bangladesh','Canada','China','France','Germany','India','Indonesia','Italy','Japan','Malaysia','Maldives','Nepal','Netherlands','Pakistan','Philippines','Saudi Arabia','Singapore','South Korea','Spain','Thailand','UAE','United Kingdom','United States','Vietnam','Other'];
// Comprehensive list of towns/cities in Sri Lanka, covering all 25 districts.
const SL_CITIES = [
  // Colombo District
  'Colombo 1 (Fort)','Colombo 2 (Slave Island)','Colombo 3 (Kollupitiya)','Colombo 4 (Bambalapitiya)','Colombo 5 (Havelock Town)','Colombo 6 (Wellawatte)','Colombo 7 (Cinnamon Gardens)','Colombo 8 (Borella)','Colombo 9 (Dematagoda)','Colombo 10 (Maradana)','Colombo 11 (Pettah)','Colombo 12 (Hulftsdorp)','Colombo 13 (Kotahena)','Colombo 14 (Grandpass)','Colombo 15 (Mutwal)',
  'Angoda','Athurugiriya','Attidiya','Avissawella','Battaramulla','Boralesgamuwa','Dehiwala','Ethul Kotte','Hanwella','Homagama','Kaduwela','Kesbewa','Kohuwala','Kollonnawa','Kotikawatta','Kottawa','Maharagama','Malabe','Mirihana','Moratuwa','Mount Lavinia','Nawala','Nugegoda','Padukka','Pannipitiya','Pelawatte','Piliyandala','Rajagiriya','Ratmalana','Talawatugoda','Wattala','Wellampitiya',
  // Gampaha District
  'Gampaha','Ja-Ela','Kadawatha','Kandana','Katunayake','Kelaniya','Kiribathgoda','Minuwangoda','Mirigama','Negombo','Nittambuwa','Ragama','Seeduwa','Veyangoda','Divulapitiya','Biyagama','Ganemulla','Yakkala','Wattegama (Gampaha)',
  // Kalutara District
  'Kalutara','Aluthgama','Bandaragama','Beruwala','Horana','Ingiriya','Matugama','Panadura','Wadduwa','Agalawatta','Dodangoda',
  // Kandy District
  'Kandy','Akurana','Gampola','Katugastota','Kundasale','Nawalapitiya','Pilimathalawa','Peradeniya','Pussellawa','Wattegama','Galagedara','Hatton','Madawala','Teldeniya','Digana','Kadugannawa',
  // Matale District
  'Matale','Dambulla','Galewela','Naula','Rattota','Ukuwela','Sigiriya','Pallepola',
  // Nuwara Eliya District
  'Nuwara Eliya','Talawakele','Ginigathena','Kotagala','Maskeliya','Nanu Oya','Ragala','Walapane','Ramboda','Lindula',
  // Galle District
  'Galle','Ambalangoda','Baddegama','Bentota','Elpitiya','Hikkaduwa','Imaduwa','Karapitiya','Koggala','Unawatuna','Habaraduwa','Neluwa','Udugama','Akmeemana',
  // Matara District
  'Matara','Akuressa','Deniyaya','Dickwella','Hakmana','Kamburupitiya','Weligama','Mirissa','Devinuwara',
  // Hambantota District
  'Hambantota','Ambalantota','Beliatta','Tangalle','Tissamaharama','Weeraketiya','Sooriyawewa','Kataragama','Walasmulla','Angunakolapelessa',
  // Jaffna District
  'Jaffna','Chavakachcheri','Kayts','Nallur','Point Pedro','Velanai','Karainagar','Tellippalai','Chankanai','Kopay','Kondavil',
  // Kilinochchi District
  'Kilinochchi','Pallai','Paranthan','Poonakary',
  // Mannar District
  'Mannar','Madhu','Nanaddan','Pesalai','Talaimannar',
  // Vavuniya District
  'Vavuniya','Cheddikulam','Nedunkeni','Omanthai',
  // Mullaitivu District
  'Mullaitivu','Mulliyawalai','Oddusuddan','Puthukkudiyiruppu',
  // Batticaloa District
  'Batticaloa','Eravur','Kaluwanchikudy','Kattankudy','Valachchenai','Chenkalady','Vakarai',
  // Ampara District
  'Ampara','Akkaraipattu','Kalmunai','Sainthamaruthu','Sammanthurai','Pottuvil','Uhana','Dehiattakandiya','Mahaoya','Addalachchenai',
  // Trincomalee District
  'Trincomalee','Kantalai','Kinniya','Kuchchaveli','Muttur','Nilaveli',
  // Kurunegala District
  'Kurunegala','Galgamuwa','Giriulla','Kuliyapitiya','Mawathagama','Narammala','Nikaweratiya','Pannala','Polgahawela','Wariyapola','Bingiriya','Alawwa','Maho','Melsiripura',
  // Puttalam District
  'Puttalam','Chilaw','Anamaduwa','Dankotuwa','Marawila','Nattandiya','Wennappuwa','Madampe','Kalpitiya',
  // Anuradhapura District
  'Anuradhapura','Eppawala','Galenbindunuwewa','Kekirawa','Medawachchiya','Mihintale','Thambuttegama','Galnewa','Nochchiyagama','Rambewa',
  // Polonnaruwa District
  'Polonnaruwa','Hingurakgoda','Kaduruwela','Medirigiriya','Dimbulagala','Welikanda',
  // Badulla District
  'Badulla','Bandarawela','Ella','Haputale','Mahiyanganaya','Passara','Welimada','Hali Ela','Diyatalawa','Uva Paranagama',
  // Monaragala District
  'Monaragala','Bibile','Buttala','Wellawaya','Medagama','Siyambalanduwa',
  // Ratnapura District
  'Ratnapura','Balangoda','Eheliyagoda','Embilipitiya','Kahawatta','Pelmadulla','Kuruwita','Godakawela',
  // Kegalle District
  'Kegalle','Mawanella','Rambukkana','Ruwanwella','Warakapola','Deraniyagala','Yatiyantota','Galigamuwa',
  'Other',
];

// ── PayHere JS SDK modal ─────────────────────────────────────────────────────
const PayHereModal = ({ data, onSuccess, onDismissed, onFail }) => {
  const didInit  = useRef(false);
  const [sdkState, setSdkState] = useState('loading');
  const [errMsg,   setErrMsg]   = useState('');

  const launch = () => {
    setSdkState('loading');
    setErrMsg('');

    const boot = () => {
      const ph = window.payhere;
      if (!ph) {
        setSdkState('error');
        setErrMsg('PayHere SDK did not initialise. Please try again.');
        return;
      }
      ph.onCompleted = (orderId) => onSuccess(orderId);
      ph.onDismissed = ()        => onDismissed();
      ph.onError     = (err)     => {
        setSdkState('error');
        setErrMsg(typeof err === 'string' ? err : 'A PayHere error occurred. Please try again.');
      };
      setSdkState('ready');
      ph.startPayment({
        sandbox:     data.sandbox === true,
        merchant_id: data.merchantId,
        return_url:  undefined,
        cancel_url:  undefined,
        notify_url:  data.notifyUrl,
        order_id:    data.orderId,
        items:       data.items,
        amount:      data.amount,
        currency:    data.currency,
        hash:        data.hash,
        first_name:  data.firstName,
        last_name:   data.lastName,
        email:       data.email,
        phone:       data.phone,
        address:     data.address,
        city:        data.city,
        country:     data.country,
      });
    };

    const old = document.getElementById('payhere-sdk');
    if (old) old.remove();
    delete window.payhere;

    const script   = document.createElement('script');
    script.id      = 'payhere-sdk';
    script.src     = 'https://www.payhere.lk/lib/payhere.js';
    script.async   = true;
    script.onload  = boot;
    script.onerror = () => {
      setSdkState('error');
      setErrMsg('Could not reach PayHere servers. Please check your internet and try again.');
    };
    document.head.appendChild(script);
  };

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    launch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (sdkState === 'loading' || sdkState === 'ready') return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">PayHere Could Not Load</h3>
        <p className="text-gray-500 text-sm mb-6">{errMsg}</p>
        <button
          onClick={() => { didInit.current = false; launch(); }}
          className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm mb-3 hover:bg-indigo-700 transition-colors"
        >
          Try Again
        </button>
        <button onClick={onFail} className="text-sm text-gray-400 hover:text-gray-600 underline">
          Cancel — I'll pay later from My Orders
        </button>
      </div>
    </div>
  );
};

// ── Stripe Card Modal ────────────────────────────────────────────────────────
// Uses Stripe.js loaded via CDN (no npm package needed)
const StripeCardModal = ({ clientSecret, publicKey, amount, currency, onSuccess, onCancel }) => {
  const cardRef      = useRef(null);
  const stripeRef    = useRef(null);
  const elementsRef  = useRef(null);
  const cardElRef    = useRef(null);
  const [cardError,  setCardError]  = useState('');
  const [processing, setProcessing] = useState(false);
  const [ready,      setReady]      = useState(false);

  useEffect(() => {
    // Load Stripe.js dynamically if not already present
    const loadStripe = () => {
      if (window.Stripe) return initStripe();
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.onload = initStripe;
      script.onerror = () => setCardError('Failed to load Stripe.js. Check your internet connection.');
      document.head.appendChild(script);
    };

    const initStripe = () => {
      try {
        stripeRef.current   = window.Stripe(publicKey);
        elementsRef.current = stripeRef.current.elements();
        const style = {
          base: {
            color: '#1a1a1a',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '16px',
            '::placeholder': { color: '#9ca3af' },
          },
          invalid: { color: '#ef4444' },
        };
        cardElRef.current = elementsRef.current.create('card', { style, hidePostalCode: true });
        cardElRef.current.mount(cardRef.current);
        cardElRef.current.on('ready', () => setReady(true));
        cardElRef.current.on('change', (e) => setCardError(e.error ? e.error.message : ''));
      } catch (err) {
        setCardError('Could not initialize Stripe. Please refresh and try again.');
      }
    };

    loadStripe();

    return () => {
      if (cardElRef.current) {
        try { cardElRef.current.unmount(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePay = async () => {
    if (!stripeRef.current || !cardElRef.current) return;
    setProcessing(true);
    setCardError('');
    try {
      const { error, paymentIntent } = await stripeRef.current.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElRef.current },
      });
      if (error) {
        setCardError(error.message);
        setProcessing(false);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess(paymentIntent.id);
      } else {
        setCardError('Payment not completed. Please try again.');
        setProcessing(false);
      }
    } catch (err) {
      setCardError('An unexpected error occurred. Please try again.');
      setProcessing(false);
    }
  };

  const sym = currency === 'LKR' ? 'Rs.' : currency;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Pay with Card</h3>
              <p className="text-xs text-gray-400">Secured by Stripe</p>
            </div>
          </div>
          <button onClick={onCancel} disabled={processing}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors disabled:opacity-50">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Amount */}
          <div className="bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-indigo-700 font-medium">Amount due</span>
            <span className="text-lg font-bold text-indigo-900">{sym} {Number(amount).toLocaleString()}</span>
          </div>

          {/* Card element */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Card details</label>
            <div
              ref={cardRef}
              className="border-2 border-gray-200 rounded-xl px-4 py-3.5 focus-within:border-indigo-500 transition-colors min-h-[50px]"
              style={{ background: ready ? '#fff' : '#f9fafb' }}
            />
            {!ready && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-400">Loading secure card form…</span>
              </div>
            )}
            {cardError && (
              <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                <span>⚠️</span> {cardError}
              </p>
            )}
          </div>

          {/* Test mode hint */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
            🧪 <strong>Test mode:</strong> Use card <span className="font-mono font-bold">4242 4242 4242 4242</span>, any future date, any CVC.
          </div>

          {/* Pay button */}
          <button
            onClick={handlePay}
            disabled={!ready || processing}
            className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing…
              </>
            ) : (
              <>🔒 Pay {sym} {Number(amount).toLocaleString()}</>
            )}
          </button>

          {/* Stripe branding */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <svg viewBox="0 0 60 25" className="h-5 fill-gray-400">
              <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 0 1 3.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.87zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.85zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.36 0 2.72.2 4.09.75v3.88a9.23 9.23 0 0 0-4.1-1.06c-.86 0-1.44.25-1.44.9 0 1.85 6.29.97 6.29 5.88z"/>
            </svg>
            Your payment is encrypted and secure
          </div>
        </div>
      </div>
    </div>
  );
};

// ── PayPal Modal ─────────────────────────────────────────────────────────────
// Uses PayPal JS SDK loaded via CDN
const PayPalModal = ({ clientId, amount, currency, orderId, onSuccess, onCancel }) => {
  const containerRef = useRef(null);
  const [sdkReady,   setSdkReady]   = useState(false);
  const [sdkError,   setSdkError]   = useState('');
  const [rendered,   setRendered]   = useState(false);

  const currencyCode = currency || 'USD';
  const amountValue  = parseFloat(amount).toFixed(2);

  useEffect(() => {
    const existingScript = document.getElementById('paypal-sdk');
    const initButtons = () => {
      setSdkReady(true);
    };

    if (window.paypal) {
      setSdkReady(true);
      return;
    }

    if (existingScript) {
      existingScript.addEventListener('load', initButtons);
      return () => existingScript.removeEventListener('load', initButtons);
    }

    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currencyCode}&intent=capture`;
    script.onload  = initButtons;
    script.onerror = () => setSdkError('Failed to load PayPal SDK. Check your internet connection.');
    document.head.appendChild(script);

    return () => script.removeEventListener('load', initButtons);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render PayPal buttons once SDK is ready and container is mounted
  useEffect(() => {
    if (!sdkReady || !containerRef.current || rendered) return;
    setRendered(true);

    try {
      window.paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
        createOrder: (data, actions) => {
          return actions.order.create({
            purchase_units: [{
              reference_id: orderId,
              amount: { value: amountValue, currency_code: currencyCode },
            }],
          });
        },
        onApprove: async (data, actions) => {
          try {
            const details = await actions.order.capture();
            onSuccess(details.id);
          } catch (err) {
            setSdkError('Payment capture failed. Please try again.');
          }
        },
        onError: (err) => {
          console.error('PayPal error:', err);
          setSdkError('PayPal encountered an error. Please try again.');
        },
        onCancel: () => {
          onCancel();
        },
      }).render(containerRef.current);
    } catch (err) {
      setSdkError('Could not render PayPal buttons. Please refresh and try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady]);

  const sym = currencyCode === 'LKR' ? 'Rs.' : currencyCode;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#003087] flex items-center justify-center">
              <span className="text-white font-bold text-sm">PP</span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Pay with PayPal</h3>
              <p className="text-xs text-gray-400">Secure PayPal checkout</p>
            </div>
          </div>
          <button onClick={onCancel}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Amount */}
          <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-blue-700 font-medium">Amount due</span>
            <span className="text-lg font-bold text-blue-900">{sym} {Number(amount).toLocaleString()}</span>
          </div>

          {sdkError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              ⚠️ {sdkError}
            </div>
          )}

          {!sdkReady && !sdkError && (
            <div className="flex items-center justify-center gap-3 py-8">
              <div className="w-5 h-5 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Loading PayPal…</span>
            </div>
          )}

          {/* PayPal buttons container */}
          <div ref={containerRef} className={sdkReady && !sdkError ? '' : 'hidden'} />

          <p className="text-xs text-center text-gray-400">
            You'll be redirected within the PayPal popup to complete payment.
          </p>
        </div>
      </div>
    </div>
  );
};

const F = ({ label, value, onChange, type = 'text', required, placeholder, col2 }) => (
  <div className={col2 ? 'sm:col-span-2' : ''}>
    <label className="form-label">{label} {required && <span className="text-red-500">*</span>}</label>
    <input type={type} value={value} onChange={onChange} required={required} placeholder={placeholder} className="form-input" />
  </div>
);

export default function Checkout() {
  const { items, subtotal, clearCart, effectivePrice } = useCart();
  useSEO({ title: 'Checkout', noindex: true });
  const { user }     = useAuth();
  const { settings } = useTheme();
  const { campaign } = useSeasonal();
  const navigate     = useNavigate();

  const sym = settings?.currencySymbol || 'Rs.';

  const orderPlaced        = useRef(false);
  // submitting is a synchronous ref-based lock that blocks double-submit
  // before setLoading(true) has a chance to re-render the disabled button.
  // It is reset in the catch block so the user can retry after an error.
  const submitting         = useRef(false);
  const [loading,          setLoading]          = useState(false);
  const [couponCode,       setCouponCode]       = useState('');
  const [couponData,       setCouponData]       = useState(null);
  const [couponLoading,    setCouponLoading]    = useState(false);
  const [giftCardCode,     setGiftCardCode]     = useState('');
  const [giftCardData,     setGiftCardData]     = useState(null);
  const [giftCardLoading,  setGiftCardLoading]  = useState(false);
  const [shipDiff,         setShipDiff]         = useState(false);
  const [paymentMethod,    setPaymentMethod]    = useState('');
  const [agreedTerms,      setAgreedTerms]      = useState(false);
  const [notes,            setNotes]            = useState('');
  const [gateways,         setGateways]         = useState([]);
  const [deliveryServices, setDeliveryServices] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState('');
  const [payHereData,      setPayHereData]      = useState(null);
  const [pendingBankOrder, setPendingBankOrder] = useState(null);
  const [slipFile,         setSlipFile]         = useState(null);
  const [slipPreview,      setSlipPreview]      = useState(null);
  const [slipUploading,    setSlipUploading]    = useState(false);

  // ── NEW: Stripe / PayPal modal state ────────────────────────────────────────
  const [stripeModal,   setStripeModal]   = useState(null); // { clientSecret, publicKey, amount, currency, orderId }
  const [paypalModal,   setPaypalModal]   = useState(null); // { clientId, amount, currency, orderId }
  // ────────────────────────────────────────────────────────────────────────────

  const [billing, setBilling] = useState(() => {
    try {
      const saved = sessionStorage.getItem('checkout_state');
      if (saved) return JSON.parse(saved).billing;
    } catch {}
    return {
      firstName: user?.firstName || '', lastName: user?.lastName || '',
      country: 'Sri Lanka', street: '', city: '',
      phone: user?.phone || '', email: user?.email || '',
    };
  });

  const [shipping, setShipping] = useState(() => {
    try {
      const saved = sessionStorage.getItem('checkout_state');
      if (saved) return JSON.parse(saved).shipping;
    } catch {}
    return { firstName: '', lastName: '', country: 'Sri Lanka', street: '', city: '', phone: '' };
  });

  useEffect(() => {
    if (items.length === 0 && !orderPlaced.current) navigate('/cart');
  }, [items, navigate]);

  // Restore saved checkout state
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('checkout_state');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.couponCode)       setCouponCode(s.couponCode);
      if (s.couponData)       setCouponData(s.couponData);
      if (s.notes)            setNotes(s.notes);
      if (s.shipDiff)         setShipDiff(s.shipDiff);
      if (s.paymentMethod)    setPaymentMethod(s.paymentMethod);
      if (s.selectedDelivery) setSelectedDelivery(s.selectedDelivery);
      if (s.agreedTerms)      setAgreedTerms(s.agreedTerms);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load payment gateways and delivery services
  useEffect(() => {
    API.get('/payments/gateways').then(r => setGateways(r.data || [])).catch(() => {});
    API.get('/delivery').then(r => {
      const svcs = r.data?.services || r.data || [];
      setDeliveryServices(svcs);
      if (svcs.length > 0) setSelectedDelivery(svcs[0].code);
    }).catch(() => {});
  }, []);

  // Some delivery services (e.g. PickMe Flash) don't support Cash on Delivery.
  // Admin can configure this per-service in 🚚 Delivery settings.
  const selectedDeliveryServiceForCOD = deliveryServices.find(s => s.code === selectedDelivery) || null;
  const codAllowedForDelivery = selectedDeliveryServiceForCOD ? selectedDeliveryServiceForCOD.codAllowed !== false : true;
  const codEnabled = settings?.codEnabled !== false && codAllowedForDelivery;

  // Default payment method
  useEffect(() => {
    if (paymentMethod) return;
    if (settings?.bankTransferEnabled !== false) { setPaymentMethod('bank_transfer'); return; }
    if (codEnabled)          { setPaymentMethod('cod'); return; }
    if (gateways.length > 0)                     setPaymentMethod(gateways[0].gateway);
  }, [settings, gateways, paymentMethod, codEnabled]);

  // Pre-fill billing from saved address
  useEffect(() => {
    if (!user) return;
    if (sessionStorage.getItem('checkout_state')) return;
    API.get('/auth/me').then(r => {
      const profile     = r.data;
      const defaultAddr = profile?.addresses?.find(a => a.isDefault) || profile?.addresses?.[0];
      setBilling(prev => ({
        ...prev,
        firstName: prev.firstName || profile.firstName || '',
        lastName:  prev.lastName  || profile.lastName  || '',
        phone:     prev.phone     || profile.phone      || '',
        email:     prev.email     || profile.email      || '',
        country:   defaultAddr?.country || prev.country,
        street:    prev.street || defaultAddr?.street   || '',
        city:      prev.city   || defaultAddr?.city     || '',
      }));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Pre-fill coupon from seasonal campaign
  useEffect(() => {
    if (campaign?.couponCode && !couponCode) setCouponCode(campaign.couponCode);
  }, [campaign, couponCode]);

  // ── Pricing via DiscountEngine — single source of truth ─────────────────────
  const selectedDeliveryService = deliveryServices.find(s => s.code === selectedDelivery) || null;
  const deliveryFee  = resolveDeliveryFee(selectedDeliveryService, billing?.city || '', subtotal, settings);
  const benefit      = resolveBenefit(couponData, giftCardData, subtotal, deliveryFee);
  const totals       = computeTotals({ subtotal, deliveryFee, couponData, giftCardData });

  // If the customer has COD selected and then picks a delivery service that
  // doesn't allow COD, automatically move them to another payment method.
  useEffect(() => {
    if (paymentMethod === 'cod' && !codAllowedForDelivery) {
      if (settings?.bankTransferEnabled !== false)      setPaymentMethod('bank_transfer');
      else if (gateways.length > 0)                     setPaymentMethod(gateways[0].gateway);
      else                                               setPaymentMethod('');
      toast.error(`${selectedDeliveryService?.name || 'This delivery option'} doesn't support Cash on Delivery — please choose another payment method.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDelivery, codAllowedForDelivery]);

  // Derived display helpers
  const couponDiscount    = totals.couponDiscount;
  const giftCardDeduction = totals.giftCardDeduction;
  const total             = totals.total;
  const isCouponActive    = benefit.couponDiscount > 0;
  const isGiftCardActive  = benefit.giftCardDeduction > 0;

  // ── Coupon apply ─────────────────────────────────────────────────────────────
  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const categoryIds = [...new Set(items.flatMap(i => [i.category?._id || i.category, i.subCategory?._id || i.subCategory]).filter(Boolean).map(String))];
      const productIds  = items.map(i => String(i._id));
      const brands      = [...new Set(items.map(i => i.brand).filter(Boolean))];

      const { data } = await API.post('/coupons/validate', {
        code: couponCode.toUpperCase(),
        orderAmount: subtotal,
        userId: user?._id,
        email: billing?.email,
        categoryIds,
        productIds,
        brands,
        items: items.map(i => ({ productId: String(i._id), quantity: i.quantity })),
      });
      setCouponData(data);

      if (giftCardData) {
        toast.success(`✅ Coupon applied! ${sym} ${data.discount.toLocaleString()} off — gift card will cover the rest`);
      } else {
        toast.success(`✅ Coupon applied! ${sym} ${data.discount.toLocaleString()} discount`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid coupon');
      setCouponData(null);
    } finally { setCouponLoading(false); }
  };

  // ── Gift card apply ───────────────────────────────────────────────────────────
  const applyGiftCard = async () => {
    if (!giftCardCode.trim()) return;
    setGiftCardLoading(true);
    try {
      const { data } = await API.post('/gift-cards/validate', { code: giftCardCode.toUpperCase() });
      setGiftCardData(data);

      if (couponData) {
        const remaining = Math.max(0, subtotal - (couponData.discount || 0) + deliveryFee);
        const covered   = Math.min(data.balance, remaining);
        toast.success(`🎁 Gift card applied! Covers ${sym} ${covered.toLocaleString()} after coupon`);
      } else {
        toast.success(`🎁 Gift card applied! Balance: ${sym} ${data.balance.toLocaleString()}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid gift card');
      setGiftCardData(null);
    } finally { setGiftCardLoading(false); }
  };

  // ── Place order ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Synchronous double-submit guard — ref check is instant, before React
    // re-renders from setLoading(true). Prevents duplicate Purchase events
    // from fast double-click or React StrictMode double-invocation.
    if (submitting.current) return;
    submitting.current = true;
    if (!agreedTerms)                    { submitting.current = false; toast.error('Please agree to terms and conditions'); return; }
    if (total > 0 && !paymentMethod)     { submitting.current = false; toast.error('Please select a payment method'); return; }

    if (!user) {
      try {
        sessionStorage.setItem('checkout_state', JSON.stringify({
          billing, shipping, couponCode, couponData,
          notes, shipDiff, paymentMethod, selectedDelivery, agreedTerms,
        }));
      } catch {}
      navigate('/register', {
        state: {
          fromCheckout: true,
          prefill: {
            firstName: billing.firstName, lastName: billing.lastName,
            email: billing.email,         phone: billing.phone,
          },
        },
      });
      return;
    }

    setLoading(true);
    try {
      const effectivePaymentMethod = total === 0 ? 'free' : paymentMethod;

      const orderData = {
        items: items.map(i => ({ productId: i._id, name: i.name, quantity: i.quantity })),
        billing,
        shipping: shipDiff ? shipping : billing,
        shipToDifferentAddress: shipDiff,
        paymentMethod: effectivePaymentMethod,
        couponCode:  couponData   ? couponCode   : undefined,
        giftCard:    giftCardData ? giftCardCode : undefined,
        notes,
        deliveryService: selectedDelivery || undefined,
      };

      // ── Handle PayHere — get hash from backend WITHOUT creating the order yet ──
      // The order is only created in onSuccess after PayHere confirms payment.
      if (effectivePaymentMethod === 'payhere') {
        try {
          const phRes = await API.post('/payments/payhere/preflight', {
            amount:       total,
            currency:     settings?.currency || 'LKR',
            customerName: `${billing.firstName} ${billing.lastName}`,
            email:   billing.email,
            phone:   billing.phone,
            address: billing.street,
            city:    billing.city,
            country: billing.country,
          });
          // Store full orderData so we can create the order in onSuccess
          phRes.data._pendingOrderData = orderData;
          setPayHereData(phRes.data);
          setLoading(false);
          return;
        } catch (err) {
          toast.error(err.response?.data?.message || 'Could not initialise PayHere. Please try again.');
          setLoading(false);
          return;
        }
      }

      // ── Stripe — get payment intent WITHOUT creating order yet ─────────────
      if (effectivePaymentMethod === 'stripe') {
        try {
          // Get amount estimate from totals (already computed in frontend)
          const intentRes = await API.post('/payments/stripe/create-intent', {
            amount:   total,
            currency: (settings?.currency || 'USD').toLowerCase(),
          });
          setStripeModal({
            clientSecret:    intentRes.data.clientSecret,
            publicKey:       intentRes.data.publicKey,
            amount:          total,
            currency:        settings?.currency || 'USD',
            pendingOrderData: orderData,
          });
          setLoading(false);
          return;
        } catch (intentErr) {
          toast.error(intentErr.response?.data?.message || 'Could not initialise Stripe. Please try again.');
          setLoading(false);
          return;
        }
      }

      // ── PayPal — show buttons WITHOUT creating order yet ─────────────────────
      if (effectivePaymentMethod === 'paypal') {
        const gwInfo = gateways.find(g => g.gateway === 'paypal');
        if (!gwInfo?.publicKey) {
          toast.error('PayPal is not properly configured. Please contact the store admin.');
          setLoading(false);
          return;
        }
        setPaypalModal({
          clientId:         gwInfo.publicKey,
          amount:           total,
          currency:         settings?.currency || 'USD',
          pendingOrderData: orderData,
        });
        setLoading(false);
        return;
      }

      // ── COD / bank_transfer / free — create order now ────────────────────────
      const _purchaseEventId = generateEventId('Purchase', Date.now());
      const { fbp: _fbp, fbc: _fbc } = getFbCookies();
      const { data } = await API.post('/orders', {
        ...orderData,
        metaEventId: _purchaseEventId,
        fbp: _fbp,
        fbc: _fbc,
      });

      if (user) {
        API.put('/auth/profile', {
          defaultAddress: { country: billing.country, street: billing.street, city: billing.city },
        }).catch(() => {});
      }

      orderPlaced.current = true;
      applyAdvancedMatching(billing);
      // Normalise order object: POST /orders returns { orderId, orderNumber, total, paymentMethod }
      // trackPurchase needs ._id and .total — map orderId → _id for consistency.
      const _orderForTracking = { ...data, _id: data._id || data.orderId };
      // Store eventId so OrderSuccess.js knows Checkout already fired this Purchase.
      sessionStorage.setItem(`sz_purchase_eid_${_orderForTracking._id}`, _purchaseEventId);
      // Items fallback: cart items have _id = product _id and productId = product _id
      const _itemsForTracking = data.items || items.map(i => ({ product: { _id: i._id || i.productId }, name: i.name, price: i.price, quantity: i.quantity }));
      trackPurchase(_orderForTracking, _itemsForTracking, { billing, eventId: _purchaseEventId });
      clearCart();
      sessionStorage.removeItem('checkout_state');

      if (effectivePaymentMethod === 'bank_transfer') {
        setPendingBankOrder({ orderId: data.orderId, orderNumber: data.orderNumber, total: data.total });
        setLoading(false);
        return;
      }

      navigate(`/my-orders?new=${data.orderId}`);
    } catch (err) {
      submitting.current = false; // allow retry after error
      toast.error(err.response?.data?.message || 'Order failed. Please try again.');
    } finally { setLoading(false); }
  };

  // ── Stripe success — create order with paymentReference ──────────────────────
  const handleStripeSuccess = async (paymentIntentId) => {
    const pendingData = stripeModal.pendingOrderData;
    setStripeModal(null);
    try {
      const _stripeEventId = generateEventId('Purchase', paymentIntentId);
      const { fbp: _fbp, fbc: _fbc } = getFbCookies();
      const { data } = await API.post('/orders', {
        ...pendingData,
        paymentReference: paymentIntentId,
        metaEventId: _stripeEventId,
        fbp: _fbp,
        fbc: _fbc,
      });
      if (user) API.put('/auth/profile', { defaultAddress: { country: billing.country, street: billing.street, city: billing.city } }).catch(() => {});
      orderPlaced.current = true;
      applyAdvancedMatching(billing);
      const _stripeOrderTracking = { ...data, _id: data._id || data.orderId };
      sessionStorage.setItem(`sz_purchase_eid_${_stripeOrderTracking._id}`, _stripeEventId);
      // POST /orders returns { orderId, orderNumber, total } — no items array.
      // Fall back to cart items shaped as order items so contentIds are never empty.
      const _stripeItems = data.items || (pendingData.items || []).map(i => ({
        product: { _id: i.productId || i._id },
        name: i.name, price: i.price, quantity: i.quantity,
      }));
      trackPurchase(_stripeOrderTracking, _stripeItems, { billing, eventId: _stripeEventId });
      clearCart();
      sessionStorage.removeItem('checkout_state');
      toast.success('✅ Payment successful!');
      navigate(`/my-orders?new=${data.orderId}&payment=stripe`);
    } catch (err) {
      toast.error('Payment received but order failed. Please contact support.');
      navigate('/my-orders');
    }
  };

  // ── PayPal success — create order with paymentReference ──────────────────────
  const handlePayPalSuccess = async (captureId) => {
    const pendingData = paypalModal.pendingOrderData;
    setPaypalModal(null);
    try {
      const _ppEventId = generateEventId('Purchase', captureId);
      const { fbp: _fbp, fbc: _fbc } = getFbCookies();
      const { data } = await API.post('/orders', {
        ...pendingData,
        paymentReference: captureId,
        metaEventId: _ppEventId,
        fbp: _fbp,
        fbc: _fbc,
      });
      if (user) API.put('/auth/profile', { defaultAddress: { country: billing.country, street: billing.street, city: billing.city } }).catch(() => {});
      orderPlaced.current = true;
      applyAdvancedMatching(billing);
      const _ppOrderTracking = { ...data, _id: data._id || data.orderId };
      sessionStorage.setItem(`sz_purchase_eid_${_ppOrderTracking._id}`, _ppEventId);
      const _ppItems = data.items || (pendingData.items || []).map(i => ({
        product: { _id: i.productId || i._id },
        name: i.name, price: i.price, quantity: i.quantity,
      }));
      trackPurchase(_ppOrderTracking, _ppItems, { billing, eventId: _ppEventId });
      clearCart();
      sessionStorage.removeItem('checkout_state');
      toast.success('✅ PayPal payment successful!');
      navigate(`/my-orders?new=${data.orderId}&payment=paypal`);
    } catch (err) {
      toast.error('Payment received but order failed. Please contact support.');
      navigate('/my-orders');
    }
  };

  const hasAnyPayment = settings?.bankTransferEnabled !== false || codEnabled || gateways.length > 0;

  // ── Slip upload ───────────────────────────────────────────────────────────────
  const handleSlipChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSlipFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSlipPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSlipUpload = async (skip = false) => {
    if (!pendingBankOrder) return;
    if (!skip && slipFile) {
      setSlipUploading(true);
      try {
        const formData = new FormData();
        formData.append('slip', slipFile);
        await API.post(`/orders/${pendingBankOrder.orderId}/payment-slip`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success("✅ Payment slip uploaded! We'll verify it shortly.");
      } catch (err) {
        toast.error(err.response?.data?.message || 'Slip upload failed. You can upload it later from your account.');
      } finally { setSlipUploading(false); }
    }
    navigate(`/my-orders?new=${pendingBankOrder.orderId}&payment=bank_transfer`);
  };

  // ── Bank transfer slip screen ─────────────────────────────────────────────────
  if (pendingBankOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--body-bg)' }}>
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8" style={{ background: 'var(--card-bg)' }}>
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--theme-gradient)' }}>
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Order Placed!</h2>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Order #{pendingBankOrder.orderNumber}</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
              Total: {settings?.currencySymbol || 'Rs.'} {pendingBankOrder.total?.toLocaleString()}
            </p>
          </div>

          <div className="rounded-2xl p-4 mb-6 text-sm space-y-1.5" style={{ background: 'var(--body-bg)', border: '1px solid var(--border-color)' }}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>📋 Bank Transfer Details</p>
            {settings?.bankName          && <p style={{ color: 'var(--text-secondary)' }}><span className="font-medium" style={{ color: 'var(--text-primary)' }}>Bank:</span> {settings.bankName}</p>}
            {settings?.bankAccountName   && <p style={{ color: 'var(--text-secondary)' }}><span className="font-medium" style={{ color: 'var(--text-primary)' }}>Account:</span> {settings.bankAccountName}</p>}
            {settings?.bankAccountNumber && <p style={{ color: 'var(--text-secondary)' }}><span className="font-medium" style={{ color: 'var(--text-primary)' }}>Number:</span> <span className="font-mono font-black">{settings.bankAccountNumber}</span></p>}
            {settings?.bankBranch        && <p style={{ color: 'var(--text-secondary)' }}><span className="font-medium" style={{ color: 'var(--text-primary)' }}>Branch:</span> {settings.bankBranch}</p>}
            <p className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
              Use <strong style={{ color: 'var(--text-primary)' }}>{pendingBankOrder.orderNumber}</strong> as the transfer reference.
            </p>
          </div>

          <div className="mb-6">
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>📎 Upload Payment Slip <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>(optional — speeds up confirmation)</span></p>
            {slipPreview ? (
              <div className="relative rounded-2xl overflow-hidden border-2 mb-3" style={{ borderColor: 'var(--color-primary)' }}>
                <img src={slipPreview} alt="Payment slip" className="w-full object-contain max-h-48" />
                <button onClick={() => { setSlipFile(null); setSlipPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-600">✕</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 cursor-pointer transition-colors hover:opacity-80" style={{ borderColor: 'var(--border-color)', background: 'var(--body-bg)' }}>
                <svg className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Click to select image or PDF</span>
                <input type="file" accept="image/*,application/pdf" onChange={handleSlipChange} className="hidden" />
              </label>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button onClick={() => handleSlipUpload(false)} disabled={slipUploading}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-opacity disabled:opacity-60"
              style={{ background: 'var(--theme-gradient)' }}>
              {slipUploading ? 'Uploading…' : slipFile ? '📤 Upload Slip & Continue' : 'Continue Without Slip'}
            </button>
            {slipFile && (
              <button onClick={() => handleSlipUpload(true)} className="w-full py-3 rounded-2xl text-sm font-medium" style={{ color: 'var(--text-secondary)', background: 'var(--body-bg)' }}>
                Skip — I'll send it later
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main checkout form ────────────────────────────────────────────────────────
  return (
    <div className="checkout-page max-w-7xl mx-auto px-4 sm:px-6 py-8" style={{ background: 'var(--body-bg)', width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box' }}>
      {/* ── Self-contained responsive rules — work even if Tailwind utilities fail to compile ── */}
      <style>{`
        html, body { overflow-x: hidden; max-width: 100%; }
        .checkout-page { width: 100%; box-sizing: border-box; }
        .checkout-page *, .checkout-page *::before, .checkout-page *::after { box-sizing: border-box; }
        .checkout-fields {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          width: 100%;
        }
        @media (min-width: 640px) {
          .checkout-fields { grid-template-columns: 1fr 1fr; }
        }
        .checkout-fields > * { min-width: 0; width: 100%; }
        .checkout-fields .field-full { grid-column: 1 / -1; }
        .checkout-page input.form-input,
        .checkout-page select.form-input,
        .checkout-page textarea.form-input {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .checkout-page .btn-primary {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .checkout-card {
          width: 100%;
          box-sizing: border-box;
        }
      `}</style>
      {/* Payment modals */}
      {payHereData && (
        <PayHereModal
          data={payHereData}
          onSuccess={async (phOrderId) => {
            try {
              // Now create the order — payment is already confirmed by PayHere
              const pendingData = payHereData._pendingOrderData;
              const _phEventId = generateEventId('Purchase', phOrderId);
              const { fbp: _phFbp, fbc: _phFbc } = getFbCookies();
              const { data: orderResult } = await API.post('/orders', {
                ...pendingData,
                paymentReference: phOrderId,
                paymentStatus: 'paid',
                metaEventId: _phEventId,
                fbp: _phFbp,
                fbc: _phFbc,
              });
              API.put('/auth/profile', {
                defaultAddress: { country: billing.country, street: billing.street, city: billing.city },
              }).catch(() => {});
              orderPlaced.current = true;
              applyAdvancedMatching(billing);
              // Store eventId so OrderSuccess.js knows Checkout already fired Purchase
              const _phOrderTracking = { ...orderResult, _id: orderResult._id || orderResult.orderId };
              sessionStorage.setItem(`sz_purchase_eid_${_phOrderTracking._id}`, _phEventId);
              const _phItems = orderResult.items || (pendingData.items || []).map(i => ({
                product: { _id: i.productId || i._id },
                name: i.name, price: i.price, quantity: i.quantity,
              }));
              trackPurchase(_phOrderTracking, _phItems, { billing, eventId: _phEventId });
              clearCart();
              sessionStorage.removeItem('checkout_state');
              setPayHereData(null);
              toast.success('✅ Payment successful!');
              navigate(`/my-orders?new=${orderResult.orderId}&payment=payhere`);
            } catch (err) {
              // Payment succeeded but order creation failed — still clear cart, show message
              orderPlaced.current = true;
              clearCart();
              sessionStorage.removeItem('checkout_state');
              setPayHereData(null);
              toast.success('✅ Payment received! Your order is being confirmed.');
              navigate('/my-orders');
            }
          }}
          onDismissed={() => {
            setPayHereData(null);
            toast('Payment cancelled. Nothing was charged.', { icon: 'ℹ️' });
          }}
          onFail={() => {
            setPayHereData(null);
            toast.error('PayHere could not load. Please try again.');
          }}
        />
      )}
      {stripeModal && (
        <StripeCardModal
          clientSecret={stripeModal.clientSecret}
          publicKey={stripeModal.publicKey}
          amount={stripeModal.amount}
          currency={stripeModal.currency}
          onSuccess={handleStripeSuccess}
          onCancel={() => {
            setStripeModal(null);
            toast('Payment cancelled. Nothing was charged.', { icon: 'ℹ️' });
            // No order was created — just stay on checkout
          }}
        />
      )}
      {paypalModal && (
        <PayPalModal
          clientId={paypalModal.clientId}
          amount={paypalModal.amount}
          currency={paypalModal.currency}
          orderId={null}
          onSuccess={handlePayPalSuccess}
          onCancel={() => {
            setPaypalModal(null);
            toast('Payment cancelled. Nothing was charged.', { icon: 'ℹ️' });
            // No order was created — just stay on checkout
          }}
        />
      )}

      <nav className="text-sm text-gray-500 flex items-center gap-2 mb-2">
        <Link to="/" style={{ color: 'var(--color-primary)' }}>Home</Link><span>/</span>
        <Link to="/cart" style={{ color: 'var(--color-primary)' }}>Cart</Link><span>/</span>
        <span className="text-gray-800 font-medium">Checkout</span>
      </nav>
      <h1 className="text-3xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'var(--font-display)' }}>Checkout</h1>

      {/* Seasonal coupon banner */}
      {campaign?.couponCode && (
        <div className="rounded-xl p-3 mb-6 flex items-center gap-3 text-white text-sm" style={{ background: 'var(--theme-gradient)' }}>
          <span className="text-lg">🎉</span>
          <span><strong>{campaign.name}</strong> — Use code <strong className="font-mono bg-white/20 px-1.5 rounded">{campaign.couponCode}</strong> for {campaign.discountPercent > 0 ? `${campaign.discountPercent}% off` : 'a discount'}!</span>
          <button type="button" onClick={() => applyCoupon()} className="ml-auto bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-semibold">Apply</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid lg:grid-cols-3 gap-8">
          {/* LEFT — Billing */}
          <div className="lg:col-span-2 space-y-5" style={{ width: '100%', minWidth: 0 }}>
            <div className="checkout-card rounded-2xl border border-gray-100 p-6" style={{ background: 'var(--card-bg)' }}>
              <h2 className="text-xl font-bold text-gray-900 mb-5" style={{ fontFamily: 'var(--font-display)' }}>Billing Details</h2>
              <div className="checkout-fields grid sm:grid-cols-2 gap-4">
                <F label="First name" value={billing.firstName} onChange={e => setBilling(p => ({ ...p, firstName: e.target.value }))} required />
                <F label="Last name"  value={billing.lastName}  onChange={e => setBilling(p => ({ ...p, lastName:  e.target.value }))} required />
                <div className="field-full sm:col-span-2">
                  <label className="form-label">Country <span className="text-red-500">*</span></label>
                  <select value={billing.country} onChange={e => setBilling(p => ({ ...p, country: e.target.value, city: '' }))} required className="form-input">
                    {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field-full sm:col-span-2">
                  <label className="form-label">Street address <span className="text-red-500">*</span></label>
                  <input value={billing.street} onChange={e => setBilling(p => ({ ...p, street: e.target.value }))} required className="form-input" placeholder="House number and street name" />
                </div>
                <div className="field-full sm:col-span-2">
                  <label className="form-label">Town / City <span className="text-red-500">*</span></label>
                  {billing.country === 'Sri Lanka' ? (
                    <select value={billing.city} onChange={e => setBilling(p => ({ ...p, city: e.target.value }))} required className="form-input">
                      <option value="">Select city…</option>
                      {SL_CITIES.map(d => <option key={d}>{d}</option>)}
                    </select>
                  ) : (
                    <input value={billing.city} onChange={e => setBilling(p => ({ ...p, city: e.target.value }))} required className="form-input" placeholder="Your city" />
                  )}
                </div>
                <div>
                  <label className="form-label">Phone <span className="text-red-500">*</span></label>
                  <input type="tel" value={billing.phone} onChange={e => setBilling(p => ({ ...p, phone: e.target.value }))} required className="form-input" placeholder="+94 7X XXX XXXX" />
                </div>
                <F label="Email" type="email" value={billing.email} onChange={e => setBilling(p => ({ ...p, email: e.target.value }))} required />
              </div>
            </div>

            {/* Ship to different address */}
            <div className="checkout-card rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--card-bg)' }}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={shipDiff} onChange={e => setShipDiff(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor: 'var(--color-primary)' }} />
                <span className="font-semibold text-gray-800 text-sm">Ship to a different address?</span>
              </label>
              {shipDiff && (
                <div className="checkout-fields grid sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-gray-100">
                  <F label="First name" value={shipping.firstName} onChange={e => setShipping(p => ({ ...p, firstName: e.target.value }))} required />
                  <F label="Last name"  value={shipping.lastName}  onChange={e => setShipping(p => ({ ...p, lastName:  e.target.value }))} required />
                  <div className="field-full sm:col-span-2">
                    <label className="form-label">Country</label>
                    <select value={shipping.country} onChange={e => setShipping(p => ({ ...p, country: e.target.value }))} className="form-input">
                      {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field-full sm:col-span-2"><label className="form-label">Street address</label><input value={shipping.street} onChange={e => setShipping(p => ({ ...p, street: e.target.value }))} required className="form-input" /></div>
                  <div className="field-full sm:col-span-2"><label className="form-label">City</label><input value={shipping.city} onChange={e => setShipping(p => ({ ...p, city: e.target.value }))} required className="form-input" /></div>
                  <div><label className="form-label">Phone</label><input type="tel" value={shipping.phone} onChange={e => setShipping(p => ({ ...p, phone: e.target.value }))} className="form-input" /></div>
                </div>
              )}
            </div>

            {/* Order Notes */}
            <div className="checkout-card rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--card-bg)' }}>
              <label className="form-label">Order notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Special delivery instructions…" className="form-input resize-none" />
            </div>
          </div>

          {/* RIGHT — Order Summary + Payment */}
          <div className="space-y-4" style={{ width: '100%', minWidth: 0 }}>
            {/* Order Items */}
            <div className="checkout-card rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--card-bg)' }}>
              <h2 className="text-lg font-bold text-gray-900 mb-4" style={{ fontFamily: 'var(--font-display)' }}>Your Order</h2>
              <div className="space-y-3 mb-4 pb-4 border-b border-gray-100">
                {items.map(item => (
                  <div key={item._id} className="flex items-center gap-3">
                    <img src={item.thumbnail || item.images?.[0] || 'https://via.placeholder.com/48'} alt={item.name} className="w-11 h-11 rounded-lg object-cover bg-gray-50 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">× {item.quantity}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{sym} {(effectivePrice(item) * item.quantity).toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {/* Price breakdown */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-semibold">{sym} {subtotal.toLocaleString()}</span>
                </div>

                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span className="flex items-center gap-1">
                      🏷️ Coupon ({couponCode})
                      <button type="button" onClick={() => { setCouponData(null); setCouponCode(''); }} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>
                    </span>
                    <span>−{sym} {couponDiscount.toLocaleString()}</span>
                  </div>
                )}

                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span className={deliveryFee === 0 ? 'text-green-600 font-semibold' : ''}>
                    {deliveryFee === 0 ? 'FREE 🎉' : `${sym} ${deliveryFee.toLocaleString()}`}
                  </span>
                </div>

                {giftCardDeduction > 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span className="flex items-center gap-1">
                      🎁 Gift Card (payment)
                      <button type="button" onClick={() => { setGiftCardData(null); setGiftCardCode(''); }} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>
                    </span>
                    <span>−{sym} {giftCardDeduction.toLocaleString()}</span>
                  </div>
                )}

                <div className="flex justify-between text-base font-bold text-gray-900 pt-3 border-t border-gray-100">
                  <span>Total</span>
                  <span style={{ color: 'var(--color-primary)' }}>{sym} {total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Delivery Service Selection */}
            {deliveryServices.length > 0 && (
              <div className="checkout-card rounded-2xl border border-gray-100 p-4" style={{ background: 'var(--card-bg)' }}>
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">🚚 Delivery Method</h3>
                <div className="space-y-2">
                  {deliveryServices.map(svc => {
                    const fee = resolveDeliveryFee(svc, billing?.city || '', subtotal, settings);
                    const rate = (() => {
                      const cl = (billing?.city || '').toLowerCase();
                      if (cl && svc.zoneRates?.length > 0) {
                        const zr = svc.zoneRates.find(r => r.zones?.some(z => z.toLowerCase() === cl || cl.includes(z.toLowerCase())));
                        if (zr) return zr;
                      }
                      return svc.rates?.[0];
                    })();
                    const eta = rate?.estimatedDays || svc.estimatedDays || '';
                    return (
                      <label key={svc.code}
                        className={`flex items-start justify-between gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedDelivery === svc.code ? 'bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                        style={selectedDelivery === svc.code ? { borderColor: 'var(--color-primary)', width: '100%', boxSizing: 'border-box' } : { width: '100%', boxSizing: 'border-box' }}>
                        <div className="flex items-start gap-2" style={{ minWidth: 0, flex: 1 }}>
                          <input type="radio" name="delivery" value={svc.code} checked={selectedDelivery === svc.code} onChange={() => setSelectedDelivery(svc.code)} style={{ accentColor: 'var(--color-primary)', marginTop: '2px', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <p className="text-sm font-semibold text-gray-800" style={{ overflowWrap: 'break-word' }}>{svc.name}</p>
                            {eta && <p className="text-xs text-gray-500">🕐 {eta}</p>}
                            {svc.coverageAreas && <p className="text-xs text-gray-400" style={{ overflowWrap: 'break-word' }}>{svc.coverageAreas}</p>}
                            {rate?.freeAbove > 0 && subtotal < rate.freeAbove && (
                              <p className="text-xs text-primary font-medium mt-0.5">
                                Add {sym} {(rate.freeAbove - subtotal).toLocaleString()} more for free delivery
                              </p>
                            )}
                            {svc.deliveryNote && <p className="text-xs text-amber-600 mt-0.5" style={{ overflowWrap: 'break-word' }}>ℹ️ {svc.deliveryNote}</p>}
                          </div>
                        </div>
                        <span className={`text-sm font-bold flex-shrink-0 ${fee === 0 ? 'text-green-600' : 'text-gray-800'}`}>
                          {fee === 0 ? 'FREE 🎉' : `${sym} ${fee.toLocaleString()}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Coupon */}
            <div className="checkout-card rounded-2xl border border-gray-100 p-4" style={{ background: 'var(--card-bg)' }}>
              <h3 className="font-semibold text-gray-800 mb-2 text-sm">🏷️ Coupon Code</h3>
              {couponData ? (
                <div className="flex items-center justify-between rounded-xl px-3 py-2 bg-green-50 border border-green-200">
                  <span className="text-sm font-semibold text-green-700">
                    ✓ {couponCode} — −{sym} {couponData.discount.toLocaleString()}
                    {giftCardData && <span className="ml-1 text-xs font-normal text-green-600">(stacks with gift card)</span>}
                  </span>
                  <button type="button" onClick={() => { setCouponData(null); setCouponCode(''); }} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), applyCoupon())} placeholder="Enter code" className="form-input text-sm flex-1 font-mono uppercase" />
                  <button type="button" onClick={applyCoupon} disabled={couponLoading} className="btn-outline text-sm py-2 px-3 flex-shrink-0">{couponLoading ? '...' : 'Apply'}</button>
                </div>
              )}
              {campaign?.couponCode && !couponData && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--color-primary)' }}>🎉 Try <strong className="font-mono">{campaign.couponCode}</strong></p>
              )}
            </div>

            {/* Gift Card */}
            <div className="checkout-card rounded-2xl border border-gray-100 p-4" style={{ background: 'var(--card-bg)' }}>
              <h3 className="font-semibold text-gray-800 mb-2 text-sm">🎁 Gift Card <span className="font-normal text-xs text-gray-400">(used as payment)</span></h3>
              {giftCardData ? (
                <div className="flex items-center justify-between rounded-xl px-3 py-2 bg-purple-50 border border-purple-200">
                  <span className="text-sm font-semibold text-purple-700">
                    ✓ Balance: {sym} {giftCardData.balance.toLocaleString()}
                    {couponData && <span className="ml-1 text-xs font-normal text-purple-600">(covers rest after coupon)</span>}
                  </span>
                  <button type="button" onClick={() => { setGiftCardData(null); setGiftCardCode(''); }} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={giftCardCode} onChange={e => setGiftCardCode(e.target.value.toUpperCase())} placeholder="Gift card code" className="form-input text-sm flex-1 font-mono uppercase" />
                  <button type="button" onClick={applyGiftCard} disabled={giftCardLoading} className="btn-outline text-sm py-2 px-3 flex-shrink-0">{giftCardLoading ? '...' : 'Apply'}</button>
                </div>
              )}
            </div>

            {/* Payment Method */}
            {total > 0 && (
              <div className="checkout-card rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--card-bg)' }}>
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">💳 Payment Method</h3>
                {!hasAnyPayment && (
                  <p className="text-sm text-amber-600 bg-amber-50 rounded-xl p-3">No payment methods configured. Please contact the store admin.</p>
                )}
                <div className="space-y-3">
                  {settings?.bankTransferEnabled !== false && (
                    <div className={`pay-method-card ${paymentMethod === 'bank_transfer' ? 'selected' : ''}`} onClick={() => setPaymentMethod('bank_transfer')}>
                      <div className="pay-method-radio" /><div className="pay-method-icon">🏦</div>
                      <div><div className="pay-method-label">Direct Bank Transfer</div><div className="pay-method-desc">Transfer & send us proof of payment</div></div>
                    </div>
                  )}
                  {paymentMethod === 'bank_transfer' && (
                    <div className="ml-4 bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-1.5 text-xs">
                      <p className="text-gray-500 mb-2 font-semibold">Transfer using your order number as reference:</p>
                      {settings?.bankName          && <p><span className="text-gray-400 w-24 inline-block">Bank:</span><span className="font-bold text-gray-700">{settings.bankName}</span></p>}
                      {settings?.bankAccountName   && <p><span className="text-gray-400 w-24 inline-block">Account:</span><span className="font-bold text-gray-700">{settings.bankAccountName}</span></p>}
                      {settings?.bankAccountNumber && <p><span className="text-gray-400 w-24 inline-block">Number:</span><span className="font-mono font-black text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200">{settings.bankAccountNumber}</span></p>}
                      {settings?.bankBranch        && <p><span className="text-gray-400 w-24 inline-block">Branch:</span><span className="font-bold text-gray-700">{settings.bankBranch}</span></p>}
                    </div>
                  )}
                  {settings?.codEnabled !== false && (
                    codAllowedForDelivery ? (
                      <div className={`pay-method-card ${paymentMethod === 'cod' ? 'selected' : ''}`} onClick={() => setPaymentMethod('cod')}>
                        <div className="pay-method-radio" /><div className="pay-method-icon">💵</div>
                        <div><div className="pay-method-label">Cash on Delivery</div><div className="pay-method-desc">Pay when your order arrives</div></div>
                      </div>
                    ) : (
                      <div
                        className="pay-method-card opacity-50 cursor-not-allowed"
                        title={`${selectedDeliveryService?.name || 'This delivery option'} doesn't support Cash on Delivery`}
                        onClick={() => toast.error(`Cash on Delivery isn't available for ${selectedDeliveryService?.name || 'this delivery option'}. Please choose a different payment method.`)}
                      >
                        <div className="pay-method-radio" /><div className="pay-method-icon">💵</div>
                        <div>
                          <div className="pay-method-label">Cash on Delivery</div>
                          <div className="pay-method-desc">Not available for {selectedDeliveryService?.name || 'this delivery option'}</div>
                        </div>
                      </div>
                    )
                  )}
                  {gateways.map(gw => (
                    <div key={gw.gateway} className={`pay-method-card ${paymentMethod === gw.gateway ? 'selected' : ''}`} onClick={() => setPaymentMethod(gw.gateway)}>
                      <div className="pay-method-radio" />
                      <div className="pay-method-icon">{gw.logo ? <img src={gw.logo} alt={gw.displayName} style={{ height: 24, objectFit: 'contain' }} /> : '🔌'}</div>
                      <div>
                        <div className="pay-method-label flex items-center gap-2">
                          {gw.displayName}
                          {!gw.isLive && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Sandbox</span>}
                        </div>
                        <div className="pay-method-desc">
                          {gw.gateway === 'payhere' && 'Redirected to PayHere secure checkout'}
                          {gw.gateway === 'stripe'  && 'Enter your card details securely via Stripe'}
                          {gw.gateway === 'paypal'  && 'Complete payment via PayPal'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {total === 0 && (
              <div className="rounded-2xl border border-green-200 p-4 bg-green-50 flex items-center gap-3">
                <span className="text-2xl">🎉</span>
                <div>
                  <p className="text-sm font-bold text-green-800">No payment needed!</p>
                  <p className="text-xs text-green-600">
                    {isCouponActive && isGiftCardActive
                      ? 'Your coupon discount and gift card cover the full order.'
                      : isCouponActive
                      ? 'Your coupon covers the full order amount.'
                      : 'Your gift card covers the full order amount.'}
                  </p>
                </div>
              </div>
            )}

            {/* Terms & Submit */}
            <div className="checkout-card rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--card-bg)' }}>
              <label className="flex items-start gap-2 cursor-pointer mb-4">
                <input type="checkbox" checked={agreedTerms} onChange={e => setAgreedTerms(e.target.checked)} className="mt-0.5 w-4 h-4 rounded flex-shrink-0" style={{ accentColor: 'var(--color-primary)' }} />
                <span className="text-sm text-gray-600">I agree to the <span className="underline cursor-pointer" style={{ color: 'var(--color-primary)' }}>terms and conditions</span> <span className="text-red-500">*</span></span>
              </label>
              <button type="submit" disabled={loading || !agreedTerms || (total > 0 && !paymentMethod)}
                className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Placing Order...</>
                ) : user ? (
                  <>Place Order — {sym} {total.toLocaleString()}{['payhere', 'stripe', 'paypal'].includes(paymentMethod) ? ' →' : ''}</>
                ) : (
                  <>Create Account &amp; Place Order — {sym} {total.toLocaleString()}</>
                )}
              </button>
              {total > 0 && ['payhere', 'stripe', 'paypal'].includes(paymentMethod) && (
                <p className="text-xs text-gray-400 text-center mt-2 flex items-center justify-center gap-1">
                  🔒 Secure payment via {gateways.find(g => g.gateway === paymentMethod)?.displayName}
                </p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}