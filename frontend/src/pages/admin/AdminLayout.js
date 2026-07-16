import React, { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import API from '../../utils/api';
import StoreAssistant from '../../components/admin/StoreAssistant';

const NAV = [
  { path:'/admin',              label:'Dashboard',      exact:true, icon:'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { path:'/admin/products',     label:'Products',                   icon:'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { path:'/admin/orders',       label:'Orders',         badge:'orders',  icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { path:'/admin/returns',      label:'Returns',        badge:'returns', icon:'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
  { path:'/admin/categories',   label:'Categories',                 icon:'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { path:'/admin/customers',    label:'Customers',                  icon:'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { path:'/admin/coupons',      label:'Coupons',                    icon:'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z' },
  { path:'/admin/gift-cards',   label:'Gift Cards',                 icon:'M12 8v13m0-13V6a4 4 0 00-4-4H5.45a2 2 0 00-1.8 1.14L2 7h10V6a4 4 0 00-4-4zm0 0V6a4 4 0 014-4h2.55a2 2 0 011.8 1.14L22 7H12V6a4 4 0 014-4z' },
  { path:'/admin/banners',      label:'Banners & Popups',           icon:'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { path:'/admin/seasonal',     label:'Seasonal',                   icon:'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
  { path:'/admin/deals',        label:'Deals & Offers',             icon:'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
  { path:'/admin/reviews',      label:'Reviews',                    icon:'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { path:'/admin/subscribers',  label:'Subscribers',                icon:'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { path:'/admin/marketing',    label:'Customer Behavior',          icon:'M17 20h5v-2a4 4 0 00-4-4h-1m-5 6H2v-2a4 4 0 014-4h4m2-4a4 4 0 100-8 4 4 0 000 8z' },
  { path:'/admin/layout',       label:'Layout Builder',             icon:'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
  { path:'/admin/seo',          label:'SEO',                        icon:'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { path:'/admin/theme-builder',label:'Theme Builder',              icon:'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  { path:'/admin/animations',   label:'Animations',                 icon:'M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z' },
  { path:'/admin/backup',        label:'Backup Center',              icon:'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  { path:'/admin/settings',     label:'Settings',                   icon:'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { path:'/admin/social-media', label:'Social Media', icon:'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z' },
  { path:'/admin/ai-post-creator', label:'AI Post Creator', icon:'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 002.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z' },
  { path:'/admin/automation',   label:'Automation Rules',           icon:'M13 10V3L4 14h7v7l9-11h-7z' },
  { path:'/admin/billing',      label:'Billing',                    icon:'M3 10h18M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zM7 15h4' },
];

// Maps a sidebar item's path to the Plan.features key that must be enabled
// for it to show up. Items not listed here are considered core and are
// always visible regardless of plan.
const NAV_FEATURE_MAP = {
  '/admin/products':        'products',
  '/admin/orders':          'orders',
  '/admin/returns':         'returns',
  '/admin/categories':      'categories',
  '/admin/customers':       'customers',
  '/admin/coupons':         'coupons',
  '/admin/gift-cards':      'giftCards',
  '/admin/banners':         'banners',
  '/admin/seasonal':        'seasonal',
  '/admin/deals':           'deals',
  '/admin/reviews':         'reviews',
  '/admin/subscribers':     'subscribers',
  '/admin/layout':          'layoutEditor',
  '/admin/seo':             'seo',
  '/admin/theme-builder':   'themeBuilder',
  '/admin/animations':      'animations',
  '/admin/social-media':    'socialMedia',
  '/admin/backup':          'backup',
  '/admin/ai-post-creator': 'aiPostCreator',
  '/admin/automation':      'automation',
};

// ── Core notification types (6 only) ─────────────────────────────────────────
const NOTIF_META = {
  new_order:         { icon: '🛒', bg: 'bg-blue-50',   dot: 'bg-blue-500',  label: 'New Order'        },
  new_user:          { icon: '👤', bg: 'bg-teal-50',   dot: 'bg-teal-500',  label: 'New User'         },
  payment_slip:      { icon: '🏦', bg: 'bg-amber-50',  dot: 'bg-amber-500', label: 'Payment Slip'     },
  payment_confirmed: { icon: '✅', bg: 'bg-green-50',  dot: 'bg-green-500', label: 'Payment Confirmed' },
  cancel_request:    { icon: '🚫', bg: 'bg-red-50',    dot: 'bg-red-500',   label: 'Cancel Request'   },
  return_request:    { icon: '↩️',  bg: 'bg-pink-50',   dot: 'bg-pink-500',  label: 'Return Request'   },
};
const notifMeta = (type) => NOTIF_META[type] || { icon: '🔔', bg: 'bg-gray-50', dot: 'bg-gray-400', label: 'Other' };

function planDaysLeftLabel(billing, plan) {
  if (!billing || !plan) return '';
  if (Number(plan.price || 0) <= 0) return 'Free plan';

  const status = billing.subscriptionStatus || 'active';
  const target =
    status === 'trial' ? billing.trialEndsAt :
    status === 'past_due' ? billing.gracePeriodEndsAt :
    billing.nextPaymentDate;

  if (!target) return 'Plan active';
  const days = Math.ceil((new Date(target).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return status === 'past_due' ? 'Grace ended' : 'Overdue';
  if (days === 0) return status === 'trial' ? 'Trial ends today' : 'Due today';
  if (status === 'trial') return `${days}d trial left`;
  if (status === 'past_due') return `${days}d grace left`;
  return `${days}d left`;
}

function planDaysLeftTone(billing, plan) {
  if (!billing || !plan || Number(plan.price || 0) <= 0) {
    return { color: '#475569', background: '#f1f5f9', border: '#e2e8f0' };
  }
  const status = billing.subscriptionStatus || 'active';
  if (status === 'past_due' || status === 'suspended' || status === 'cancelled') {
    return { color: '#b45309', background: '#fffbeb', border: '#fde68a' };
  }
  if (status === 'trial') return { color: '#2563eb', background: '#eff6ff', border: '#bfdbfe' };
  return { color: '#047857', background: '#ecfdf5', border: '#a7f3d0' };
}

// ─── Sidebar is extracted as a REAL component (not inline) so refs stay stable ─
// Defining it inside AdminLayout caused it to remount every render, which is
// what made the nav scroll to top on every route change.
const Sidebar = React.memo(function Sidebar({ user, logout, navigate, isActive, badges, navRef, nav }) {
  return (
    <div className="flex flex-col h-full" style={{ background: '#0f172a' }}>

      {/* ── Logo ── */}
      <div className="flex-shrink-0 p-5 border-b border-white/10">
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-white text-base leading-tight truncate">StoreKit</p>
            <p className="text-xs text-gray-500">Admin Panel v2</p>
          </div>
        </Link>
      </div>

      {/* ── Nav list ──
          overflow-y-auto  → only THIS element scrolls, never the page
          overscroll-contain → bounce stops here, doesn't bubble to body
          scrollbar hidden via inline style (cross-browser)                */}
      <nav
        ref={navRef}
        className="flex-1 p-3 space-y-0.5 overflow-y-auto overscroll-contain"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {nav.map(item => {
          const active = isActive(item.path, item.exact);
          const badge  = item.badge && badges[item.badge] > 0 ? badges[item.badge] : 0;
          return (
            <Link
              key={item.path}
              to={item.path}
              data-active={active ? 'true' : undefined}
              className={`admin-nav-item ${active ? 'active' : ''}`}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            '10px',
                padding:        '8px 10px',
                borderRadius:   '10px',
                textDecoration: 'none',
                transition:     'background 0.15s',
                minHeight:      '40px',       // prevents items shrinking on mobile
                overflow:       'hidden',     // keeps badge from overflowing row
              }}
            >
              {/* icon — fixed size, never shrinks */}
              <svg
                style={{ width: 18, height: 18, flexShrink: 0 }}
                fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={1.8}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>

              {/* label — takes remaining space, clips with ellipsis */}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>

              {/* badge — fixed width pill so it never wraps or disappears */}
              {badge > 0 && (
                <span style={{
                  flexShrink:     0,
                  background:     'var(--color-primary, #6366f1)',
                  color:          '#fff',
                  fontSize:       10,
                  fontWeight:     700,
                  lineHeight:     1,
                  borderRadius:   999,
                  padding:        '3px 6px',
                  minWidth:       20,
                  textAlign:      'center',
                }}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── User footer ── */}
      <div className="flex-shrink-0 p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {user?.firstName?.[0]}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="text-white text-sm font-semibold truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-gray-500 text-xs">Administrator</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/"
            className="flex-1 text-center text-xs text-gray-400 hover:text-white py-2 rounded-lg hover:bg-white/10 transition-colors"
            style={{ minWidth: 0 }}
          >
            ← Store
          </Link>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex-1 text-center text-xs text-gray-400 hover:text-red-400 py-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

    </div>
  );
});

// ─── Main layout ──────────────────────────────────────────────────────────────
export default function AdminLayout() {
  const { user, logout }        = useAuth();
  const { darkMode, setDarkMode } = useTheme();
  const location                = useLocation();
  const navigate                = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifOpen,     setNotifOpen]     = useState(false);
  const [notifFilter,   setNotifFilter]   = useState('all'); // 'all' | type key
  const [badges,        setBadges]        = useState({ orders: 0, returns: 0 });
  const [billingInfo,   setBillingInfo]   = useState(null);
  // Empty until loaded so restricted plan items do not flash before /tenant/my returns.
  const [planFeatures,  setPlanFeatures]  = useState({});
  const [planLoaded,    setPlanLoaded]     = useState(false);

  // navRef is attached to the <nav> element inside Sidebar.
  // Because Sidebar is a stable component (not redefined each render) the ref
  // persists across route changes and we can scroll it without touching the page.
  const navRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await API.get('/notifications');
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    API.get('/admin/nav-summary', { cacheTTL: 10 * 1000 })
      .then(r => setBadges({ orders: r.data.pendingOrders || 0, returns: r.data.pendingReturns || 0 }))
      .catch(() => {});
    API.get('/billing/status')
      .then(r => {
        setBillingInfo({ billing: r.data?.billing, plan: r.data?.plan });
        setPlanFeatures(r.data?.plan?.features || {});
        setPlanLoaded(true);
      })
      .catch(() => {
        setBillingInfo(null);
        setPlanFeatures({});
        setPlanLoaded(true);
      });
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  const visibleNav = useMemo(() => {
    if (!planLoaded) return NAV.filter(item => item.path === '/admin/settings');
    return NAV.filter(item => {
      const featureKey = NAV_FEATURE_MAP[item.path];
      if (!featureKey) return true; // core item, not plan-gated
      return !!planFeatures[featureKey];
    });
  }, [planFeatures, planLoaded]);

  // Close mobile drawer on navigation
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Scroll ONLY the nav container so the active item stays visible —
  // never touches window.scrollY or the main content scroll position.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector('[data-active="true"]');
    if (!active) return;

    const navTop    = nav.scrollTop;
    const navBot    = navTop + nav.clientHeight;
    const itemTop   = active.offsetTop;
    const itemBot   = itemTop + active.offsetHeight;

    if (itemTop < navTop) {
      nav.scrollTop = itemTop - 8;
    } else if (itemBot > navBot) {
      nav.scrollTop = itemBot - nav.clientHeight + 8;
    }
    // Does NOT call window.scrollTo or affect any element outside nav
  }, [location.pathname]);

  const isActive = useCallback(
    (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path),
    [location.pathname]
  );

  const markAllRead = async () => {
    await API.put('/notifications/read-all');
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleNotifClick = async (notif) => {
    if (!notif.isRead) {
      await API.put(`/notifications/${notif._id}/read`);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n._id === notif._id ? { ...n, isRead: true } : n));
    }
    if (notif.link) { navigate(notif.link); setNotifOpen(false); }
  };

  const currentPage = NAV.find(n => isActive(n.path, n.exact))?.label || 'Admin';
  const planDaysLabel = planDaysLeftLabel(billingInfo?.billing, billingInfo?.plan);
  const planDaysTone = planDaysLeftTone(billingInfo?.billing, billingInfo?.plan);

  // Shared sidebar props
  const sidebarProps = { user, logout, navigate, isActive, badges, navRef, nav: visibleNav };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Desktop sidebar (lg+) ── */}
      <aside className="hidden lg:block flex-shrink-0 w-64 h-screen overflow-hidden">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* ── Mobile drawer ── */}
      {sidebarOpen && (
        <>
          {/* Backdrop — covers entire screen, closes drawer on tap */}
          <div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer panel — sits above backdrop, full height, fixed width */}
          <aside
            className="fixed left-0 top-0 bottom-0 z-50 lg:hidden"
            style={{ width: 256, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <Sidebar {...sidebarProps} />
          </aside>
        </>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top bar ── */}
        <header
          className="bg-white border-b border-gray-100 shadow-sm flex-shrink-0"
          style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          {/* Left: hamburger + page title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-gray-100 flex-shrink-0"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <h1
              className="font-display font-bold text-gray-900"
              style={{ fontSize: 'clamp(14px, 3vw, 18px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {currentPage}
            </h1>
          </div>

          {/* Right: dark mode + notifications + view store */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
              title={darkMode ? 'Light mode' : 'Dark mode'}
              style={{ flexShrink: 0 }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{darkMode ? '☀️' : '🌙'}</span>
            </button>

            {/* Notifications */}
            {planDaysLabel && (
              <Link
                to="/admin/billing"
                title="Plan days left"
                className="inline-flex items-center rounded-full text-xs font-bold"
                style={{
                  height: 28,
                  padding: '0 8px',
                  color: planDaysTone.color,
                  background: planDaysTone.background,
                  border: `1px solid ${planDaysTone.border}`,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {planDaysLabel}
              </Link>
            )}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
                aria-label="Notifications"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position:   'absolute', top: 2, right: 2,
                    background: '#ef4444', color: '#fff',
                    fontSize: 10, fontWeight: 700, lineHeight: 1,
                    borderRadius: 999,
                    minWidth: 16, height: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div
                    className="bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
                    style={{ position:'absolute', right:0, top:'100%', marginTop:8, width:'min(360px, calc(100vw - 24px))' }}
                  >
                    {/* Header */}
                    <div className="px-4 pt-3 pb-2 border-b border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-900 text-sm">Notifications</h3>
                          {unreadCount > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">{unreadCount}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {unreadCount > 0 && (
                            <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">Mark all read</button>
                          )}
                          <button
                            onClick={async () => { await API.delete('/notifications/clear-read'); fetchNotifications(); }}
                            className="text-xs text-gray-400 hover:text-red-500"
                          >Clear read</button>
                        </div>
                      </div>
                      {/* Filter tabs */}
                      <div className="flex gap-1 flex-wrap">
                        {[
                          { key:'all',               label:'All'      },
                          { key:'new_order',         label:'Orders'   },
                          { key:'new_user',          label:'Users'    },
                          { key:'payment_slip',      label:'Slips'    },
                          { key:'payment_confirmed', label:'Payments' },
                          { key:'cancel_request',    label:'Cancels'  },
                          { key:'return_request',    label:'Returns'  },
                        ].map(tab => (
                          <button
                            key={tab.key}
                            onClick={() => setNotifFilter(tab.key)}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                              notifFilter === tab.key
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >{tab.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* List */}
                    <div style={{ maxHeight: 400, overflowY:'auto' }}>
                      {(() => {
                        const filtered = notifFilter === 'all'
                          ? notifications
                          : notifications.filter(n => n.type === notifFilter);
                        if (filtered.length === 0) return (
                          <div className="py-10 text-center">
                            <p className="text-2xl mb-2">🔕</p>
                            <p className="text-sm text-gray-400">No notifications{notifFilter !== 'all' ? ' in this category' : ''}</p>
                          </div>
                        );
                        return filtered.map(n => {
                          const meta = notifMeta(n.type);
                          return (
                            <button
                              key={n._id}
                              onClick={() => handleNotifClick(n)}
                              className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.isRead ? meta.bg : ''}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base ${meta.bg} border border-gray-100`}>
                                  {meta.icon}
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div className="flex items-start justify-between gap-1">
                                    <p className="text-xs font-semibold text-gray-800 leading-tight">{n.title}</p>
                                    {!n.isRead && <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${meta.dot}`}/>}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                                  <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                                </div>
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                      <p className="text-xs text-gray-400">
                        {notifFilter === 'all' ? notifications.length : notifications.filter(n=>n.type===notifFilter).length} notification(s)
                      </p>
                      <button
                        onClick={async () => { await API.delete('/notifications/clear-all'); fetchNotifications(); setNotifOpen(false); }}
                        className="text-xs text-red-400 hover:text-red-600 hover:underline"
                      >Clear all</button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* View store — hidden on very small screens */}
            <Link
              to="/"
              target="_blank"
              className="hidden sm:flex items-center gap-1 text-xs text-gray-500 hover:text-primary bg-gray-100 hover:bg-primary/10 rounded-lg transition-all font-medium whitespace-nowrap"
              style={{ padding: '7px 10px', flexShrink: 0 }}
            >
              ↗ View Store
            </Link>
          </div>
        </header>

        {/* ── Page content ── */}
        <main
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{ padding: 'clamp(12px, 3vw, 24px)' }}
        >
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>

      </div>
      <StoreAssistant />
    </div>
  );
}
