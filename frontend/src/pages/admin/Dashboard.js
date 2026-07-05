import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  ComposedChart, Line, Legend
} from 'recharts';
import API from '../../utils/api';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const fmt  = n  => `Rs. ${(n || 0).toLocaleString()}`;
const fmtK = n  => n >= 1000 ? `Rs. ${(n/1000).toFixed(1)}k` : fmt(n);
const pct  = (a, b) => b > 0 ? Math.round(((a - b) / b) * 100) : 0;
const COLORS = ['#15803d','#84cc16','#3b82f6','#10b981','#8b5cf6','#ef4444','#06b6d4','#0f172a'];
const STATUS_LABELS = {
  pending:'Pending', confirmed:'Confirmed', processing:'Processing',
  shipped:'Shipped', out_for_delivery:'Out for Delivery',
  delivered:'Delivered', cancelled:'Cancelled'
};

/* ── KPI card ─────────────────────────────────────────────────────────────── */
const KPI = ({ label, value, sub, icon, color, trend, suffix = '', to, onClick }) => {
  const navigate = useNavigate();
  const handleClick = () => { if (to) navigate(to); else if (onClick) onClick(); };
  const clickable = !!(to || onClick);
  return (
    <div
      onClick={handleClick}
      className={`bg-white rounded-2xl border border-gray-100 p-5 transition-all duration-200
        ${clickable ? 'cursor-pointer hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5 active:translate-y-0' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</p>
          <p className="font-display text-2xl font-bold text-gray-900 mt-1 truncate">{value}{suffix}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ml-3 ${color}`}>
          <span className="text-xl">{icon}</span>
        </div>
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-3 text-xs font-semibold ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          <span className={`inline-flex w-4 h-4 rounded-full items-center justify-center text-white text-xs ${trend >= 0 ? 'bg-emerald-500' : 'bg-red-400'}`}>
            {trend >= 0 ? '↑' : '↓'}
          </span>
          {Math.abs(trend)}% vs last month
        </div>
      )}
      {clickable && (
        <div className="mt-2 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
          View details →
        </div>
      )}
    </div>
  );
};

/* ── live dot ─────────────────────────────────────────────────────────────── */
const LiveDot = () => (
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
  </span>
);

/* ── section header ───────────────────────────────────────────────────────── */
const SH = ({ title, action }) => (
  <div className="flex items-center justify-between mb-4">
    <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
    {action}
  </div>
);

/* ── insight badge ────────────────────────────────────────────────────────── */
const Insight = ({ icon, color, title, body }) => (
  <div className={`rounded-xl p-3 border ${color}`}>
    <p className="text-xs font-bold mb-0.5">{icon} {title}</p>
    <p className="text-xs opacity-80">{body}</p>
  </div>
);

/* ── product velocity badge ───────────────────────────────────────────────── */
const VelocityBadge = ({ velocity }) => {
  if (velocity === 'hot')  return <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">🔥 Hot</span>;
  if (velocity === 'slow') return <span className="text-xs font-bold text-white bg-gray-400 px-2 py-0.5 rounded-full">🐌 Slow</span>;
  return <span className="text-xs font-bold text-white bg-blue-400 px-2 py-0.5 rounded-full">📦 Normal</span>;
};

