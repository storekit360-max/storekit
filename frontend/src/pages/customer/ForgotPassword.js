import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

// ─── Password strength helpers ────────────────────────────────────────────────
const RULES = [
  { id: 'len',     label: 'At least 8 characters',              test: (p) => p.length >= 8 },
  { id: 'upper',   label: 'One uppercase letter (A-Z)',          test: (p) => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'One lowercase letter (a-z)',          test: (p) => /[a-z]/.test(p) },
  { id: 'number',  label: 'One number (0-9)',                    test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character (!@#$%^&* …)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function getStrength(password) {
  const passed = RULES.filter(r => r.test(password)).length;
  if (passed === 0) return { score: 0, label: '',         color: 'bg-gray-200' };
  if (passed === 1) return { score: 1, label: 'Very Weak', color: 'bg-red-500' };
  if (passed === 2) return { score: 2, label: 'Weak',      color: 'bg-orange-500' };
  if (passed === 3) return { score: 3, label: 'Fair',      color: 'bg-yellow-500' };
  if (passed === 4) return { score: 4, label: 'Strong',    color: 'bg-blue-500' };
  return               { score: 5, label: 'Very Strong', color: 'bg-green-500' };
}

// ─── Sub-component: Password strength meter ───────────────────────────────────
function PasswordStrengthMeter({ password }) {
  const strength = getStrength(password);
  if (!password) return null;

  return (
    <div className="mt-3 space-y-2">
      {/* Bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i <= strength.score ? strength.color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {strength.label && (
        <p className={`text-xs font-semibold ${
          strength.score <= 1 ? 'text-red-500' :
          strength.score === 2 ? 'text-orange-500' :
          strength.score === 3 ? 'text-yellow-600' :
          strength.score === 4 ? 'text-blue-500' :
          'text-green-600'
        }`}>
          {strength.label}
        </p>
      )}
      {/* Rules checklist */}
      <ul className="space-y-1">
        {RULES.map(rule => {
          const ok = rule.test(password);
          return (
            <li key={rule.id} className={`flex items-center gap-1.5 text-xs transition-colors ${ok ? 'text-green-600' : 'text-gray-400'}`}>
              <span>{ok ? '✓' : '○'}</span>
              <span>{rule.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ForgotPassword() {
  const navigate = useNavigate();
  const { loginWithGoogle: loginDirect } = useAuth(); // reuse the same setter

  const [step, setStep] = useState(1); // 1=email, 2=otp, 3=new password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const allRulesPassed = RULES.every(r => r.test(newPassword));

  // ── Step 1: Send OTP ────────────────────────────────────────────────────────
  const sendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await API.post('/auth/forgot-password', { email });
      toast.success('OTP sent to your email!');
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP ──────────────────────────────────────────────────────
  const verifyOTP = async (e) => {
    e.preventDefault();
    const otpStr = otp.join('');
    if (otpStr.length !== 6) { toast.error('Enter all 6 digits'); return; }
    setLoading(true);
    try {
      const { data } = await API.post('/auth/verify-otp', { email, otp: otpStr });
      setResetToken(data.resetToken);
      toast.success('OTP verified!');
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Reset password → auto-login ─────────────────────────────────────
  const resetPassword = async (e) => {
    e.preventDefault();
    if (!allRulesPassed) { toast.error('Please meet all password requirements'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const { data } = await API.post('/auth/reset-password', { email, resetToken, newPassword });

      // Auto-login: store token + user exactly like a normal login
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      loginDirect(data.user, data.token); // update AuthContext state

      toast.success('Password reset! You are now logged in 🎉');

      // Redirect admins to dashboard, customers to home
      navigate(data.user.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      const msg = err.response?.data?.message || 'Reset failed';
      const errs = err.response?.data?.errors;
      if (errs && errs.length) {
        errs.forEach(e => toast.error(e));
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── OTP input helpers ────────────────────────────────────────────────────────
  const handleOtpChange = useCallback((val, idx) => {
    if (!/^\d*$/.test(val)) return;
    const newOtp = [...otp];
    newOtp[idx] = val.slice(-1);
    setOtp(newOtp);
    if (val && idx < 5) document.getElementById(`otp-${idx + 1}`)?.focus();
  }, [otp]);

  const handleOtpKey = useCallback((e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) document.getElementById(`otp-${idx - 1}`)?.focus();
  }, [otp]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md fade-in">

        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="font-display font-bold text-2xl text-gray-900">StoreKit</span>
          </Link>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s ? 'bg-primary text-white shadow-lg' : 'bg-gray-200 text-gray-400'}`}>
                  {step > s ? '✓' : s}
                </div>
                {s < 3 && <div className={`w-8 h-0.5 transition-all ${step > s ? 'bg-primary' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          <h1 className="font-display text-2xl font-bold text-gray-900">
            {step === 1 ? 'Forgot Password?' : step === 2 ? 'Enter OTP' : 'New Password'}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {step === 1 ? 'Enter your email to receive an OTP'
              : step === 2 ? `We sent a 6-digit OTP to ${email}`
              : 'Choose a strong new password'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-8">

          {/* ── Step 1: Email ─────────────────────────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={sendOTP} className="space-y-4">
              <div>
                <label className="form-label">Email Address</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required className="form-input" placeholder="you@example.com" autoFocus
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {loading
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Sending...</>
                  : '📧 Send OTP'}
              </button>
            </form>
          )}

          {/* ── Step 2: OTP ───────────────────────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={verifyOTP} className="space-y-6">
              <div>
                <label className="form-label text-center block mb-4">Enter the 6-digit OTP</label>
                <div className="flex gap-2 justify-center">
                  {otp.map((digit, idx) => (
                    <input
                      key={idx} id={`otp-${idx}`} type="text" inputMode="numeric"
                      maxLength={1} value={digit}
                      onChange={e => handleOtpChange(e.target.value, idx)}
                      onKeyDown={e => handleOtpKey(e, idx)}
                      className="w-12 h-12 text-center text-xl font-bold border-2 border-gray-200 rounded-xl focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  ))}
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? 'Verifying...' : '✓ Verify OTP'}
              </button>
              <button type="button" onClick={() => { setStep(1); setOtp(['', '', '', '', '', '']); }}
                className="w-full text-sm text-gray-400 hover:text-primary transition-colors">
                ← Try different email
              </button>
            </form>
          )}

          {/* ── Step 3: New password ──────────────────────────────────────────── */}
          {step === 3 && (
            <form onSubmit={resetPassword} className="space-y-4">

              {/* New password */}
              <div>
                <label className="form-label">New Password</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required className="form-input pr-10" placeholder="Create a strong password" autoFocus
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showNew
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>

                {/* Strength meter */}
                <PasswordStrengthMeter password={newPassword} />
              </div>

              {/* Confirm password */}
              <div>
                <label className="form-label">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required className="form-input pr-10" placeholder="Repeat your password"
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirm
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                )}
                {confirmPassword && newPassword === confirmPassword && confirmPassword.length > 0 && (
                  <p className="text-green-600 text-xs mt-1">✓ Passwords match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !allRulesPassed || newPassword !== confirmPassword}
                className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Resetting...' : '🔐 Reset Password & Log In'}
              </button>
            </form>
          )}

          <div className="text-center mt-6">
            <Link to="/login" className="text-sm text-gray-500 hover:text-primary transition-colors">← Back to Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}