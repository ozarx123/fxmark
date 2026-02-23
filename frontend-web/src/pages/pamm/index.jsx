import React from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  pammSummary,
  equityCurveData,
  availableManagers,
  myAllocations,
} from './pammMockData';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`;

function RiskBadge({ profile }) {
  const c = profile === 'Conservative' ? 'low' : profile === 'Aggressive' ? 'high' : 'mid';
  return <span className={`risk-badge risk-badge--${c}`}>{profile}</span>;
}

export default function Pamm() {
  return (
    <div className="page pamm-page">
      <header className="page-header">
        <h1>PAMM</h1>
        <p className="page-subtitle">Managers, allocation, risk, growth and P&L</p>
        <Link to="/pamm/manager" className="pamm-manager-cta">
          Manage your fund (PAMM Managers) →
        </Link>
      </header>

      <section className="pamm-summary-cards">
        <div className="pamm-card">
          <h3>Total P&L</h3>
          <p className="pamm-value">{formatCurrency(pammSummary.totalPnl)}</p>
          <span className="pamm-meta">{formatPercent(pammSummary.pnlPercent)}</span>
        </div>
        <div className="pamm-card">
          <h3>Current value</h3>
          <p className="pamm-value">{formatCurrency(pammSummary.currentValue)}</p>
          <span className="pamm-meta">Invested: {formatCurrency(pammSummary.totalInvested)}</span>
        </div>
        <div className="pamm-card">
          <h3>Growth (YTD)</h3>
          <p className={`pamm-value ${pammSummary.growthYtd >= 0 ? 'positive' : 'negative'}`}>{formatPercent(pammSummary.growthYtd)}</p>
          <span className="pamm-meta">MTD: {formatPercent(pammSummary.growthMtd)}</span>
        </div>
        <div className="pamm-card">
          <h3>Risk score</h3>
          <p className="pamm-value">{pammSummary.riskScore}</p>
          <span className="pamm-meta">{pammSummary.riskProfile}</span>
        </div>
        <div className="pamm-card">
          <h3>Drawdown</h3>
          <p className="pamm-value negative">{pammSummary.currentDrawdown}%</p>
          <span className="pamm-meta">Max: {pammSummary.maxDrawdown}%</span>
        </div>
      </section>

      <section className="pamm-section">
        <h2 className="pamm-section-title">P&L</h2>
        <div className="pamm-pl-block">
          <div className="pamm-pl-row">
            <span>Open P&L</span>
            <span className={pammSummary.openPnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(pammSummary.openPnl)}</span>
          </div>
          <div className="pamm-pl-row">
            <span>Closed P&L</span>
            <span className="positive">{formatCurrency(pammSummary.closedPnl)}</span>
          </div>
          <div className="pamm-pl-row pamm-pl-total">
            <span>Total P&L</span>
            <span className={pammSummary.totalPnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(pammSummary.totalPnl)} ({formatPercent(pammSummary.pnlPercent)})</span>
          </div>
        </div>
      </section>

      <section className="pamm-section">
        <h2 className="pamm-section-title">Risk</h2>
        <div className="pamm-risk-block">
          <div className="pamm-risk-row">
            <span>Risk profile</span>
            <RiskBadge profile={pammSummary.riskProfile} />
          </div>
          <div className="pamm-risk-row">
            <span>Risk score (0–100)</span>
            <span>{pammSummary.riskScore}</span>
          </div>
          <div className="pamm-risk-row">
            <span>Current drawdown</span>
            <span className="negative">{pammSummary.currentDrawdown}%</span>
          </div>
          <div className="pamm-risk-row">
            <span>Max drawdown</span>
            <span className="negative">{pammSummary.maxDrawdown}%</span>
          </div>
        </div>
      </section>

      <section className="pamm-section">
        <h2 className="pamm-section-title">Growth</h2>
        <div className="pamm-growth-block">
          <div className="pamm-growth-row">
            <span>YTD growth</span>
            <span className={pammSummary.growthYtd >= 0 ? 'positive' : 'negative'}>{formatPercent(pammSummary.growthYtd)}</span>
          </div>
          <div className="pamm-growth-row">
            <span>MTD growth</span>
            <span className={pammSummary.growthMtd >= 0 ? 'positive' : 'negative'}>{formatPercent(pammSummary.growthMtd)}</span>
          </div>
        </div>
      </section>

      <section className="pamm-section">
        <h2 className="pamm-section-title">Equity curve</h2>
        <div className="pamm-chart-wrap">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={equityCurveData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="month" tick={{ fill: '#aaa', fontSize: 11 }} />
              <YAxis tick={{ fill: '#aaa', fontSize: 11 }} tickFormatter={(v) => v} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#2a1515', border: '1px solid rgba(255,255,255,0.12)' }} formatter={(v) => [v, 'Index']} />
              <Line type="monotone" dataKey="value" stroke="var(--fxmark-orange)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="pamm-section">
        <h2 className="pamm-section-title">Available managers</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>Browse by performance, risk and growth.</p>
        <div className="pamm-manager-cards">
          {availableManagers.map((m) => (
            <div key={m.id} className="pamm-manager-card">
              <div className="pamm-manager-header">
                <h3>{m.name}</h3>
                <RiskBadge profile={m.riskProfile} />
              </div>
              <p className="pamm-manager-strategy">{m.strategy}</p>
              <div className="pamm-manager-stats">
                <div><span className="label">P&L</span><span className={m.pnlPercent >= 0 ? 'positive' : 'negative'}>{formatPercent(m.pnlPercent)}</span></div>
                <div><span className="label">Growth YTD</span><span>{formatPercent(m.growthYtd)}</span></div>
                <div><span className="label">Risk</span><span>{m.riskScore}</span></div>
                <div><span className="label">Drawdown</span><span className="negative">{m.drawdown}%</span></div>
              </div>
              <p className="pamm-manager-meta">AUM {formatCurrency(m.aum)} · {m.investors} investors</p>
              <button type="button" className="btn btn-sm btn-primary">Follow</button>
            </div>
          ))}
        </div>
      </section>

      <section className="pamm-section">
        <h2 className="pamm-section-title">My allocations</h2>
        <div className="table-wrap">
          <table className="table pamm-table">
            <thead>
              <tr>
                <th>Manager</th>
                <th>Amount</th>
                <th>Share %</th>
                <th>P&L</th>
                <th>Growth %</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {myAllocations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-cell">No active allocations</td>
                </tr>
              ) : (
                myAllocations.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.managerName}</strong></td>
                    <td>{formatCurrency(a.amount)}</td>
                    <td>{a.sharePercent}%</td>
                    <td className={a.pnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(a.pnl)} ({formatPercent(a.pnlPercent)})</td>
                    <td className={a.growthPercent >= 0 ? 'positive' : 'negative'}>{formatPercent(a.growthPercent)}</td>
                    <td>{a.riskScore}</td>
                    <td><span className="status-badge status-approved">{a.status}</span></td>
                    <td><button type="button" className="btn-link">Add funds</button> <button type="button" className="btn-link btn-link-danger">Unfollow</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
