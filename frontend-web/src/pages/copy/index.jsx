import React from 'react';
import { Link } from 'react-router-dom';
import { discoverMasters, myFollowing, myMasterProfile } from './copyMockData';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`;

export default function CopyHub() {
  return (
    <div className="page copy-page copy-hub-page">
      <header className="page-header">
        <h1>Copy Trading</h1>
        <p className="page-subtitle">Discover masters, follow strategies, and manage your copy portfolio</p>
      </header>

      <section className="copy-hub-ctas">
        <Link to="/copy/following" className="copy-hub-card">
          <span className="copy-hub-card-title">My copy</span>
          <span className="copy-hub-card-desc">Masters you follow · {myFollowing.length} active</span>
          <span className="copy-hub-card-arrow">→</span>
        </Link>
        <Link to="/copy/manager" className="copy-hub-card">
          <span className="copy-hub-card-title">Master profile</span>
          <span className="copy-hub-card-desc">
            {myMasterProfile ? `${myMasterProfile.followers} followers · ${myMasterProfile.status}` : 'Become a master'}
          </span>
          <span className="copy-hub-card-arrow">→</span>
        </Link>
      </section>

      <section className="copy-section">
        <h2 className="copy-section-title">Discover masters</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>Browse by performance and risk. Click a master to view profile and follow.</p>
        <div className="copy-master-cards">
          {discoverMasters.map((m) => (
            <div key={m.id} className="copy-master-card">
              <div className="copy-master-header">
                <h3>{m.name}</h3>
                <span className={`copy-status copy-status--${m.status}`}>{m.status}</span>
              </div>
              <p className="copy-master-strategy">{m.strategy}</p>
              <div className="copy-master-stats">
                <div><span className="label">P&L</span><span className={m.pnlPercent >= 0 ? 'positive' : 'negative'}>{formatPercent(m.pnlPercent)}</span></div>
                <div><span className="label">YTD</span><span>{formatPercent(m.growthYtd)}</span></div>
                <div><span className="label">Risk</span><span>{m.riskScore}</span></div>
                <div><span className="label">Drawdown</span><span className="negative">{m.drawdown}%</span></div>
              </div>
              <p className="copy-master-meta">{m.followers} followers · AUM {formatCurrency(m.aum)}</p>
              <Link to={`/copy/master/${m.slug}`} className="btn btn-sm btn-primary">View profile</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
