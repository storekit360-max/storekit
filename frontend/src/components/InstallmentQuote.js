import React, { useEffect, useState } from 'react';
import API from '../utils/api';

const quoteCache = new Map();
const quoteRequests = new Map();
const loadQuote = productId => {
  if (quoteCache.has(productId)) return Promise.resolve(quoteCache.get(productId));
  if (!quoteRequests.has(productId)) {
    const request = API.get(`/payments/installment-quote/${productId}`).then(({ data }) => {
      const value = { enabled: data.enabled === true, plans: data.plans || [] };
      quoteCache.set(productId, value);
      return value;
    }).finally(() => quoteRequests.delete(productId));
    quoteRequests.set(productId, request);
  }
  return quoteRequests.get(productId);
};

export default function InstallmentQuote({ productId, className = '' }) {
  const cardMode = className.includes('card-installments');
  const [state, setState] = useState({ loading: true, enabled: false, plans: [] });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, enabled: false, plans: [] });
    loadQuote(productId).then(data => alive && setState({ loading: false, ...data })).catch(() => alive && setState({ loading: false, enabled: false, plans: [] }));
    return () => { alive = false; };
  }, [productId]);
  if (!state.enabled || (!state.loading && !state.plans.length)) return null;
  return (
    <div className={`installment-quote mt-2 w-full min-w-0 overflow-hidden ${cardMode ? 'card-installments text-sm' : 'py-1 text-sm'} ${className}`}>
      {!cardMode && <div className="font-semibold" style={{ color: 'var(--color-primary)' }}>Installment available</div>}
      {state.loading ? <div style={{ color: 'var(--text-muted-on-card, #6b7280)' }}>Installment available</div> : state.plans.slice(0, 3).map(plan => {
        const provider = String(plan.provider || '').trim();
        const amount = Number(plan.monthlyAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
          <div key={`${provider}-${plan.months}`} className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-5 ${cardMode ? 'text-gray-500' : ''}`} style={cardMode ? undefined : { color: 'var(--color-primary)' }}>
            <span className="inline-flex h-5 w-[58px] shrink-0 items-center justify-start">
              {plan.providerLogo ? <img src={plan.providerLogo} alt={provider} className="max-h-5 max-w-[58px] object-contain object-left" onError={e => { e.currentTarget.style.display = 'none'; }} /> : <span className="font-bold text-[11px] text-violet-700">{provider}</span>}
            </span>
            <span className="min-w-0 break-words"><strong className={cardMode ? 'font-normal' : ''}>{plan.months} × Rs. {amount}</strong> with {provider}</span>
          </div>
        );
      })}
    </div>
  );
}
