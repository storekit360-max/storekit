/**
 * CategoryPage.js — SEO-friendly category landing page
 * Route: /category/:slug  (e.g. /category/audio, /category/electronics)
 *
 * Features:
 *  - Canonical URL at /category/:slug (clean, no query params)
 *  - Unique SEO title + meta description per category
 *  - BreadcrumbList + Organization JSON-LD schemas
 *  - 200–500 word category description for Google rankings
 *  - All products in that category rendered with pagination
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { gsap } from 'gsap';
import API from '../../utils/api';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import useSEO from '../../hooks/useSEO';

// ── FAQ content per category ──────────────────────────────────────────────────
const CATEGORY_FAQS = {
  audio: [
    { q: 'What audio brands are available in Sri Lanka at StoreKit?', a: 'StoreKit stocks top audio brands including Sony, JBL, Bose, Philips, and more — all available online in Sri Lanka with island-wide delivery.' },
    { q: 'Can I buy wireless headphones online in Sri Lanka?', a: 'Yes! StoreKit offers a wide range of wireless Bluetooth headphones and earbuds online in Sri Lanka. Browse our audio category for the latest models with fast delivery.' },
    { q: 'What is the return policy for audio products at StoreKit?', a: 'All audio products at StoreKit come with a 14-day hassle-free return policy. Returns are free and processed promptly.' },
    { q: 'Are audio products sold at StoreKit covered by warranty?', a: "Yes, all audio equipment at StoreKit is sourced from authorised channels and covered by the manufacturer's warranty." },
  ],
  electronics: [
    { q: 'What electronics are available online in Sri Lanka at StoreKit?', a: 'StoreKit offers smartphones, laptops, tablets, smart home devices, accessories, and more from leading global brands — all available online in Sri Lanka with fast delivery.' },
    { q: 'Can I buy genuine electronics online in Sri Lanka?', a: 'Yes. All electronics at StoreKit are 100% genuine, sourced from authorised distributors, and covered by manufacturer warranty.' },
    { q: 'How fast is delivery for electronics in Sri Lanka?', a: 'StoreKit delivers electronics island-wide within 1–5 business days. Express delivery is available to Colombo and major cities.' },
    { q: 'What payment methods are accepted for electronics at StoreKit?', a: 'StoreKit accepts credit/debit cards, bank transfers, and cash on delivery for electronics purchases in Sri Lanka.' },
  ],
  appliances: [
    { q: 'What home appliances can I buy online in Sri Lanka at StoreKit?', a: 'StoreKit stocks a full range of home appliances including air fryers, washing machines, refrigerators, ACs, blenders, and more from Philips, Samsung, Panasonic, and other top brands.' },
    { q: 'Are home appliances at StoreKit covered by warranty?', a: "Yes, all home appliances at StoreKit come with the manufacturer's warranty. We also offer a 14-day return policy for peace of mind." },
    { q: 'How are large appliances delivered in Sri Lanka?', a: 'StoreKit delivers large appliances with careful packaging island-wide. Installation support is available for select products such as air conditioners and washing machines.' },
    { q: 'Which are the best appliance brands available in Sri Lanka?', a: 'StoreKit stocks appliances from Philips, Samsung, Panasonic, LG, Tefal, Bajaj, Midea, and more — all available online in Sri Lanka.' },
  ],
};

function getCategoryFAQs(slug, catName) {
  const faqs = CATEGORY_FAQS[slug] || [
    { q: `Where can I buy ${catName} online in Sri Lanka?`, a: `StoreKit is Sri Lanka's trusted online store for ${catName}. Browse our full range, compare prices, and enjoy fast island-wide delivery.` },
    { q: `What is the delivery time for ${catName} in Sri Lanka?`, a: `StoreKit delivers ${catName} across Sri Lanka within 1–5 business days. Same-day dispatch available for orders placed before noon.` },
    { q: `Are ${catName} products at StoreKit genuine?`, a: `Yes, all ${catName} at StoreKit are 100% authentic, sourced from authorised channels, and covered by manufacturer warranty.` },
    { q: `What is the return policy for ${catName} at StoreKit?`, a: `StoreKit offers a 14-day hassle-free return policy on all ${catName}. Returns are free and processed promptly.` },
  ];
  return faqs;
}

// Inject FAQ + ItemList JSON-LD schemas into document head
function injectCategorySchemas(faqs, products, catName, canonicalUrl, aggregateRating) {
  // Remove old schemas injected by this function
  ['cat-faq-schema', 'cat-itemlist-schema'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const faqEl = document.createElement('script');
  faqEl.type = 'application/ld+json';
  faqEl.id = 'cat-faq-schema';
  faqEl.textContent = JSON.stringify(faqSchema);
  document.head.appendChild(faqEl);

  if (products && products.length > 0) {
    const itemListSchema = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${catName} — Buy Online in Sri Lanka | StoreKit`,
      url: canonicalUrl,
      ...(aggregateRating ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: aggregateRating.average,
          reviewCount: aggregateRating.count,
          bestRating: '5',
          worstRating: '1',
        },
      } : {}),
      mainEntity: {
        '@type': 'ItemList',
        name: catName,
        numberOfItems: products.length,
        itemListElement: products.slice(0, 20).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Product',
            name: p.name,
            url: `${window.__STOREKIT_SEO__?.siteUrl || window.location.origin}/product/${p.slug}`,
            image: p.thumbnail || p.images?.[0] || undefined,
            ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
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
    listEl.id = 'cat-itemlist-schema';
    listEl.textContent = JSON.stringify(itemListSchema);
    document.head.appendChild(listEl);
  }
}

// ── Category SEO content library ─────────────────────────────────────────────
// 200-500 word descriptions keyed by category slug for Google ranking signals.
const CATEGORY_DESCRIPTIONS = {
  audio: `Discover our premium audio collection at StoreKit — your one-stop destination for high-quality sound equipment in Sri Lanka. Whether you're a music enthusiast, a professional audiophile, or simply looking for a reliable pair of headphones for daily commuting, we have exactly what you need.

Our audio range includes wireless Bluetooth headphones, noise-cancelling earbuds, portable Bluetooth speakers, home theatre systems, soundbars, and professional studio monitors. Every product is sourced from trusted global brands including Sony, JBL, Bose, Philips, and more — all backed by manufacturer warranties and our 14-day return policy.

Wireless audio technology has transformed how we experience music and entertainment. Our Bluetooth headphones deliver crystal-clear sound with deep bass and precise highs, while long battery life ensures your music never stops. For commuters and fitness enthusiasts, our true wireless earbuds offer a secure, tangle-free fit with active noise cancellation that blocks out the world.

Home audio is equally important — our range of soundbars and speaker systems transform any living room into a cinema-like experience. With Dolby Atmos support and multi-room connectivity, you can fill every corner of your home with rich, immersive sound.

Shop with confidence at StoreKit: fast delivery across Sri Lanka, secure payment options, and a dedicated customer support team ready to help you find the perfect audio product. Compare prices, read verified reviews, and enjoy the best deals on audio equipment available online in Sri Lanka today.`,

  electronics: `StoreKit brings you Sri Lanka's widest selection of electronics — from the latest smartphones and laptops to smart home devices and essential accessories. Whether you need cutting-edge technology for work, entertainment, or everyday life, our electronics collection has you covered.

Explore flagship smartphones from Samsung, Apple, and other leading brands, all available at competitive prices with fast delivery to your doorstep. Our laptop range covers everything from lightweight ultrabooks for professionals to powerful gaming laptops for enthusiasts.

Smart home technology is reshaping how we live, and StoreKit is at the forefront. Browse smart bulbs, robot vacuums, security cameras, and Wi-Fi routers that make your home more connected and convenient. Our accessories category includes screen protectors, cases, chargers, power banks, and cables to keep your devices running and protected.

All electronics at StoreKit come with official warranty coverage. Our product pages include detailed specifications, real customer reviews, and high-resolution images so you can make a fully informed purchase. We offer flexible payment options and easy returns, making online electronics shopping in Sri Lanka safe and straightforward.

Whether you're upgrading your setup or searching for the perfect gift, StoreKit is the trusted choice for electronics in Sri Lanka. Fast delivery, best prices, and authentic products — every time.`,

  appliances: `Transform your home with StoreKit's comprehensive range of home appliances — the best selection available online in Sri Lanka. From kitchen essentials to large household appliances, we stock everything you need to make daily life easier, more efficient, and more enjoyable.

Our kitchen appliance range includes air fryers, microwave ovens, blenders, food processors, electric kettles, rice cookers, and coffee machines from globally trusted brands like Philips, Panasonic, Bajaj, and Tefal. Every appliance is designed to save you time in the kitchen without sacrificing the quality of your cooking.

For the laundry room, choose from front-load and top-load washing machines, dryers, and ironing systems that handle even the heaviest loads with ease. Our refrigerators and freezers come in a range of capacities, finishes, and energy ratings to suit every household size and budget.

StoreKit's air conditioner collection covers split ACs, portable ACs, and inverter models that keep your home cool efficiently — perfect for Sri Lanka's tropical climate. All major brands including Carrier, Midea, and LG are available with installation support.

Shop appliances online at StoreKit with total confidence: browse detailed specifications, compare models side-by-side, read verified buyer reviews, and complete your purchase securely. We deliver across Sri Lanka with careful packaging to ensure your appliance arrives in perfect condition. Enjoy the convenience of the best home appliances at the best prices — only at StoreKit.`,
};

// Generate a default description for any category not in the library
function getDefaultDescription(catName) {
  return `Explore StoreKit's complete ${catName} collection — the best selection of ${catName} products available online in Sri Lanka. We bring you top brands, competitive prices, and fast island-wide delivery.

Every ${catName} product in our range is carefully selected for quality and value. Browse detailed specifications, compare models, and read verified customer reviews to make a confident buying decision.

At StoreKit, we believe great shopping starts with great choice. Our ${catName} range is regularly updated with the latest models and best deals, so you'll always find what you're looking for at a price that works for you.

Shop ${catName} online at StoreKit with fast delivery across Sri Lanka, secure checkout, and our 14-day hassle-free return policy. Our customer support team is always on hand to help you find the perfect product.`;
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

export default function CategoryPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { settings } = useTheme();
  const { addItem } = useCart();
  const sym = settings?.currencySymbol || 'Rs.';
  const gridRef = useRef(null);

  const [category,   setCategory]   = useState(null);
  const [products,   setProducts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [catLoading, setCatLoading] = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);
  const [sortBy,     setSortBy]     = useState('newest');
  const [addedId,    setAddedId]    = useState(null);

  // Load category metadata
  useEffect(() => {
    setCatLoading(true);
    API.get('/categories/all')
      .then(r => {
        const cats = r.data || [];
        const found = cats.find(c => c.slug === slug);
        setCategory(found || null);
      })
      .catch(() => setCategory(null))
      .finally(() => setCatLoading(false));
  }, [slug]);

  // Load products for this category
  const fetchProducts = useCallback(() => {
    if (!category) return;
    setLoading(true);
    const q = new URLSearchParams({ page, limit: 12, sort: sortBy, category: category._id });
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
  }, [page, sortBy, category]);

  // ── SEO ───────────────────────────────────────────────────────────────────
  const catName = category?.name || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const siteUrl = window.__STOREKIT_SEO__?.siteUrl || window.location.origin;
  const canonicalUrl = `${siteUrl}/category/${slug}`;

  const seoTitle = category
    ? `${category.name} — Buy Online in Sri Lanka | StoreKit`
    : `${catName} | StoreKit Sri Lanka`;

  const seoDesc = category?.description
    ? category.description.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
    : `Shop the best ${catName} online in Sri Lanka. Top brands, best prices, fast delivery. Browse our full ${catName} range at StoreKit.`;

  // Build aggregate rating across all loaded products for CollectionPage schema
  const categoryAggregateRating = React.useMemo(() => {
    const rated = products.filter(p => p.ratings?.count > 0);
    if (!rated.length) return null;
    const totalRatings = rated.reduce((sum, p) => sum + p.ratings.count, 0);
    const weightedSum  = rated.reduce((sum, p) => sum + p.ratings.average * p.ratings.count, 0);
    return {
      count: totalRatings,
      average: (weightedSum / totalRatings).toFixed(1),
    };
  }, [products]);

  // Inject FAQ + ItemList schemas when products/category loads
  useEffect(() => {
    if (!category || products.length === 0) return;
    const faqs = getCategoryFAQs(slug, catName);
    injectCategorySchemas(faqs, products, catName, canonicalUrl, categoryAggregateRating);
    return () => {
      ['cat-faq-schema', 'cat-itemlist-schema'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, category, categoryAggregateRating]);

  useEffect(() => { setPage(1); }, [sortBy, slug]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.style.scrollBehavior = '';
    });
  }, [page]);

  const handleAdd = (e, product) => {
    e.preventDefault();
    if (product.variants?.length > 0) { navigate(`/product/${product.slug}`); return; }
    addItem(product);
    setAddedId(product._id);
    setTimeout(() => setAddedId(null), 1200);
  };

  useSEO({
    title: seoTitle,
    description: seoDesc,
    url: canonicalUrl,
    keywords: `${catName}, buy ${catName} online sri lanka, ${catName} price in sri lanka, best ${catName.toLowerCase()} brands, ${catName.toLowerCase()} delivery colombo, ${catName.toLowerCase()} online shopping, storekit sri lanka`,
    breadcrumbs: [
      { name: 'Shop', url: '/shop' },
      { name: catName, url: `/category/${slug}` },
    ],
  });

  const displayDescription = CATEGORY_DESCRIPTIONS[slug] || getDefaultDescription(catName);

  if (catLoading) {
    return (
      <div style={{ background: 'var(--body-bg)', minHeight: '100vh' }}
        className="flex items-center justify-center">
        <div className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}/>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--body-bg)', minHeight: '100vh' }}>
      {/* Header */}
      <div className="border-b" style={{ background: 'var(--card-bg)' }}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-3 flex-wrap">
            <Link to="/" style={{ color: 'var(--color-primary)' }}>Home</Link>
            <span>/</span>
            <Link to="/shop" style={{ color: 'var(--color-primary)' }}>Shop</Link>
            <span>/</span>
            <span className="font-medium text-gray-600">{catName}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-2"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
            {catName}
          </h1>
          <p className="text-sm text-gray-400">{total} product{total !== 1 ? 's' : ''} found</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6">
        {/* Sort bar */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{total} results</p>
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
              <div key={i} className="rounded-2xl animate-pulse" style={{ background: 'var(--card-bg)', height: '280px' }}/>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-4">🔍</p>
            <p className="font-semibold">No products found in this category yet.</p>
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
                  className="group rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
                  style={{ background: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  {/* Image */}
                  <div className="relative overflow-hidden aspect-square bg-gray-50">
                    <img
                      src={product.thumbnail || product.images?.[0]}
                      alt={`${product.brand ? product.brand + ' ' : ''}${product.name}${product.category?.name ? ' — ' + product.category.name : ''} — buy online Sri Lanka`}
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
                  {/* Info */}
                  <div className="p-3">
                    {product.brand && (
                      <p className="text-xs text-gray-400 mb-0.5">{product.brand}</p>
                    )}
                    <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 mb-1"
                      style={{ fontFamily: 'var(--font-body)' }}>
                      {product.name}
                    </h3>
                    {product.ratings?.count > 0 && (
                      <div className="flex items-center gap-1 mb-1">
                        <Stars rating={product.ratings.average}/>
                        <span className="text-xs text-gray-400">({product.ratings.count})</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
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
                  border: `1px solid var(--color-primary)`,
                }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Category Description (SEO content block) */}
        <div className="mt-12 rounded-2xl p-6 sm:p-8"
          style={{ background: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 className="text-xl font-bold text-gray-800 mb-4"
            style={{ fontFamily: 'var(--font-display)' }}>
            About {catName}
          </h2>
          <div className="text-sm text-gray-600 leading-relaxed space-y-3">
            {displayDescription.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>

        {/* Internal linking — related categories and brands for SEO + UX */}
        <div className="mt-8 rounded-2xl p-5"
          style={{ background: 'var(--card-bg)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Also explore
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/shop" className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors"
              style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>
              All Products
            </Link>
            <Link to="/shop?onSale=true" className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors"
              style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>
              Sale Items
            </Link>
            <Link to="/shop?featured=true" className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors"
              style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>
              Featured
            </Link>
            {slug !== 'audio'       && <Link to="/category/audio"       className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors" style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>Audio</Link>}
            {slug !== 'electronics' && <Link to="/category/electronics" className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors" style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>Electronics</Link>}
            {slug !== 'appliances'  && <Link to="/category/appliances"  className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors" style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>Appliances</Link>}
          </div>
          {/* Popular brand links — boosts brand page crawling & internal link equity */}
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-4 mb-3">
            Shop by brand
          </p>
          <div className="flex flex-wrap gap-2">
            {['sony', 'philips', 'samsung', 'jbl'].map(brand => (
              <Link key={brand} to={`/brand/${brand}`}
                className="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors capitalize"
                style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)', background: 'transparent' }}>
                {brand.charAt(0).toUpperCase() + brand.slice(1)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}