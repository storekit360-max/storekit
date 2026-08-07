import React, { useEffect, useState } from 'react';
import API from '../utils/api';

export default function InstallmentQuote({ productId, className = '' }) {
  const [state, setState] = useState({ loading: true, enabled: false, plans: [] });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, enabled: false, plans: [] });
    API.get(`/payments/installment-quote/${productId}`).then(({ data }) => alive && setState({ loading: false, enabled: data.enabled === true, plans: data.plans || [] })).catch(() => alive && setState({ loading: false, enabled: false, plans: [] }));
    return () => { alive = false; };
  }, [productId]);
  if (!state.enabled || (!state.loading && !state.plans.length)) return null;
  return <div className={`mt-2 rounded-lg bg-violet-50 px-2.5 py-2 text-xs ${className}`}><div className="font-semibold text-violet-700">Installment available</div>{state.loading ? <div className="text-violet-400">Loading plans…</div> : state.plans.slice(0, 3).map(plan => <div key={`${plan.provider}-${plan.months}`} className="mt-1 flex items-center gap-1.5 text-violet-600"><span className="inline-flex h-5 w-14 items-center justify-start overflow-hidden"><img src={plan.providerLogo || ''} alt={plan.provider} className="max-h-5 max-w-14 object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} /></span><span><strong>{plan.months} × Rs. {Number(plan.monthlyAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> with {plan.provider}</span></div>)}</div>;
}
