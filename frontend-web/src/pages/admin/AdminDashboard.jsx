import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  kpiDailySummary,
  todayKpis,
  topIbs,
  topCountries,
  symbolBreakdown,
  overviewMetrics,
  topPerformers,
} from './mockKpiData';

const DATE_RANGES = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales KPIs' },
];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState(30);
  const [ibFilter, setIbFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [symbolGroupFilter, setSymbolGroupFilter] = useState('');

  const chartData = useMemo(() => {
    return kpiDailySummary.slice(-dateRange);
  }, [dateRange]);

  const formatCurrency = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const formatNum = (n) => new Intl.NumberFormat('en-US').format(n);

  return (
    <div className="page admin-page admin-dashboard">
      <header className="page-header">
        <h1>Sales & Trade Performance KPIs</h1>
        <p className="page-subtitle">Real-time and aggregated insights</p>
      </header>

      {/* Tabs */}
      <nav className="kpi-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`kpi-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Global filters */}
      <section className="kpi-filters">
        <div className="filter-group">
          <label>Date range</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="filter-select"
          >
            {DATE_RANGES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>IB</label>
          <select
            value={ibFilter}
            onChange={(e) => setIbFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All IBs</option>
            {topIbs.map((ib) => (
              <option key={ib.id} value={ib.id}>{ib.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Country</label>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All countries</option>
            {topCountries.map((c) => (
              <option key={c.country} value={c.country}>{c.country}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Symbol group</label>
          <select
            value={symbolGroupFilter}
            onChange={(e) => setSymbolGroupFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All</option>
            {symbolBreakdown.map((s) => (
              <option key={s.symbolGroup} value={s.symbolGroup}>{s.symbolGroup}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Overview tab: high-level metrics */}
      {activeTab === 'overview' && (
        <section className="kpi-cards-section">
          <h2 className="section-title">Overview</h2>
          <div className="kpi-cards kpi-cards-overview">
            <div className="kpi-card">
              <h3>Total deposits</h3>
              <p className="kpi-value">{formatCurrency(overviewMetrics.totalDeposits)}</p>
              <span className="kpi-meta">Period total</span>
            </div>
            <div className="kpi-card">
              <h3>Total users</h3>
              <p className="kpi-value">{formatNum(overviewMetrics.totalUsers)}</p>
              <span className="kpi-meta">Registered</span>
            </div>
            <div className="kpi-card">
              <h3>Daily avg deposits</h3>
              <p className="kpi-value">{formatCurrency(overviewMetrics.dailyAvgDeposits)}</p>
              <span className="kpi-meta">Per day</span>
            </div>
            <div className="kpi-card">
              <h3>Avg withdrawals</h3>
              <p className="kpi-value">{formatCurrency(overviewMetrics.avgWithdrawals)}</p>
              <span className="kpi-meta">Per request</span>
            </div>
            <div className="kpi-card">
              <h3>User growth</h3>
              <p className="kpi-value">{overviewMetrics.userGrowthPercent}%</p>
              <span className="kpi-meta">vs previous period</span>
            </div>
            <div className="kpi-card">
              <h3>Compliant resolution</h3>
              <p className="kpi-value">{overviewMetrics.compliantResolution}%</p>
              <span className="kpi-meta">{overviewMetrics.compliantResolvedCount} / {overviewMetrics.compliantTotal} resolved</span>
            </div>
            <div className="kpi-card">
              <h3>Commission pending</h3>
              <p className="kpi-value">{formatCurrency(overviewMetrics.commissionPending)}</p>
              <span className="kpi-meta">Awaiting payout</span>
            </div>
          </div>
          <div className="top-performers-block">
            <h2 className="section-title">Top performers</h2>
            <div className="table-wrap">
              <table className="table kpi-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Metric</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {topPerformers.map((p) => (
                    <tr key={`${p.rank}-${p.name}`}>
                      <td>{p.rank}</td>
                      <td><strong>{p.name}</strong></td>
                      <td><span className="performer-type performer-type--{p.type.toLowerCase()}">{p.type}</span></td>
                      <td>{p.metric}</td>
                      <td>{typeof p.value === 'number' && p.value > 1000 ? formatCurrency(p.value) : formatNum(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Sales tab: Today's KPIs (sales funnel) */}
      {activeTab === 'sales' && (
        <section className="kpi-cards-section">
          <h2 className="section-title">Today&apos;s KPIs</h2>
          <div className="kpi-cards kpi-cards-sales">
            <div className="kpi-card">
              <h3>New Leads</h3>
              <p className="kpi-value">{formatNum(todayKpis.leads)}</p>
              <span className="kpi-meta">Daily</span>
            </div>
            <div className="kpi-card">
              <h3>Verified Users</h3>
              <p className="kpi-value">{formatNum(todayKpis.verifiedUsers)}</p>
              <span className="kpi-meta">Email/KYC approved</span>
            </div>
            <div className="kpi-card">
              <h3>FTD</h3>
              <p className="kpi-value">{formatNum(todayKpis.ftdCount)}</p>
              <span className="kpi-meta">{formatCurrency(todayKpis.ftdAmount)}</span>
            </div>
            <div className="kpi-card">
              <h3>Lead → FTD</h3>
              <p className="kpi-value">{todayKpis.leadToFtdRate}%</p>
              <span className="kpi-meta">Conversion rate</span>
            </div>
            <div className="kpi-card">
              <h3>Active Traders (7d)</h3>
              <p className="kpi-value">{formatNum(todayKpis.activeTraders7d)}</p>
              <span className="kpi-meta">30d: {formatNum(todayKpis.activeTraders30d)}</span>
            </div>
            <div className="kpi-card">
              <h3>ARPU</h3>
              <p className="kpi-value">{formatCurrency(todayKpis.arpu)}</p>
              <span className="kpi-meta">Avg deposit per client</span>
            </div>
          </div>
        </section>
      )}

      {/* Trend charts */}
      <section className="kpi-charts-section">
        <h2 className="section-title">Trends ({dateRange}d)</h2>
        <div className="kpi-charts-grid">
          {activeTab === 'sales' && (
          <>
          <div className="chart-block">
            <h3>Leads</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" tick={{ fill: '#aaa', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#aaa', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#2a1515', border: '1px solid var(--fxmark-border)' }}
                  formatter={(v) => [formatNum(v), 'Leads']}
                />
                <Line type="monotone" dataKey="leads" stroke="var(--fxmark-orange)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-block">
            <h3>FTD (count)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" tick={{ fill: '#aaa', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: '#aaa', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#2a1515', border: '1px solid var(--fxmark-border)' }}
                  formatter={(v) => [formatNum(v), 'FTD']}
                />
                <Line type="monotone" dataKey="ftd" stroke="#6bcf7f" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          </>
          )}
          {activeTab === 'overview' && (
          <>
            <div className="chart-block">
              <h3>Deposits</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fill: '#aaa', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: '#aaa', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#2a1515', border: '1px solid var(--fxmark-border)' }}
                    labelFormatter={(v) => v}
                    formatter={(v) => [formatCurrency(v), 'Deposits']}
                  />
                  <Line type="monotone" dataKey="deposits" stroke="var(--fxmark-orange)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-block">
              <h3>Closed Lots</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fill: '#aaa', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: '#aaa', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#2a1515', border: '1px solid var(--fxmark-border)' }}
                    formatter={(v) => [Number(v).toFixed(1), 'Lots']}
                  />
                  <Line type="monotone" dataKey="lots" stroke="#6bcf7f" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-block">
              <h3>Revenue</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fill: '#aaa', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: '#aaa', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ background: '#2a1515', border: '1px solid var(--fxmark-border)' }}
                    formatter={(v) => [formatCurrency(v), 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#7b9cff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
          )}
        </div>
      </section>

      {/* Leaderboards + Symbol breakdown */}
      <section className="kpi-tables-section">
        <div className="leaderboard-block">
          <h2 className="section-title">Top IBs (ranking)</h2>
          <div className="table-wrap">
            <table className="table kpi-table">
              <thead>
                <tr>
                  <th>IB</th>
                  <th>Leads</th>
                  <th>FTD</th>
                  <th>Deposits</th>
                  <th>Lots</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topIbs.map((ib) => (
                  <tr key={ib.id}>
                    <td><strong>{ib.name}</strong></td>
                    <td>{formatNum(ib.leads)}</td>
                    <td>{formatNum(ib.ftd)}</td>
                    <td>{formatCurrency(ib.deposits)}</td>
                    <td>{ib.lots}</td>
                    <td>{formatCurrency(ib.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="leaderboard-block">
          <h2 className="section-title">Top Countries</h2>
          <div className="table-wrap">
            <table className="table kpi-table">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Leads</th>
                  <th>FTD</th>
                  <th>Deposits</th>
                </tr>
              </thead>
              <tbody>
                {topCountries.map((c) => (
                  <tr key={c.country}>
                    <td><strong>{c.country}</strong></td>
                    <td>{formatNum(c.leads)}</td>
                    <td>{formatNum(c.ftd)}</td>
                    <td>{formatCurrency(c.deposits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {activeTab === 'overview' && (
        <div className="symbol-breakdown-block">
          <h2 className="section-title">Symbol performance</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={symbolBreakdown} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis type="number" tick={{ fill: '#aaa' }} tickFormatter={(v) => v.toLocaleString()} />
              <YAxis type="category" dataKey="symbolGroup" tick={{ fill: '#aaa' }} width={70} />
              <Tooltip
                contentStyle={{ background: '#2a1515', border: '1px solid var(--fxmark-border)' }}
                formatter={(v, name) => [name === 'lots' ? Number(v).toFixed(1) : formatCurrency(v), name]}
              />
              <Bar dataKey="lots" fill="var(--fxmark-orange)" name="Lots" radius={[0, 4, 4, 0]} />
              <Bar dataKey="revenue" fill="#7b9cff" name="Revenue" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        )}
      </section>

      <section className="kpi-footer-note">
        <p className="muted">
          Data from summary tables (kpi_daily_summary, kpi_daily_by_ib, kpi_daily_by_symbol_group). 
          Role-based visibility: Admin, Finance, Risk. Export CSV/PDF coming soon.
        </p>
      </section>
    </div>
  );
}
