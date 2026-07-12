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

// ── Brand FAQ + ItemList schema injection ─────────────────────────────────────
function injectBrandSchemas(brandName, slug, products, siteUrl) {
  ['brand-faq-schema', 'brand-itemlist-schema'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  const brandUrl = `${siteUrl}/brand/${slug}`;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `Where can I buy genuine ${brandName} products in Sri Lanka?`,
        acceptedAnswer: { '@type': 'Answer', text: `You can buy genuine ${brandName} products in Sri Lanka at StoreKit (${brandUrl}). All ${brandName} products are authentic and backed by the manufacturer's warranty.` },
      },
      {
        '@type': 'Question',
        name: `Does StoreKit deliver ${brandName} products across Sri Lanka?`,
        acceptedAnswer: { '@type': 'Answer', text: `Yes, StoreKit delivers ${brandName} products island-wide across Sri Lanka within 1–5 business days. Fast delivery available to Colombo, Kandy, Galle, and all major cities.` },
      },
      {
        '@type': 'Question',
        name: `Are ${brandName} products at StoreKit covered by warranty?`,
        acceptedAnswer: { '@type': 'Answer', text: `Yes, all ${brandName} products at StoreKit are covered by the manufacturer's warranty. StoreKit also offers a 14-day hassle-free return policy.` },
      },
      {
        '@type': 'Question',
        name: `What ${brandName} products are available in Sri Lanka at StoreKit?`,
        acceptedAnswer: { '@type': 'Answer', text: `StoreKit stocks a wide range of ${brandName} products in Sri Lanka. Visit ${brandUrl} to browse the full collection including the latest models at competitive prices.` },
      },
    ],
  };

  const faqEl = document.createElement('script');
  faqEl.type = 'application/ld+json';
  faqEl.id = 'brand-faq-schema';
  faqEl.textContent = JSON.stringify(faqSchema);
  document.head.appendChild(faqEl);

  if (products && products.length > 0) {
    const itemListSchema = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${brandName} Products in Sri Lanka | StoreKit`,
      url: brandUrl,
      mainEntity: {
        '@type': 'ItemList',
        name: `${brandName} Products`,
        numberOfItems: products.length,
        itemListElement: products.slice(0, 20).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Product',
            name: p.name,
            url: `${siteUrl}/product/${p.slug}`,
            image: p.thumbnail || p.images?.[0] || undefined,
            brand: { '@type': 'Brand', name: brandName },
            offers: {
              '@type': 'Offer',
              priceCurrency: 'LKR',
              price: String(p.salePrice || p.price || 0),
              availability: (p.stock > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
            ...(p.ratings?.count > 0 ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(p.ratings.average).toFixed(1),
                reviewCount: p.ratings.count,
                bestRating: '5',
                worstRating: '1',
              },
            } : {}),
          },
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

// ── Brand content library ─────────────────────────────────────────────────────
const BRAND_INFO = {
  sony: {
    name: 'Sony',
    tagline: 'Be Moved',
    description: `Sony is a global leader in audio, electronics, and entertainment technology, renowned for innovation and premium build quality. From iconic headphones and speakers to televisions, cameras, and gaming hardware, Sony has defined the benchmark for consumer electronics for over 75 years.

At StoreKit, we carry an extensive selection of Sony products available in Sri Lanka — including Sony WH-1000XM series noise-cancelling headphones, Sony Bravia TVs, Sony Xperia smartphones, and PlayStation accessories. All Sony products sold at StoreKit are authentic and covered by manufacturer warranty.

Whether you're upgrading your home audio setup, searching for a powerful new camera, or equipping your gaming station, Sony's engineering excellence ensures an experience that exceeds expectations. Explore the full Sony range at StoreKit and enjoy fast island-wide delivery, competitive pricing, and our trusted 14-day return policy.`,
  },
  philips: {
    name: 'Philips',
    tagline: 'Innovation and You',
    description: `Philips is a world-renowned Dutch technology company with a legacy spanning over 130 years, trusted globally for its commitment to health, well-being, and meaningful innovation. From personal care and home appliances to audio equipment and lighting, Philips products are designed to make everyday life better.

StoreKit is proud to offer a comprehensive range of Philips products in Sri Lanka, including Philips air fryers, blenders, electric shavers, hair dryers, Philips Hue smart lighting, and audio devices. Every product reflects Philips' dedication to quality, reliability, and thoughtful design.

Philips home appliances are engineered to save time and energy while delivering superior performance. Their personal care products use advanced technology to give salon-quality results at home. Shop genuine Philips products at StoreKit with confidence — fast delivery across Sri Lanka, manufacturer warranty on all items, and our hassle-free return policy.`,
  },
  samsung: {
    name: 'Samsung',
    tagline: 'Do What You Can\'t',
    description: `Samsung Electronics is one of the world's largest technology companies, manufacturing an unrivalled range of smartphones, TVs, home appliances, and audio products. Samsung's Galaxy series smartphones are among the most popular in Sri Lanka, combining cutting-edge cameras, powerful processors, and stunning displays.

At StoreKit, we offer the latest Samsung products including Galaxy smartphones, Samsung QLED and OLED televisions, Samsung refrigerators, washing machines, air conditioners, and Galaxy buds earphones. All Samsung products are sourced from authorised channels and come with full manufacturer warranties.

Samsung's commitment to innovation means every product pushes boundaries — from foldable displays on smartphones to Bespoke home appliances with customisable panels. Browse the full Samsung catalogue at StoreKit and take advantage of competitive prices, fast delivery across Sri Lanka, and our expert customer support team.`,
  },
  jbl: {
    name: 'JBL',
    tagline: 'Hear the World',
    description: `JBL is one of the most respected names in audio, with over 75 years of acoustic engineering excellence. Known for powerful bass, clear vocals, and durable construction, JBL products are the go-to choice for music lovers, athletes, and professionals across the world.

At StoreKit Sri Lanka, we carry a wide range of JBL products including JBL portable Bluetooth speakers, over-ear headphones, true wireless earbuds, soundbars, and car audio equipment. JBL's signature PRO SOUND technology delivers concert-quality audio whether you're at home, outdoors, or on the move.

The JBL Charge, Flip, and Xtreme series are among the most loved portable speakers in Sri Lanka — waterproof, durable, and delivering impressively loud sound from a compact form. Shop authentic JBL products at StoreKit with island-wide delivery, competitive prices, and the reassurance of a genuine manufacturer warranty.`,
  },
};

