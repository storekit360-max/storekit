/**
 * BrandPage.js — SEO-friendly brand landing page
 * Route: /brand/:slug  (e.g. /brand/sony, /brand/philips)
 *
 * Features:
 *  - Canonical URL at /brand/:slug
 *  - Unique SEO title + meta description per brand
 *  - BreadcrumbList JSON-LD schema
 *  - Brand description content for Google rankings
 *  - All products for that brand with pagination
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { gsap } from 'gsap';
import API from '../../utils/api';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import useSEO from '../../hooks/useSEO';

// Keep collection structured data aligned with the visible tenant catalogue.
function injectBrandSchemas(brandName, slug, products, siteUrl, storeName) {
  ['brand-faq-schema', 'brand-itemlist-schema'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  const brandUrl = `${siteUrl}/brand/${slug}`;

  if (products && products.length > 0) {
    const itemListSchema = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${brandName} Products | ${storeName}`,
      url: brandUrl,
      mainEntity: {
        '@type': 'ItemList',
        name: `${brandName} Products`,
        numberOfItems: products.length,
        itemListElement: products.slice(0, 20).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.name,
          url: `${siteUrl}/product/${p.slug}`,
          image: p.thumbnail || p.images?.[0] || undefined,
        })),
      },
    };
    const listEl = document.createElement('script');
    listEl.type = 'application/ld+json';
    listEl.id = 'brand-itemlist-schema';
    listEl.textContent = JSON.stringify(itemListSchema);
    document.head.appendChild(listEl);
  }
}

function getDefaultBrandInfo(brandSlug, storeName) {
  const name = brandSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return {
    name,
    tagline: '',
    description: `Browse the ${name} products currently listed by ${storeName}. Each product page shows its latest description, images, price, stock status, available options, and ordering details.`,
  };
}

const Stars = ({ rating = 0 }) => (
  <div className="flex gap-0.5">
    {[1,2,3,4,5].map(s => (
      <svg key={s} className={`w-3 h-3 ${s <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
      </svg>
    ))}
  </div>
);

export default function BrandPage() {
  const { slug } = useParams();
  const navigate  = useNavigate();
  const { settings } = useTheme();
  const { addItem } = useCart();
  const sym = settings?.currencySymbol || 'Rs.';
  const storeName = settings?.storeName || window.__STOREKIT_SEO__?.siteName || 'Online Store';
  const gridRef = useRef(null);

  const genericBrand = getDefaultBrandInfo(slug, storeName);
  const brandInfo = genericBrand;
  const brandName = brandInfo.name;

  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);
  const [sortBy,     setSortBy]     = useState('newest');
  const [addedId,    setAddedId]    = useState(null);
  const [availableBrands, setAvailableBrands] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);

  useEffect(() => {
    API.get('/products/brands?limit=16').then(response => setAvailableBrands(response.data?.brands || [])).catch(() => {});
    API.get('/categories').then(response => setAvailableCategories(response.data || [])).catch(() => {});
  }, []);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    // Search by brand name in the products API
    const q = new URLSearchParams({ page, limit: 12, sort: sortBy, brand: brandName });
    API.get(`/products?${q}`)
      .then(r => {
        setProducts(r.data.products || []);
        setTotalPages(r.data.pages || 1);
        setTotal(r.data.total || 0);
        setTimeout(() => {
          if (gridRef.current) {
            gsap.fromTo(gridRef.current.children,
              { y: 30, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.5, stagger: 0.05, ease: 'power2.out' }
            );
          }
        }, 50);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, sortBy, brandName]);

  const siteUrl = window.__STOREKIT_SEO__?.siteUrl || window.location.origin;

  // Inject an ItemList schema that matches the visible tenant catalogue.
  useEffect(() => {
    if (!products.length) return;
    injectBrandSchemas(brandName, slug, products, siteUrl, storeName);
    return () => {
      ['brand-faq-schema', 'brand-itemlist-schema'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    };
  }, [products, brandName, siteUrl, slug, storeName]);

  useEffect(() => { setPage(1); }, [sortBy, slug]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  const handleAdd = (e, product) => {
    e.preventDefault();
    if (product.variants?.length > 0) { navigate(`/product/${product.slug}`); return; }
    addItem(product);
    setAddedId(product._id);
    setTimeout(() => setAddedId(null), 1200);
  };

  // ── SEO ───────────────────────────────────────────────────────────────────
  const canonicalUrl = `${siteUrl}/brand/${slug}`;

  useSEO({
    title: `${brandName} Products — Buy Online | ${storeName}`,
    description: `Browse ${brandName} products at ${storeName}. See current prices, product details and live stock status.`,
    url: canonicalUrl,
    breadcrumbs: [
      { name: 'Shop', url: '/shop' },
      { name: `${brandName} Products`, url: `/brand/${slug}` },
    ],
  });

  return (
    <div style={{ background: 'var(--body-bg)', minHeight: '100vh' }}>
      {/* Brand Hero */}
      <div className="border-b" style={{ background: 'var(--card-bg)' }}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-8 sm:py-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-4 flex-wrap">
            <Link to="/" style={{ color: 'var(--color-primary)' }}>Home</Link>
            <span>/</span>
            <Link to="/shop" style={{ color: 'var(--color-primary)' }}>Shop</Link>
            <span>/</span>
            <span className="font-medium text-gray-600">{brandName}</span>
          </div>
          <div className="flex items-end gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1"
                style={{ color: 'var(--color-primary)' }}>
                Brand collection
              </p>
              <h1 className="text-4xl sm:text-5xl font-black text-gray-900"
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
                {brandName}
              </h1>
              {brandInfo.tagline && (
                <p className="text-base text-gray-500 mt-1 italic">{brandInfo.tagline}</p>
              )}
              <p className="text-sm text-gray-400 mt-2">{total} product{total !== 1 ? 's' : ''} available</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6">
        {/* Sort */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{total} {brandName} products</p>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 outline-none"
            style={{ background: 'var(--card-bg)', borderColor: '#e5e7eb' }}>
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="popular">Most Popular</option>
          </select>
        </div>

        {/* Products grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-2xl animate-pulse"
                style={{ background: 'var(--card-bg)', height: '280px' }}/>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-4">🔍</p>
            <p className="font-semibold">No {brandName} products found right now.</p>
            <Link to="/shop" className="mt-4 inline-block text-sm font-medium"
              style={{ color: 'var(--color-primary)' }}>Browse all products →</Link>
          </div>
        ) : (
          <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map(product => {
              const hasDiscount = product.isOnSale && product.salePrice && product.salePrice < product.price;
              const price = hasDiscount ? product.salePrice : product.price;
              const discount = hasDiscount
                ? Math.round((1 - product.salePrice / product.price) * 100)
                : 0;

              return (
                <Link key={product._id} to={`/product/${product.slug}`}
                  className="catalog-product-card group rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 flex flex-col h-full"
                  style={{ background: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <div className="relative overflow-hidden aspect-square bg-gray-50">
                    <img
                      src={product.thumbnail || product.images?.[0]}
                      alt={`${brandName} ${product.name} — buy online Sri Lanka`}
                      className="w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      width="300"
                      height="300"
                    />
                    {hasDiscount && (
                      <span className="absolute top-2 left-2 text-white text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--color-primary)' }}>
                        -{discount}%
                      </span>
                    )}
                  </div>
                  <div className="catalog-product-body p-3 flex flex-col flex-1">
                    <p className="text-xs text-gray-400 mb-0.5">{brandName}</p>
                    <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 mb-1">
                      {product.name}
                    </h3>
                    {product.ratings?.count > 0 && (
                      <div className="flex items-center gap-1 mb-1">
                        <Stars rating={product.ratings.average}/>
                        <span className="text-xs text-gray-400">({product.ratings.count})</span>
                      </div>
                    )}
                    <div className="catalog-product-footer flex items-center justify-between mt-auto pt-2">
                      <div>
                        <span className="font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                          {sym}{price?.toLocaleString()}
                        </span>
                        {hasDiscount && (
                          <span className="text-xs text-gray-400 line-through ml-1">
                            {sym}{product.price?.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={e => handleAdd(e, product)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-200"
                        style={{
                          background: addedId === product._id ? '#22c55e' : 'var(--color-primary)',
                          color: '#fff',
                        }}>
                        {addedId === product._id ? '✓' : '+'}
                      </button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                className="w-9 h-9 rounded-full text-sm font-semibold transition-all"
                style={{
                  background: page === i + 1 ? 'var(--color-primary)' : 'var(--card-bg)',
                  color: page === i + 1 ? '#fff' : 'var(--color-primary)',
                  border: '1px solid var(--color-primary)',
                }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Brand Description (SEO content) */}
        <div className="mt-12 rounded-2xl p-6 sm:p-8"
          style={{ background: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 className="text-xl font-bold text-gray-800 mb-4"
            style={{ fontFamily: 'var(--font-display)' }}>
            About {brandName}
          </h2>
          <div className="text-sm text-gray-600 leading-relaxed space-y-3">
            {brandInfo.description.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>

        {/* Internal linking — related brands and categories */}
        <div className="mt-6 rounded-2xl p-5"
          style={{ background: 'var(--card-bg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Shop other brands
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {availableBrands.filter(brand => brand.slug !== slug.toLowerCase()).slice(0, 8).map(brand => (
              <Link key={brand.slug} to={`/brand/${brand.slug}`}
                className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors capitalize"
                style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>
                {brand.name}
              </Link>
            ))}
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Shop by category
          </p>
          <div className="flex flex-wrap gap-2">
            {availableCategories.filter(category => category.isActive !== false && category.slug).slice(0, 8).map(category => (
              <Link key={category._id || category.slug} to={`/category/${category.slug}`}
                className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors"
                style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>
                {category.name}
              </Link>
            ))}
            <Link to="/shop" className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors"
              style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>
              All Products
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
