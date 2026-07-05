import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../../utils/api';
import { useCart } from '../../context/CartContext';
import toast from 'react-hot-toast';

export default function Wishlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();

  useEffect(() => {
    API.get('/auth/wishlist').then(r => setItems(r.data)).finally(() => setLoading(false));
  }, []);

  const removeFromWishlist = async (productId) => {
    await API.post(`/auth/wishlist/${productId}`);
    setItems(prev => prev.filter(p => p._id !== productId));
    toast.success('Removed from wishlist');
  };

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-3xl font-bold text-gray-900 mb-8">My Wishlist</h1>
      {items.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">💝</div>
          <p className="text-gray-500 text-lg mb-4">Your wishlist is empty</p>
          <Link to="/shop" className="btn-primary">Browse Products</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
          {items.map(product => (
            <div key={product._id} className="product-card bg-white rounded-2xl overflow-hidden border border-gray-100 group relative">
              <button onClick={() => removeFromWishlist(product._id)} className="absolute top-3 right-3 z-10 w-8 h-8 bg-white rounded-full shadow flex items-center justify-center text-red-400 hover:text-red-600 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
              </button>
              <Link to={`/product/${product.slug}`} className="block aspect-square bg-gray-50 overflow-hidden">
                <img src={product.thumbnail || product.images?.[0]} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </Link>
              <div className="p-4">
                <Link to={`/product/${product.slug}`}><h3 className="font-semibold text-gray-800 text-sm line-clamp-2 hover:text-primary">{product.name}</h3></Link>
                <div className="flex items-center justify-between mt-3">
                  <span className="font-bold text-gray-900">Rs. {(product.salePrice || product.price).toLocaleString()}</span>
                  <button onClick={() => { addItem(product); }} disabled={product.stock === 0} className="text-xs btn-primary py-1.5 px-3">Add to Cart</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
