import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import API from '../utils/api';
import { analyticsConsentAllowed } from '../components/CookieConsent';

const SESSION_KEY = 'storekit:click-analytics-count';
const MAX_SESSION_EVENTS = 60;
const MIN_INTERVAL_MS = 750;

export function pageBucket(pathname) {
  const path = String(pathname || '/').toLowerCase();
  if (path === '/') return 'home';
  if (path === '/shop') return 'shop';
  if (path.startsWith('/category/') || path.startsWith('/shop/')) return 'category';
  if (path.startsWith('/brand/')) return 'brand';
  if (path.startsWith('/product/')) return 'product';
  if (path === '/cart') return 'cart';
  if (path.startsWith('/checkout')) return 'checkout';
  if (path.startsWith('/account')) return 'account';
  if (path.startsWith('/orders')) return 'orders';
  if (path.startsWith('/wishlist')) return 'wishlist';
  if (path.startsWith('/returns')) return 'returns';
  if (path.startsWith('/page/') || path.startsWith('/campaign/')) return 'content';
  return 'other';
}

function viewportBucket(width) { return width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'; }
function sessionCount() { try { return Number(sessionStorage.getItem(SESSION_KEY) || 0); } catch { return MAX_SESSION_EVENTS; } }
function incrementSessionCount() { try { sessionStorage.setItem(SESSION_KEY, String(sessionCount() + 1)); } catch { } }

export default function useStorefrontClickAnalytics(user) {
  const location = useLocation();
  useEffect(() => {
    if (!user || user.role !== 'customer') return undefined;
    let active = true; let marketingConsent = false; let lastSentAt = 0;
    const permitted = () => active && marketingConsent && analyticsConsentAllowed() && sessionCount() < MAX_SESSION_EVENTS;
    API.get('/marketing/consent', { suppressAuthRedirect: true }).then(({ data }) => { marketingConsent = data?.granted === true; }).catch(() => { marketingConsent = false; });
    const consentChanged = event => { marketingConsent = event.detail?.granted === true; };
    const click = event => {
      if (!event.isTrusted || event.button !== 0 || !permitted() || Date.now() - lastSentAt < MIN_INTERVAL_MS) return;
      const interactive = event.target?.closest?.('a,button,[role="button"],input[type="submit"]');
      if (!interactive || interactive.closest('[data-analytics-ignore="true"]')) return;
      const root = document.documentElement; const width = Math.max(root.scrollWidth, root.clientWidth, 1); const height = Math.max(root.scrollHeight, root.clientHeight, 1);
      const normalizedX = Math.min(0.999, Math.max(0, event.pageX / width)); const normalizedY = Math.min(0.999, Math.max(0, event.pageY / height));
      lastSentAt = Date.now(); incrementSessionCount();
      API.post('/marketing/events', { eventType: 'storefront_click', interaction: { normalizedX: Number(normalizedX.toFixed(3)), normalizedY: Number(normalizedY.toFixed(3)), page: pageBucket(location.pathname), viewport: viewportBucket(window.innerWidth) } }, { suppressAuthRedirect: true }).catch(() => {});
    };
    window.addEventListener('storekit:marketing-consent', consentChanged);
    document.addEventListener('click', click, true);
    return () => { active = false; window.removeEventListener('storekit:marketing-consent', consentChanged); document.removeEventListener('click', click, true); };
  }, [user, location.pathname]);
}

export { MAX_SESSION_EVENTS, MIN_INTERVAL_MS, viewportBucket };
