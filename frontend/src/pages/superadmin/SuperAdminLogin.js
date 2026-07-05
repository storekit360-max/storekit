import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [email, setEmail] = useState('superadmin@storekit.local');
  const [password, setPassword] = useState('SuperAdmin@123456');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

        <div className="mt-6 bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600">
          <strong className="text-slate-800">Default:</strong><br />
          superadmin@storekit.local<br />
          SuperAdmin@123456
        </div>
      </div>
    </div>
  );
}