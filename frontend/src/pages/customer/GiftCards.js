import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const DESIGNS = [
  { id: 'default',     emoji: '🎁', label: 'Classic Gift',  bg: 'linear-gradient(135deg,#15803d,#84cc16)' },
  { id: 'birthday',   emoji: '🎂', label: 'Birthday',       bg: 'linear-gradient(135deg,#7c3aed,#a78bfa)' },
  { id: 'christmas',  emoji: '🎄', label: 'Christmas',      bg: 'linear-gradient(135deg,#15803d,#84cc16)' },
  { id: 'anniversary',emoji: '💝', label: 'Anniversary',    bg: 'linear-gradient(135deg,#be185d,#fb7185)' },
  { id: 'thankyou',   emoji: '💙', label: 'Thank You',      bg: 'linear-gradient(135deg,#0369a1,#06b6d4)' },
];

const AMOUNTS = [500, 1000, 2000, 5000, 10000];

const GiftCardPreview = ({ design, amount, recipientName, message, sym }) => {
  const d = DESIGNS.find(x => x.id === design) || DESIGNS[0];
  return (
    <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: d.bg, maxWidth: 340, margin: '0 auto' }}>
      <div className="p-6 text-center text-white">
        <div className="text-5xl mb-2">{d.emoji}</div>
        <p className="font-bold text-xl mb-1" style={{ fontFamily: 'var(--font-display)' }}>{d.label}</p>
        {recipientName && <p className="text-white/80 text-sm">For {recipientName}</p>}
      </div>
      <div className="bg-white/15 backdrop-blur-sm p-5 text-white">
        <div className="text-center mb-4">
          <p className="text-3xl font-black">{sym} {(amount || 0).toLocaleString()}</p>
          <p className="text-white/70 text-xs mt-1">Gift Card Value</p>
        </div>
        {message && (
          <div className="bg-white/10 rounded-xl p-3 mb-4">
            <p className="text-sm text-white/90 italic text-center">"{message}"</p>
          </div>
        )}
        <div className="bg-white/20 rounded-xl p-3 text-center">
          <p className="text-xs text-white/60 mb-1">Gift Card Code</p>
          <p className="font-mono font-bold text-base tracking-widest">GC-XXXX-XXXX-XXXX</p>
        </div>
      </div>
    </div>
  );
};

/* ── Slip Upload Component ─────────────────────────────────────────────────── */
const SlipUpload = ({ cardId, cardCode, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('slip', file);
      await API.post(`/gift-cards/${cardId}/payment-slip`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('✅ Payment slip uploaded! We\'ll verify and activate your gift card shortly.');
      onUploaded();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-amber-300 bg-amber-50 rounded-xl p-5 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-100 transition-all"
      >
        {preview ? (
          <img src={preview} alt="Slip preview" className="w-full max-h-48 object-contain rounded-lg mb-2" />
        ) : (
          <>
            <div className="text-3xl mb-2">📎</div>
            <p className="text-sm font-medium text-amber-700">Click to attach your payment slip</p>
            <p className="text-xs text-amber-600 mt-1">Image (JPG, PNG) or PDF — max 8MB</p>
          </>
        )}
        {file && <p className="text-xs text-amber-700 mt-2 font-medium">{file.name}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={e => handleFile(e.target.files[0])}
        />
      </div>
      {file && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="btn-primary w-full py-3 text-sm"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Uploading...
            </span>
          ) : (
            '📤 Upload Payment Slip'
          )}
        </button>
      )}
    </div>
  );
};

