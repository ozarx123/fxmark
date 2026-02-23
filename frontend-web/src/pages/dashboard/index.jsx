import React from 'react';
import { useAccount } from '../../context/AccountContext';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function Dashboard() {
  const { balance, accountType } = useAccount();

  return (
    <div className="page dashboard-page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="page-subtitle">Overview of your account and activity · {accountType === 'demo' ? 'Demo' : 'Live'} account</p>
      </header>
      <section className="page-content">
        <div className="cards-row">
          <div className="card">
            <h3>Balance</h3>
            <p className="card-value">{formatCurrency(balance)}</p>
            <span className="card-label">USD</span>
          </div>
          <div className="card">
            <h3>Equity</h3>
            <p className="card-value">{formatCurrency(balance)}</p>
            <span className="card-label">USD</span>
          </div>
          <div className="card">
            <h3>Free Margin</h3>
            <p className="card-value">{formatCurrency(balance)}</p>
            <span className="card-label">USD</span>
          </div>
          <div className="card">
            <h3>Open P&L</h3>
            <p className="card-value">—</p>
            <span className="card-label">Unrealized</span>
          </div>
        </div>
        <div className="section-block">
          <h2>Recent activity</h2>
          <p className="muted">Connect your account to see recent trades and account activity.</p>
          <ul className="list-placeholder">
            <li>No recent activity</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
