import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { gsap } from 'gsap';
import API from '../../utils/api';
import { useCart } from '../../context/CartContext';
import { useTheme } from '../../context/ThemeContext';
import useSEO, { getSeoConfig } from '../../hooks/useSEO';

const Stars = ({ rating=0 }) => (
  <div className="flex gap-0.5">
    {[1,2,3,4,5].map(s=><svg key={s} className={`w-3 h-3 ${s<=Math.round(rating)?'text-yellow-400':'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>)}
  </div>
);

export default function Shop() {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useTheme();
  const { addItem } = useCart();
  const sym = settings?.currencySymbol || 'Rs.';
  const gridRef = useRef(null);

  const { category: routeCategory } = useParams(); // from /shop/:category route
  const qParams     = new URLSearchParams(location.search);
  const catParam    = routeCategory || qParams.get('category') || '';
  const searchParam = qParams.get('search')   || '';
  const saleParam   = qParams.get('onSale')   === 'true';
  const featParam   = qParams.get('featured') === 'true';

  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);
  const [category,   setCategory]   = useState(catParam);
  const [search,     setSearch]     = useState(searchParam);
  // Debounced copy of `search` — fetchProducts depends on THIS, not `search`,
  // so rapid typing doesn't trigger an API call (and thus an Edge Request)
  // on every keystroke. Waits 500ms after the user stops typing.
  const [debouncedSearch, setDebouncedSearch] = useState(searchParam);
  const [sortBy,     setSortBy]     = useState('newest');
  const [priceMin,   setPriceMin]   = useState('');
  const [priceMax,   setPriceMax]   = useState('');
  const [inStock,    setInStock]    = useState(false);
  const [onSale,     setOnSale]     = useState(saleParam);
  const [subCategory, setSubCategory] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [addedId,    setAddedId]    = useState(null);

  useEffect(() => {
    API.get('/categories/all')
      .then(r => setCategories(r.data || []))
      .catch(() => { API.get('/categories').then(r => setCategories(r.data || [])).catch(() => {}); });
  }, []);

  // Sync category state when navigating via /shop/:category route or ?category= param
  useEffect(() => {
    setCategory(catParam);
    setPage(1);
  }, [catParam]);

  // Sync search state when the ?search= URL param changes (e.g. "See all results" from navbar)
  useEffect(() => {
    setSearch(searchParam);
    setPage(1);
  }, [searchParam]);

  // Debounce: only update debouncedSearch 500ms after the user stops typing.
  // This is what actually triggers fetchProducts (via the dependency below),
  // drastically cutting /api/products calls — and therefore Edge Requests —
  // while the user is typing in the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ page, limit:12, sort:sortBy });
    // Resolve category: could be an _id (from filter panel) or a slug (from navbar /shop/:category)
    if (category) {
      const matched = categories.find(c => c._id === category || c.slug === category);
      q.set('category', matched ? matched._id : category);
    }
    if (subCategory) q.set('subCategory', subCategory);
    if (debouncedSearch) q.set('search', debouncedSearch);
    if (onSale)   q.set('onSale', 'true');
    if (featParam) q.set('featured','true');
    if (inStock)  q.set('inStock','true');
    if (priceMin) q.set('minPrice', priceMin);
    if (priceMax) q.set('maxPrice', priceMax);
    API.get(`/products?${q}`).then(r=>{
      setProducts(r.data.products||[]);
      setTotalPages(r.data.pages||1);
      setTotal(r.data.total||0);
      // GSAP stagger on grid
      setTimeout(()=>{
        if (gridRef.current) {
          gsap.fromTo(gridRef.current.children, {y:30,opacity:0}, {y:0,opacity:1,duration:0.5,stagger:0.05,ease:'power2.out'});
        }
      }, 50);
    }).catch(()=>{}).finally(()=>setLoading(false));
  }, [page, category, subCategory, categories, debouncedSearch, sortBy, onSale, inStock, priceMin, priceMax, featParam]);

  useEffect(() => { setPage(1); }, [category, subCategory, debouncedSearch, sortBy, onSale, inStock, priceMin, priceMax]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Scroll to top of page whenever the page number changes (pagination)
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.documentElement.style.scrollBehavior = '';
      document.body.style.scrollBehavior = '';
    });
  }, [page]);

  const handleAdd = (e, product) => {
    e.preventDefault();
    if (product.variants?.length > 0) { navigate(`/product/${product.slug}`); return; }
    addItem(product);
    setAddedId(product._id);
    setTimeout(() => setAddedId(null), 1200);
  };

  const currentCat = categories.find(c=>c._id===category||c.slug===category);

  // ── SEO for shop/category pages ──────────────────────────────────────────
  // /shop?category=X is the same content as /category/X — canonicalize to
  // the latter so the two URL forms aren't treated as duplicates.
  // Any other filter/sort/search combination is noindex,follow: Google keeps
  // crawling through to the real product/category pages, but doesn't index
  // every permutation of ?sort=&minPrice=&onSale=&search= as its own page.
  const siteUrl = (getSeoConfig().siteUrl || window.location.origin).replace(/\/$/, '');
  const isFiltered = !!(searchParam || onSale || featParam || inStock || priceMin || priceMax || subCategory || sortBy !== 'newest');

  const canonicalPath = currentCat ? `/category/${currentCat.slug}` : '/shop';
  const canonicalUrl  = `${siteUrl}${canonicalPath}${page > 1 ? `?page=${page}` : ''}`;

  useSEO({
    title: currentCat ? currentCat.name : searchParam ? `Search: ${searchParam}` : 'Shop',
    description: currentCat?.description || `Browse our ${currentCat?.name || 'full'} collection — quality products, fast delivery.`,
    url: canonicalUrl,
    noindexFollow: isFiltered,
    breadcrumbs: currentCat ? [
      { name: 'Shop', url: '/shop' },
      { name: currentCat.name, url: `/category/${currentCat.slug}` },
    ] : [{ name: 'Shop', url: '/shop' }],
  });

  return (
    <div style={{background:'var(--body-bg)',minHeight:'100vh'}}>
      {/* Header */}
      <div className="border-b" style={{background:'var(--card-bg)'}}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1 flex-wrap">
                <Link to="/" style={{color:'var(--color-primary)'}}>Home</Link>
                <span>/</span>
                <span className="font-medium text-gray-600">Shop</span>
                {currentCat && <><span>/</span><span className="font-medium text-gray-600">{currentCat.name}</span></>}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900" style={{fontFamily:'var(--font-display)',letterSpacing:'-0.02em'}}>
                {search ? `"${search}"` : currentCat?.name || (onSale ? '🔥 Sale' : featParam ? '⭐ Featured' : 'All Products')}
              </h1>
              <p className="text-sm text-gray-400 mt-0.5">{total} product{total!==1?'s':''} found</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="form-input text-sm py-2 w-auto">
                <option value="newest">Newest</option>
                <option value="price_asc">Price: Low → High</option>
                <option value="price_desc">Price: High → Low</option>
                <option value="rating">Top Rated</option>
                <option value="popular">Most Popular</option>
              </select>
              <button onClick={()=>setFilterOpen(!filterOpen)} className="btn-outline text-sm py-2 px-4 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><line x1="4" y1="6" x2="11" y2="6"/><line x1="8" y1="6" x2="8" y2="2"/><line x1="4" y1="18" x2="11" y2="18"/><line x1="8" y1="22" x2="8" y2="18"/><line x1="13" y1="14" x2="20" y2="14"/><line x1="16" y1="14" x2="16" y2="10"/><line x1="13" y1="2" x2="20" y2="2"/><line x1="16" y1="6" x2="16" y2="2"/></svg>
                Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="flex gap-4 sm:gap-6">
          {/* Sidebar filter (desktop) */}
          <aside className={`flex-shrink-0 w-52 hidden lg:block`}>
            <div className="sticky top-24 space-y-5">
              {/* Search */}
              <div>
                <p className="form-label mb-2">Search</p>
                <div className="relative">
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="form-input pr-8 text-sm py-2"/>
                  {search && <button onClick={()=>setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>}
                </div>
              </div>
              {/* Category + Subcategory */}
              <div>
                <p className="form-label mb-2">Category</p>
                <div className="space-y-1">
                  <button
                    onClick={() => { setCategory(''); setSubCategory(''); }}
                    className={`w-full text-left text-sm px-3 py-1.5 rounded-xl transition-all font-medium ${!category ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    style={!category ? { background: 'var(--theme-gradient)' } : {}}
                  >All Products</button>
                  {categories.filter(c => !c.parent).map(c => {
                    const subs = categories.filter(s => (s.parent?._id || s.parent) === c._id);
                    const isSelected = category === c._id;
                    return (
                      <div key={c._id}>
                        <button
                          onClick={() => { setCategory(c._id); setSubCategory(''); }}
                          className={`w-full text-left text-sm px-3 py-1.5 rounded-xl transition-all font-medium ${isSelected && !subCategory ? 'text-white' : isSelected ? 'text-gray-800 bg-gray-100' : 'text-gray-600 hover:bg-gray-100'}`}
                          style={isSelected && !subCategory ? { background: 'var(--theme-gradient)' } : {}}
                        >{c.name}</button>
                        {/* Subcategories indent */}
                        {isSelected && subs.length > 0 && (
                          <div className="ml-3 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-2">
                            {subs.map(s => (
                              <button
                                key={s._id}
                                onClick={() => setSubCategory(s._id)}
                                className={`w-full text-left text-xs px-2 py-1 rounded-lg transition-all font-medium ${subCategory === s._id ? 'text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                                style={subCategory === s._id ? { background: 'var(--theme-gradient)' } : {}}
                              >{s.name}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Price */}
              <div>
                <p className="form-label mb-2">Price Range</p>
                <div className="flex gap-2">
                  <input type="number" value={priceMin} onChange={e=>setPriceMin(e.target.value)} className="form-input text-xs py-1.5" placeholder="Min"/>
                  <input type="number" value={priceMax} onChange={e=>setPriceMax(e.target.value)} className="form-input text-xs py-1.5" placeholder="Max"/>
                </div>
              </div>
              {/* Toggles */}
              <div className="space-y-2">
                {[['onSale','🔥 On Sale',onSale,()=>setOnSale(!onSale)],['inStock','✅ In Stock',inStock,()=>setInStock(!inStock)]].map(([k,label,val,fn])=>(
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <div onClick={fn} className={`w-10 h-5 rounded-full relative cursor-pointer transition-all flex-shrink-0 ${val?'':'bg-gray-200'}`} style={val?{background:'var(--theme-gradient)'}:{}}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-all`} style={{left:val?22:2}}/>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
              {(category||subCategory||search||onSale||inStock||priceMin||priceMax) && (
                <button onClick={()=>{setCategory('');setSubCategory('');setSearch('');setOnSale(false);setInStock(false);setPriceMin('');setPriceMax('');}} className="text-xs font-bold w-full text-center py-2 rounded-xl transition-all" style={{color:'var(--color-primary)'}}>
                  × Clear All Filters
                </button>
              )}
            </div>
          </aside>

          {/* Mobile filter drawer */}
          {filterOpen && (
            <div className="fixed inset-0 bg-black/50 z-50 lg:hidden" onClick={()=>setFilterOpen(false)}>
              <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-gray-900">Filters</h3><button onClick={()=>setFilterOpen(false)} className="text-gray-400 text-xl">✕</button></div>
                <div className="space-y-4">
                  <div>
                    <p className="form-label">Category</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button onClick={() => { setCategory(''); setSubCategory(''); }} className={`text-sm px-3 py-1.5 rounded-xl font-semibold transition-all ${!category ? 'text-white' : 'bg-gray-100 text-gray-600'}`} style={!category ? { background: 'var(--theme-gradient)' } : {}}>All</button>
                      {categories.filter(c => !c.parent).map(c => (
                        <button key={c._id} onClick={() => { setCategory(c._id); setSubCategory(''); setFilterOpen(false); }} className={`text-sm px-3 py-1.5 rounded-xl font-semibold transition-all ${category === c._id ? 'text-white' : 'bg-gray-100 text-gray-600'}`} style={category === c._id ? { background: 'var(--theme-gradient)' } : {}}>{c.name}</button>
                      ))}
                    </div>
                    {/* Mobile subcategory row */}
                    {category && categories.filter(c => (c.parent?._id || c.parent) === category).length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">Subcategory</p>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setSubCategory('')} className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${!subCategory ? 'text-white' : 'bg-gray-100 text-gray-500'}`} style={!subCategory ? { background: 'var(--theme-gradient)' } : {}}>All</button>
                          {categories.filter(c => (c.parent?._id || c.parent) === category).map(s => (
                            <button key={s._id} onClick={() => { setSubCategory(s._id); setFilterOpen(false); }} className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${subCategory === s._id ? 'text-white' : 'bg-gray-100 text-gray-500'}`} style={subCategory === s._id ? { background: 'var(--theme-gradient)' } : {}}>{s.name}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1"><label className="form-label">Min Price</label><input type="number" value={priceMin} onChange={e=>setPriceMin(e.target.value)} className="form-input"/></div>
                    <div className="flex-1"><label className="form-label">Max Price</label><input type="number" value={priceMax} onChange={e=>setPriceMax(e.target.value)} className="form-input"/></div>
                  </div>
                  {[['onSale','🔥 On Sale Only',onSale,()=>setOnSale(!onSale)],['inStock','✅ In Stock Only',inStock,()=>setInStock(!inStock)]].map(([k,label,val,fn])=>(
                    <label key={k} className="flex items-center gap-3 cursor-pointer">
                      <div onClick={fn} className={`w-11 h-6 rounded-full relative cursor-pointer transition-all flex-shrink-0 ${val?'':'bg-gray-200'}`} style={val?{background:'var(--theme-gradient)'}:{}}>
                        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all`} style={{left:val?22:2}}/>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{label}</span>
                    </label>
                  ))}
                  <button onClick={()=>setFilterOpen(false)} className="btn-primary w-full py-3">Apply Filters</button>
                </div>
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {[...Array(12)].map((_,i)=>(
                  <div key={i} className="skeleton-card" style={{borderRadius:20}}>
                    <div className="skeleton-premium skeleton-img" style={{aspectRatio:'1',borderRadius:'18px 18px 0 0'}}/>
                    <div className="p-4 space-y-2">
                      <div className="skeleton-premium skeleton-badge" style={{width:60}}/>
                      <div className="skeleton-premium skeleton-title"/>
                      <div className="skeleton-premium skeleton-line" style={{width:'55%'}}/>
                      <div className="skeleton-premium skeleton-price"/>
                      <div className="skeleton-premium skeleton-btn" style={{height:40,marginTop:8}}/>
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-gray-700 mb-2" style={{fontFamily:'var(--font-display)'}}>No products found</h3>
                <p className="text-gray-400 text-sm mb-5">Try a different search or browse our categories</p>
                <button onClick={()=>{setSearch('');setCategory('');setSubCategory('');setOnSale(false);setInStock(false);}} className="btn-primary text-sm">Clear Filters</button>
              </div>
            ) : (
              <>
                <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {products.map(product => {
                    const isOnSale = product.isOnSale && product.salePrice;
                    const price    = isOnSale ? product.salePrice : product.price;
                    const discount = isOnSale ? Math.round(((product.price-product.salePrice)/product.price)*100) : 0;
                    const hasVars  = product.variants?.length > 0;
                    const wasAdded = addedId === product._id;
                    return (
                      <article key={product._id} className="product-card group">
                        <Link to={`/product/${product.slug}`} className="block relative overflow-hidden bg-gray-50" style={{aspectRatio:'1/1'}}>
                          <img src={product.thumbnail||product.images?.[0]||'https://via.placeholder.com/300'} alt={product.name} loading="lazy" className="card-img w-full h-full object-cover"/>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"/>
                          <div className="absolute top-2 left-2 flex flex-col gap-1">
                            {isOnSale && <span className="badge badge-sale">{discount}% OFF</span>}
                            {product.isFeatured && !isOnSale && <span className="badge badge-featured">Featured</span>}
                            {product.stock===0 && <span className="badge badge-hot">Sold Out</span>}
                          </div>
                        </Link>
                        <div className="p-2.5 sm:p-3.5">
                          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{product.category?.name}</p>
                          <Link to={`/product/${product.slug}`}><h3 className="font-bold text-xs sm:text-sm leading-snug text-gray-900 line-clamp-2 hover:opacity-60 transition-opacity mb-1 sm:mb-1.5">{product.name}</h3></Link>
                          {product.ratings?.count > 0 && <div className="flex items-center gap-1 mb-1 sm:mb-1.5"><Stars rating={product.ratings.average}/><span className="text-[10px] sm:text-[11px] text-gray-400">({product.ratings.count})</span></div>}
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="min-w-0">
                              <span className="font-black text-sm sm:text-base text-gray-900 leading-tight" style={{fontFamily:'var(--font-display)'}}>{sym} {price?.toLocaleString()}</span>
                              {isOnSale && <span className="text-xs text-gray-400 line-through ml-1 block sm:inline">{sym} {product.price?.toLocaleString()}</span>}
                            </div>
                            {hasVars ? (
                              <Link to={`/product/${product.slug}`} className="flex-shrink-0 text-xs px-3 py-1.5 rounded-xl font-bold text-white" style={{background:'var(--theme-gradient)'}}>Select</Link>
                            ) : (
                              <button onClick={e=>handleAdd(e,product)} disabled={product.stock===0}
                                className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${product.stock>0?'text-white hover:-translate-y-0.5 active:scale-90':'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
                                style={product.stock>0?{background:wasAdded?'#16a34a':'var(--theme-gradient)',boxShadow:wasAdded?'0 4px 16px rgba(22,163,74,0.4)':'0 4px 16px var(--glow-primary)'}:{}}>
                                {wasAdded ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7"/></svg>
                                          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-10">
                    <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="btn-outline text-sm py-2 px-4 disabled:opacity-40">← Prev</button>
                    {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>Math.abs(p-page)<=2||p===1||p===totalPages).map((p,i,arr)=>(
                      <React.Fragment key={p}>
                        {i>0&&arr[i-1]!==p-1&&<span className="self-center text-gray-400 px-1">…</span>}
                        <button onClick={()=>setPage(p)} className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${page===p?'text-white shadow-lg':'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`} style={page===p?{background:'var(--theme-gradient)'}:{}}>{p}</button>
                      </React.Fragment>
                    ))}
                    <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="btn-outline text-sm py-2 px-4 disabled:opacity-40">Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}