export default function GiftCards() {
  const { user } = useAuth();
  const { settings } = useTheme();
  const navigate = useNavigate();
  const sym = settings?.currencySymbol || 'Rs.';

  const [tab, setTab] = useState('buy');
  const [myCards, setMyCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checkCode, setCheckCode] = useState('');
  const [checkResult, setCheckResult] = useState(null);

  // Purchase form
  const [form, setForm] = useState({
    amount: 1000, customAmount: '',
    recipientName: '', recipientEmail: '', recipientPhone: '',
    message: '', design: 'default',
    isSelf: false,
  });

  // After purchase state
  const [purchasedCard, setPurchasedCard] = useState(null); // the created card from API
  const [slipUploaded, setSlipUploaded] = useState(false);

  useEffect(() => {
    if (user && tab === 'mine') {
      API.get('/gift-cards/my-cards').then(r => setMyCards(r.data)).catch(() => {});
    }
  }, [user, tab]);

  // Pre-fill recipient as self when isSelf toggled
  useEffect(() => {
    if (form.isSelf && user) {
      setForm(p => ({
        ...p,
        recipientName: `${user.firstName} ${user.lastName}`,
        recipientEmail: user.email,
      }));
    } else if (!form.isSelf) {
      setForm(p => ({ ...p, recipientName: '', recipientEmail: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.isSelf]);

  const handlePurchase = async () => {
    const amount = form.customAmount ? Number(form.customAmount) : form.amount;
    if (!amount || amount < 100) { toast.error('Minimum gift card value is Rs. 100'); return; }
    if (!form.isSelf && !form.recipientEmail && !form.recipientPhone) {
      toast.error('Enter recipient email or phone'); return;
    }

    setLoading(true);
    try {
      const { data } = await API.post('/gift-cards/purchase', {
        amount,
        recipientName: form.isSelf ? `${user.firstName} ${user.lastName}` : form.recipientName,
        recipientEmail: form.isSelf ? user.email : form.recipientEmail,
        recipientPhone: form.recipientPhone,
        message: form.message,
        design: form.design,
        paymentMethod: 'bank_transfer',
      });
      setPurchasedCard(data.giftCard);
      toast.success('🎁 Gift card order placed!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  const checkBalance = async () => {
    if (!checkCode.trim()) return;
    try {
      const { data } = await API.get(`/gift-cards/balance/${checkCode.toUpperCase()}`);
      setCheckResult(data);
    } catch (err) {
      setCheckResult({ error: err.response?.data?.message || 'Not found' });
    }
  };

  const amount = form.customAmount ? Number(form.customAmount) : form.amount;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8" style={{ background: 'var(--body-bg)' }}>
      {/* Hero */}
      <div className="rounded-3xl p-8 sm:p-12 text-center mb-8 overflow-hidden relative" style={{ background: 'var(--hero-gradient)' }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-5 right-10 w-40 h-40 rounded-full blur-3xl" style={{ background: 'var(--color-accent)' }}/>
          <div className="absolute bottom-5 left-10 w-32 h-32 rounded-full blur-2xl" style={{ background: 'var(--color-primary)' }}/>
        </div>
        <div className="relative z-10">
          <div className="text-5xl mb-3">🎁</div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-display)' }}>Gift Cards</h1>
          <p className="text-white/80 text-sm sm:text-base max-w-md mx-auto">The perfect gift for any occasion. Give someone the joy of choice.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-8">
        {[['buy', '🎁 Buy a Gift Card'], ['check', '🔍 Check Balance'], ['mine', '💳 My Cards']].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setPurchasedCard(null); setSlipUploaded(false); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${tab === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── BUY TAB ── */}
      {tab === 'buy' && (
        <>
          {/* Step 1: Success + Slip Upload */}
          {purchasedCard && !slipUploaded && (
            <div className="max-w-lg mx-auto space-y-5">
              <div className="rounded-2xl bg-green-50 border border-green-200 p-6 text-center">
                <div className="text-4xl mb-2">🎉</div>
                <h3 className="font-bold text-green-800 mb-1">Gift Card Order Placed!</h3>
                <p className="text-sm text-green-700 mb-2">Your gift card code: <span className="font-mono font-bold">{purchasedCard.code}</span></p>
                <p className="text-sm text-green-600">Now upload your bank transfer slip below to activate it.</p>
              </div>

              <div className="rounded-2xl border border-amber-200 p-5" style={{ background: 'var(--card-bg)' }}>
                <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <span className="text-amber-500">🏦</span> Upload Bank Transfer Slip
                </h3>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-700">
                  <p className="font-semibold mb-1">Bank Transfer Details:</p>
                  <p>Transfer <strong>{sym} {purchasedCard.initialValue?.toLocaleString()}</strong> to the store bank account</p>
                  <p className="mt-1">Reference: <strong className="font-mono">{purchasedCard.code}</strong></p>
                </div>
                <SlipUpload
                  cardId={purchasedCard._id}
                  cardCode={purchasedCard.code}
                  onUploaded={() => setSlipUploaded(true)}
                />
              </div>

              <p className="text-xs text-gray-400 text-center">You can also upload the slip later from <Link to="/my-orders" className="underline" style={{ color: 'var(--color-primary)' }}>My Orders</Link></p>
            </div>
          )}

          {/* Step 2: Slip uploaded confirmation */}
          {purchasedCard && slipUploaded && (
            <div className="max-w-lg mx-auto space-y-4">
              <div className="rounded-2xl bg-green-50 border border-green-200 p-6 text-center">
                <div className="text-4xl mb-2">✅</div>
                <h3 className="font-bold text-green-800 mb-1">Payment Slip Uploaded!</h3>
                <p className="text-sm text-green-700 mb-4">
                  Our team will verify your payment and activate gift card <strong>{purchasedCard.code}</strong> shortly.
                  You and the recipient will receive email notifications once it's active.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <button
                    onClick={() => {
                      setPurchasedCard(null);
                      setSlipUploaded(false);
                      setForm({ amount: 1000, customAmount: '', recipientName: '', recipientEmail: '', recipientPhone: '', message: '', design: 'default', isSelf: false });
                    }}
                    className="btn-outline text-sm"
                  >
                    Buy Another
                  </button>
                  <Link to="/my-orders" className="btn-primary text-sm">My Orders</Link>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 p-4 text-sm" style={{ background: 'var(--card-bg)' }}>
                <p className="font-semibold text-gray-700 mb-2">What happens next?</p>
                <ol className="space-y-1.5 text-gray-500 list-none">
                  {['Admin reviews your payment slip (1–2 hrs)', 'Gift card gets activated', 'You receive an email confirmation', `${purchasedCard.recipientEmail && purchasedCard.recipientEmail !== purchasedCard.purchaserEmail ? 'Recipient receives gift card by email' : 'Use your gift card at checkout'}`].map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5" style={{ background: 'var(--color-primary)' }}>{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* Purchase form */}
          {!purchasedCard && (
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="space-y-5">
                {/* Amount */}
                <div className="rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--card-bg)' }}>
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>1</span>
                    Choose Amount
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                    {AMOUNTS.map(a => (
                      <button key={a} onClick={() => setForm(p => ({ ...p, amount: a, customAmount: '' }))}
                        className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${!form.customAmount && form.amount === a ? 'border-primary text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
                        style={!form.customAmount && form.amount === a ? { background: 'var(--theme-gradient)', borderColor: 'var(--color-primary)' } : {}}>
                        {a >= 1000 ? `${a / 1000}K` : a}
                      </button>
                    ))}
                  </div>
                  <input type="number" value={form.customAmount} onChange={e => setForm(p => ({ ...p, customAmount: e.target.value }))}
                    className="form-input text-sm" placeholder={`Custom amount (min. ${sym} 100)`} />
                  <p className="text-xs text-gray-400 mt-1">Total: <strong>{sym} {amount.toLocaleString()}</strong></p>
                </div>

                {/* Design */}
                <div className="rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--card-bg)' }}>
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>2</span>
                    Choose Design
                  </h3>
                  <div className="grid grid-cols-5 gap-2">
                    {DESIGNS.map(d => (
                      <button key={d.id} onClick={() => setForm(p => ({ ...p, design: d.id }))}
                        className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 border-2 transition-all ${form.design === d.id ? 'border-primary shadow-lg scale-105' : 'border-gray-100 hover:border-gray-200'}`}
                        style={{ background: d.bg }}>
                        <span className="text-xl">{d.emoji}</span>
                        <span className="text-white text-[10px] font-semibold">{d.label.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recipient */}
                <div className="rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--card-bg)' }}>
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>3</span>
                    Recipient Details
                  </h3>

                  {/* Self / Someone else toggle */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setForm(p => ({ ...p, isSelf: false }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${!form.isSelf ? 'text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      style={!form.isSelf ? { background: 'var(--theme-gradient)', borderColor: 'var(--color-primary)' } : {}}
                    >
                      🎁 For someone else
                    </button>
                    <button
                      onClick={() => setForm(p => ({ ...p, isSelf: true }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.isSelf ? 'text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      style={form.isSelf ? { background: 'var(--theme-gradient)', borderColor: 'var(--color-primary)' } : {}}
                    >
                      👤 For myself
                    </button>
                  </div>

                  {!form.isSelf && (
                    <div className="space-y-3">
                      <div><label className="form-label">Recipient Name</label>
                        <input value={form.recipientName} onChange={e => setForm(p => ({ ...p, recipientName: e.target.value }))} className="form-input" placeholder="Their name" /></div>
                      <div><label className="form-label">Email Address *</label>
                        <input type="email" value={form.recipientEmail} onChange={e => setForm(p => ({ ...p, recipientEmail: e.target.value }))} className="form-input" placeholder="recipient@email.com" /></div>
                      <div><label className="form-label">Phone (optional)</label>
                        <input type="tel" value={form.recipientPhone} onChange={e => setForm(p => ({ ...p, recipientPhone: e.target.value }))} className="form-input" placeholder="+94 7X XXX XXXX" /></div>
                    </div>
                  )}

                  {form.isSelf && user && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-700">
                      Gift card will be linked to your account: <strong>{user.email}</strong>
                    </div>
                  )}

                  <div className="mt-3">
                    <label className="form-label">Personal Message (optional)</label>
                    <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={3} className="form-input resize-none" placeholder="Write a heartfelt message..." />
                  </div>
                </div>

                {/* Payment info */}
                <div className="rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--card-bg)' }}>
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>4</span>
                    Payment
                  </h3>
                  <div className="flex items-center gap-3 p-3 rounded-xl border-2" style={{ borderColor: 'var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 5%, white)' }}>
                    <span className="text-2xl">🏦</span>
                    <div>
                      <p className="font-semibold text-sm text-gray-800">Bank Transfer</p>
                      <p className="text-xs text-gray-500">Upload your transfer slip to activate the gift card</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={user ? handlePurchase : () => navigate('/login?redirect=/gift-cards')}
                  disabled={loading}
                  className="btn-primary w-full py-4 text-base"
                >
                  {loading
                    ? 'Processing...'
                    : user
                      ? `Place Gift Card Order — ${sym} ${amount.toLocaleString()}`
                      : 'Sign in to Purchase →'}
                </button>
              </div>

              {/* Preview */}
              <div className="hidden lg:block">
                <div className="sticky top-24">
                  <h3 className="font-semibold text-gray-700 mb-4 text-center text-sm">Preview</h3>
                  <GiftCardPreview design={form.design} amount={amount} recipientName={form.isSelf ? (user ? `${user.firstName} ${user.lastName}` : 'You') : form.recipientName} message={form.message} sym={sym} />
                  <div className="mt-5 bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-700">
                    <p className="font-semibold mb-2">How it works:</p>
                    <ol className="space-y-1.5 list-none">
                      {['Place your order here', 'Transfer payment to our bank account', 'Upload your slip in My Orders', 'We verify & activate the gift card', `${form.isSelf ? 'Use it at checkout' : 'Recipient gets email with the code'}`].map((s, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: 'var(--color-primary)' }}>{i + 1}</span>
                          {s}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CHECK BALANCE TAB ── */}
      {tab === 'check' && (
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl border border-gray-100 p-6" style={{ background: 'var(--card-bg)' }}>
            <h3 className="font-bold text-gray-900 mb-4 text-center">Check Gift Card Balance</h3>
            <div className="flex gap-2 mb-4">
              <input
                value={checkCode}
                onChange={e => setCheckCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && checkBalance()}
                className="form-input font-mono uppercase flex-1"
                placeholder="GC-XXXX-XXXX-XXXX"
              />
              <button onClick={checkBalance} className="btn-primary text-sm px-4 flex-shrink-0">Check</button>
            </div>
            {checkResult && (
              checkResult.error ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-red-600 font-medium text-sm">❌ {checkResult.error}</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden">
                  <div className="p-5 text-white text-center" style={{ background: 'var(--theme-gradient)' }}>
                    <p className="font-mono text-lg font-bold mb-1">{checkResult.code}</p>
                    <p className="text-3xl font-black">{sym} {checkResult.balance?.toLocaleString()}</p>
                    <p className="text-white/70 text-xs mt-1">Remaining Balance</p>
                  </div>
                  <div className="bg-gray-50 p-4 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-gray-500">Initial Value</span><span className="font-semibold">{sym} {checkResult.initialValue?.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Used</span><span className="font-semibold">{sym} {(checkResult.initialValue - checkResult.balance)?.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Status</span><span className={`font-semibold ${checkResult.isActive ? 'text-green-600' : 'text-amber-600'}`}>{checkResult.isActive ? '✓ Active' : '⏳ Inactive'}</span></div>
                    {checkResult.expiresAt && <div className="flex justify-between"><span className="text-gray-500">Expires</span><span className="font-semibold">{new Date(checkResult.expiresAt).toLocaleDateString()}</span></div>}
                  </div>
                  {checkResult.balance > 0 && checkResult.isActive && (
                    <div className="p-3 bg-green-50 text-center">
                      <Link to="/shop" className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Use it now → Shop</Link>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ── MY CARDS TAB ── */}
      {tab === 'mine' && (
        <div>
          {!user ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-3">🔒</div>
              <p className="text-gray-500 mb-4">Sign in to see your gift cards</p>
              <Link to="/login?redirect=/gift-cards" className="btn-primary">Sign In</Link>
            </div>
          ) : myCards.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-3 float">🎁</div>
              <p className="text-gray-500 mb-4">You haven't purchased any gift cards yet</p>
              <button onClick={() => setTab('buy')} className="btn-primary">Buy a Gift Card</button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myCards.map(card => {
                const d = DESIGNS.find(x => x.id === card.design) || DESIGNS[0];
                return (
                  <div key={card._id} className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                    <div className="p-4 text-white" style={{ background: d.bg }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl">{d.emoji}</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${card.isActive ? 'bg-green-500' : card.paymentSlip && !card.isActive ? 'bg-yellow-400 text-yellow-900' : 'bg-white/20'}`}>
                          {card.isActive ? '✓ Active' : card.paymentSlip ? '⏳ Under Review' : 'Pending Slip'}
                        </span>
                      </div>
                      <p className="font-mono text-sm font-bold tracking-wider">{card.code}</p>
                    </div>
                    <div className="p-4 bg-white">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-gray-500">Balance</span>
                        <span className="font-bold text-gray-900">{sym} {card.balance?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between mb-3">
                        <span className="text-sm text-gray-500">For</span>
                        <span className="text-sm text-gray-700">{card.recipientName || card.recipientEmail || '—'}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${(card.balance / card.initialValue) * 100}%`, background: 'var(--theme-gradient)' }} />
                      </div>
                      <p className="text-xs text-gray-400">{sym} {card.balance?.toLocaleString()} of {sym} {card.initialValue?.toLocaleString()} remaining</p>
                      {/* Prompt slip upload if not uploaded yet */}
                      {!card.isActive && !card.paymentSlip && (
                        <Link to="/my-orders" className="mt-3 block text-center text-xs font-semibold py-2 rounded-lg border-2 transition-all hover:text-white"
                          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--theme-gradient)'; e.currentTarget.style.color = 'white'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--color-primary)'; }}>
                          📤 Upload Payment Slip
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}