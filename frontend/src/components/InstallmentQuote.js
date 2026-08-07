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
  return (
    <div className={`installment-quote mt-2 w-full rounded-xl bg-violet-50 px-2.5 py-2 text-xs ${className}`}>
      <div className="font-semibold text-violet-700">Installment available</div>
      {state.loading ? <div className="text-violet-400">Installment available</div> : state.plans.slice(0, 3).map(plan => {
        const provider = String(plan.provider || '').trim();
        const amount = Number(plan.monthlyAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
          <div key={`${provider}-${plan.months}`} className="mt-1 flex min-w-0 items-center gap-1.5 leading-5 text-violet-600">
            <span className="inline-flex h-5 w-[58px] shrink-0 items-center justify-start">
              {plan.providerLogo ? <img src={plan.providerLogo} alt={provider} className="max-h-5 max-w-[58px] object-contain object-left" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <span className="font-bold text-[11px] text-violet-700">{provider}</span>}
            </span>
            <span className="truncate"><strong>{plan.months} × Rs. {amount}</strong> with {provider}</span>
          </div>
        );
      })}
    </div>
  );
}
