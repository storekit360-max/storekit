import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import API from '../../utils/api';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAnimation } from '../../context/AnimationContext';
import { use3DTilt, MagneticButton, Card3D } from '../../components/Cinematic';
import toast from 'react-hot-toast';
import useSEO, { trackAddToCart, trackViewItem } from '../../hooks/useSEO';
import { WhatsAppProductInquiry } from '../../components/WhatsAppWidget';
import PositionBanner from '../../components/PositionBanner';

const effectivePrice = product => product?.isOnSale
  && Number(product.salePrice) > 0
  && Number(product.salePrice) < Number(product.price)
  ? Number(product.salePrice)
  : Number(product?.price || 0);

gsap.registerPlugin(ScrollTrigger);

// Render HTML descriptions properly. AI-generated HTML includes style attributes on h4 tags
// for proper spacing. We preserve them as-is since they're designed for the store theme.
function sanitizeHtml(html) {
  if (!html) return '';
  
  // Check if this contains HTML tags - if so, render them properly
  // Look for any HTML tag pattern
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(html);
  
  if (!hasHtmlTags) {
    // Plain text - return as-is (no HTML to render)
    return html;
  }
  
  // HTML detected - preserve it for proper rendering
  // The AI generates clean HTML with proper structure, so we keep it as-is
  return html;
}

const Stars = ({ rating, count, interactive, selected, onSelect }) => (
  <div className="flex items-center gap-1">
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <svg key={s}
          onClick={() => onSelect && onSelect(s)}
          className={`${interactive ? 'w-6 h-6 cursor-pointer hover:scale-125 transition-transform' : 'w-4 h-4'} ${s <= Math.round(interactive ? selected : rating) ? 'text-yellow-400' : 'text-gray-200'}`}
          fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
        </svg>
      ))}
    </div>
    {count !== undefined && <span className="text-sm text-gray-400">({count})</span>}
  </div>
);

