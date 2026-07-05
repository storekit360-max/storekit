import React, { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBytes = b => {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(2)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};
const fmtDate = d => d ? new Date(d).toLocaleString() : '—';
const fmtDur  = ms => ms >= 60000 ? `${(ms/60000).toFixed(1)}m` : ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms}ms`;

const STATUS_COLOR = {
  running:   { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  completed: { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
  verified:  { bg: '#f0fdf4', text: '#065f46', dot: '#10b981' },
  failed:    { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' },
};

const TYPE_COLOR = {
  manual:  '#6366f1',
  daily:   '#0891b2',
  weekly:  '#7c3aed',
  monthly: '#b45309',
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#6366f1', icon }) {
  return (
    <div style={{ background:'#fff', borderRadius:16, padding:'20px 22px', boxShadow:'0 1px 4px rgba(0,0,0,.06)', border:'1px solid #f0f0f0', display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, color:'#888', fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:22 }}>{icon}</span>
      </div>
      <span style={{ fontSize:26, fontWeight:800, color, lineHeight:1 }}>{value}</span>
      {sub && <span style={{ fontSize:12, color:'#aaa' }}>{sub}</span>}
    </div>
  );
}

function Section({ title, children, action }) {
  return (
    <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 1px 4px rgba(0,0,0,.06)', border:'1px solid #f0f0f0', overflow:'hidden' }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #f5f5f5', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h3 style={{ fontWeight:700, fontSize:14, color:'#1f2937', margin:0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Badge({ status }) {
  const c = STATUS_COLOR[status] || { bg:'#f3f4f6', text:'#6b7280', dot:'#9ca3af' };
  return (
    <span style={{ background:c.bg, color:c.text, borderRadius:999, fontSize:11, fontWeight:700, padding:'3px 10px', display:'inline-flex', alignItems:'center', gap:5 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:c.dot, display:'inline-block' }} />
      {status}
    </span>
  );
}

function TypeBadge({ type }) {
  return (
    <span style={{ background:TYPE_COLOR[type]+'18', color:TYPE_COLOR[type], borderRadius:999, fontSize:11, fontWeight:700, padding:'2px 9px' }}>
      {type}
    </span>
  );
}

function StorageBar({ data }) {
  if (!data) return <p style={{ color:'#9ca3af', fontSize:13, margin:0 }}>Click "Check Storage" to load Drive info.</p>;
  if (data.configured === false) {
    return (
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <span style={{ fontSize:22 }}>🔌</span>
        <div>
          <p style={{ color:'#92400e', fontSize:13, margin:0, fontWeight:600 }}>Google Drive not connected</p>
          <p style={{ color:'#9ca3af', fontSize:12, margin:'4px 0 0' }}>{data.message}</p>
        </div>
      </div>
    );
  }
  const { usedBytes, totalBytes, backupBytes, fileCount, folderName, email } = data;
  const pct   = totalBytes ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;
  const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:20 }}>✅</span>
        <div>
          <p style={{ margin:0, fontWeight:700, fontSize:14, color:'#15803d' }}>Connected as {email}</p>
          <p style={{ margin:'2px 0 0', fontSize:12, color:'#6b7280' }}>
            Backup folder: <b>{folderName}</b> — {fileCount} file{fileCount !== 1 ? 's' : ''}, {fmtBytes(backupBytes)} backup data
          </p>
        </div>
      </div>
      {totalBytes > 0 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6b7280', marginBottom:4 }}>
            <span>{fmtBytes(usedBytes)} used</span>
            <span>{fmtBytes(totalBytes)} total</span>
          </div>
          <div style={{ background:'#f3f4f6', borderRadius:8, height:8, overflow:'hidden' }}>
            <div style={{ width:`${pct}%`, background:color, height:'100%', borderRadius:8, transition:'width .4s' }} />
          </div>
          <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>{pct.toFixed(1)}% of your Google Drive used</div>
        </div>
      )}
    </div>
  );
}

function Btn({ onClick, disabled, color='#6366f1', children, small }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? '#e5e7eb' : color,
        color: disabled ? '#9ca3af' : '#fff',
        border: 'none', borderRadius: 8,
        padding: small ? '5px 12px' : '8px 16px',
        fontSize: small ? 12 : 13,
        fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity .15s',
      }}
    >
      {children}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BackupCenter() {
  const [health,     setHealth]     = useState(null);
  const [storage,    setStorage]    = useState(null);
  const [backups,    setBackups]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [filter,     setFilter]     = useState({ type:'', status:'' });
  const [editSet,    setEditSet]    = useState(null);
  const [tab,        setTab]        = useState('history');
  const [loading,    setLoading]    = useState(false);
  const [actionBusy, setActionBusy] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15, ...Object.fromEntries(Object.entries(filter).filter(([,v])=>v)) };
      const [hRes, bRes, sRes] = await Promise.all([
        API.get('/backup/health'),
        API.get('/backup', { params }),
        API.get('/backup/settings'),
      ]);
      setHealth(hRes.data);
      setBackups(bRes.data.backups);
      setTotal(bRes.data.total);
      setEditSet({ ...sRes.data });
    } catch (e) {
      toast.error('Failed to load backup data');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const hasRunning = backups.some(b => b.status === 'running');
    if (!hasRunning) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [backups, load]);

  const loadStorage = async () => {
    try {
      const r = await API.get('/backup/drive-storage');
      setStorage(r.data);
    } catch (e) {
      const msg = e.response?.data?.message;
      if (e.response?.status === 503) {
        setStorage({ configured: false, message: msg || 'Google Drive not connected.' });
      } else {
        toast.error(msg || 'Could not fetch Drive storage info');
      }
    }
  };

  const connectDrive = async () => {
    try {
      const r = await API.get('/backup/oauth/url');
      window.open(r.data.url, '_blank', 'width=520,height=620');
      toast('Complete the Google sign-in in the new window, then click Refresh.', { icon: 'ℹ️', duration: 8000 });
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not get auth URL. Check GOOGLE_OAUTH_CLIENT_ID env vars.');
    }
  };

  const disconnectDrive = async () => {
    if (!window.confirm('Disconnect Google Drive? Future backups will fail until you reconnect.')) return;
    try {
      await API.delete('/backup/oauth/disconnect');
      toast.success('Google Drive disconnected');
      load();
      setStorage(null);
    } catch {
      toast.error('Disconnect failed');
    }
  };

  const triggerManual = async () => {
    setActionBusy(b => ({ ...b, manual: true }));
    try {
      await API.post('/backup');
      toast.success('Backup started in background');
      setTimeout(load, 2000);
    } catch (e) {
      const msg = e.response?.data?.message || 'Failed to start backup';
      toast.error(msg, { duration: 6000 });
    } finally {
      setActionBusy(b => ({ ...b, manual: false }));
    }
  };

  const verify = async (id) => {
    setActionBusy(b => ({ ...b, [id+'v']: true }));
    try {
      const r = await API.post(`/backup/${id}/verify`);
      toast.success(r.data.ok ? '✅ Backup verified' : '❌ Checksum mismatch');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Verify failed');
    } finally {
      setActionBusy(b => ({ ...b, [id+'v']: false }));
    }
  };

  const restore = async (id) => {
    if (!window.confirm('⚠️ This will restore the database from this backup. An emergency backup will be created first. Continue?')) return;
    setActionBusy(b => ({ ...b, [id+'r']: true }));
    try {
      await API.post(`/backup/${id}/restore`);
      toast.success('Restore completed successfully');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Restore failed');
    } finally {
      setActionBusy(b => ({ ...b, [id+'r']: false }));
    }
  };

  const deleteBackup = async (id) => {
    if (!window.confirm('Delete this backup? This cannot be undone.')) return;
    try {
      await API.delete(`/backup/${id}`);
      toast.success('Backup deleted');
      load();
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const saveSettings = async () => {
    try {
      await API.put('/backup/settings', editSet);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  const healthColor = health?.status === 'healthy' ? '#22c55e' : health?.status === 'warning' ? '#f59e0b' : '#ef4444';
  const driveConnected = health?.driveConnected;
  const LIMIT = 15;

  return (
    <div style={{ padding:'24px 20px', maxWidth:1100, margin:'0 auto', fontFamily:'inherit' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#1f2937', margin:0 }}>Backup Center</h1>
          <p style={{ fontSize:13, color:'#6b7280', margin:'4px 0 0' }}>Google Drive-powered database backups</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Btn onClick={load} color='#6b7280'>↻ Refresh</Btn>
          <Btn onClick={triggerManual} disabled={actionBusy.manual || !driveConnected} color='#6366f1'>
            {actionBusy.manual ? 'Starting…' : '+ Backup Now'}
          </Btn>
        </div>
      </div>

      {/* Drive not connected banner */}
      {!driveConnected && (
        <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <p style={{ margin:0, fontWeight:700, color:'#92400e', fontSize:14 }}>⚠️ Google Drive not connected</p>
            <p style={{ margin:'3px 0 0', fontSize:12, color:'#78350f' }}>Connect your Google account to enable backups. Takes 30 seconds.</p>
          </div>
          <Btn onClick={connectDrive} color='#f59e0b'>🔗 Connect Google Drive</Btn>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14, marginBottom:24 }}>
        <StatCard
          label='Health'
          value={health?.status || '—'}
          sub={health?.hoursSinceLast != null ? `Last backup ${health.hoursSinceLast}h ago` : 'No backups yet'}
          color={healthColor}
          icon='🛡️'
        />
        <StatCard
          label='Total Backups'
          value={total}
          sub={`${backups.filter(b=>b.status==='running').length} running`}
          color='#6366f1'
          icon='💾'
        />
        <StatCard
          label='Failed (24h)'
          value={health?.failed24h ?? '—'}
          color={health?.failed24h > 0 ? '#ef4444' : '#22c55e'}
          icon='⚠️'
        />
        <StatCard
          label='Latest Backup'
          value={health?.latestBackup ? fmtDate(health.latestBackup.createdAt) : '—'}
          sub={health?.latestBackup ? fmtBytes(health.latestBackup.sizeBytes) : ''}
          color='#0891b2'
          icon='📅'
        />
      </div>

      {/* Drive Storage */}
      <Section
        title='Google Drive Storage'
        action={
          <div style={{ display:'flex', gap:8 }}>
            {driveConnected
              ? <Btn small onClick={disconnectDrive} color='#ef4444'>Disconnect</Btn>
              : <Btn small onClick={connectDrive} color='#22c55e'>Connect Drive</Btn>
            }
            <Btn small onClick={loadStorage} color='#6b7280'>Check Storage</Btn>
          </div>
        }
      >
        <div style={{ padding:'16px 20px' }}>
          {driveConnected && health?.oauthEmail && !storage && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: storage ? 12 : 0 }}>
              <span style={{ fontSize:18 }}>✅</span>
              <p style={{ margin:0, fontSize:13, color:'#15803d', fontWeight:600 }}>
                Connected as {health.oauthEmail}
              </p>
            </div>
          )}
          <StorageBar data={storage} />
        </div>
      </Section>

      <div style={{ marginTop:20 }} />

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16 }}>
        {['history','settings'].map(t => (
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:'7px 18px', borderRadius:8, border:'none', fontWeight:600, fontSize:13, cursor:'pointer',
            background: tab===t ? '#6366f1' : '#f3f4f6',
            color: tab===t ? '#fff' : '#6b7280',
          }}>
            {t === 'history' ? '📋 Backup History' : '⚙️ Schedule & Settings'}
          </button>
        ))}
      </div>

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <Section
          title={`Backups (${total})`}
          action={
            <div style={{ display:'flex', gap:8 }}>
              <select value={filter.type} onChange={e=>{ setFilter(f=>({...f,type:e.target.value})); setPage(1); }}
                style={{ fontSize:12, borderRadius:6, border:'1px solid #e5e7eb', padding:'4px 8px', color:'#374151' }}>
                <option value=''>All types</option>
                {['manual','daily','weekly','monthly'].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
              <select value={filter.status} onChange={e=>{ setFilter(f=>({...f,status:e.target.value})); setPage(1); }}
                style={{ fontSize:12, borderRadius:6, border:'1px solid #e5e7eb', padding:'4px 8px', color:'#374151' }}>
                <option value=''>All statuses</option>
                {['running','completed','verified','failed'].map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          }
        >
          {loading && backups.length === 0
            ? <div style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>Loading…</div>
            : backups.length === 0
              ? <div style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>No backups found. Connect Google Drive and click "Backup Now".</div>
              : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#f9fafb' }}>
                        {['Label','Type','Status','Size','Docs','Duration','Created','Actions'].map(h=>(
                          <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:600, color:'#6b7280', fontSize:12, borderBottom:'1px solid #f3f4f6', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map(b => (
                        <tr key={b._id} style={{ borderBottom:'1px solid #f9fafb' }}>
                          <td style={{ padding:'10px 14px', color:'#1f2937', fontWeight:500, maxWidth:180 }}>
                            <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.label || '—'}</div>
                            {b.triggeredBy && b.triggeredBy !== 'system' && <div style={{ fontSize:11, color:'#9ca3af' }}>by {b.triggeredBy}</div>}
                          </td>
                          <td style={{ padding:'10px 14px' }}><TypeBadge type={b.type} /></td>
                          <td style={{ padding:'10px 14px' }}><Badge status={b.status} /></td>
                          <td style={{ padding:'10px 14px', color:'#374151' }}>{fmtBytes(b.sizeBytes)}</td>
                          <td style={{ padding:'10px 14px', color:'#374151' }}>{b.docCount?.toLocaleString() || '—'}</td>
                          <td style={{ padding:'10px 14px', color:'#374151' }}>{b.duration ? fmtDur(b.duration) : '—'}</td>
                          <td style={{ padding:'10px 14px', color:'#6b7280', whiteSpace:'nowrap' }}>{fmtDate(b.createdAt)}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                              {b.driveFileUrl && (
                                <a href={b.driveFileUrl} target='_blank' rel='noreferrer' style={{ fontSize:11, color:'#6366f1', fontWeight:600, textDecoration:'none' }}>Drive ↗</a>
                              )}
                              {['completed','failed'].includes(b.status) && (
                                <Btn small color='#0891b2' disabled={actionBusy[b._id+'v']} onClick={()=>verify(b._id)}>
                                  {actionBusy[b._id+'v'] ? '…' : 'Verify'}
                                </Btn>
                              )}
                              {['completed','verified'].includes(b.status) && (
                                <Btn small color='#7c3aed' disabled={actionBusy[b._id+'r']} onClick={()=>restore(b._id)}>
                                  {actionBusy[b._id+'r'] ? '…' : 'Restore'}
                                </Btn>
                              )}
                              <Btn small color='#ef4444' onClick={()=>deleteBackup(b._id)}>✕</Btn>
                            </div>
                            {b.error && <div style={{ fontSize:11, color:'#ef4444', marginTop:3 }}>{b.error}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          }

          {total > LIMIT && (
            <div style={{ padding:'12px 20px', display:'flex', gap:6, justifyContent:'center' }}>
              <Btn small color='#6b7280' disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Prev</Btn>
              <span style={{ fontSize:13, color:'#6b7280', padding:'5px 10px' }}>Page {page} / {Math.ceil(total/LIMIT)}</span>
              <Btn small color='#6b7280' disabled={page >= Math.ceil(total/LIMIT)} onClick={()=>setPage(p=>p+1)}>Next →</Btn>
            </div>
          )}
        </Section>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === 'settings' && editSet && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:16 }}>

          {/* Google Drive Connection */}
          <Section title='Google Drive Connection'>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
              {driveConnected ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#f0fdf4', borderRadius:10, border:'1px solid #bbf7d0' }}>
                    <span style={{ fontSize:20 }}>✅</span>
                    <div>
                      <p style={{ margin:0, fontWeight:700, fontSize:13, color:'#15803d' }}>Connected</p>
                      {health?.oauthEmail && <p style={{ margin:'2px 0 0', fontSize:12, color:'#6b7280' }}>{health.oauthEmail}</p>}
                    </div>
                  </div>
                  <Btn onClick={disconnectDrive} color='#ef4444'>Disconnect Google Drive</Btn>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ padding:'12px 14px', background:'#fefce8', border:'1px solid #fde68a', borderRadius:10, fontSize:12, lineHeight:1.8, color:'#78350f' }}>
                    <b>Setup required (one time):</b><br/>
                    1. Go to <a href='https://console.cloud.google.com/apis/credentials' target='_blank' rel='noreferrer' style={{color:'#b45309'}}>Google Cloud Console → Credentials</a><br/>
                    2. Create an <b>OAuth 2.0 Client ID</b> (Web application)<br/>
                    3. Add redirect URI: <code style={{fontSize:11}}>{window.location.origin}/api/backup/oauth/callback</code><br/>
                    4. Add to Railway env vars:<br/>
                    &nbsp;&nbsp;<code style={{fontSize:11}}>GOOGLE_OAUTH_CLIENT_ID</code><br/>
                    &nbsp;&nbsp;<code style={{fontSize:11}}>GOOGLE_OAUTH_CLIENT_SECRET</code><br/>
                    &nbsp;&nbsp;<code style={{fontSize:11}}>GOOGLE_OAUTH_REDIRECT_URI</code> = same URI as above<br/>
                    5. Click the button below ↓
                  </div>
                  <Btn onClick={connectDrive} color='#22c55e'>🔗 Connect Google Drive</Btn>
                </div>
              )}
              <div>
                <label style={{ fontSize:12, color:'#6b7280', fontWeight:600 }}>Backup Folder Name</label>
                <input value={editSet.driveFolder||''} onChange={e=>setEditSet(s=>({...s,driveFolder:e.target.value}))}
                  placeholder='StoreKit Backups'
                  style={{ width:'100%', marginTop:4, padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
                <p style={{ fontSize:11, color:'#9ca3af', margin:'4px 0 0' }}>Folder will be created automatically in your Drive on first backup.</p>
              </div>
            </div>
          </Section>

          {/* General */}
          <Section title='General'>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:14 }}>
                <input type='checkbox' checked={!!editSet.enabled} onChange={e=>setEditSet(s=>({...s,enabled:e.target.checked}))} />
                <span style={{ fontWeight:600 }}>Enable automated backups</span>
              </label>
            </div>
          </Section>

          {/* Schedule */}
          <Section title='Schedule (UTC)'>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <span style={{ fontSize:12, color:'#0891b2', fontWeight:700 }}>Daily</span>
                <div style={{ display:'flex', gap:8, marginTop:4, alignItems:'center' }}>
                  <label style={{ fontSize:12, color:'#6b7280' }}>Hour (UTC)</label>
                  <input type='number' min={0} max={23} value={editSet.dailyHour??2} onChange={e=>setEditSet(s=>({...s,dailyHour:+e.target.value}))}
                    style={{ width:60, padding:'5px 8px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:13 }} />
                </div>
              </div>
              <div>
                <span style={{ fontSize:12, color:'#7c3aed', fontWeight:700 }}>Weekly</span>
                <div style={{ display:'flex', gap:8, marginTop:4, alignItems:'center', flexWrap:'wrap' }}>
                  <label style={{ fontSize:12, color:'#6b7280' }}>Day</label>
                  <select value={editSet.weeklyDay??0} onChange={e=>setEditSet(s=>({...s,weeklyDay:+e.target.value}))}
                    style={{ padding:'5px 8px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:13 }}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=><option key={i} value={i}>{d}</option>)}
                  </select>
                  <label style={{ fontSize:12, color:'#6b7280' }}>Hour (UTC)</label>
                  <input type='number' min={0} max={23} value={editSet.weeklyHour??3} onChange={e=>setEditSet(s=>({...s,weeklyHour:+e.target.value}))}
                    style={{ width:60, padding:'5px 8px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:13 }} />
                </div>
              </div>
              <div>
                <span style={{ fontSize:12, color:'#b45309', fontWeight:700 }}>Monthly</span>
                <div style={{ display:'flex', gap:8, marginTop:4, alignItems:'center', flexWrap:'wrap' }}>
                  <label style={{ fontSize:12, color:'#6b7280' }}>Day</label>
                  <input type='number' min={1} max={28} value={editSet.monthlyDay??1} onChange={e=>setEditSet(s=>({...s,monthlyDay:+e.target.value}))}
                    style={{ width:60, padding:'5px 8px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:13 }} />
                  <label style={{ fontSize:12, color:'#6b7280' }}>Hour (UTC)</label>
                  <input type='number' min={0} max={23} value={editSet.monthlyHour??4} onChange={e=>setEditSet(s=>({...s,monthlyHour:+e.target.value}))}
                    style={{ width:60, padding:'5px 8px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:13 }} />
                </div>
              </div>
            </div>
          </Section>

          {/* Retention */}
          <Section title='Retention Rules'>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { label:'Daily backups to keep',   key:'retainDaily',   def:14, color:'#0891b2' },
                { label:'Weekly backups to keep',  key:'retainWeekly',  def:8,  color:'#7c3aed' },
                { label:'Monthly backups to keep', key:'retainMonthly', def:12, color:'#b45309' },
              ].map(r => (
                <div key={r.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <label style={{ fontSize:13, color:'#374151' }}>{r.label}</label>
                  <input type='number' min={1} max={365} value={editSet[r.key]??r.def}
                    onChange={e=>setEditSet(s=>({...s,[r.key]:+e.target.value}))}
                    style={{ width:70, padding:'5px 8px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:13, textAlign:'center', color:r.color, fontWeight:700 }} />
                </div>
              ))}
            </div>
          </Section>

          {/* Alerts */}
          <Section title='Failure Alerts'>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:14 }}>
                <input type='checkbox' checked={!!editSet.alertOnFailure} onChange={e=>setEditSet(s=>({...s,alertOnFailure:e.target.checked}))} />
                <span>Email me on backup failure</span>
              </label>
              <div>
                <label style={{ fontSize:12, color:'#6b7280', fontWeight:600 }}>Alert Email</label>
                <input type='email' value={editSet.alertEmail||''} onChange={e=>setEditSet(s=>({...s,alertEmail:e.target.value}))}
                  placeholder='admin@storekit.local'
                  style={{ width:'100%', marginTop:4, padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
              </div>
            </div>
          </Section>

          {/* Save */}
          <div style={{ gridColumn:'1/-1', display:'flex', justifyContent:'flex-end' }}>
            <Btn onClick={saveSettings} color='#6366f1'>Save Settings</Btn>
          </div>
        </div>
      )}
    </div>
  );
}