function getDefaultBrandInfo(brandSlug) {
  const name = brandSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return {
    name,
    tagline: `Official ${name} Products`,
    description: `Shop genuine ${name} products at StoreKit — Sri Lanka's trusted online store. Browse our full ${name} collection including the latest models, all backed by manufacturer warranty and fast island-wide delivery.

${name} products available at StoreKit are sourced from authorised channels, ensuring you receive 100% authentic items at competitive prices. Our ${name} range is regularly updated with the latest releases so you never miss out.

At StoreKit, we make it easy to find and buy the ${name} product you need. Detailed specifications, verified customer reviews, and clear pricing help you make an informed choice. Enjoy secure checkout, flexible payment options, and our 14-day return policy on all ${name} purchases.`,
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
  const gridRef = useRef(null);

  const brandInfo = BRAND_INFO[slug.toLowerCase()] || getDefaultBrandInfo(slug);
  const brandName = brandInfo.name;

  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);
  const [sortBy,     setSortBy]     = useState('newest');
  const [addedId,    setAddedId]    = useState(null);

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

  // Inject FAQ + ItemList schemas when products load
  useEffect(() => {
    if (!products.length) return;
    injectBrandSchemas(brandName, slug, products, siteUrl);
    return () => {
      ['brand-faq-schema', 'brand-itemlist-schema'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

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
    title: `${brandName} Products — Buy Online in Sri Lanka | StoreKit`,
    description: `Shop genuine ${brandName} products online in Sri Lanka at StoreKit. Best prices, fast delivery, manufacturer warranty. Browse the full ${brandName} range today.`,
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
                Official Brand Store
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
              const price = product.salePrice || product.price;
              const hasDiscount = product.salePrice && product.salePrice < product.price;
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
            {['sony', 'philips', 'samsung', 'jbl'].filter(b => b !== slug.toLowerCase()).map(b => (
              <Link key={b} to={`/brand/${b}`}
                className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors capitalize"
                style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>
                {b.charAt(0).toUpperCase() + b.slice(1)}
              </Link>
            ))}
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Shop by category
          </p>
          <div className="flex flex-wrap gap-2">
            {[['audio', 'Audio'], ['electronics', 'Electronics'], ['appliances', 'Appliances']].map(([s, label]) => (
              <Link key={s} to={`/category/${s}`}
                className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors"
                style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>
                {label}
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
