import React, { lazy, Suspense, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { SeasonalProvider } from './context/SeasonalContext';
import { ThemeProvider } from './context/ThemeContext';
import { AnimationProvider } from './context/AnimationContext';
import { ScrollProgressBar, FloatingShapes } from './components/Cinematic';
import AnalyticsBootstrap from './hooks/useAnalytics';

// ─── Lazy-loaded Customer Pages ───────────────────────────────────────────────
// Each page is code-split into its own chunk. If one chunk fails to load
// (e.g. CDN edge hasn't propagated the new build yet), only that route errors
// — the shell and other routes stay alive. ErrorBoundary in index.js catches
// chunk-load failures and shows a "Reload" prompt instead of a white screen.
const Home           = lazy(() => import('./pages/customer/Home'));
const Shop           = lazy(() => import('./pages/customer/Shop'));
const CategoryPage   = lazy(() => import('./pages/customer/CategoryPage'));
const BrandPage      = lazy(() => import('./pages/customer/BrandPage'));
const ProductDetail  = lazy(() => import('./pages/customer/ProductDetail'));
const Cart           = lazy(() => import('./pages/customer/Cart'));
const Checkout       = lazy(() => import('./pages/customer/Checkout'));

const ForgotPassword = lazy(() => import('./pages/customer/ForgotPassword'));
const Account        = lazy(() => import('./pages/customer/Account'));
const MyOrders       = lazy(() => import('./pages/customer/MyOrders'));
const Wishlist       = lazy(() => import('./pages/customer/Wishlist'));
const GiftCards      = lazy(() => import('./pages/customer/GiftCards'));
const Returns        = lazy(() => import('./pages/customer/Returns'));
const BusinessPage   = lazy(() => import('./pages/customer/BusinessPage'));
const CampaignPage   = lazy(() => import('./pages/customer/CampaignPage'));
const CustomerLayout = lazy(() => import('./pages/customer/CustomerLayout'));

// ─── Lazy-loaded Admin Pages ──────────────────────────────────────────────────
// Admin bundle is large — lazy-loading keeps it completely out of the customer
// bundle, which also speeds up the initial customer page load.
const Dashboard          = lazy(() => import('./pages/admin/Dashboard'));
const AdminProducts      = lazy(() => import('./pages/admin/Products'));
const AdminOrders        = lazy(() => import('./pages/admin/Orders'));
const AdminOrderDetail   = lazy(() => import('./pages/admin/OrderDetail'));

const AdminSettings      = lazy(() => import('./pages/admin/Settings'));
const AdminReturns       = lazy(() => import('./pages/admin/Returns'));
const AdminGiftCards     = lazy(() => import('./pages/admin/GiftCards'));
const AdminSeasonal      = lazy(() => import('./pages/admin/Seasonal'));
const AdminSubscribers   = lazy(() => import('./pages/admin/Subscribers'));
const AdminSEO           = lazy(() => import('./pages/admin/SEO'));
const AnimationSettings  = lazy(() => import('./pages/admin/AnimationSettings'));
const ThemeBuilder       = lazy(() => import('./pages/admin/ThemeBuilder'));
const LayoutEditor       = lazy(() => import('./pages/admin/LayoutEditor'));
const AdminLayout        = lazy(() => import('./pages/admin/AdminLayout'));
const Monitoring         = lazy(() => import('./pages/admin/Monitoring'));
const SocialMediaSettings = lazy(() => import('./pages/admin/SocialMedia'));
const AIPostCreator      = lazy(() => import('./pages/admin/AIPostCreator'));
const AutomationRules    = lazy(() => import('./pages/admin/AutomationRules'));
const BackupCenter       = lazy(() => import('./pages/admin/BackupCenter'));
const AdminDeals         = lazy(() => import('./pages/admin/Deals'));

const SuperAdminLogin = lazy(() => import('./pages/superadmin/SuperAdminLogin'));
const SuperAdminDashboard = lazy(() => import('./pages/superadmin/SuperAdminDashboard'));

// ─── Lazy wrapper helpers for named exports ───────────────────────────────────
// Some modules export multiple components; we unwrap them here so lazy() works.
const OrderSuccess   = (props) => {
  const Mod = lazy(() => import('./pages/customer/OrderSuccess').then(m => ({ default: m.OrderSuccess })));
  return <Suspense fallback={<PageLoader/>}><Mod {...props}/></Suspense>;
};
const OrderTracking  = (props) => {
  const Mod = lazy(() => import('./pages/customer/OrderSuccess').then(m => ({ default: m.OrderTracking })));
  return <Suspense fallback={<PageLoader/>}><Mod {...props}/></Suspense>;
};
const Login = (props) => {
  const Mod = lazy(() => import('./pages/customer/Login').then(m => ({ default: m.Login })));
  return <Suspense fallback={<PageLoader/>}><Mod {...props}/></Suspense>;
};
const Register = (props) => {
  const Mod = lazy(() => import('./pages/customer/Login').then(m => ({ default: m.Register })));
  return <Suspense fallback={<PageLoader/>}><Mod {...props}/></Suspense>;
};
const AdminCategories = (props) => {
  const Mod = lazy(() => import('./pages/admin/Categories').then(m => ({ default: m.AdminCategories })));
  return <Suspense fallback={<PageLoader/>}><Mod {...props}/></Suspense>;
};
const AdminCustomers = (props) => {
  const Mod = lazy(() => import('./pages/admin/Categories').then(m => ({ default: m.AdminCustomers })));
  return <Suspense fallback={<PageLoader/>}><Mod {...props}/></Suspense>;
};
const AdminCoupons = (props) => {
  const Mod = lazy(() => import('./pages/admin/Coupons'));
  return <Suspense fallback={<PageLoader/>}><Mod {...props}/></Suspense>;
};
const AdminBanners = (props) => {
  const Mod = lazy(() => import('./pages/admin/Banners').then(m => ({ default: m.AdminBanners })));
  return <Suspense fallback={<PageLoader/>}><Mod {...props}/></Suspense>;
};
const AdminReviews = (props) => {
  const Mod = lazy(() => import('./pages/admin/Banners').then(m => ({ default: m.AdminReviews })));
  return <Suspense fallback={<PageLoader/>}><Mod {...props}/></Suspense>;
};

// ─── Page loading fallback ────────────────────────────────────────────────────
// Shown while a lazy chunk is downloading. Matches the site's bg colour so
// there's no jarring flash — it just looks like the page is thinking.
function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--body-bg, #fafaf8)',
    }}>
      <div style={{
        width: 40,
        height: 40,
        border: '3px solid var(--border-color, #e5e7eb)',
        borderTopColor: 'var(--color-primary, #15803d)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Scroll restoration ───────────────────────────────────────────────────────
function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const forceTop = () => {
      document.documentElement.style.scrollBehavior = 'auto';
      document.body.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    forceTop();

    const raf1 = requestAnimationFrame(() => {
      forceTop();
      const raf2 = requestAnimationFrame(() => {
        forceTop();
        document.documentElement.style.scrollBehavior = '';
        document.body.style.scrollBehavior = '';
      });
      return () => cancelAnimationFrame(raf2);
    });

    return () => cancelAnimationFrame(raf1);
  }, [pathname]);

  return null;
}

