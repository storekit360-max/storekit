import React, { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => (n ?? 0).toLocaleString();
const ms  = (n) => n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n}ms`;

function uptimeStr(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#6366f1', icon }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      padding: '20px 22px',
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      border: '1px solid #f0f0f0',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <span style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: '#aaa' }}>{sub}</span>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      border: '1px solid #f0f0f0',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <h3 style={{ fontWeight: 700, fontSize: 14, color: '#1f2937', margin: 0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Mini bar ─────────────────────────────────────────────────────────────────
function MiniBar({ value, max, color = '#6366f1' }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 4, height: 6, overflow: 'hidden', flex: 1, minWidth: 60 }}>
      <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4, transition: 'width .4s' }} />
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ code }) {
  const color = code >= 500 ? '#ef4444' : code >= 400 ? '#f59e0b' : code >= 300 ? '#6366f1' : '#10b981';
  return (
    <span style={{
      background: color + '18',
      color,
      borderRadius: 6,
      padding: '2px 7px',
      fontSize: 11,
      fontWeight: 700,
    }}>{code}</span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Monitoring() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [autoRefresh,setAutoRefresh]= useState(true);
  const [search,     setSearch]     = useState('');
  const [sortBy,     setSortBy]     = useState('count'); // count | avgMs | errors
  const [resetting,  setResetting]  = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data: d } = await API.get('/monitoring');
      setData(d);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to fetch monitoring data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  const handleReset = async () => {
    if (!window.confirm('Reset all monitoring stats? This cannot be undone.')) return;
    setResetting(true);
    try {
      await API.delete('/monitoring/reset');
      await fetchData();
    } catch {
      setError('Failed to reset stats.');
    } finally {
      setResetting(false);
    }
  };

  // ── Filtered + sorted endpoints ────────────────────────────────────────────
  const endpoints = (data?.endpoints || [])
    .filter(e => !search || e.endpoint.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b[sortBy] - a[sortBy]);

  const maxCount = endpoints[0]?.count || 1;

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20, color: '#111', margin: 0 }}>Monitoring</h2>
          {data && (
            <p style={{ fontSize: 12, color: '#aaa', margin: '2px 0 0' }}>
              Uptime {uptimeStr(data.uptimeMs)} · Started {new Date(data.startedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(v => !v)}
            style={{
              padding: '7px 14px',
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              background: autoRefresh ? '#ecfdf5' : '#fff',
              color: autoRefresh ? '#10b981' : '#888',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {autoRefresh ? '⏱ Auto-refresh ON' : '⏸ Auto-refresh OFF'}
          </button>

          {/* Manual refresh */}
          <button
            onClick={fetchData}
            style={{
              padding: '7px 14px',
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              background: '#fff',
              color: '#374151',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >↻ Refresh</button>

          {/* Reset */}
          <button
            onClick={handleReset}
            disabled={resetting}
            style={{
              padding: '7px 14px',
              borderRadius: 10,
              border: '1px solid #fecaca',
              background: '#fff5f5',
              color: '#ef4444',
              fontWeight: 600,
              fontSize: 12,
              cursor: resetting ? 'not-allowed' : 'pointer',
              opacity: resetting ? 0.6 : 1,
            }}
          >🗑 Reset Stats</button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      )}

      {data && <>

        {/* ── Overview cards ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
          <StatCard label="Total Requests"  value={fmt(data.totalRequests)}  icon="🌐" color="#6366f1" />
          <StatCard label="Total Errors"    value={fmt(data.totalErrors)}    icon="🚨" color="#ef4444"
            sub={`${data.errorRate}% error rate`} />
          <StatCard label="Cache Hit Rate"  value={`${data.cache.ratio}%`}   icon="⚡" color="#10b981"
            sub={`${fmt(data.cache.hits)} hits / ${fmt(data.cache.misses)} misses`} />
          <StatCard label="Throttled Reqs"  value={fmt(data.throttling.blocked)} icon="🛑" color="#f59e0b" />
          <StatCard label="Endpoints Tracked" value={fmt(data.endpoints.length)} icon="📡" color="#8b5cf6" />
          <StatCard label="Unique IPs"      value={fmt(Object.keys(data.topIPs || {}).length || data.topIPs?.length)} icon="🖥" color="#0ea5e9" />
        </div>

        {/* ── Middleware metrics row ──────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>

          {/* Cache */}
          <Section title="Cache Middleware">
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Cache Hits',   value: data.cache.hits,   color: '#10b981', max: data.cache.hits + data.cache.misses },
                { label: 'Cache Misses', value: data.cache.misses, color: '#f59e0b', max: data.cache.hits + data.cache.misses },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: '#6b7280', width: 90, flexShrink: 0 }}>{r.label}</span>
                  <MiniBar value={r.value} max={r.max} color={r.color} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.color, width: 44, textAlign: 'right', flexShrink: 0 }}>{fmt(r.value)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f5f5f5', paddingTop: 8 }}>
                <span style={{ fontSize: 12, color: '#aaa' }}>Hit Ratio</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>{data.cache.ratio}%</span>
              </div>
            </div>
          </Section>

          {/* Throttling */}
          <Section title="Throttle Middleware">
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>Blocked Requests</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{fmt(data.throttling.blocked)}</span>
              </div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                Rate-limited requests that were rejected before hitting route handlers.
                Wire <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>recordThrottled()</code> into your throttle middleware to track these.
              </div>
            </div>
          </Section>

          {/* Top IPs */}
          <Section title="Top Client IPs">
            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.topIPs || []).slice(0, 5).map((row, i) => (
                <div key={row.ip} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: '#aaa', width: 16, flexShrink: 0 }}>#{i + 1}</span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.ip}</span>
                  <MiniBar value={row.count} max={(data.topIPs[0]?.count || 1)} color="#6366f1" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', width: 44, textAlign: 'right', flexShrink: 0 }}>{fmt(row.count)}</span>
                </div>
              ))}
              {(!data.topIPs || data.topIPs.length === 0) && (
                <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>No IP data yet.</p>
              )}
            </div>
          </Section>
        </div>

        {/* ── All Endpoints table ─────────────────────────────────────────── */}
        <Section
          title={`API Endpoints (${endpoints.length})`}
          action={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Search */}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter…"
                style={{
                  padding: '5px 10px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  fontSize: 12,
                  outline: 'none',
                  width: 140,
                }}
              />
              {/* Sort */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, outline: 'none' }}
              >
                <option value="count">Sort: Requests</option>
                <option value="avgMs">Sort: Avg Time</option>
                <option value="errors">Sort: Errors</option>
              </select>
            </div>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {['Endpoint', 'Requests', 'Avg Time', 'Errors', 'Error %', 'Status Codes', 'Volume'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap', borderBottom: '1px solid #f0f0f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {endpoints.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No endpoints matched.</td></tr>
                )}
                {endpoints.map((e, i) => (
                  <tr key={e.endpoint} style={{ borderBottom: '1px solid #f9f9f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, color: '#1f2937', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.endpoint}
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, color: '#374151' }}>{fmt(e.count)}</td>
                    <td style={{ padding: '10px 16px', color: e.avgMs > 500 ? '#ef4444' : e.avgMs > 200 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                      {ms(e.avgMs)}
                    </td>
                    <td style={{ padding: '10px 16px', color: e.errors > 0 ? '#ef4444' : '#aaa', fontWeight: e.errors > 0 ? 700 : 400 }}>{fmt(e.errors)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        color: e.errorRate > 10 ? '#ef4444' : e.errorRate > 0 ? '#f59e0b' : '#10b981',
                        fontWeight: 600,
                        fontSize: 12,
                      }}>{e.errorRate}%</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {Object.entries(e.statusCodes).map(([code, n]) => (
                          <span key={code} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <StatusBadge code={+code} />
                            <span style={{ fontSize: 10, color: '#aaa' }}>×{n}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', minWidth: 100 }}>
                      <MiniBar value={e.count} max={maxCount} color="#6366f1" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Top Endpoints summary ───────────────────────────────────────── */}
        <Section title="Top 10 Endpoints by Request Volume">
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(data.topEndpoints || []).map((e, i) => (
              <div key={e.endpoint} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: '#aaa', width: 20, flexShrink: 0 }}>#{i + 1}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151', width: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {e.endpoint}
                </span>
                <MiniBar value={e.count} max={data.topEndpoints[0]?.count || 1} color="#6366f1" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', width: 54, textAlign: 'right', flexShrink: 0 }}>{fmt(e.count)} req</span>
                <span style={{ fontSize: 11, color: e.avgMs > 500 ? '#ef4444' : '#aaa', width: 52, textAlign: 'right', flexShrink: 0 }}>{ms(e.avgMs)}</span>
              </div>
            ))}
            {(!data.topEndpoints || data.topEndpoints.length === 0) && (
              <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', padding: '12px 0' }}>No requests recorded yet.</p>
            )}
          </div>
        </Section>

      </>}
    </div>
  );
}
