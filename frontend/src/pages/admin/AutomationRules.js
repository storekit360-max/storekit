/**
 * pages/admin/AutomationRules.js
 *
 * Social Media Automation Rules admin page.
 * Matches StoreKit's existing design system exactly:
 *   - form-input / form-label CSS classes
 *   - btn-primary class
 *   - toast notifications via react-hot-toast
 *   - API utility from utils/api
 */

import React, { useEffect, useState, useCallback } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

// ── Platform meta ─────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2' },
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'tiktok',    label: 'TikTok',    color: '#111111' },
  { id: 'whatsapp',  label: 'WhatsApp',  color: '#25D366' },
  { id: 'telegram',  label: 'Telegram',  color: '#229ED9' },
];

const TRIGGER_LABELS = {
  new_product:      { emoji: '🆕', label: 'New Product' },
  product_discount: { emoji: '🔥', label: 'Discount'    },
  offer_active:     { emoji: '🎉', label: 'Offer'       },
  manual:           { emoji: '▶️', label: 'Manual'      },
};

const STATUS_CLS = {
  success:  'bg-green-100 text-green-700',
  failed:   'bg-red-100 text-red-700',
};

// ── Tiny shared primitives (defined at module scope — no re-mount on render) ──

const Spinner = () => (
  <svg className="w-4 h-4 animate-spin inline-block" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path  className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
);