const VariantSelector = ({ variant, selected, onSelect }) => {
  const isColor = variant.type === 'color';
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <label className="text-sm font-black uppercase tracking-wide" style={{ color: 'var(--color-dark)' }}>{variant.name}</label>
        {selected && <span className="text-sm font-semibold text-gray-400">— {variant.values.find(v => v.value === selected)?.label || selected}</span>}
        {variant.required && !selected && <span className="text-xs text-red-500 font-bold">Required</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {variant.values?.filter(v => v.isAvailable !== false).map(val => {
          const isSel = selected === val.value;
          if (isColor && (val.value.startsWith('#') || val.value.startsWith('rgb'))) {
            return (
              <button key={val.value} onClick={() => onSelect(val.value)} title={val.label}
                className={`w-10 h-10 rounded-full transition-all duration-300 ${isSel ? 'scale-110' : 'hover:scale-110'}`}
                style={{ background: val.value, boxShadow: isSel ? `0 0 0 3px white, 0 0 0 5px var(--color-primary), 0 8px 20px var(--glow-primary)` : '0 2px 8px rgba(0,0,0,0.15)' }}>
                {isSel && <span className="text-white text-xs flex items-center justify-center h-full font-black">✓</span>}
              </button>
            );
          }
          return (
            <button key={val.value} onClick={() => onSelect(val.value)}
              className={`px-4 py-2 rounded-xl border-2 text-sm font-bold transition-all duration-300 ${isSel ? 'text-white shadow-lg scale-105' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:scale-105'}`}
              style={isSel ? { background: 'var(--theme-gradient)', borderColor: 'transparent', boxShadow: '0 8px 24px var(--glow-primary)' } : {}}>
              {val.label}
              {val.priceModifier !== 0 && <span className="text-xs ml-1 opacity-75">{val.priceModifier > 0 ? `+` : ''}{val.priceModifier}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default function ProductDetail() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const { user } = useAuth();
  const { settings } = useTheme();
  const { config } = useAnimation();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selImg, setSelImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [reviews, setReviews] = useState([]);
  const [related, setRelated] = useState([]);

  const [similarItems, setSimilarItems] = useState([]);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [brandProducts, setBrandProducts] = useState([]);
  const [siblingCategories, setSiblingCategories] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [tab, setTab] = useState(() => (typeof window !== 'undefined' && window.location.hash === '#reviews') ? 'reviews' : 'description');
  const [wishlist, setWishlist] = useState([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', comment: '' });
  const [reviewableOrderId, setReviewableOrderId] = useState(null);
  const [checkingReviewEligibility, setCheckingReviewEligibility] = useState(true);
  const [selVars, setSelVars] = useState({});
  const [varError, setVarError] = useState('');
  const [adding, setAdding] = useState(false);
  const [waConfig, setWaConfig] = useState(null);
  const [zoomed, setZoomed] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);

  const heroRef   = useRef(null);
  const imgRef    = useRef(null);
  const infoRef   = useRef(null);
  const shineRef  = useRef(null);
  const btnRef    = useRef(null);
  const atcRowRef = useRef(null);

  const sym = settings?.currencySymbol || 'Rs.';

  // ── SEO: dynamic meta for this product ─────────────────────────────────────
  // Build a tenant-specific search description from facts visible on this page.
  const seoDescription = React.useMemo(() => {
    if (!product) return undefined;
    const validSale = product.isOnSale && Number(product.salePrice) > 0 && Number(product.salePrice) < Number(product.price);
    const price     = validSale ? product.salePrice : product.price;
    const origPrice = validSale ? product.price : null;
    const priceStr  = price ? `Rs.${price.toLocaleString()}` : '';
    const wasStr    = origPrice && origPrice !== price ? ` (was Rs.${origPrice.toLocaleString()})` : '';
    const brand     = product.brand ? `${product.brand} ` : '';
    const cat       = product.category?.name ? ` ${product.category.name}` : '';
    const plain     = String(product.shortDescription || product.description || '')
                        .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const snippet   = plain.slice(0, 80) || `${brand}${product.name}`;
    const storeName = settings?.storeName || window.__STOREKIT_SEO__?.siteName || 'this store';
    return priceStr
      ? `${snippet}. ${priceStr}${wasStr}. Check live stock and order from ${storeName}.`.slice(0, 165)
      : `${snippet}. View ${brand}${product.name}${cat}, live stock and ordering details at ${storeName}.`.slice(0, 165);
  }, [product, settings?.storeName]);

  // Build rich keywords — slug-variant pattern matching target page source
  const seoKeywords = React.useMemo(() => {
    if (!product) return undefined;
    const nameLc  = product.name.toLowerCase();
    const slugLc  = (product.slug || product.name).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const brand   = product.brand || '';
    const catName = product.category?.name || '';
    const base    = [product.name, brand, product.sku, catName, ...(product.tags || [])].filter(Boolean);
    const intent  = [
      `${nameLc} price in sri lanka`,
      `buy ${brand} ${product.name}`.trim() + ' online sri lanka',
      `${brand} ${slugLc}`.trim(),
      `${nameLc} price`,
      `colombo delivery ${nameLc}`,
      `${nameLc} review`,
      `buy ${brand.toLowerCase()} ${product.name.toLowerCase()} in sri lanka`.trim(),
      `best ${catName.toLowerCase()} for sri lankan`.trim(),
      `${nameLc} features and price`,
      `sri lankan rupee price ${nameLc}`,
      brand ? `${brand.toLowerCase()} appliances sri lanka` : null,
      'sri lanka',
    ].filter(Boolean);
    return [...base, ...intent].join(', ');
  }, [product]);

  useSEO({
    title:       product?.name,
    description: seoDescription,
    image:       product?.thumbnail || product?.images?.[0],
    type:        'product',
    product,
    reviews,
    noindex: !loading && !product,
    keywords:    seoKeywords,
    breadcrumbs: product ? [
      { name: 'Shop', url: '/shop' },
      { name: product.category?.name || 'Products', url: `/shop?category=${product.category?.slug || ''}` },
      { name: product.name, url: `/product/${product.slug}` },
    ] : undefined,
  });

  useEffect(() => {
    setLoading(true); setSelVars({}); setSimilarLoading(true);
    if (window.location.hash === '#reviews') setTab('reviews'); else setTab('description');
    API.get(`/products/${slug}`).then(r => {
      setProduct(r.data);
      trackViewItem(r.data);
      API.get(`/reviews/product/${r.data._id}`).then(rr => setReviews(rr.data || [])).catch(() => {});

      if (user) {
        setCheckingReviewEligibility(true);
        API.get('/reviews/reviewable').then(rr => {
          const match = (rr.data || []).find(item => String(item.product?._id) === String(r.data._id));
          setReviewableOrderId(match ? match.orderId : null);
        }).catch(() => setReviewableOrderId(null))
          .finally(() => setCheckingReviewEligibility(false));
      } else {
        setCheckingReviewEligibility(false);
      }

      const cat = r.data.category;
      const catId = cat?._id;

      // Fetch subcategory products once — split into two non-overlapping groups
      const loadBothSections = async (productId, productName, categoryId) => {
        const excludeSelf = p => p._id !== productId;
        let subPool = [];

        // Step 1 — same subcategory, fetch enough for both sections
        if (categoryId) {
          try {
            const res = await API.get(`/products?category=${categoryId}&limit=20`);
            subPool = (res.data?.products || res.data || []).filter(excludeSelf);
          } catch (_) {}
        }

        // Similar Items = first 4, Customers Also Viewed = next 4 (no overlap)
        const group1 = subPool.slice(0, 4);
        const group2 = subPool.slice(4, 8);

        setSimilarItems(group1);

        // Customers Also Viewed: top up from parent if needed
        if (group2.length >= 4) {
          setRelated(group2);
          return;
        }

        const shownIds = new Set([productId, ...group1.map(p => p._id), ...group2.map(p => p._id)]);
        let relatedFilled = false;
        try {
          const catRes = await API.get(`/categories`);
          const allCats = catRes.data || [];
          const thisCat = allCats.find(c => c._id?.toString() === categoryId?.toString());
          if (thisCat?.parent) {
            const res2 = await API.get(`/products?category=${thisCat.parent}&limit=12`);
            const parentPool = (res2.data?.products || res2.data || []).filter(p => !shownIds.has(p._id));
            setRelated([...group2, ...parentPool].slice(0, 4));
            relatedFilled = true;
          }
        } catch (_) {}
        if (!relatedFilled) setRelated(group2);

        // Similar Items fallback — subcategory was empty, try name search
        if (group1.length === 0) {
          const nameWords = productName
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3)
            .slice(0, 3)
            .join(' ');
          if (nameWords) {
            try {
              const res3 = await API.get(`/products?search=${encodeURIComponent(nameWords)}&limit=9`);
              const pool3 = (res3.data?.products || res3.data || []).filter(excludeSelf);
              setSimilarItems(pool3.slice(0, 4));
            } catch (_) {}
          }
        }
      };

      loadBothSections(r.data._id, r.data.name, catId).finally(() => setSimilarLoading(false));

      // ── Brand products — "More from [Brand]"
      if (r.data.brand) {
        API.get(`/products?brand=${encodeURIComponent(r.data.brand)}&limit=9`)
          .then(rr => {
            const all = rr.data?.products || rr.data || [];
            setBrandProducts(all.filter(p => p._id !== r.data._id).slice(0, 4));
          })
          .catch(() => {});
      }

      // ── Sibling categories — "Related Categories"
      if (cat?._id) {
        API.get(`/categories/siblings/${cat._id}`)
          .then(rr => setSiblingCategories(rr.data || []))
          .catch(() => {});
      }

      // ── Recently Viewed — track this product in localStorage
      API.post(
        '/marketing/events',
        {eventType:'product_view',productId:r.data._id,source:'product_page',device:navigator.userAgent},
        {suppressAuthRedirect:true}
      ).catch(()=>{});
      try {
        const key = 'sz_recently_viewed';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const updated = [
          { _id: r.data._id, name: r.data.name, slug: r.data.slug,
            thumbnail: r.data.thumbnail || r.data.images?.[0],
            price: r.data.price, salePrice: r.data.salePrice, brand: r.data.brand },
          ...existing.filter(p => p._id !== r.data._id),
        ].slice(0, 10);
        localStorage.setItem(key, JSON.stringify(updated));
        setRecentlyViewed(updated.filter(p => p._id !== r.data._id).slice(0, 4));
      } catch (_) {}
    }).catch(() => toast.error('Product not found')).finally(() => setLoading(false));
    if (user) API.get('/auth/wishlist').then(r => setWishlist(r.data.map(p => p._id))).catch(() => {});
    API.get('/whatsapp/config').then(r => setWaConfig(r.data)).catch(() => {});
  }, [slug, user]);

  /* Cinematic entrance */
  useEffect(() => {
    if (!product || !heroRef.current) return;
    const tl = gsap.timeline();
    tl.fromTo(imgRef.current,
      { opacity: 0, scale: 0.85, rotateY: -20, transformPerspective: 900 },
      { opacity: 1, scale: 1, rotateY: 0, duration: 0.9, ease: 'power3.out' }
    ).fromTo(infoRef.current?.children ? [...infoRef.current.children] : infoRef.current,
      { opacity: 0, x: 60, rotateY: 8, transformPerspective: 900 },
      { opacity: 1, x: 0, rotateY: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out' },
      '-=0.5'
    );
  }, [product]);

  /* Sticky ATC: show after scrolling past the add-to-cart section */
  useEffect(() => {
    if (!product) return;
    const target = atcRowRef.current;
    if (!target) {
      // fallback: use scroll threshold
      const onScroll = () => setStickyVisible(window.scrollY > 600);
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: '0px 0px -20px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [product]);

  /* Image 3D tilt */
  use3DTilt(imgRef, { rotMax: 12, scaleHover: 1.03 });

  /* Shine sweep on image hover */
  useEffect(() => {
    const img   = imgRef.current;
    const shine = shineRef.current;
    if (!img || !shine || !config.cardShine) return;
    const enter = () => gsap.fromTo(shine, { x: '-120%' }, { x: '220%', duration: 0.9, ease: 'power2.out' });
    img.addEventListener('mouseenter', enter);
    return () => img.removeEventListener('mouseenter', enter);
  }, [config.cardShine, product]);

  const getPriceModifier = () => {
    if (!product?.variants) return 0;
    return product.variants.reduce((sum, v) => {
      const val = v.values?.find(x => x.value === selVars[v.name]);
      return sum + (val?.priceModifier || 0);
    }, 0);
  };

  const basePrice = effectivePrice(product);
  const curPrice  = (basePrice || 0) + getPriceModifier();

  const handleAdd = () => {
    if (product?.variants?.length > 0) {
      const missing = product.variants.filter(v => v.required && !selVars[v.name]);
      if (missing.length > 0) { setVarError(`Please select: ${missing.map(v => v.name).join(', ')}`); return; }
    }
    setVarError(''); setAdding(true);
    addItem({ ...product, selectedVariants: selVars, price: curPrice }, qty);
    trackAddToCart(
      { ...product, price: curPrice },
      qty,
      { billing: user ? { email: user.email, phone: user.phone, firstName: user.firstName, lastName: user.lastName } : {} }
    );

    // GSAP button celebration
    const btn = btnRef.current;
    if (btn) {
      gsap.timeline()
        .to(btn, { scale: 0.88, duration: 0.1 })
        .to(btn, { scale: 1.12, duration: 0.2, ease: 'back.out(2)' })
        .to(btn, { scale: 1, duration: 0.3, ease: 'elastic.out(1,0.4)' });
    }

    toast.custom(t => (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border-2 ${t.visible ? 'fade-up' : ''}`}
        style={{ background: 'var(--card-bg)', borderColor: 'var(--color-primary)', minWidth: 250 }}>
        <img src={product.thumbnail || product.images?.[0] || 'https://via.placeholder.com/48'} alt={product.name} width="48" height="48" loading="lazy" decoding="async"
          className="w-12 h-12 rounded-xl object-cover flex-shrink-0"/>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>Added to Cart! 🛒</p>
          <p className="text-xs text-gray-500 truncate">{product.name}</p>
          {Object.keys(selVars).length > 0 && (
            <p className="text-xs text-gray-400">{Object.entries(selVars).map(([k,v]) => `${k}: ${v}`).join(' · ')}</p>
          )}
        </div>
        <div className="text-green-500 text-xl">✓</div>
      </div>
    ), { duration: config.cartToastDuration || 3000, position: config.cartToastPos || 'bottom-right' });

    setTimeout(() => setAdding(false), 1500);
  };

  const toggleWishlist = async () => {
    if (!user) { toast.error('Please log in'); return; }
    await API.post(`/auth/wishlist/${product._id}`);
    setWishlist(p => p.includes(product._id) ? p.filter(id => id !== product._id) : [...p, product._id]);
    toast.success(wishlist.includes(product._id) ? 'Removed from wishlist' : '❤️ Added to wishlist!');
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!user) { toast.error('Please log in'); return; }
    if (!reviewableOrderId) { toast.error('You can only review products you have purchased and received.'); return; }
    setSubmittingReview(true);
    try {
      await API.post('/reviews', { ...reviewForm, product: product._id, order: reviewableOrderId });
      toast.success('Review submitted! ⭐');
      setReviewForm({ rating: 5, title: '', comment: '' });
      setReviewableOrderId(null);
      API.get(`/reviews/product/${product._id}`).then(rr => setReviews(rr.data || [])).catch(() => {});
      API.get(`/products/${slug}`).then(r => setProduct(r.data)).catch(() => {});
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSubmittingReview(false); }
  };

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8" style={{background:'var(--body-bg)'}}>
      {/* Breadcrumb skeleton */}
      <div className="flex gap-2 mb-6">
        {[60,40,80].map((w,i)=><div key={i} className="skeleton-premium skeleton-text-sm" style={{width:w}}/>)}
      </div>
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-14">
        {/* Image skeleton */}
        <div>
          <div className="skeleton-premium" style={{aspectRatio:'1',borderRadius:24,marginBottom:12}}/>
          <div className="flex gap-2">
            {[1,2,3,4].map(i=><div key={i} className="skeleton-premium" style={{width:72,height:72,borderRadius:12,flexShrink:0}}/>)}
          </div>
        </div>
        {/* Info skeleton */}
        <div className="space-y-4">
          <div className="skeleton-premium skeleton-text-sm" style={{width:'40%'}}/>
          <div className="skeleton-premium" style={{height:40,borderRadius:10,width:'85%'}}/>
          <div className="skeleton-premium" style={{height:32,borderRadius:10,width:'55%'}}/>
          <div className="skeleton-premium" style={{height:36,borderRadius:10,width:'45%'}}/>
          <div className="skeleton-premium skeleton-text-sm" style={{width:'30%'}}/>
          <div className="space-y-2 pt-2">
            {[1,2,3].map(i=><div key={i} className="skeleton-premium skeleton-line" style={{width:`${80-i*10}%`}}/>)}
          </div>
          <div className="skeleton-premium" style={{height:200,borderRadius:16}}/>
          <div className="flex gap-3 pt-2">
            <div className="skeleton-premium" style={{width:120,height:52,borderRadius:14}}/>
            <div className="skeleton-premium skeleton-btn" style={{flex:1}}/>
            <div className="skeleton-premium" style={{width:52,height:52,borderRadius:14}}/>
          </div>
        </div>
      </div>
    </div>
  );
  if (!product) return <div className="text-center py-20 text-gray-500">Product not found</div>;

  const images = [product.thumbnail, ...(product.images || [])].filter(Boolean);
  const isOnSale = product.isOnSale && Number(product.salePrice) > 0 && Number(product.salePrice) < Number(product.price);
  const discount = isOnSale ? Math.round(((product.price - product.salePrice) / product.price) * 100) : 0;
  const inWishlist = wishlist.includes(product._id);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ background: 'var(--body-bg)' }}>
      {/* Breadcrumb - Mobile Optimized */}
      <nav className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-400 mb-4 sm:mb-6 flex-wrap overflow-hidden">
        <Link to="/" className="flex-shrink-0 hover:text-primary transition-colors" style={{ color: 'var(--color-primary)' }}>Home</Link>
        <span className="flex-shrink-0">/</span>
        <Link to="/shop" className="flex-shrink-0 hover:text-primary transition-colors" style={{ color: 'var(--color-primary)' }}>Shop</Link>
        {product.category && <>
          <span className="flex-shrink-0">/</span>
          <Link to={`/category/${product.category.slug}`} className="flex-shrink-0 hover:text-primary transition-colors" style={{ color: 'var(--color-primary)' }}>{product.category.name}</Link>
        </>}
        <span className="flex-shrink-0">/</span>
        <span className="text-gray-600 font-medium break-words min-w-0 flex-grow">{product.name}</span>
      </nav>

      <div className="mb-6">
        <PositionBanner position="product_page" productSlug={product.slug} compact />
      </div>

      <div ref={heroRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-14">
        {/* ── Image Gallery ── */}
        <div className="w-full">
          {/* Main image */}
          <div ref={imgRef} className="gallery-main mb-3 w-full"
            onClick={() => setZoomed(true)}
            style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}>
            <img src={images[selImg] || 'https://via.placeholder.com/600'} alt={product.name} width="800" height="800" loading="eager" decoding="async" fetchPriority="high"
              className="w-full h-full object-contain transition-all duration-500"/>
            {/* Shine */}
            <div ref={shineRef} className="absolute inset-0 pointer-events-none z-10"
              style={{ background: 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.3) 50%, transparent 80%)', transform: 'translateX(-120%)' }}/>
            {/* Badges */}
            {isOnSale && <span className="absolute top-4 left-4 price-badge z-20">{discount}% OFF</span>}
            {images.length > 1 && (
              <>
                {selImg > 0 && <button className="gallery-nav gallery-nav-prev" onClick={e=>{e.stopPropagation();const ni=selImg-1;setSelImg(ni);gsap.fromTo(imgRef.current,{opacity:0.5,x:-20},{opacity:1,x:0,duration:0.35,ease:'power2.out'})}}>‹</button>}
                {selImg < images.length-1 && <button className="gallery-nav gallery-nav-next" onClick={e=>{e.stopPropagation();const ni=selImg+1;setSelImg(ni);gsap.fromTo(imgRef.current,{opacity:0.5,x:20},{opacity:1,x:0,duration:0.35,ease:'power2.out'})}}>›</button>}
              </>
            )}
            <div className="swipe-hint">🔍 Click to zoom</div>
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="gallery-thumbnails">
              {images.map((img, i) => (
                <button key={i} onClick={() => {
                  setSelImg(i);
                  gsap.fromTo(imgRef.current, { opacity: 0.4, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' });
                }} className={`gallery-thumb ${selImg===i?'active':''}`}>
                  <img src={img} alt={`${product.name} — view ${i + 1}`} width="96" height="96" loading="lazy" decoding="async"/>
                </button>
              ))}
            </div>
          )}

          {/* Dots */}
          {images.length > 1 && (
            <div className="gallery-dots">
              {images.map((_,i)=><button key={i} onClick={()=>setSelImg(i)} className={`gallery-dot ${selImg===i?'active':''}`}/>)}
            </div>
          )}

          {product.imageAttribution?.provider && (
            <p className="mt-2 text-[11px] text-gray-400">
              Photo by{' '}
              <a href={product.imageAttribution.photographerUrl || product.imageAttribution.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-gray-600">
                {product.imageAttribution.photographer || 'a contributor'}
              </a>{' '}
              on{' '}
              <a href={product.imageAttribution.sourceUrl || 'https://www.pexels.com'} target="_blank" rel="noreferrer" className="underline hover:text-gray-600">
                {product.imageAttribution.provider}
              </a>
            </p>
          )}
        </div>

        {/* ── Product Info ── */}
        <div ref={infoRef} className="flex flex-col gap-3 sm:gap-4">
          {/* Brand + title */}
          <div className="w-full">
            {product.brand && <p className="text-xs font-black uppercase tracking-widest mb-1 sm:mb-2" style={{ color: 'var(--color-primary)', opacity: 0.7 }}>{product.brand}</p>}
            <h1 className="product-detail-title text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-black leading-tight break-words" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-dark)', letterSpacing: '-0.025em', wordBreak: 'break-word', overflowWrap: 'break-word', hyphens: 'auto' }}>
              {product.name}
            </h1>
          </div>

          {/* Rating */}
          {product.ratings?.count > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Stars rating={product.ratings.average} count={product.ratings.count}/>
              <span className="text-xs sm:text-sm text-gray-400">({product.ratings.count} {product.ratings.count === 1 ? 'review' : 'reviews'})</span>
            </div>
          )}

          {/* Price */}
          <div className="price-display flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="price-current text-lg sm:text-xl font-bold" style={{ color: 'var(--color-primary)' }}>
              {sym} {curPrice?.toLocaleString()}
            </span>
            {isOnSale && (
              <>
                <span className="price-original text-sm sm:text-base line-through">{sym} {product.price?.toLocaleString()}</span>
                <span className="price-badge text-xs sm:text-sm">-{discount}%</span>
              </>
            )}
          </div>
          {getPriceModifier() !== 0 && (
            <p className="text-xs text-gray-400">Base {sym} {basePrice?.toLocaleString()} + {sym} {getPriceModifier()} variant</p>
          )}

          {/* Short desc */}
          {product.shortDescription && <p className="text-gray-600 leading-relaxed text-xs sm:text-sm lg:text-base">{product.shortDescription}</p>}

          {/* Stock */}
          <div className="stock-indicator flex items-center gap-2">
            <div className={`stock-dot ${product.stock > 10 ? 'in-stock' : product.stock > 0 ? 'low-stock' : 'out-stock'}`}/>
            <span className={`text-xs sm:text-sm font-medium ${product.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
              {product.stock > 10 ? `In Stock (${product.stock} available)` : product.stock > 0 ? `Only ${product.stock} left!` : 'Out of Stock'}
            </span>
          </div>

          {/* Variants */}
          {product.variants?.length > 0 && (
            <div className="border-t border-gray-100 pt-3 sm:pt-4">
              {product.variants.map(v => (
                <VariantSelector key={v.name} variant={v} selected={selVars[v.name]}
                  onSelect={val => { setSelVars(p => ({ ...p, [v.name]: val })); setVarError(''); }}/>
              ))}
              {varError && (
                <p className="text-red-500 text-xs sm:text-sm font-bold flex items-center gap-1">⚠️ {varError}</p>
              )}
            </div>
          )}

          {/* Qty + Add - Mobile Responsive */}
          {product.stock > 0 && (
            <div ref={atcRowRef} className="product-atc-row flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
              <div className="qty-stepper flex-shrink-0" style={{ order: 2 }}>
                <button className="qty-stepper-btn" onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty<=1}>−</button>
                <span className="qty-stepper-val">{qty}</span>
                <button className="qty-stepper-btn" onClick={() => setQty(q => Math.min(product.stock, q + 1))}>+</button>
              </div>
              <MagneticButton ref={btnRef} onClick={handleAdd}
                className="btn-primary py-3 sm:py-3.5 text-sm sm:text-base font-black w-full sm:flex-1 order-1 sm:order-2"
                style={{ flex: '1 1 0', minWidth: 0, background: adding ? 'linear-gradient(135deg,#16a34a,#22c55e)' : undefined }}>
                {adding ? '✓ Added!' : '🛒 Add to Cart'}
              </MagneticButton>
              <button onClick={toggleWishlist}
                className={`wish-btn flex-shrink-0 ${inWishlist?'active':''}`}
                title={inWishlist?'Remove from wishlist':'Add to wishlist'}
                style={{ order: 3 }}>
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill={inWishlist ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{color:inWishlist?'#ef4444':'#94a3b8'}}>
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
                </svg>
              </button>
            </div>
          )}

          {/* Delivery info */}
          <div className="rounded-2xl p-3 sm:p-4 border text-xs sm:text-sm" style={{ background: 'rgba(181,69,27,0.03)', borderColor: 'rgba(181,69,27,0.12)' }}>
            <div className="flex items-center gap-2 font-bold mb-1" style={{ color: 'var(--color-primary)' }}>
              🚚 Delivery from {sym} {settings?.standardDelivery || 600}
              {settings?.freeDeliveryThreshold && ` · Free over ${sym} ${settings.freeDeliveryThreshold.toLocaleString()}`}
            </div>
            <p className="text-xs text-gray-400">{settings?.maxReturnDays || 7}-day easy returns</p>
          </div>

          {/* Trust signals */}
          <div className="grid grid-cols-2 gap-2">
            {[{icon:'🔒',text:'Secure Payment'},  {icon:'↩️',text:'Easy Returns'}, {icon:'⭐',text:'Quality Assured'}, {icon:'📦',text:'Fast Shipping'}].map(({icon,text})=>(
              <div key={text} className="flex items-center gap-2 text-xs text-gray-500 font-semibold p-2 sm:p-2.5 rounded-xl bg-gray-50">
                <span className="flex-shrink-0">{icon}</span><span className="break-words">{text}</span>
              </div>
            ))}
          </div>

          {/* WhatsApp inquiry */}
          {waConfig?.whatsappEnabled && waConfig?.whatsappNumber && (
            <WhatsAppProductInquiry
              productName={product?.name}
              productUrl={typeof window !== 'undefined' ? window.location.href : ''}
              waNumber={waConfig.whatsappNumber}
              waMessage={waConfig.whatsappPrefilledMessage}
            />
          )}

          {/* Meta */}
          <div className="text-xs text-gray-400 space-y-1 border-t border-gray-100 pt-3">
            {product.sku && <p>SKU: <span className="font-mono text-xs break-all">{product.sku}</span></p>}
{/* Tags are used for SEO meta keywords only — not displayed in UI */}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="mt-8 sm:mt-14">
        <div className="flex gap-1 border-b overflow-x-auto mb-4 sm:mb-6" style={{ borderColor: 'var(--card-border)' }}>
          {['description', 'specifications', 'reviews'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm font-bold capitalize transition-all border-b-2 -mb-px whitespace-nowrap ${t === tab ? '' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
              style={t === tab ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}>
              {t}
              {t === 'reviews' && product.ratings?.count > 0 && ` (${product.ratings.count})`}
            </button>
          ))}
        </div>

        {tab === 'description' && (
          <div className="prose prose-sm sm:prose max-w-none text-gray-600 leading-relaxed text-xs sm:text-sm lg:text-base"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }} />
        )}

        {tab === 'specifications' && (
          product.specifications?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {product.specifications.map((s, i) => (
                <Card3D key={i} className="flex gap-4 rounded-2xl p-3 sm:p-4 border text-xs sm:text-sm" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }} rotMax={8}>
                  <span className="text-xs sm:text-sm font-black text-gray-500 w-24 sm:w-32 flex-shrink-0 break-words">{s.key}</span>
                  <span className="text-xs sm:text-sm text-gray-800 font-semibold break-words">{s.value}</span>
                </Card3D>
              ))}
            </div>
          ) : <p className="text-gray-400 text-sm">No specifications listed.</p>
        )}

        {tab === 'reviews' && (
          <div>
            {reviews.length > 0 ? (
              <div className="space-y-4 mb-10">
                {reviews.map(r => (
                  <Card3D key={r._id} className="rounded-2xl p-5 border" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }} rotMax={5}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0" style={{ background: 'var(--theme-gradient)' }}>
                          {r.user?.firstName?.[0]}
                        </div>
                        <div>
                          <p className="font-bold text-sm" style={{ color: 'var(--color-dark)' }}>{r.user?.firstName} {r.user?.lastName}</p>
                          <Stars rating={r.rating}/>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    {r.title && <p className="font-bold text-sm mb-1" style={{ color: 'var(--color-dark)' }}>{r.title}</p>}
                    <p className="text-gray-600 text-sm">{r.comment}</p>
                  </Card3D>
                ))}
              </div>
            ) : <p className="text-gray-400 text-sm mb-8">No reviews yet. Be the first!</p>}

            <div className="rounded-3xl p-6 sm:p-8 border" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <h3 className="font-black text-lg mb-5" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-dark)' }}>Write a Review</h3>
              {!user ? (
                <p className="text-gray-500 text-sm">Please <Link to="/login" className="font-bold hover:underline" style={{ color: 'var(--color-primary)' }}>sign in</Link> to write a review.</p>
              ) : checkingReviewEligibility ? (
                <p className="text-gray-400 text-sm">Checking your purchase history...</p>
              ) : !reviewableOrderId ? (
                <p className="text-gray-500 text-sm">
                  Only customers who have purchased and received this product can leave a review.
                  {' '}<Link to="/my-orders" className="font-bold hover:underline" style={{ color: 'var(--color-primary)' }}>View your orders</Link>.
                </p>
              ) : (
                <form onSubmit={submitReview} className="space-y-4">
                  <div><label className="form-label">Rating</label><Stars rating={0} interactive selected={reviewForm.rating} onSelect={s => setReviewForm(p => ({ ...p, rating: s }))}/></div>
                  <div><label className="form-label">Title</label><input value={reviewForm.title} onChange={e => setReviewForm(p => ({ ...p, title: e.target.value }))} className="form-input" placeholder="Summary..."/></div>
                  <div><label className="form-label">Review</label><textarea value={reviewForm.comment} onChange={e => setReviewForm(p => ({ ...p, comment: e.target.value }))} rows={4} className="form-input resize-none" placeholder="Share your experience..."/></div>
                  <MagneticButton type="submit" className="btn-primary" style={{}} onClick={submitReview}>
                    {submittingReview ? 'Submitting...' : 'Submit Review ⭐'}
                  </MagneticButton>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Similar Items ── */}
      <div className="mt-16">
          <div className="flex items-center justify-between mb-6 gap-4">
            <h2 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-dark)', letterSpacing: '-0.025em' }}>
              Similar Items
            </h2>
            {product?.category?._id && (
              <Link to={`/shop?category=${product.category._id}`}
                className="text-sm font-bold shrink-0 hover:underline"
                style={{ color: 'var(--color-primary)' }}>
                View all in {product.category.name} →
              </Link>
            )}
          </div>
          {similarLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="rounded-2xl overflow-hidden border" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                  <div className="skeleton-premium" style={{ aspectRatio: '1' }} />
                  <div className="p-3.5 space-y-2">
                    <div className="skeleton-premium skeleton-text-sm" style={{ width: '80%' }} />
                    <div className="skeleton-premium skeleton-text-sm" style={{ width: '45%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {similarItems.map((p) => (
                <div key={p._id} className="product-card" style={{ transformStyle: 'preserve-3d' }}>
                  <Link to={`/product/${p.slug}`} className="block overflow-hidden bg-gray-50" style={{ aspectRatio: '1' }}>
                    <img src={p.thumbnail || p.images?.[0]} alt={p.name} width="600" height="600" loading="lazy" decoding="async" className="card-img w-full h-full object-cover" />
                  </Link>
                  <div className="p-3.5" style={{ background: 'var(--card-bg)' }}>
                    <Link to={`/product/${p.slug}`}>
                      <p className="text-sm font-bold line-clamp-2 hover:opacity-60 transition-opacity" style={{ color: 'var(--color-dark)', fontFamily: 'var(--font-display)' }}>{p.name}</p>
                    </Link>
                    <p className="font-black mt-1.5 text-base" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                      {sym} {effectivePrice(p).toLocaleString()}
                    </p>
                    {effectivePrice(p) < Number(p.price) && (
                      <p className="text-xs text-gray-400 line-through">{sym} {p.price?.toLocaleString()}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* ── Similar Products — "Customers Also Viewed" ── */}
      <div className="mt-16">
        <div className="flex items-center justify-between mb-6 gap-4">
          <h2 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-dark)', letterSpacing: '-0.025em' }}>
            Customers Also Viewed
          </h2>
          {product?.category?.slug && (
            <Link to={`/shop?category=${product.category._id}`}
              className="text-sm font-bold shrink-0 hover:underline"
              style={{ color: 'var(--color-primary)' }}>
              View all in {product.category.name} →
            </Link>
          )}
        </div>
        {related.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-2xl overflow-hidden border" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <div className="skeleton-premium" style={{ aspectRatio: '1' }} />
                <div className="p-3.5 space-y-2">
                  <div className="skeleton-premium skeleton-text-sm" style={{ width: '80%' }} />
                  <div className="skeleton-premium skeleton-text-sm" style={{ width: '45%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {related.map((p) => (
              <div key={p._id} className="product-card" style={{ transformStyle: 'preserve-3d' }}>
                <Link to={`/product/${p.slug}`} className="block overflow-hidden bg-gray-50" style={{ aspectRatio: '1' }}>
                  <img src={p.thumbnail || p.images?.[0]} alt={p.name} width="600" height="600" loading="lazy" decoding="async" className="card-img w-full h-full object-cover" />
                </Link>
                <div className="p-3.5" style={{ background: 'var(--card-bg)' }}>
                  <Link to={`/product/${p.slug}`}>
                    <p className="text-sm font-bold line-clamp-2 hover:opacity-60 transition-opacity" style={{ color: 'var(--color-dark)', fontFamily: 'var(--font-display)' }}>{p.name}</p>
                  </Link>
                  <p className="font-black mt-1.5 text-base" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                    {sym} {effectivePrice(p).toLocaleString()}
                  </p>
                  {effectivePrice(p) < Number(p.price) && (
                    <p className="text-xs text-gray-400 line-through">{sym} {p.price?.toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── More from Brand ── */}
      {product?.brand && brandProducts.length > 0 && (
        <div className="mt-16">
          <div className="flex items-center justify-between mb-6 gap-4">
            <h2 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-dark)', letterSpacing: '-0.025em' }}>
              More from {product.brand}
            </h2>
            <Link
              to={`/shop?brand=${encodeURIComponent(product.brand)}`}
              className="text-sm font-bold shrink-0 hover:underline"
              style={{ color: 'var(--color-primary)' }}>
              All {product.brand} Products →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {brandProducts.map(p => (
              <div key={p._id} className="product-card" style={{ transformStyle: 'preserve-3d' }}>
                <Link to={`/product/${p.slug}`} className="block overflow-hidden bg-gray-50" style={{ aspectRatio: '1' }}>
                  <img src={p.thumbnail || p.images?.[0]} alt={`${product.brand} — ${p.name}`} width="600" height="600" loading="lazy" decoding="async" className="card-img w-full h-full object-cover" />
                </Link>
                <div className="p-3.5" style={{ background: 'var(--card-bg)' }}>
                  <Link to={`/product/${p.slug}`}>
                    <p className="text-sm font-bold line-clamp-2 hover:opacity-60 transition-opacity" style={{ color: 'var(--color-dark)', fontFamily: 'var(--font-display)' }}>{p.name}</p>
                  </Link>
                  <p className="font-black mt-1.5 text-base" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                    {sym} {effectivePrice(p).toLocaleString()}
                  </p>
                  {effectivePrice(p) < Number(p.price) && (
                    <p className="text-xs text-gray-400 line-through">{sym} {p.price?.toLocaleString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Related Categories ── */}
      {siblingCategories.length > 0 && (
        <div className="mt-16">
          <h2 className="text-xl sm:text-2xl font-black mb-5" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-dark)', letterSpacing: '-0.025em' }}>
            Related Categories
          </h2>
          <div className="flex flex-wrap gap-3">
            {/* Current category — highlighted */}
            {product?.category && (
              <Link
                to={`/shop?category=${product.category._id}`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black border-2 transition-all"
                style={{ background: 'var(--theme-gradient)', color: '#fff', borderColor: 'transparent', boxShadow: '0 4px 16px var(--glow-primary)' }}>
                ★ {product.category.name}
              </Link>
            )}
            {siblingCategories.filter(c => c._id !== product?.category?._id).map(cat => (
              <Link
                key={cat._id}
                to={`/shop?category=${cat._id}`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold border-2 hover:scale-105 transition-all"
                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--color-dark)' }}>
                {cat.name}
              </Link>
            ))}
            {/* Link to parent category if exists */}
            {siblingCategories[0]?.parent && (
              <Link
                to={`/shop?category=${siblingCategories[0].parent._id || siblingCategories[0].parent}`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold border-2 hover:scale-105 transition-all"
                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--color-primary)' }}>
                ← All {siblingCategories[0]?.parentName || 'Categories'}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Recently Viewed ── */}
      {recentlyViewed.length > 0 && (
        <div className="mt-16">
          <h2 className="text-xl sm:text-2xl font-black mb-5" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-dark)', letterSpacing: '-0.025em' }}>
            Recently Viewed
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {recentlyViewed.map(p => (
              <div key={p._id} className="product-card" style={{ transformStyle: 'preserve-3d' }}>
                <Link to={`/product/${p.slug}`} className="block overflow-hidden bg-gray-50" style={{ aspectRatio: '1' }}>
                  <img src={p.thumbnail} alt={p.name} width="600" height="600" className="card-img w-full h-full object-cover" loading="lazy" decoding="async" />
                </Link>
                <div className="p-3.5" style={{ background: 'var(--card-bg)' }}>
                  <Link to={`/product/${p.slug}`}>
                    <p className="text-sm font-bold line-clamp-2 hover:opacity-60 transition-opacity" style={{ color: 'var(--color-dark)', fontFamily: 'var(--font-display)' }}>{p.name}</p>
                  </Link>
                  {p.brand && <p className="text-xs text-gray-400 mt-0.5 font-semibold">{p.brand}</p>}
                  <p className="font-black mt-1.5 text-base" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                    {sym} {effectivePrice(p).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Image Zoom Modal ── */}
      {zoomed && images[selImg] && (
        <div className="img-zoom-modal" onClick={() => setZoomed(false)}>
          <button className="img-zoom-close" onClick={() => setZoomed(false)}>✕</button>
          <img src={images[selImg]} alt={product.name} width="1200" height="1200" decoding="async" onClick={e => e.stopPropagation()}/>
        </div>
      )}

      {/* ── Sticky Add to Cart ── */}
      {stickyVisible && product?.stock > 0 && (
        <div className="sticky-atc">
          <div className="sticky-atc-inner">
            <img src={images[0]} alt={product.name} width="48" height="48" loading="lazy" decoding="async" className="sticky-atc-img hidden sm:block"/>
            <div className="sticky-atc-info">
              <div className="sticky-atc-name">{product.name}</div>
              <div className="sticky-atc-price" style={{color:'var(--color-primary)'}}>{sym} {curPrice?.toLocaleString()}</div>
            </div>
            <div className="qty-stepper mr-2 hidden sm:flex">
              <button className="qty-stepper-btn" onClick={()=>setQty(q=>Math.max(1,q-1))} disabled={qty<=1}>−</button>
              <span className="qty-stepper-val">{qty}</span>
              <button className="qty-stepper-btn" onClick={()=>setQty(q=>Math.min(product.stock,q+1))}>+</button>
            </div>
            <button className="sticky-atc-btn" onClick={handleAdd}>
              🛒 Add to Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
