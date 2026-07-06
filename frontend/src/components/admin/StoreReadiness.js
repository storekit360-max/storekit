import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../../utils/api';

const ACTION_LINKS = {
  products: '/admin/products',
  categories: '/admin/categories',
  banner: '/admin/banners',
  theme: '/admin/theme-builder',
  payment: '/admin/settings',
  delivery: '/admin/settings',
  pages: '/admin/settings',
  domain: '/admin/settings',
};

export default function StoreReadiness() {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [bootstrapping, setBootstrapping] = useState(false);

  const load = async () => {
    try {
      const { data } = await API.get('/tenant/readiness', { cacheTTL: 30 * 1000 });
      setState({ loading: false, data, error: '' });
    } catch (err) {
      setState({ loading: false, data: null, error: err.response?.data?.message || 'Store readiness check failed' });
    }
  };

  useEffect(() => { load(); }, []);

  const runBootstrap = async () => {
    setBootstrapping(true);
    try {
      await API.post('/tenant/bootstrap');
      await load();
    } finally {
      setBootstrapping(false);
    }
  };

  if (state.loading || state.error || !state.data) return null;
  const { score, readyToSell, checks = [] } = state.data;
  if (readyToSell && score >= 100) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🚀</span>
            <h2 className="font-bold text-gray-900">Store launch readiness</h2>
          </div>
          <p className="text-sm text-gray-500">Complete these items before giving this store to a customer.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-40 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className={`h-full ${readyToSell ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${score}%` }} />
          </div>
          <span className={`text-sm font-bold ${readyToSell ? 'text-emerald-600' : 'text-amber-600'}`}>{score}%</span>
          <button
            type="button"
            onClick={runBootstrap}
            disabled={bootstrapping}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {bootstrapping ? 'Preparing…' : 'Auto prepare'}
          </button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 p-5">
        {checks.map(check => (
          <Link
            key={check.key}
            to={ACTION_LINKS[check.key] || '/admin/dashboard'}
            className={`rounded-xl border p-3 transition-all ${check.done ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/70 hover:shadow-sm'}`}
          >
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${check.done ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-white'}`}>
                {check.done ? '✓' : '!'}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{check.label}</p>
                {!check.done && <p className="text-xs text-gray-500 mt-0.5">{check.action}</p>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
