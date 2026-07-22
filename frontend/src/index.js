import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './storeTemplates.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const root = ReactDOM.createRoot(document.getElementById('root'));

async function mountStorefront() {
  // On a tenant's first visit, wait for the lightweight settings bootstrap so
  // React's very first visible state is the admin-configured StoreLoader. This
  // removes the unwanted generic/default screen before it.
  try {
    await Promise.resolve(window.__STOREKIT_SETTINGS_READY__);
  } catch {}

  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );

  // Reveal only after React has committed its configured first screen.
  requestAnimationFrame(() => {
    document.documentElement.setAttribute('data-react-ready', '1');
    const ssrHide = document.getElementById('ssr-hide');
    if (ssrHide) ssrHide.remove();
    // Crawler responses include meaningful HTML before JavaScript runs. Once
    // React has committed the equivalent interactive page, remove that static
    // copy so rendered-DOM validators and assistive technology never see
    // duplicate headings or product content.
    const seoContent = document.getElementById('seo-visible-content');
    if (seoContent) seoContent.remove();
  });
}

mountStorefront();
