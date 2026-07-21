import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';
import API from '../../utils/api';

// ─── Password strength checker ────────────────────────────────────────────────
const checkPasswordStrength = (password) => {
  const rules = [
    { id: 'length',    label: 'At least 8 characters',            pass: password.length >= 8 },
    { id: 'uppercase', label: 'One uppercase letter (A–Z)',        pass: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'One lowercase letter (a–z)',        pass: /[a-z]/.test(password) },
    { id: 'number',    label: 'One number (0–9)',                  pass: /[0-9]/.test(password) },
    { id: 'special',   label: 'One special character (!@#$%...)',  pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const passed = rules.filter(r => r.pass).length;
  let strength = 'weak';
  if (passed === 5) strength = 'strong';
  else if (passed >= 3) strength = 'medium';
  return { rules, passed, strength };
};

const strengthConfig = {
  weak:   { label: 'Weak',   color: '#ef4444', barColor: 'bg-red-500',    bars: 1 },
  medium: { label: 'Fair',   color: '#f59e0b', barColor: 'bg-amber-400',  bars: 2 },
  strong: { label: 'Strong', color: '#22c55e', barColor: 'bg-green-500',  bars: 3 },
};

function PasswordStrengthMeter({ password }) {
  const { rules, strength } = useMemo(() => checkPasswordStrength(password), [password]);
  if (!password) return null;
  const cfg = strengthConfig[strength];

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bars */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= cfg.bars ? cfg.barColor : 'bg-gray-200'}`}
            />
          ))}
        </div>
        <span className="text-xs font-semibold" style={{ color: cfg.color, minWidth: 40 }}>
          {cfg.label}
        </span>
      </div>

      {/* Rule checklist */}
      <div className="grid grid-cols-1 gap-1">
        {rules.map(rule => (
          <div key={rule.id} className="flex items-center gap-1.5">
            <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-white transition-all duration-200 ${rule.pass ? 'bg-green-500' : 'bg-gray-200'}`} style={{ fontSize: 9 }}>
              {rule.pass ? '✓' : ''}
            </span>
            <span className={`text-xs transition-colors duration-200 ${rule.pass ? 'text-green-600 line-through' : 'text-gray-400'}`}>
              {rule.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────
const Logo = ({ settings }) => (
  <Link to="/" className="inline-flex items-center gap-2 mb-6">
    {settings?.logoUrl ? (
      <img src={settings.logoUrl} alt={settings?.storeName || 'Store'} className="h-10 object-contain" />
    ) : (
      <>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'var(--theme-gradient)' }}>
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <span className="font-bold text-2xl text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
          {settings?.storeName || 'StoreKit'}
        </span>
      </>
    )}
  </Link>
);

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const Divider = () => (
  <div className="relative my-5">
    <div className="absolute inset-0 flex items-center">
      <div className="w-full border-t border-gray-100" />
    </div>
    <div className="relative flex justify-center">
      <span className="px-3 text-xs text-gray-400" style={{ background: 'var(--card-bg, white)' }}>or</span>
    </div>
  </div>
);

