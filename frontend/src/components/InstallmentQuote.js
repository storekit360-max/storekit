import React, { useEffect, useState } from 'react';
import API from '../utils/api';

export default function InstallmentQuote({ productId, className = '' }) {
  const [state, setState] = useState({ loading: true, plans: [] });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, plans: [] });
    API.get(`/payments/installment-quote/${productId}`).then(({ data }) => alive && setState({ loading: false, plans: data.plans || [] })).catch(() => alive && setState({ loading: false, plans: [] }));
    return () => { alive = false; };
  }, [productId]);
  if (!state.plans.length && !state.loading) return null;
  return <div className={`mt-2 rounded-lg bg-violet-50 px-2.5 py-2 text-xs ${className}`}><div className="font-semibold text-violet-700">Installment available</div>{state.loading ? <div className="text-violet-400">Loading plans…</div> : state.plans.slice(0, 2).map(plan => <div key={`${plan.provider}-${plan.months}`} className="text-violet-600">{plan.provider} · {plan.months} months: <strong>Rs. {Number(plan.monthlyAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo</strong></div>)}</div>;
}
