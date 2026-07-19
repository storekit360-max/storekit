import React from 'react';

export default class ModuleErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(previous) { if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  componentDidCatch(error, info) { console.error('[SUPERADMIN_MODULE_RENDER_FAILED]', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"><h2 className="font-extrabold">This Control Center module could not load</h2><p className="mt-2 text-sm">Your current work elsewhere is safe. Refresh this module to retry the application bundle.</p><button onClick={()=>window.location.reload()} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">Reload module</button></section>;
  }
}