// ─── Google Sign-In Button ────────────────────────────────────────────────────
function GoogleSignInButton({ onSuccess, disabled, label = 'Continue with Google' }) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const bridgeSessionRef = useRef(null);

  const handleCredential = useCallback(async (response) => {
    setLoading(true);
    try {
      const { data } = await API.post('/auth/google', { credential: response.credential });
      onSuccess(data.user, data.token);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  const clearBridgeSession = useCallback(() => {
    const session = bridgeSessionRef.current;
    if (!session) return;
    window.removeEventListener('message', session.onMessage);
    window.clearInterval(session.closedTimer);
    window.clearTimeout(session.timeoutTimer);
    bridgeSessionRef.current = null;
  }, []);

  useEffect(() => {
    let active = true;
    API.get('/auth/google/config', { skipCache: true })
      .then(({ data }) => {
        if (!active) return;
        if (!data?.enabled || !data?.bridgeUrl) throw new Error(data?.message || 'Google Sign-In is unavailable');
        setAuthConfig(data);
        setReady(true);
      })
      .catch(err => {
        if (!active) return;
        setConfigError(err?.response?.data?.message || err?.message || 'Google Sign-In is unavailable');
        setReady(false);
      });
    return () => {
      active = false;
      clearBridgeSession();
    };
  }, [clearBridgeSession]);

  const handleClick = () => {
    if (!ready || !authConfig?.bridgeUrl) {
      toast.error(configError || 'Google Sign-In is still loading. Please try again.');
      return;
    }

    clearBridgeSession();
    const requestId = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const bridgeUrl = new URL(authConfig.bridgeUrl);
    bridgeUrl.searchParams.set('returnOrigin', window.location.origin);
    bridgeUrl.searchParams.set('requestId', requestId);
    const trustedBridgeOrigin = bridgeUrl.origin;

    const popup = window.open(
      bridgeUrl.toString(),
      'storekit-google-signin',
      'popup=yes,width=480,height=650,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
    );
    if (!popup) {
      toast.error('Please allow popups to continue with Google.');
      return;
    }

    setLoading(true);
    const finish = () => {
      clearBridgeSession();
      setLoading(false);
    };
    const onMessage = event => {
      if (event.source !== popup) return;
      if (event.origin !== trustedBridgeOrigin) return;
      if (event.data?.type !== 'storekit:google-credential') return;
      if (event.data?.requestId !== requestId || !event.data?.credential) return;
      clearBridgeSession();
      handleCredential({ credential: event.data.credential });
    };
    window.addEventListener('message', onMessage);
    const closedTimer = window.setInterval(() => {
      if (popup.closed) finish();
    }, 500);
    const timeoutTimer = window.setTimeout(() => {
      try { popup.close(); } catch (_) {}
      finish();
      toast.error('Google Sign-In timed out. Please try again.');
    }, 2 * 60 * 1000);
    bridgeSessionRef.current = { onMessage, closedTimer, timeoutTimer };
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-all font-medium text-gray-700 text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Spinner /> : (
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        )}
        <span>{loading ? 'Signing in...' : label}</span>
      </button>
    </>
  );
}

// ─── Login Page ────────────────────────────────────────────────────────────────
export function Login() {
  const { login, loginWithGoogle } = useAuth();
  const { settings, visualDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname
    ? (location.state.from.pathname + (location.state.from.search || ''))
    : null;
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.firstName}! 👋`);
      navigate(user.role === 'admin' ? '/admin' : (from || '/'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = useCallback((user, token) => {
    loginWithGoogle(user, token);
    toast.success(`Welcome back, ${user.firstName}! 👋`);
    navigate(user.role === 'admin' ? '/admin' : (from || '/'));
  }, [loginWithGoogle, navigate, from]);

  return (
    <div className={`auth-theme ${visualDark ? 'dark-mode' : ''} min-h-screen flex items-center justify-center px-3 sm:px-4 py-7 sm:py-12`} style={{ background: 'var(--body-bg)', color:'var(--text-primary)' }}>
      <div className="w-full max-w-md fade-in">
        <div className="text-center mb-8">
          <Logo settings={settings} />
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Welcome back</h1>
          <p className="text-gray-500 mt-1 text-sm">Sign in to continue shopping</p>
        </div>
        <div className="rounded-2xl border border-gray-100 shadow-xl p-5 sm:p-8" style={{ background: 'var(--card-bg)', color:'var(--text-on-card)' }}>
          <GoogleSignInButton onSuccess={handleGoogleSuccess} disabled={loading} />
          <Divider />
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Email Address</label>
              <input
                type="email" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required className="form-input" placeholder="you@example.com" autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="form-label mb-0">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  required className="form-input pr-10" placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              {loading ? <><Spinner />Signing in...</> : 'Sign In →'}
            </button>
          </form>
          <Divider />
          <p className="text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
              Create one free
            </Link>
          </p>
        </div>
        <p className="text-center mt-4">
          <Link to="/" className="text-sm text-gray-400 hover:opacity-75">← Back to store</Link>
        </p>
      </div>
    </div>
  );
}

// ─── Register Page ─────────────────────────────────────────────────────────────
export function Register() {
  const { register, loginWithGoogle } = useAuth();
  const { settings, visualDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = location.state?.prefill || {};
  const fromCheckout = location.state?.fromCheckout || false;

  const [form, setForm] = useState({
    firstName: prefill.firstName || '',
    lastName:  prefill.lastName  || '',
    username:  '',
    email:     prefill.email     || '',
    password:  '',
    phone:     prefill.phone     || '',
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newUserCoupon, setNewUserCoupon] = useState(null);

  // Live password strength
  const { rules, strength } = useMemo(() => checkPasswordStrength(form.password), [form.password]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Enforce all 5 rules before submitting
    const failedRules = rules.filter(r => !r.pass);
    if (failedRules.length > 0) {
      toast.error(`Password needs: ${failedRules[0].label.toLowerCase()}`);
      return;
    }

    setLoading(true);
    try {
      const res = await register(form);
      if (res?.data?.newUserCoupon) {
        setNewUserCoupon(res.data.newUserCoupon);
      } else if (fromCheckout) {
        toast.success('Account created! Returning to checkout... 🛒');
        navigate('/checkout');
      } else {
        toast.success('Account created! Welcome 🎉');
        navigate('/');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = useCallback((user, token) => {
    loginWithGoogle(user, token);
    toast.success(`Welcome, ${user.firstName}! 🎉`);
    navigate(fromCheckout ? '/checkout' : '/');
  }, [loginWithGoogle, navigate, fromCheckout]);

  if (newUserCoupon) return (
    <div className={`auth-theme ${visualDark ? 'dark-mode' : ''} min-h-screen flex items-center justify-center px-3 sm:px-4 py-6`} style={{ background: 'var(--body-bg)', color:'var(--text-primary)' }}>
      <div className="rounded-2xl border border-gray-100 shadow-xl p-5 sm:p-8 max-w-md w-full text-center bounce-in" style={{ background: 'var(--card-bg)', color:'var(--text-on-card)' }}>
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          Welcome to {settings?.storeName || 'StoreKit'}!
        </h2>
        <p className="text-gray-500 mb-6">Here's an exclusive gift for your first order:</p>
        <div className="rounded-2xl p-6 text-white mb-6" style={{ background: 'var(--theme-gradient)' }}>
          <p className="text-sm text-white/80 mb-1">Your Welcome Coupon</p>
          <p className="font-mono text-3xl font-bold tracking-widest">{newUserCoupon.code}</p>
          <p className="text-white/90 mt-2 text-sm">
            {newUserCoupon.description || `${newUserCoupon.value}${newUserCoupon.type === 'percentage' ? '%' : ` ${settings?.currencySymbol || 'Rs.'}`} off your first order`}
          </p>
        </div>
        <button onClick={() => navigate(fromCheckout ? '/checkout' : '/shop')} className="btn-primary w-full">
          {fromCheckout ? 'Continue to Checkout →' : 'Start Shopping →'}
        </button>
      </div>
    </div>
  );

  return (
    <div className={`auth-theme ${visualDark ? 'dark-mode' : ''} min-h-screen flex items-center justify-center px-3 sm:px-4 py-7 sm:py-12`} style={{ background: 'var(--body-bg)', color:'var(--text-primary)' }}>
      <div className="w-full max-w-md fade-in">
        <div className="text-center mb-8">
          <Logo settings={settings} />
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Create Account</h1>
          {fromCheckout ? (
            <p className="text-sm mt-2 font-semibold px-4 py-2 rounded-xl inline-block" style={{ background: 'var(--color-primary)', color: '#fff' }}>
              🛒 One step away — create your account to place your order
            </p>
          ) : (
            <p className="text-gray-500 mt-1 text-sm">Join thousands of happy customers</p>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 shadow-xl p-5 sm:p-8" style={{ background: 'var(--card-bg)', color:'var(--text-on-card)' }}>
          <GoogleSignInButton onSuccess={handleGoogleSuccess} disabled={loading} label="Sign up with Google" />
          <Divider />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label">First Name *</label>
                <input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} required className="form-input" placeholder="John" />
              </div>
              <div>
                <label className="form-label">Last Name *</label>
                <input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} required className="form-input" placeholder="Doe" />
              </div>
            </div>

            <div>
              <label className="form-label">Username *</label>
              <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required className="form-input" placeholder="johndoe123" />
            </div>

            <div>
              <label className="form-label">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required className="form-input" />
            </div>

            <div>
              <label className="form-label">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="form-input" placeholder="+94 7X XXX XXXX" />
            </div>

            {/* Password with strength meter */}
            <div>
              <label className="form-label">Password *</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  required
                  className="form-input pr-10"
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
              {/* Live strength meter — only shows once user starts typing */}
              <PasswordStrengthMeter password={form.password} />
            </div>

            <button
              type="submit"
              disabled={loading || (form.password.length > 0 && strength !== 'strong')}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <><Spinner />Creating...</> : 'Create Account 🎉'}
            </button>

            {/* Helper text when button is disabled due to weak password */}
            {form.password.length > 0 && strength !== 'strong' && (
              <p className="text-center text-xs text-amber-500">
                Complete all password requirements to continue
              </p>
            )}
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
