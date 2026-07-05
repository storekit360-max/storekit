import React from 'react';

/**
 * ErrorBoundary — catches unhandled React render/lifecycle errors AND
 * chunk-load failures (the #1 cause of white screens after a new deploy).
 *
 * When Vercel deploys a new build the CDN edge nodes take a moment to
 * propagate the new JS chunks. If a user (or a React.lazy import) tries to
 * load a chunk that the edge node hasn't received yet, the browser gets a
 * 404 and React throws a "Loading chunk N failed" error. Without this
 * boundary that results in a permanent white screen.
 *
 * This boundary detects that specific error and auto-reloads once per
 * session. A hard reload fetches the freshest assets from origin, bypassing
 * the stale edge cache, which immediately fixes the problem for the user.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isChunkError: false,
      autoReloadAttempted: false,
    };
  }

  static getDerivedStateFromError(error) {
    // Detect "Loading chunk N failed" / dynamic import errors
    const msg = error?.message || '';
    const isChunkError =
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      (error?.name === 'ChunkLoadError');

    return { hasError: true, error, isChunkError };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[StoreKit ErrorBoundary]', error, errorInfo);
  }

  componentDidUpdate(_, prevState) {
    // Auto-reload once on chunk errors — fixes white screen post-deploy
    // without requiring user action. Only attempt once per session to
    // avoid reload loops if there's a genuine permanent error.
    const { isChunkError, hasError, autoReloadAttempted } = this.state;
    if (
      hasError &&
      isChunkError &&
      !autoReloadAttempted &&
      !prevState.hasError
    ) {
      this.setState({ autoReloadAttempted: true });

      // Small delay so the browser finishes processing before reload
      setTimeout(() => {
        // Force a hard reload — skips CDN edge cache, fetches from origin
        window.location.reload(true);
      }, 800);
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, isChunkError: false, autoReloadAttempted: false });
    window.location.reload(true);
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, isChunkError: false, autoReloadAttempted: false });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const { isChunkError, autoReloadAttempted } = this.state;
    const isDev = process.env.NODE_ENV === 'development';

    // Chunk error — show a minimal "updating" message while auto-reload fires
    if (isChunkError && !autoReloadAttempted) {
      return (
        <div style={styles.root}>
          <div style={styles.card}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔄</div>
            <h2 style={styles.title}>Updating StoreKit…</h2>
            <p style={styles.body}>
              A new version is available. Reloading automatically…
            </p>
            <div style={styles.spinner}/>
            <style>{spinnerCSS}</style>
          </div>
        </div>
      );
    }

    return (
      <div style={styles.root}>
        <div style={styles.card}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
          <h2 style={styles.title}>Something went wrong</h2>
          <p style={styles.body}>
            {isChunkError
              ? 'The page failed to load its latest version. Please reload to try again.'
              : 'The page ran into an unexpected error. This is usually temporary — try refreshing or going back to the home page.'}
          </p>

          <div style={styles.buttons}>
            <button onClick={this.handleReload} style={styles.primary}>
              🔄 Reload Page
            </button>
            <button onClick={this.handleGoHome} style={styles.secondary}>
              🏠 Go to Home
            </button>
          </div>

          {isDev && this.state.error && (
            <details style={{ marginTop: 24, textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                Error details (dev only)
              </summary>
              <pre style={styles.pre}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--body-bg, #fafaf8)',
    fontFamily: 'system-ui, sans-serif',
    padding: 24,
  },
  card: {
    maxWidth: 480,
    width: '100%',
    background: 'var(--card-bg, #fff)',
    borderRadius: 20,
    boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
    padding: 40,
    textAlign: 'center',
  },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #111)', margin: '0 0 8px' },
  body:  { color: 'var(--text-secondary, #64748b)', fontSize: 14, margin: '0 0 28px', lineHeight: 1.6 },
  buttons: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  primary: {
    background: 'var(--color-primary, #15803d)',
    color: '#fff', border: 'none', borderRadius: 12,
    padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  secondary: {
    background: '#f1f5f9', color: '#374151', border: 'none',
    borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  pre: {
    marginTop: 8, padding: 12, background: '#fef2f2', borderRadius: 8,
    fontSize: 11, color: '#dc2626', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
  spinner: {
    width: 36, height: 36,
    border: '3px solid var(--border-color, #e5e7eb)',
    borderTopColor: 'var(--color-primary, #15803d)',
    borderRadius: '50%',
    animation: 'szSpin 0.7s linear infinite',
    margin: '16px auto 0',
  },
};

const spinnerCSS = `@keyframes szSpin { to { transform: rotate(360deg); } }`;