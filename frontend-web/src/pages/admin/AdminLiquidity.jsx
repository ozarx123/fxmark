import React, { useState } from 'react';

export default function AdminLiquidity() {
  const [provider, setProvider] = useState('primary');
  const [maxExposure, setMaxExposure] = useState(500000);
  const [autoHedge, setAutoHedge] = useState(true);

  return (
    <div className="page admin-page admin-liquidity">
      <header className="page-header">
        <h1>Liquidity management</h1>
        <p className="page-subtitle">Providers, exposure limits and hedging</p>
      </header>

      <section className="admin-section-block">
        <h2 className="section-title">Liquidity providers</h2>
        <div className="settings-card">
          <div className="filter-group">
            <label>Primary provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="filter-select"
            >
              <option value="primary">Primary LP</option>
              <option value="secondary">Secondary LP</option>
              <option value="backup">Backup LP</option>
            </select>
          </div>
          <p className="muted">Select the default liquidity provider for A-Book execution.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Exposure & limits</h2>
        <div className="settings-card">
          <div className="filter-group">
            <label>Max exposure per symbol (USD)</label>
            <input
              type="number"
              min={0}
              value={maxExposure}
              onChange={(e) => setMaxExposure(Number(e.target.value) || 0)}
              className="filter-input"
            />
          </div>
          <p className="muted">Maximum aggregate exposure before automatic hedge or B-Book retention.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Hedging</h2>
        <div className="settings-card">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={autoHedge}
              onChange={(e) => setAutoHedge(e.target.checked)}
            />
            <span>Auto-hedge when exposure exceeds limit</span>
          </label>
          <p className="muted">When enabled, positions are sent to the liquidity provider when exposure limits are reached.</p>
        </div>
      </section>

      <section className="admin-section-block">
        <div className="settings-actions">
          <button type="button" className="btn btn-primary">Save changes</button>
        </div>
      </section>
    </div>
  );
}
