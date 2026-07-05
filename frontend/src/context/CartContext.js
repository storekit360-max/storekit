import React, { createContext, useContext, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { effectivePrice, computeSubtotal } from '../utils/discountEngine';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; }
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => { localStorage.setItem('cart', JSON.stringify(items)); }, [items]);

  const addItem = (product, quantity = 1) => {
    setItems(prev => {
      const variantKey = product.selectedVariants && Object.keys(product.selectedVariants).length > 0
        ? JSON.stringify(product.selectedVariants)
        : '';
      const cartKey = product._id + '::' + variantKey;
      const existing = prev.find(i => i.cartKey === cartKey);
      if (existing) {
        toast.success('Cart updated! ✓');
        return prev.map(i => i.cartKey === cartKey ? { ...i, quantity: i.quantity + quantity } : i);
      }

      let displayName = product.name;
      if (product.selectedVariants && Object.keys(product.selectedVariants).length > 0) {
        const variantStr = Object.entries(product.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(', ');
        displayName = `${product.name} (${variantStr})`;
      }

      toast.success('Added to cart! 🛒');
      return [...prev, {
        ...product,
        quantity,
        cartKey,
        variantKey,
        displayName,
        selectedVariants: product.selectedVariants || {},
        price:     product.price,
        salePrice: product.salePrice,
      }];
    });
    setIsOpen(true);
  };

  const removeItem    = (cartKey) => setItems(prev => prev.filter(i => (i.cartKey || i._id) !== cartKey));
  const updateQuantity = (cartKey, quantity) => {
    if (quantity < 1) { removeItem(cartKey); return; }
    setItems(prev => prev.map(i => (i.cartKey || i._id) === cartKey ? { ...i, quantity } : i));
  };
  const clearCart = () => setItems([]);

  // ── Pricing — all computed via DiscountEngine (no inline salePrice || price) ──
  const subtotal  = computeSubtotal(items);          // uses effectivePrice internally
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // Expose effectivePrice so child components don't need to import separately
  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart,
      subtotal, itemCount,
      isOpen, setIsOpen,
      effectivePrice,   // ← single helper for per-item display price
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);