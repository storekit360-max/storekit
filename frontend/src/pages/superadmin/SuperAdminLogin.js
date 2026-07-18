import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const { user, login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const { data } = await API.get('/auth/superadmin/google-config');
        if (!data?.enabled || cancelled) return;
        let script = document.querySelector('script[data-superadmin-google]');
        if (!script) {
          script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true; script.defer = true; script.dataset.superadminGoogle = 'true';
          document.head.appendChild(script);
        }
        await new Promise((resolve, reject) => {
          if (window.google?.accounts?.id) return resolve();
          script.addEventListener('load', resolve, { once: true });
          script.addEventListener('error', reject, { once: true });
        });
        if (cancelled || !googleButtonRef.current) return;
        window.google.accounts.id.initialize({ client_id: data.clientId, auto_select: false, cancel_on_tap_outside: true, callback: async response => {
          setError(''); setLoading(true);
          try {
            const result = await API.post('/auth/superadmin/google', { credential: response.credential });
            loginWithGoogle(result.data.user, result.data.token);
            navigate('/superadmin', { replace: true });
          } catch (err) { setError(err.response?.data?.message || 'Secure Google sign-in failed'); }
          finally { setLoading(false); }
        }});
        window.google.accounts.id.renderButton(googleButtonRef.current, { theme: 'outline', size: 'large', width: 352, text: 'signin_with', shape: 'pill' });
      } catch { /* Password login remains available when Google is not configured. */ }
    };
    start();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (user?.role === 'superadmin') return <Navigate to="/superadmin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      if (loggedUser.role !== 'superadmin') {
        throw new Error('This account is not a super admin account');
      }
      navigate('/superadmin', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#312e81 100%)' }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">
        <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center mb-5 shadow-lg">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18M3 9h18M3 15h18M15 3v18" />
          </svg>
        </div>

        <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Super Admin Login</h1>
        <p className="text-sm text-slate-500 mb-6">Manage tenants, plans, features, and custom domains.</p>

        <div ref={googleButtonRef} className="min-h-[44px] flex justify-center mb-4" />
        <div className="flex items-center gap-3 mb-4"><span className="h-px bg-slate-200 flex-1"/><span className="text-xs uppercase tracking-wider text-slate-400">or use password</span><span className="h-px bg-slate-200 flex-1"/></div>

        <form onSubmit={submit} className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
            Email
            <input
              className="h-11 border border-slate-300 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-slate-600">
            Password
            <input
              className="h-11 border border-slate-300 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>

          {error ? (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium">
              {error}
            </div>
          ) : null}

          <button
            disabled={loading}
            type="submit"
            className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-base transition-colors mt-1"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-xs text-center text-slate-400">Access is restricted to enrolled platform operators. Authentication events are rate-limited and audited.</p>
      </div>
    </div>
  );
}