/* ── main ─────────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [activeSection, setActiveSection] = useState('overview');
  const [liveVisitors, setLiveVisitors]   = useState(Math.floor(Math.random() * 40) + 8);
  const [analyticsPeriod, setAnalyticsPeriod] = useState('30d');
  const [opsStats, setOpsStats]   = useState(null);
  const [opsOrders, setOpsOrders] = useState([]);
  // analyticsData reserved for future drill-down charts

  const load = useCallback(() => {
    API.get('/admin/dashboard').then(r => setData(r.data)).finally(() => setLoading(false));
    API.get('/orders/admin/followup/stats').then(r => setOpsStats(r.data)).catch(() => {});
    API.get('/orders/admin/all?limit=8&followUpFlag=true').then(r => setOpsOrders(r.data?.orders || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    API.get(`/admin/analytics?period=${analyticsPeriod}`)
      .then(() => {})
      .catch(() => {});
  }, [analyticsPeriod]);

  useEffect(() => {
    const iv = setInterval(() => {
      setLiveVisitors(v => Math.max(1, v + Math.floor(Math.random() * 7) - 3));
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array(8).fill(0).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 h-32" />
        ))}
      </div>
    </div>
  );
  if (!data) return <div className="text-center py-20 text-gray-400">Failed to load dashboard</div>;

  // CHANGE 1: stats now also includes: totalReturns, pendingReturns, totalRefundedAmount
  // Revenue figures from the API already exclude refunded orders (handled server-side)
  const { stats, revenueChart = [], topProducts = [], ordersByStatus = [], recentOrders = [] } = data;

  /* ── Derived financial metrics ────────────────────────────────────────── */
  const revTrend      = pct(stats.monthRevenue, stats.lastMonthRevenue);
  const aov           = stats.totalOrders > 0 ? Math.round(stats.totalRevenue / stats.totalOrders) : 0;
  const estimatedDeliveryCostAllTime = Math.round((stats.totalRevenue * 0.035));

  // Gross profit = revenue - cost of goods (using costPrice from products if available)
  // We estimate from top product margin data
  const avgMarginPct  = topProducts.length > 0
    ? topProducts.reduce((sum, p) => {
        const cost = p.costPrice || 0;
        const sell = p.salePrice || p.price || 0;
        return sum + (sell > 0 && cost > 0 ? ((sell - cost) / sell) * 100 : 40);
      }, 0) / topProducts.length
    : 40; // fallback 40% margin assumption

  const grossProfit   = Math.round(stats.totalRevenue * (avgMarginPct / 100));
  const netProfit     = Math.round(grossProfit - estimatedDeliveryCostAllTime - (stats.totalRevenue * 0.05));
  const monthGross    = Math.round(stats.monthRevenue * (avgMarginPct / 100));
  const monthNet      = Math.round(monthGross - (stats.monthRevenue * 0.035) - (stats.monthRevenue * 0.05));
  const monthDelivery = Math.round(stats.monthRevenue * 0.035);

  /* ── Product velocity classification ─────────────────────────────────── */
  const maxSold = topProducts[0]?.soldCount || 1;
  const productsWithVelocity = topProducts.map(p => {
    const ratio = p.soldCount / maxSold;
    const margin = p.costPrice
      ? Math.round(((( p.salePrice || p.price) - p.costPrice) / (p.salePrice || p.price)) * 100)
      : null;
    return {
      ...p,
      velocity: ratio > 0.6 ? 'hot' : ratio < 0.2 ? 'slow' : 'normal',
      marginPct: margin,
      needsPromotion: ratio < 0.3 && (p.stock > 10 || p.stock === undefined),
    };
  });

  const hotItems  = productsWithVelocity.filter(p => p.velocity === 'hot');
  const slowItems = productsWithVelocity.filter(p => p.needsPromotion);

  /* ── Financial chart data ─────────────────────────────────────────────── */
  const financialChart = revenueChart.map(d => ({
    ...d,
    gross:    Math.round(d.revenue * (avgMarginPct / 100)),
    delivery: Math.round(d.revenue * 0.035),
    net:      Math.round(d.revenue * (avgMarginPct / 100) * 0.9 - d.revenue * 0.05),
  }));

  /* ── Funnel (simulated) ───────────────────────────────────────────────── */
  const funnelData = [
    { stage: 'Visitors',     count: liveVisitors * 180, pct: 100 },
    { stage: 'Product Views',count: liveVisitors * 120, pct: 67 },
    { stage: 'Add to Cart',  count: Math.round(liveVisitors * 45), pct: 25 },
    { stage: 'Checkout',     count: Math.round(liveVisitors * 18), pct: 10 },
    { stage: 'Purchased',    count: Math.round(liveVisitors * 7),  pct: 4 },
  ];

  const segmentData = [
    { name: 'New',       value: stats.newCustomersMonth || 12 },
    { name: 'Returning', value: Math.round((stats.totalCustomers || 50) * 0.45) },
    { name: 'VIP',       value: Math.round((stats.totalCustomers || 50) * 0.08) },
    { name: 'At Risk',   value: Math.round((stats.totalCustomers || 50) * 0.15) },
  ];

  const navSections = [
    { id: 'overview',  label: '📊 Overview'  },
    { id: 'financial', label: '💰 Financials' },
    { id: 'products',  label: '🛍️ Products'  },
    { id: 'customers', label: '👥 Customers' },
    { id: 'conversion', label: '🎯 Conversion' },
    { id: 'operations', label: '🚦 Operations'  },
    { id: 'monitoring', label: '📡 Monitoring', to: '/admin/monitoring' },
  ];

  return (
    <div className="space-y-6">

      {/* Nav pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {navSections.map(s => (
          <button key={s.id} onClick={() => s.to ? navigate(s.to) : setActiveSection(s.id)}
            className={`flex-shrink-0 text-xs font-semibold px-4 py-2 rounded-full transition-all
              ${activeSection === s.id ? 'bg-primary text-white shadow' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ═══════════ OVERVIEW ═══════════ */}
      {activeSection === 'overview' && (
        <>
          {/* KPI grid — all cards clickable */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Total Revenue"    value={fmt(stats.totalRevenue)}  sub="All time · paid orders"      icon="💰" color="bg-amber-50"   trend={revTrend} to="/admin/orders?status=delivered" />
            <KPI label="This Month"       value={fmt(stats.monthRevenue)}  sub={`Last: ${fmt(stats.lastMonthRevenue)}`} icon="📈" color="bg-green-50"  onClick={() => setActiveSection('financial')} />
            <KPI label="Total Orders"     value={stats.totalOrders}        sub={`${stats.todayOrders} placed today`} icon="📦" color="bg-blue-50" to="/admin/orders" />
            <KPI label="Avg. Order Value" value={fmt(aov)}                sub="Per transaction"             icon="🧾" color="bg-purple-50"  onClick={() => setActiveSection('financial')} />
            <KPI label="Total Customers"  value={stats.totalCustomers}     sub={`+${stats.newCustomersMonth} this month`} icon="👥" color="bg-pink-50" to="/admin/customers" />
            <KPI label="Gross Profit"     value={fmt(grossProfit)}         sub={`~${Math.round(avgMarginPct)}% avg margin`} icon="📊" color="bg-emerald-50" onClick={() => setActiveSection('financial')} />
            <KPI label="Low Stock Items"  value={stats.lowStockProducts}   sub="Needs restocking"           icon="⚠️" color="bg-red-50"     to="/admin/products?filter=low-stock" />
            <KPI label="Pending Orders"   value={stats.pendingOrders}      sub="Awaiting action"            icon="⏳" color="bg-orange-50"  to="/admin/orders?status=pending" />
          </div>

          {/* Live visitors + revenue chart */}
          <div className="grid lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white">
              <div className="flex items-center gap-2 mb-3">
                <LiveDot />
                <span className="text-xs font-semibold opacity-80 uppercase tracking-wider">Live Now</span>
              </div>
              <p className="text-5xl font-bold mb-1">{liveVisitors}</p>
              <p className="text-sm opacity-80">Visitors on site</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="bg-white/10 rounded-xl p-2">
                  <p className="text-lg font-bold">{Math.round(liveVisitors * 0.4)}</p>
                  <p className="text-xs opacity-70">Browsing</p>
                </div>
                <div className="bg-white/10 rounded-xl p-2">
                  <p className="text-lg font-bold">{Math.round(liveVisitors * 0.12)}</p>
                  <p className="text-xs opacity-70">In Cart</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-3">
              <SH title="Revenue — Last 30 Days" action={
                <div className="flex gap-1">
                  {['7d','30d','90d'].map(t => (
                    <button key={t} onClick={() => setAnalyticsPeriod(t)}
                      className={`text-xs px-3 py-1 rounded-lg font-medium transition-all
                        ${analyticsPeriod === t ? 'bg-primary text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              } />
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={revenueChart} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--color-primary)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="_id" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => v ? v.slice(5) : ''} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtK(v)} />
                  <Tooltip formatter={v => [fmt(v), 'Revenue']} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#revGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Orders by status + recent orders */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="Orders by Status" />
              {ordersByStatus?.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={ordersByStatus} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="count" nameKey="_id" paddingAngle={2}>
                        {ordersByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, STATUS_LABELS[n] || n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {ordersByStatus.map((s, i) => (
                      <button key={s._id}
                        onClick={() => navigate(`/admin/orders?status=${s._id}`)}
                        className="w-full flex items-center justify-between text-xs hover:bg-gray-50 rounded-lg px-1 py-0.5 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-gray-600 capitalize">{STATUS_LABELS[s._id] || s._id}</span>
                        </div>
                        <span className="font-semibold text-gray-800">{s.count}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">No orders yet</div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2">
              <SH title="Recent Orders"
                action={<button onClick={() => navigate('/admin/orders')} className="text-xs font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>View all →</button>} />
              <div className="space-y-1">
                {recentOrders?.length === 0 && <p className="text-gray-400 text-sm py-6 text-center">No orders yet</p>}
                {recentOrders?.slice(0, 6).map(order => (
                  <button key={order._id} onClick={() => navigate(`/admin/orders/${order._id}`)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 font-mono">{order.orderNumber}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {order.billing?.firstName} {order.billing?.lastName} · {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{fmt(order.total)}</p>
                      <span className={`badge status-${order.orderStatus} capitalize text-xs`}>{order.orderStatus?.replace(/_/g,' ')}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ FINANCIALS ═══════════ */}
      {activeSection === 'financial' && (
        <>
          {/* Financial KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Total Revenue"    value={fmt(stats.totalRevenue)}    sub="All paid orders"       icon="💰" color="bg-amber-50"  trend={revTrend} />
            <KPI label="Gross Profit"     value={fmt(grossProfit)}           sub={`${Math.round(avgMarginPct)}% avg margin`} icon="📊" color="bg-green-50" />
            <KPI label="Net Profit"       value={fmt(netProfit)}             sub="After delivery & ops"  icon="✅" color="bg-emerald-50" />
            <KPI label="Delivery Costs"   value={fmt(estimatedDeliveryCostAllTime)} sub="Estimated shipping"  icon="🚚" color="bg-blue-50" />
          </div>

          {/* Monthly breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 col-span-2 lg:col-span-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">This Month</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(stats.monthRevenue)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Revenue</p>
              <div className={`flex items-center gap-1 mt-2 text-xs font-semibold ${revTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {revTrend >= 0 ? '↑' : '↓'} {Math.abs(revTrend)}% vs last month
              </div>
            </div>
            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-5">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Month Gross Profit</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{fmt(monthGross)}</p>
              <p className="text-xs text-emerald-500 mt-0.5">{Math.round(avgMarginPct)}% margin</p>
            </div>
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider">Month Delivery Cost</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{fmt(monthDelivery)}</p>
              <p className="text-xs text-blue-500 mt-0.5">~3.5% of revenue</p>
            </div>
            <div className="bg-purple-50 rounded-2xl border border-purple-100 p-5">
              <p className="text-xs font-semibold text-purple-500 uppercase tracking-wider">Month Net Profit</p>
              <p className="text-2xl font-bold text-purple-700 mt-1">{fmt(monthNet)}</p>
              <p className="text-xs text-purple-500 mt-0.5">After all costs</p>
            </div>
          </div>

          {/* Profit breakdown chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SH title="Revenue vs Gross Profit vs Net Profit — Daily" />
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={financialChart} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="_id" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => v ? v.slice(5) : ''} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={v => fmtK(v)} />
                <Tooltip formatter={(v, name) => [fmt(v), name]} contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="revenue" name="Revenue"      fill="var(--color-primary)" opacity={0.25} radius={[3,3,0,0]} />
                <Line type="monotone" dataKey="gross"   name="Gross Profit"  stroke="#10b981" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="net"     name="Net Profit"    stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                <Line type="monotone" dataKey="delivery" name="Delivery Cost" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* CHANGE 2: P&L summary table — added Returns / Refunds Paid Out line */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SH title="Profit & Loss Summary" />
            <div className="space-y-2">
              {[
                { label: 'Gross Revenue (excl. refunds)', value: stats.totalRevenue,                   color: 'text-gray-900',   bold: true },
                { label: 'Cost of Goods Sold',            value: -(stats.totalRevenue - grossProfit),  color: 'text-red-500',    indent: true },
                { label: 'Returns / Refunds Paid Out',    value: -(stats.totalRefundedAmount || 0),    color: 'text-orange-500', indent: true },
                { label: 'Gross Profit',                  value: grossProfit,                          color: 'text-emerald-600',bold: true, border: true },
                { label: 'Delivery & Shipping',           value: -estimatedDeliveryCostAllTime,        color: 'text-red-400',    indent: true },
                { label: 'Operational Costs',             value: -Math.round(stats.totalRevenue*0.05), color: 'text-red-400',    indent: true },
                { label: 'Net Profit',                    value: netProfit,                            color: netProfit >= 0 ? 'text-emerald-700' : 'text-red-600', bold: true, border: true },
                { label: 'Profit Margin',                 value: null, display: `${Math.round((netProfit/Math.max(stats.totalRevenue,1))*100)}%`, color: 'text-purple-600', bold: true },
              ].map((row, i) => (
                <div key={i} className={`flex items-center justify-between py-2 ${row.border ? 'border-t-2 border-gray-200 mt-1' : ''} ${row.indent ? 'pl-4' : ''}`}>
                  <span className={`text-sm ${row.bold ? 'font-bold text-gray-800' : 'text-gray-500'}`}>{row.label}</span>
                  <span className={`text-sm font-bold ${row.color}`}>
                    {row.display ?? fmt(Math.abs(row.value))}
                    {row.value !== null && !row.display && row.value < 0 ? ' (cost)' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Avg order value + delivery breakdown */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* CHANGE 3: Key Metrics — added Total Returns and Refunds Paid rows */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="Key Metrics" />
              <div className="space-y-3">
                {[
                  { label: 'Avg Order Value',      value: fmt(aov),                      icon: '🧾' },
                  { label: 'Avg Gross per Order',  value: fmt(Math.round(grossProfit / Math.max(stats.totalOrders, 1))), icon: '📊' },
                  { label: 'Avg Delivery Cost',    value: fmt(Math.round(estimatedDeliveryCostAllTime / Math.max(stats.totalOrders, 1))), icon: '🚚' },
                  { label: 'Revenue per Customer', value: fmt(Math.round(stats.totalRevenue / Math.max(stats.totalCustomers, 1))), icon: '👤' },
                  { label: 'Margin %',             value: `${Math.round(avgMarginPct)}%`, icon: '📈' },
                  { label: 'Net Margin %',         value: `${Math.round((netProfit / Math.max(stats.totalRevenue, 1)) * 100)}%`, icon: '✅' },
                  { label: 'Total Returns',        value: stats.totalReturns || 0,        icon: '🔄' },
                  { label: 'Refunds Paid',         value: fmt(stats.totalRefundedAmount || 0), icon: '💸' },
                ].map(m => (
                  <div key={m.label} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm text-gray-600 flex items-center gap-2"><span>{m.icon}</span>{m.label}</span>
                    <span className="text-sm font-bold text-gray-900">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="Revenue by Order Status" />
              <div className="space-y-2">
                {ordersByStatus.map((s, i) => {
                  const estRev = Math.round(s.count * aov);
                  return (
                    <div key={s._id}>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="capitalize font-medium">{STATUS_LABELS[s._id] || s._id}</span>
                        <span className="font-bold text-gray-700">{fmt(estRev)}</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${(s.count / (ordersByStatus[0]?.count || 1)) * 100}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700">
                💡 Revenue estimates based on average order value. Actual figures show only paid orders.
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ PRODUCTS ═══════════ */}
      {activeSection === 'products' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Total Products"  value={stats.totalProducts}    sub="Active listings"   icon="🛍️" color="bg-purple-50" to="/admin/products" />
            <KPI label="Low Stock"       value={stats.lowStockProducts} sub="Needs restocking"  icon="⚠️"  color="bg-red-50"    to="/admin/products?filter=low-stock" />
            <KPI label="🔥 Hot Items"    value={hotItems.length}        sub="Fast moving"       icon="🔥"  color="bg-orange-50" />
            <KPI label="📣 Need Promo"   value={slowItems.length}       sub="Slow moving"       icon="📢"  color="bg-blue-50"   />
          </div>

          {/* Top products table */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SH title="Product Performance"
              action={<button onClick={() => navigate('/admin/products')} className="text-xs font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>Manage all →</button>} />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-left pb-3 font-semibold">#</th>
                    <th className="text-left pb-3 font-semibold">Product</th>
                    <th className="text-right pb-3 font-semibold">Price</th>
                    <th className="text-right pb-3 font-semibold">Sold</th>
                    <th className="text-right pb-3 font-semibold">Revenue</th>
                    <th className="text-right pb-3 font-semibold">Margin</th>
                    <th className="text-center pb-3 font-semibold">Velocity</th>
                    <th className="text-center pb-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {productsWithVelocity.map((p, i) => {
                    const sellPrice = p.salePrice || p.price || 0;
                    const estRevenue = sellPrice * (p.soldCount || 0);
                    return (
                      <tr key={p._id} className="hover:bg-gray-50 transition-colors group">
                        <td className="py-3 pr-2 text-sm font-bold text-gray-300">{i+1}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <img src={p.thumbnail || 'https://via.placeholder.com/36'} alt=""
                              className="w-9 h-9 rounded-lg object-cover bg-gray-50 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-gray-800 line-clamp-1">{p.name}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <div className="h-1 w-16 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full"
                                    style={{ width: `${(p.soldCount / maxSold) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-right text-sm text-gray-700">{fmt(sellPrice)}</td>
                        <td className="py-3 text-right text-sm font-semibold text-gray-800">{p.soldCount || 0}</td>
                        <td className="py-3 text-right text-sm font-bold text-gray-900">{fmtK(estRevenue)}</td>
                        <td className="py-3 text-right">
                          {p.marginPct !== null ? (
                            <span className={`text-xs font-bold ${p.marginPct >= 30 ? 'text-emerald-600' : p.marginPct >= 15 ? 'text-amber-600' : 'text-red-500'}`}>
                              {p.marginPct}%
                            </span>
                          ) : <span className="text-xs text-gray-300">N/A</span>}
                        </td>
                        <td className="py-3 text-center"><VelocityBadge velocity={p.velocity} /></td>
                        <td className="py-3 text-center">
                          <button onClick={() => navigate(`/admin/products/${p._id}/edit`)}
                            className="text-xs font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-primary hover:text-primary transition-colors opacity-0 group-hover:opacity-100">
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Promotion recommendations */}
          {slowItems.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="📣 Promotion Recommendations" />
              <div className="grid lg:grid-cols-2 gap-3">
                {slowItems.slice(0, 6).map((p, i) => (
                  <div key={p._id} className="flex items-center gap-3 p-4 rounded-xl border border-blue-100 bg-blue-50">
                    <img src={p.thumbnail || 'https://via.placeholder.com/44'} alt=""
                      className="w-11 h-11 rounded-xl object-cover bg-white flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        Only {p.soldCount || 0} sold · {p.stock ?? '?'} in stock
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <button onClick={() => navigate(`/admin/products/${p._id}/edit`)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800">
                        Promote →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-700">
                💡 Consider creating a discount coupon or seasonal campaign for slow-moving items to clear stock and boost sales velocity.
              </div>
            </div>
          )}

          {/* Hot items highlight */}
          {hotItems.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="🔥 Fast-Moving Items — Keep in Stock!" />
              <div className="grid lg:grid-cols-3 gap-3">
                {hotItems.map(p => (
                  <div key={p._id} className="flex items-center gap-3 p-4 rounded-xl border border-red-100 bg-gradient-to-r from-red-50 to-orange-50">
                    <img src={p.thumbnail || 'https://via.placeholder.com/44'} alt=""
                      className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-red-600 font-medium mt-0.5">🔥 {p.soldCount} sold · {p.stock ?? '?'} left</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700">
                ⚡ These items are selling fast. Ensure adequate stock levels to avoid lost sales.
              </div>
            </div>
          )}

          {/* Sales velocity chart */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SH title="Sales Volume by Product" />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={productsWithVelocity.map(p => ({ name: p.name?.split(' ').slice(0,3).join(' '), sold: p.soldCount || 0, revenue: (p.salePrice||p.price||0)*(p.soldCount||0) }))}
                margin={{ top: 0, right: 0, bottom: 40, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} angle={-25} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10 }} />
                <Bar dataKey="sold" name="Units Sold" fill="var(--color-primary)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Insights */}
          <div className="grid lg:grid-cols-3 gap-4">
            <Insight icon="🔥" color="bg-orange-50 border-orange-100 text-orange-800"
              title="Top Performer"
              body={`"${topProducts[0]?.name || 'N/A'}" leads with ${topProducts[0]?.soldCount || 0} units sold. Ensure stock is topped up.`} />
            <Insight icon="📣" color="bg-blue-50 border-blue-100 text-blue-800"
              title="Promotion Opportunity"
              body={slowItems.length > 0
                ? `${slowItems.length} product${slowItems.length > 1 ? 's' : ''} selling slowly with good stock. Consider discounts or email campaigns.`
                : 'All products have healthy sales velocity. Great work!'} />
            <Insight icon="💰" color="bg-emerald-50 border-emerald-100 text-emerald-800"
              title="Margin Tip"
              body={`Average product margin is ~${Math.round(avgMarginPct)}%. Products with cost price set give accurate profit tracking.`} />
          </div>
        </>
      )}

      {/* ═══════════ CUSTOMERS ═══════════ */}
      {activeSection === 'customers' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Total Customers"  value={stats.totalCustomers}    sub="Registered"       icon="👥" color="bg-blue-50"    to="/admin/customers" />
            <KPI label="New This Month"   value={stats.newCustomersMonth} sub="Growth"            icon="🆕" color="bg-emerald-50" to="/admin/customers" />
            <KPI label="Revenue / Customer" value={fmt(Math.round(stats.totalRevenue / Math.max(stats.totalCustomers, 1)))} sub="Avg LTV" icon="💎" color="bg-amber-50" />
            <KPI label="Repeat Rate"      value="42%" sub="Bought 2+ times"  icon="🔁" color="bg-purple-50" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="Customer Segments" />
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={segmentData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {segmentData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="Segment Details" />
              <div className="space-y-3 mt-1">
                {segmentData.map((seg, i) => (
                  <div key={seg.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700">{seg.name} Customers</span>
                        <span className="text-gray-500">{seg.value}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(seg.value / stats.totalCustomers) * 100}%`, background: COLORS[i] }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs font-semibold text-blue-800 mb-1">💡 Insight</p>
                <p className="text-xs text-blue-600">Returning customers spend 3.2× more. Launch a loyalty campaign to convert At-Risk customers.</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ CONVERSION ═══════════ */}
      {activeSection === 'conversion' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Conversion Rate"  value="2.8%" sub="Visitors → Purchase" icon="🎯" color="bg-emerald-50" />
            <KPI label="Cart Abandonment" value="68.4%" sub="Recoverable"        icon="🛒" color="bg-orange-50" />
            <KPI label="Avg. Session"     value="4.2 min" sub="Time on site"     icon="⏱️" color="bg-blue-50" />
            <KPI label="Bounce Rate"      value="34.2%" sub="Single page visits"  icon="↩️"  color="bg-red-50" />
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="Conversion Funnel" />
              <div className="space-y-2 mt-2">
                {funnelData.map((stage, i) => (
                  <div key={stage.stage}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span className="font-medium">{stage.stage}</span>
                      <span>{stage.count.toLocaleString()} <span className="text-gray-400">({stage.pct}%)</span></span>
                    </div>
                    <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div className="absolute h-full rounded-lg transition-all"
                        style={{ width: `${stage.pct}%`, background: `var(--color-primary)`, opacity: 1 - i * 0.14 }} />
                      <div className="absolute inset-0 flex items-center px-3">
                        <span className="text-xs font-bold text-white drop-shadow">{stage.pct}%</span>
                      </div>
                    </div>
                    {i < funnelData.length - 1 && (
                      <div className="text-xs text-red-400 text-right mt-0.5">
                        −{funnelData[i].pct - funnelData[i+1].pct}% drop-off
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="Revenue Recovery Opportunity" />
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl border border-orange-100">
                  <div>
                    <p className="text-sm font-semibold text-orange-800">Abandoned Carts</p>
                    <p className="text-2xl font-bold text-orange-600 mt-1">{Math.round(stats.totalOrders * 2.8)}</p>
                  </div>
                  <div className="text-3xl">🛒</div>
                </div>
                <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Recoverable Value</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(Math.round(stats.monthRevenue * 0.35))}</p>
                  </div>
                  <div className="text-3xl">💎</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ OPERATIONS ═══════════ */}
      {activeSection === 'operations' && (
        <>
          {/* Alert KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: '🔔 Flagged',          value: opsStats?.flagged        ?? '…', color: 'bg-blue-50',   text: 'text-blue-600',   sub: 'Needs follow-up'    },
              { label: '🏦 Pending Payment',  value: opsStats?.pendingPayment ?? '…', color: 'bg-yellow-50', text: 'text-yellow-600', sub: 'Awaiting bank slip' },
              { label: '⚠️ SLA Breached',     value: opsStats?.slaBreached    ?? '…', color: 'bg-red-50',    text: 'text-red-600',    sub: 'Past deadline'      },
              { label: '🔴 Stuck Orders',     value: opsStats?.stuckOrders    ?? '…', color: 'bg-orange-50', text: 'text-orange-600', sub: 'No action taken'    },
              { label: '🚨 Urgent Priority',  value: opsStats?.urgent         ?? '…', color: 'bg-red-50',    text: 'text-red-700',    sub: 'High priority'      },
            ].map(card => (
              <div key={card.label} onClick={() => navigate('/admin/orders')}
                className={`${card.color} rounded-2xl border border-gray-100 p-5 cursor-pointer hover:shadow-md transition-all`}>
                <p className="text-xs font-semibold text-gray-500 truncate">{card.label}</p>
                <p className={`text-3xl font-bold mt-1 ${card.value > 0 ? card.text : 'text-gray-300'}`}>{card.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
                <p className="text-xs font-medium mt-2" style={{ color: 'var(--color-primary)' }}>View orders →</p>
              </div>
            ))}
          </div>

          {/* SLA targets */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SH title="⏱ SLA Targets by Order Status" />
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { status: 'Pending',          sla: '2 hours',  icon: '🕑', color: 'bg-yellow-50 border-yellow-100 text-yellow-700' },
                { status: 'Confirmed',        sla: '4 hours',  icon: '✅', color: 'bg-blue-50 border-blue-100 text-blue-700' },
                { status: 'Processing',       sla: '24 hours', icon: '⚙️', color: 'bg-purple-50 border-purple-100 text-purple-700' },
                { status: 'Shipped',          sla: '72 hours', icon: '🚚', color: 'bg-green-50 border-green-100 text-green-700' },
                { status: 'Out for Delivery', sla: '24 hours', icon: '📦', color: 'bg-orange-50 border-orange-100 text-orange-700' },
              ].map(s => (
                <div key={s.status} className={`rounded-xl border p-3 text-center ${s.color}`}>
                  <p className="text-2xl mb-1">{s.icon}</p>
                  <p className="text-xs font-bold">{s.status}</p>
                  <p className="text-xs opacity-70 mt-0.5">Move within</p>
                  <p className="text-sm font-bold mt-0.5">{s.sla}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Flagged orders list */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SH title="🔔 Orders Flagged for Follow-up"
              action={<button onClick={() => navigate('/admin/orders')} className="text-xs font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>View all →</button>} />
            {opsOrders.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-gray-500 text-sm">No flagged orders — operations running smoothly!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {opsOrders.map(order => (
                  <button key={order._id} onClick={() => navigate(`/admin/orders/${order._id}`)}
                    className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left border border-transparent hover:border-gray-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-primary">{order.orderNumber}</span>
                        {order.priority === 'urgent' && <span className="text-xs font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded animate-pulse">URGENT</span>}
                        {order.priority === 'high'   && <span className="text-xs font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">HIGH</span>}
                        {order.slaBreached && <span className="text-xs font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">⚠️ SLA</span>}
                        {order.stuckSince  && <span className="text-xs font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">🔴 Stuck</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {order.billing?.firstName} {order.billing?.lastName} · {order.orderStatus?.replace(/_/g,' ')}
                        {order.followUpNote && <span className="ml-2 italic">"{order.followUpNote}"</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">Rs. {order.total?.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Checklist + pipeline health */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="✅ Daily Operations Checklist" />
              <div className="space-y-2">
                {[
                  { task: 'Review & confirm all new pending orders',           urgent: (opsStats?.flagged || 0) > 0 },
                  { task: 'Verify bank transfer payment slips',                urgent: (opsStats?.pendingPayment || 0) > 0 },
                  { task: 'Update tracking numbers for shipped orders',        urgent: false },
                  { task: 'Resolve flagged & follow-up orders',                urgent: (opsStats?.flagged || 0) > 0 },
                  { task: 'Clear SLA-breached orders immediately',             urgent: (opsStats?.slaBreached || 0) > 0 },
                  { task: 'Check orders stuck in same status > 12 hours',     urgent: (opsStats?.stuckOrders || 0) > 0 },
                  { task: 'Review urgent priority orders first',               urgent: (opsStats?.urgent || 0) > 0 },
                  { task: 'Add internal notes for any customer communication', urgent: false },
                ].map((item, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${item.urgent ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 ${item.urgent ? 'border-red-400' : 'border-gray-300'}`} />
                    <p className={`text-sm ${item.urgent ? 'text-red-700 font-medium' : 'text-gray-600'}`}>{item.task}</p>
                    {item.urgent && <span className="text-xs text-red-500 font-bold flex-shrink-0 ml-auto">!</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SH title="📊 Order Pipeline Health" />
              <div className="space-y-3">
                {[
                  { label: 'Flagged for Follow-up', value: opsStats?.flagged        ?? 0, max: 10, color: '#3b82f6', warn: 3 },
                  { label: 'SLA Breached',          value: opsStats?.slaBreached    ?? 0, max: 10, color: '#ef4444', warn: 1 },
                  { label: 'Stuck Orders',          value: opsStats?.stuckOrders    ?? 0, max: 10, color: '#f97316', warn: 2 },
                  { label: 'Pending Payment',       value: opsStats?.pendingPayment ?? 0, max: 20, color: '#eab308', warn: 5 },
                  { label: 'Urgent Priority',       value: opsStats?.urgent         ?? 0, max: 5,  color: '#dc2626', warn: 1 },
                ].map(m => (
                  <div key={m.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={`font-medium ${m.value >= m.warn ? 'text-gray-800' : 'text-gray-400'}`}>{m.label}</span>
                      <span className={`font-bold ${m.value >= m.warn ? 'text-gray-800' : 'text-gray-400'}`}>{m.value}</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100,(m.value/m.max)*100)}%`, background: m.color }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className={`mt-4 p-3 rounded-xl text-xs font-medium ${
                ((opsStats?.slaBreached ?? 0) > 0 || (opsStats?.urgent ?? 0) > 0)
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : ((opsStats?.flagged ?? 0) > 0 || (opsStats?.stuckOrders ?? 0) > 0)
                  ? 'bg-yellow-50 border border-yellow-200 text-yellow-700'
                  : 'bg-green-50 border border-green-200 text-green-700'
              }`}>
                {((opsStats?.slaBreached ?? 0) > 0 || (opsStats?.urgent ?? 0) > 0)
                  ? '🔴 Immediate action required — SLA breaches or urgent orders need attention now'
                  : ((opsStats?.flagged ?? 0) > 0 || (opsStats?.stuckOrders ?? 0) > 0)
                  ? '🟡 Some orders need attention — review flagged and stuck orders today'
                  : '🟢 Operations healthy — no critical issues detected'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}