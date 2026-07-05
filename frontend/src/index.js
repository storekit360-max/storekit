import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Remove the SSR flash-prevention CSS once React has mounted.
// The `ssr-hide` style tag in index.html hides raw SSR HTML injected
// for crawlers. This runs after React's first DOM commit so real UI
// is already painted before we reveal it — zero flash for users.
// Crawlers (no JS) still see the full SSR content unaffected.
requestAnimationFrame(() => {
  document.documentElement.setAttribute('data-react-ready', '1');
  const ssrHide = document.getElementById('ssr-hide');
  if (ssrHide) ssrHide.remove();
});