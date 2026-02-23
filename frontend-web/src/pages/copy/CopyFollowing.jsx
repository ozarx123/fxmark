import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { myFollowing, COPY_MODE_OPTIONS } from './copyMockData';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`;

function copyModeLabel(value) {
  return COPY_MODE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export default function CopyFollowing() {
  const [following, setFollowing] = useState(myFollowing);

  const handleUnfollow = (id) => {
    if (window.confirm('Unfollow this master? Your current copied positions may remain open.')) {
      setFollowing((prev) => prev.filter((f) => f.id !== id));
    }
  };

  return (
    <div className="page copy-page copy-following-page">
      <header className="page-header">
        <h1>My copy</h1>
        <p className="page-subtitle">Masters you follow and your copy settings</p>
        <Link to="/copy" className="copy-back-link">← Copy Trading</Link>
      </header>

      <section className="copy-section">
        <h2 className="copy-section-title">Active following</h2>
        <div className="table-wrap">
          <table className="table copy-table">
            <thead>
              <tr>
                <th>Master</th>
                <th>Copy mode</th>
                <th>Allocation / Risk</th>
                <th>Limits</th>
                <th>P&L</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {following.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">No active copy. <Link to="/copy">Discover masters</Link></td>
                </tr>
              ) : (
                following.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link to={`/copy/master/${f.masterSlug}`} className="copy-master-link"><strong>{f.masterName}</strong></Link>
                    </td>
                    <td>{copyModeLabel(f.copyMode)}</td>
                    <td>
                      {f.copyMode === 'capital_balance' && formatCurrency(f.allocationAmount)}
                      {f.copyMode === 'risk_pct' && `${f.riskPctPerTrade}% per trade`}
                      {!f.allocationAmount && f.copyMode !== 'risk_pct' && '—'}
                    </td>
                    <td>Daily loss {f.maxDailyLossPct}% · DD {f.maxDrawdownPct}%</td>
                    <td className={f.pnl >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(f.pnl)} ({formatPercent(f.pnlPercent)})
                    </td>
                    <td><span className="copy-status copy-status--active">{f.status}</span></td>
                    <td>
                      <button type="button" className="btn-link btn-link-danger" onClick={() => handleUnfollow(f.id)}>Unfollow</button>
                    </td>
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
