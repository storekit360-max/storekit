import React, { useState } from 'react';
import useSEO, { trackInitiateCheckout } from '../../hooks/useSEO';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { resolveDeliveryFee } from '../../utils/discountEngine';

const FreeDeliveryBar = ({ subtotal, threshold, sym }) => {
  const remaining = threshold - subtotal;
  const pct = Math.min(100, (subtotal / threshold) * 100);
  if (subtotal >= threshold) return (
    <div className="free-del-progress" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
      <p className="free-del-text" style={{ color: '#065f46' }}>🎉 You've unlocked FREE delivery!</p>
      <div className="free-del-bar"><div className="free-del-fill" style={{ width: '100%', background: 'linear-gradient(90deg,#10b981,#059669)' }} /></div>
    </div>
  );
  return (
    <div className="free-del-progress">
      <p className="free-del-text">Add <strong>{sym} {remaining.toLocaleString()}</strong> more for FREE delivery 🚚</p>
      <div className="free-del-bar"><div className="free-del-fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
};

export default function Cart() {
  const { items, removeItem, updateQuantity, subtotal, clearCart, effectivePrice } = useCart();
  useSEO({ title: 'Cart', noindex: true });
  const { settings } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  const sym          = settings?.currencySymbol || 'Rs.';
  // Delivery fee via engine — no delivery service selected yet at cart stage
  const deliveryCost = resolveDeliveryFee(null, '', subtotal, settings);

  const [removingId, setRemovingId] = useState(null);

  const handleRemove = (id) => {
    setRemovingId(id);
    setTimeout(() => { removeItem(id); setRemovingId(null); }, 280);
  };

  if (items.length === 0) return (
    <div className="empty-state" style={{ minHeight: '70vh', background: 'var(--body-bg)' }}>
      <div className="empty-state-emoji">🛒</div>
      <h1 className="empty-state-title">Your cart is empty</h1>
      <p className="empty-state-sub">Looks like you haven't added anything yet. Let's find something you'll love!</p>
      <Link to="/shop" className="btn-primary">Browse Products</Link>
    </div>
  );

  return (
    <div style={{ background: 'var(--body-bg)', minHeight: '100vh' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="breadcrumb mb-2">
              <Link to="/">Home</Link><span className="breadcrumb-sep">›</span>
              <span className="breadcrumb-current">Cart</span>
            </div>
            <h1 className="section-title">Shopping Cart</h1>
            <p className="text-sm text-gray-400 mt-1">{items.reduce((s, i) => s + i.quantity, 0)} items</p>
          </div>
          <button onClick={clearCart} className="text-sm text-gray-300 hover:text-red-400 transition-colors flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-red-50">
            <span>🗑</span> Clear all
          </button>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Items */}
          <div className="lg:col-span-3 space-y-3">
            {items.map(item => {
              const unitPrice = effectivePrice(item);
              const itemKey   = item.cartKey || item._id;
              return (
                <div key={itemKey}
                  style={{
                    background: 'var(--card-bg)',
                    opacity:    removingId === itemKey ? 0 : 1,
                    transform:  removingId === itemKey ? 'translateX(40px)' : 'none',
                    transition: 'opacity 0.28s ease,transform 0.28s ease',
                  }}
                  className="rounded-2xl border p-4 flex gap-4">
                  {/* image */}
                  <Link to={`/product/${item.slug}`}
                    className="flex-shrink-0 rounded-2xl overflow-hidden bg-gray-50"
                    style={{ width: 88, height: 88, borderRadius: 16, overflow: 'hidden', flexShrink: 0 }}>
                    <img src={item.thumbnail || item.images?.[0] || 'https://placehold.co/88x88?text=+'}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s ease' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link to={`/product/${item.slug}`}
                          className="font-bold text-gray-900 hover:opacity-70 transition-opacity text-sm sm:text-base line-clamp-2 leading-snug"
                          style={{ fontFamily: 'var(--font-body)' }}>
                          {item.displayName || item.name}
                        </Link>
                        {item.category?.name && <p className="text-xs text-gray-400 mt-0.5">{item.category.name}</p>}
                        {item.price !== unitPrice && (
                          <p className="text-xs text-gray-400 line-through mt-0.5">{sym} {item.price?.toLocaleString()}</p>
                        )}
                      </div>
                      <button onClick={() => handleRemove(itemKey)}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-red-50 hover:text-red-400 flex items-center justify-center text-gray-300 transition-all flex-shrink-0 text-lg">×</button>
                    </div>
                    <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                      {/* Qty stepper */}
                      <div className="qty-stepper">
                        <button className="qty-stepper-btn" onClick={() => updateQuantity(itemKey, item.quantity - 1)} disabled={item.quantity <= 1}>−</button>
                        <span className="qty-stepper-val">{item.quantity}</span>
                        <button className="qty-stepper-btn" onClick={() => updateQuantity(itemKey, item.quantity + 1)}>+</button>
                      </div>
                      <div className="text-right">
                        <p className="font-extrabold text-gray-900 text-lg">{sym} {(unitPrice * item.quantity).toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{sym} {unitPrice?.toLocaleString()} each</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="lg:col-span-2">
            <div className="order-summary-sticky" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <div className="p-6 border-b" style={{ borderColor: 'var(--card-border)' }}>
                <h2 className="font-extrabold text-xl text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Order Summary</h2>
              </div>
              <div className="p-6 space-y-3">
                {items.map(item => (
                  <div key={item.cartKey || item._id} className="flex justify-between text-sm text-gray-500">
                    <span className="truncate pr-2 flex-1">{item.name} ×{item.quantity}</span>
                    <span className="font-semibold flex-shrink-0">{sym} {(effectivePrice(item) * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t pt-3 space-y-2" style={{ borderColor: 'var(--card-border)' }}>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span><span className="font-bold">{sym} {subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Delivery</span>
                    <span className={deliveryCost === 0 ? 'text-green-600 font-bold' : ''}>
                      {deliveryCost === 0 ? 'FREE 🎉' : `${sym} ${deliveryCost.toLocaleString()}`}
                    </span>
                  </div>
                  <FreeDeliveryBar
                    subtotal={subtotal}
                    threshold={Number(settings?.freeDeliveryThreshold) || 5000}
                    sym={sym}
                  />
                  <div className="border-t pt-3" style={{ borderColor: 'var(--card-border)' }}>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-900">Total</span>
                      <span className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)' }}>
                        {sym} {(subtotal + deliveryCost).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <button onClick={() => { trackInitiateCheckout(items, subtotal, { billing: user ? { email: user.email, phone: user.phone, firstName: user.firstName, lastName: user.lastName } : {} }); navigate('/checkout'); }} className="btn-primary w-full text-base mt-2">
                  Proceed to Checkout →
                </button>
                <Link to="/shop" className="block text-center text-sm text-gray-400 hover:text-gray-600 transition-colors mt-2">
                  ← Continue Shopping
                </Link>
                {/* Trust signals */}
                <div className="space-y-2 pt-2">
                  {['🔒 Secure & encrypted checkout', '🚚 Fast delivery to your door', '↩️ Easy returns within 14 days'].map(t => (
                    <div key={t} className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}