// ─── Route guards ─────────────────────────────────────────────────────────────
const AdminRoute = ({ children }) => {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login"/>;
  if (!isAdmin) return <Navigate to="/"/>;
  return children;
};

const SuperAdminRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user || user.role !== 'superadmin') return <Navigate to="/superadmin/login" replace/>;
  return children;
};

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
};

const toastStyle = {
  fontFamily: 'var(--font-body)', fontSize: '14px',
  borderRadius: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
  padding: '12px 16px',
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <ThemeProvider>
          <SeasonalProvider>
            <AnimationProvider>
              <BrowserRouter>
                <ScrollToTop/>
                <AnalyticsBootstrap />
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    duration: 3000,
                    style: toastStyle,
                    success: { iconTheme: { primary: 'var(--color-primary)', secondary: '#fff' } },
                  }}
                />
                <ScrollProgressBar/>
                <FloatingShapes/>

                {/*
                  Suspense wraps ALL routes. React.lazy chunks download
                  progressively — if any chunk 404s (CDN edge hasn't
                  propagated yet), React throws a "Loading chunk failed"
                  error which ErrorBoundary in index.js catches and shows
                  a "Reload" button instead of a white screen.
                */}
                <Suspense fallback={<PageLoader/>}>
                  <Routes>
                    <Route element={<CustomerLayout/>}>
                      <Route path="/"                    element={<Home/>}/>
                      <Route path="/shop"                element={<Shop/>}/>
                      <Route path="/shop/:category"      element={<Shop/>}/>
                      <Route path="/category/:slug"      element={<CategoryPage/>}/>
                      <Route path="/brand/:slug"         element={<BrandPage/>}/>
                      <Route path="/product/:slug"       element={<ProductDetail/>}/>
                      <Route path="/cart"                element={<Cart/>}/>
                      <Route path="/checkout"            element={<Checkout/>}/>
                      <Route path="/order-success/:id"   element={<OrderSuccess/>}/>
                      <Route path="/track-order/:id"     element={<OrderTracking/>}/>
                      <Route path="/wishlist"            element={<Wishlist/>}/>
                      <Route path="/gift-cards"          element={<GiftCards/>}/>
                      <Route path="/returns"             element={<ProtectedRoute><Returns/></ProtectedRoute>}/>
                      <Route path="/account"             element={<ProtectedRoute><Account/></ProtectedRoute>}/>
                      <Route path="/my-orders"           element={<ProtectedRoute><MyOrders/></ProtectedRoute>}/>
                      <Route path="/page/:slug"          element={<BusinessPage/>}/>
                      <Route path="/campaign/:slug"      element={<CampaignPage/>}/>
                    </Route>

                    <Route path="/login"           element={<Login/>}/>
                    <Route path="/register"        element={<Register/>}/>
                    <Route path="/forgot-password" element={<ForgotPassword/>}/>

                    <Route path="/superadmin/login" element={<SuperAdminLogin/>}/>
                    <Route path="/superadmin" element={<SuperAdminRoute><SuperAdminDashboard/></SuperAdminRoute>}/>

                    <Route path="/admin" element={<AdminRoute><AdminLayout/></AdminRoute>}>
                      <Route index                   element={<Dashboard/>}/>
                      <Route path="products"         element={<AdminProducts/>}/>
                      <Route path="orders"           element={<AdminOrders/>}/>
                      <Route path="orders/:id"       element={<AdminOrderDetail/>}/>
                      <Route path="categories"       element={<AdminCategories/>}/>
                      <Route path="customers"        element={<AdminCustomers/>}/>
                      <Route path="coupons"          element={<AdminCoupons/>}/>
                      <Route path="banners"          element={<AdminBanners/>}/>
                      <Route path="seasonal"         element={<AdminSeasonal/>}/>
                      <Route path="reviews"          element={<AdminReviews/>}/>
                      <Route path="returns"          element={<AdminReturns/>}/>
                      <Route path="gift-cards"       element={<AdminGiftCards/>}/>
                      <Route path="subscribers"      element={<AdminSubscribers/>}/>
                      <Route path="seo"              element={<AdminSEO/>}/>
                      <Route path="settings"         element={<AdminSettings/>}/>
                      <Route path="layout"           element={<LayoutEditor/>}/>
                      <Route path="animations"       element={<AnimationSettings/>}/>
                      <Route path="theme-builder"    element={<ThemeBuilder/>}/>
                      <Route path="social-media"     element={<SocialMediaSettings/>}/>
                      <Route path="ai-post-creator"  element={<AIPostCreator/>}/>
                      <Route path="automation"       element={<AutomationRules/>}/>
                      <Route path="deals"            element={<AdminDeals/>}/>
                      <Route path="monitoring"       element={<Monitoring/>}/>
                      <Route path="backup"           element={<BackupCenter/>}/>
                    </Route>
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </AnimationProvider>
          </SeasonalProvider>
        </ThemeProvider>
      </CartProvider>
    </AuthProvider>
  );
}