const ToggleSwitch = ({ value, onChange, disabled }) => (
  <button
    type="button"
    onClick={disabled ? undefined : onChange}
    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 focus:outline-none ${
      value ? 'bg-primary' : 'bg-gray-200'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
);

// ── Rule Card ─────────────────────────────────────────────────────────────────
function RuleCard({ rule, socialStatus, onSaved }) {
  const [local,    setLocal]    = useState(rule);
  const [saving,   setSaving]   = useState(false);
  const [open,     setOpen]     = useState(false);

  // sync when parent data changes (e.g. after a refetch)
  useEffect(() => setLocal(rule), [rule]);

  const save = async (patch) => {
    const next = { ...local, ...patch };
    setLocal(next);
    setSaving(true);
    try {
      const { data } = await API.put(`/automation/rules/${rule.trigger}`, patch);
      setLocal(data);
      onSaved(data);
      toast.success('Rule saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
      setLocal(local); // revert optimistic update
    } finally {
      setSaving(false);
    }
  };

  const togglePlatform = (pid) => {
    const platforms = { ...local.platforms, [pid]: !local.platforms[pid] };
    save({ platforms });
  };

  const meta = TRIGGER_LABELS[rule.trigger] || {};

  return (
    <div className={`bg-white rounded-2xl border transition-all overflow-hidden ${local.enabled ? 'border-primary/25 shadow-sm' : 'border-gray-100'}`}>

      {/* Header row */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="text-xl flex-shrink-0 select-none">{meta.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight">{local.label}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{local.description}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {saving && <Spinner />}
          <ToggleSwitch
            value={local.enabled}
            onChange={() => save({ enabled: !local.enabled })}
            disabled={saving}
          />
          <button
            onClick={() => setOpen(o => !o)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
            title={open ? 'Collapse' : 'Configure'}
          >
            <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Platform chips */}
      <div className="px-5 pb-4 flex flex-wrap gap-2">
        {PLATFORMS.map(p => {
          const connected = !!socialStatus?.[p.id]?.connected;
          const active    = !!local.platforms[p.id];
          const canToggle = connected && local.enabled && !saving;
          return (
            <button
              key={p.id}
              onClick={canToggle ? () => togglePlatform(p.id) : undefined}
              title={!connected ? `${p.label} not connected — go to Social Media settings` : (!local.enabled ? 'Enable this rule first' : undefined)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all select-none ${
                active && connected && local.enabled
                  ? 'text-white border-transparent shadow-sm'
                  : 'border-gray-200 text-gray-400 bg-gray-50'
              } ${canToggle ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
              style={{ background: active && connected && local.enabled ? p.color : undefined }}
            >
              {p.label}
              {!connected && <span className="opacity-70 text-xs">⚠</span>}
            </button>
          );
        })}
      </div>

      {/* Expanded configuration */}
      {open && (
        <div className="px-5 pb-5 pt-4 border-t border-gray-50 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Delay before posting</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" max="10080"
                  value={local.delayMinutes}
                  onChange={e => setLocal(l => ({ ...l, delayMinutes: Number(e.target.value) }))}
                  onBlur={() => save({ delayMinutes: local.delayMinutes })}
                  className="form-input w-28"
                />
                <span className="text-sm text-gray-500">min&nbsp;(0 = immediate)</span>
              </div>
            </div>

            {rule.trigger === 'product_discount' && (
              <div>
                <label className="form-label">Min discount to trigger (%)</label>
                <input
                  type="number" min="0" max="100"
                  value={local.minDiscountPercent}
                  onChange={e => setLocal(l => ({ ...l, minDiscountPercent: Number(e.target.value) }))}
                  onBlur={() => save({ minDiscountPercent: local.minDiscountPercent })}
                  className="form-input"
                />
              </div>
            )}
          </div>

          <div>
            <label className="form-label">
              Custom message override
              <span className="text-gray-400 font-normal ml-1">(blank = use platform template)</span>
            </label>
            <textarea
              rows={3}
              value={local.customMessage}
              onChange={e => setLocal(l => ({ ...l, customMessage: e.target.value }))}
              onBlur={() => save({ customMessage: local.customMessage })}
              placeholder={`🆕 Check out {{productName}}! Now {{price}} → {{url}}`}
              className="form-input resize-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Variables:&nbsp;
              {['{{productName}}','{{price}}','{{salePrice}}','{{discount}}','{{url}}','{{offerName}}'].map(v => (
                <code key={v} className="bg-gray-100 rounded px-1 mr-1">{v}</code>
              ))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manual Trigger Modal ──────────────────────────────────────────────────────
function ManualModal({ onClose, onDone }) {
  const [trigger,   setTrigger]   = useState('new_product');
  const [entityId,  setEntityId]  = useState('');
  const [entityType,setEntityType]= useState('product');
  const [platforms, setPlatforms] = useState([]);
  const [customMsg, setCustomMsg] = useState('');
  const [busy,      setBusy]      = useState(false);

  const toggle = (pid) => setPlatforms(ps => ps.includes(pid) ? ps.filter(p => p !== pid) : [...ps, pid]);

  const submit = async () => {
    if (!entityId.trim())  return toast.error('Enter an entity ID');
    if (!platforms.length) return toast.error('Select at least one platform');
    setBusy(true);
    try {
      const { data } = await API.post('/automation/manual', {
        trigger, entityId: entityId.trim(), entityType, platforms, customMsg,
      });
      toast.success(`${data.success}/${data.total} published successfully`);
      if (data.failed > 0) toast.error(`${data.failed} failed — check logs`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Trigger failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Manual Publish</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="form-label">Trigger type</label>
            <select value={trigger} onChange={e => {
              setTrigger(e.target.value);
              setEntityType(e.target.value === 'offer_active' ? 'offer' : 'product');
            }} className="form-input">
              <option value="new_product">🆕 New Product</option>
              <option value="product_discount">🔥 Product Discount</option>
              <option value="offer_active">🎉 Offer Active</option>
              <option value="manual">▶️ Manual / Custom</option>
            </select>
          </div>
          <div>
            <label className="form-label">Entity ID (MongoDB ObjectId)</label>
            <input
              type="text" value={entityId} onChange={e => setEntityId(e.target.value)}
              placeholder="6644d3abc..." className="form-input font-mono text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Copy from the Products or Seasonal Campaigns list (Admin → Products → product ID in the URL)</p>
          </div>
          <div>
            <label className="form-label">Custom message <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} value={customMsg} onChange={e => setCustomMsg(e.target.value)} placeholder="Leave blank to use platform template" className="form-input resize-none text-sm"/>
          </div>
          <div>
            <label className="form-label">Target platforms</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PLATFORMS.map(p => (
                <button key={p.id} type="button" onClick={() => toggle(p.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${platforms.includes(p.id) ? 'text-white border-transparent' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  style={{ background: platforms.includes(p.id) ? p.color : undefined }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary text-sm flex items-center gap-2">
            {busy ? <><Spinner/> Publishing…</> : '▶ Publish Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Log Row (memoised to avoid full-list re-renders on retry) ─────────────────
const LogRow = React.memo(function LogRow({ log, onRetry, onDelete }) {
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const meta  = TRIGGER_LABELS[log.trigger] || {};
  const pmeta = PLATFORMS.find(p => p.id === log.platform);

  const retry = async () => {
    setRetrying(true);
    try {
      const { data } = await API.post(`/automation/retry/${log._id}`);
      if (data.success) toast.success(`✅ Retry succeeded on ${log.platform}`);
      else              toast.error(`✗ Retry failed: ${data.errorMessage}`);
      onRetry();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Retry failed');
    } finally { setRetrying(false); }
  };

  const del = async () => {
    setDeleting(true);
    try {
      await API.delete(`/automation/logs/${log._id}`);
      onDelete(log._id);
    } catch { toast.error('Delete failed'); setDeleting(false); }
  };

  return (
    <div className="border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
        {/* Platform dot */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ background: pmeta?.color || '#999' }}>
          {pmeta?.label?.[0] || '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800 truncate max-w-xs">
              {meta.emoji} {log.entityName || log.entityType}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[log.status] || 'bg-gray-100 text-gray-500'}`}>
              {log.status}
            </span>
            {log.isRetry && <span className="text-xs text-orange-500">retry #{log.attemptNumber}</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400">{pmeta?.label} · {new Date(log.createdAt).toLocaleString()}</span>
            {log.durationMs > 0 && <span className="text-xs text-gray-300">{log.durationMs}ms</span>}
            {log.platformPostId && <span className="text-xs text-green-600 font-mono truncate max-w-[120px]">{log.platformPostId}</span>}
          </div>
          {log.status === 'failed' && log.errorMessage && (
            <p className="text-xs text-red-500 mt-0.5 truncate">{log.errorMessage}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => setExpanded(e => !e)} title="Details"
            className="p-1.5 text-gray-300 hover:text-gray-500 rounded transition-colors">
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {log.status === 'failed' && (
            <button onClick={retry} disabled={retrying} title="Retry"
              className="p-1.5 text-blue-400 hover:text-blue-600 rounded transition-colors disabled:opacity-40">
              {retrying ? <Spinner/> : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              )}
            </button>
          )}
          <button onClick={del} disabled={deleting} title="Delete"
            className="p-1.5 text-gray-300 hover:text-red-400 rounded transition-colors disabled:opacity-40">
            {deleting ? <Spinner/> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-gray-50/60">
          <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2 text-xs">
            {log.postText && (
              <div><span className="font-semibold text-gray-500">Post text:</span>
                <p className="mt-0.5 text-gray-700 whitespace-pre-wrap leading-relaxed">{log.postText}</p>
              </div>
            )}
            {log.imageUrl && (
              <div><span className="font-semibold text-gray-500">Image:</span>
                <a href={log.imageUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-500 hover:underline truncate block">{log.imageUrl}</a>
              </div>
            )}
            {log.errorCode && (
              <div><span className="font-semibold text-gray-500">Error code:</span> <code className="bg-red-50 text-red-600 px-1 rounded">{log.errorCode}</code></div>
            )}
            {log.errorMessage && (
              <div><span className="font-semibold text-gray-500">Error:</span> <span className="text-red-600">{log.errorMessage}</span></div>
            )}
            <div className="flex gap-4 pt-1 border-t border-gray-100">
              <span><span className="font-semibold text-gray-500">Triggered by:</span> {log.triggeredBy}</span>
              <span><span className="font-semibold text-gray-500">Entity:</span> {log.entityType}:{log.entityId}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AutomationRules() {
  const [rules,        setRules]       = useState([]);
  const [stats,        setStats]       = useState(null);
  const [logs,         setLogs]        = useState([]);
  const [logsTotal,    setLogsTotal]   = useState(0);
  const [logsPage,     setLogsPage]    = useState(1);
  const [socialStatus, setSocialStatus]= useState({});
  const [loading,      setLoading]     = useState(true);
  const [showManual,   setShowManual]  = useState(false);
  const [filter,       setFilter]      = useState({ platform: '', status: '', trigger: '' });
  const [clearBusy,    setClearBusy]   = useState(false);

  // ── data fetchers ───────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [rulesR, statsR, socialR] = await Promise.all([
        API.get('/automation/rules'),
        API.get('/automation/stats'),
        API.get('/social-media'),
      ]);
      setRules(rulesR.data);
      setStats(statsR.data);
      setSocialStatus(socialR.data);
    } catch { toast.error('Failed to load automation data'); }
    finally  { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const params = { page: logsPage, limit: 20, ...filter };
      // strip empty strings from params
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const { data } = await API.get('/automation/logs', { params });
      setLogs(data.logs);
      setLogsTotal(data.total);
    } catch {}
  }, [logsPage, filter]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  // ── helpers ─────────────────────────────────────────────────────────────────
  const refreshLogs = () => { loadLogs(); API.get('/automation/stats').then(r => setStats(r.data)).catch(() => {}); };

  const clearFailed = async () => {
    if (!window.confirm('Delete all failed log entries?')) return;
    setClearBusy(true);
    try {
      const { data } = await API.delete('/automation/logs?status=failed');
      toast.success(`Cleared ${data.deletedCount} failed entries`);
      refreshLogs();
    } catch { toast.error('Clear failed'); }
    finally { setClearBusy(false); }
  };

  const connectedCount = PLATFORMS.filter(p => socialStatus?.[p.id]?.connected).length;

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading) return (
    <div className="max-w-5xl mx-auto p-6 space-y-4 animate-pulse">
      <div className="h-8 bg-gray-100 rounded-lg w-56"/>
      <div className="h-28 bg-gray-100 rounded-2xl"/>
      {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl"/>)}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {showManual && <ManualModal onClose={() => setShowManual(false)} onDone={refreshLogs}/>}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center text-white shadow-lg flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Automation Rules</h1>
            <p className="text-sm text-gray-500">Auto-post to social media when products or offers change</p>
          </div>
        </div>
        <button onClick={() => setShowManual(true)} className="btn-primary text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Manual Publish
        </button>
      </div>

      {/* ── Platforms warning ── */}
      {connectedCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div>
            <p className="font-semibold text-amber-800 text-sm">No platforms connected</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Connect your accounts in <strong>Social Media</strong> settings before enabling automation rules.
            </p>
          </div>
        </div>
      )}

      {/* ── Stats strip ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Posts', value: stats.total,   cls: 'text-gray-800' },
            { label: 'Successful',  value: stats.success, cls: 'text-green-600' },
            { label: 'Failed',      value: stats.failed,  cls: 'text-red-500'  },
            { label: 'Platforms',   value: connectedCount + '/5 connected', cls: 'text-blue-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Automation Rules ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Automation Triggers</h2>
        <div className="space-y-3">
          {rules.map(rule => (
            <RuleCard
              key={rule.trigger}
              rule={rule}
              socialStatus={socialStatus}
              onSaved={updated => setRules(rs => rs.map(r => r.trigger === updated.trigger ? updated : r))}
            />
          ))}
        </div>
      </div>

      {/* ── Platform breakdown ── */}
      {stats?.byPlatform?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Posts by Platform</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {stats.byPlatform.map(bp => {
              const meta = PLATFORMS.find(p => p.id === bp._id);
              const rate = bp.total ? Math.round((bp.success / bp.total) * 100) : 0;
              return (
                <div key={bp._id} className="flex items-center gap-2 p-3 rounded-xl border border-gray-100">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: meta?.color || '#aaa' }}>
                    {meta?.label?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{meta?.label || bp._id}</p>
                    <p className="text-xs text-gray-400">{bp.success}/{bp.total} ({rate}%)</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Publish Logs ── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Log header + filters */}
        <div className="p-4 sm:p-5 border-b border-gray-50">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Publish Log</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={loadLogs} className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">
                ↻ Refresh
              </button>
              {stats?.failed > 0 && (
                <button onClick={clearFailed} disabled={clearBusy} className="px-3 py-1.5 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors disabled:opacity-40">
                  {clearBusy ? <Spinner/> : `🗑 Clear ${stats.failed} failed`}
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'platform', opts: [['','All platforms'], ...PLATFORMS.map(p => [p.id, p.label])] },
              { key: 'status',   opts: [['','All statuses'],['success','Success'],['failed','Failed']] },
              { key: 'trigger',  opts: [['','All triggers'],['new_product','New Product'],['product_discount','Discount'],['offer_active','Offer'],['manual','Manual']] },
            ].map(f => (
              <select key={f.key} value={filter[f.key]}
                onChange={e => { setFilter(prev => ({ ...prev, [f.key]: e.target.value })); setLogsPage(1); }}
                className="form-input text-xs py-1.5 pr-8 min-w-0">
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
          </div>
        </div>

        {/* Log entries */}
        <div>
          {logs.length === 0
            ? <div className="py-12 text-center text-sm text-gray-400">No logs found</div>
            : logs.map(log => (
                <LogRow
                  key={log._id}
                  log={log}
                  onRetry={refreshLogs}
                  onDelete={id => setLogs(ls => ls.filter(l => l._id !== id))}
                />
              ))
          }
        </div>

        {/* Pagination */}
        {logsTotal > 20 && (
          <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">{logsTotal} total entries</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setLogsPage(p => Math.max(1, p - 1))} disabled={logsPage === 1}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-40 transition-colors">
                ← Prev
              </button>
              <span className="text-xs text-gray-500 px-2">Page {logsPage}</span>
              <button onClick={() => setLogsPage(p => p + 1)} disabled={logsPage * 20 >= logsTotal}
                className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-40 transition-colors">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}