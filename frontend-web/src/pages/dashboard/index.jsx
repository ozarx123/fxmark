import React from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../../context/AccountContext';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../hooks/useFinance';
import { formatCurrency } from '../../constants/finance';
import { ChartBarIcon, GraduationCapIcon, PhoneIcon, UserIcon, ArrowRightIcon, ShareNetworkIcon } from '../../components/Icons.jsx';

const SUPPORT_PHONE = '+1 (800) 123-4567';

const PAMM_OPPORTUNITIES = [
  { id: 1, name: 'Alpha Fund', roi: '+8.2%', risk: 'Medium', link: '/pamm' },
  { id: 2, name: 'Gold Trader Pro', roi: '+12.1%', risk: 'High', link: '/pamm' },
  { id: 3, name: 'Conservative Growth', roi: '+4.5%', risk: 'Low', link: '/pamm' },
];

const LEARNING_ITEMS = [
  { title: 'Forex basics', desc: 'Understand currency pairs and spreads', link: '#' },
  { title: 'Risk management', desc: 'Protect your capital with stop-loss', link: '#' },
  { title: 'PAMM investing', desc: 'How to follow expert traders', link: '/pamm' },
];

export default function Dashboard() {
  const { activeAccount, balance } = useAccount();
  const { user, isAuthenticated } = useAuth();
  const { walletBalance, realizedPnl, entries, loading } = useFinance();

  const displayBalance = isAuthenticated && activeAccount?.type === 'live' && walletBalance != null ? walletBalance : balance;
  const userName = user?.name || user?.email?.split('@')[0] || 'Trader';

  return (
    <div className="page dashboard-page">
      <header className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, <span className="dashboard-welcome-name">{userName}</span>
          </h1>
          <p className="page-subtitle mt-1">Overview of your account and activity · {activeAccount?.type === 'demo' ? 'Demo' : 'Live'} account</p>
        </div>
        <div className="page-header-actions flex flex-wrap gap-2">
          <Link to="/settings/profile" className="btn btn-secondary btn-sm dashboard-quick-link">
            <UserIcon size={18} />
            Profile settings
          </Link>
          <Link to="/finance" className="btn btn-secondary btn-sm">Finance</Link>
        </div>
      </header>
      <section className="page-content">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 dashboard-cards">
          <div className="dashboard-card dashboard-card-balance">
            <div className="dashboard-card-glow" />
            <h3 className="dashboard-card-title">Balance</h3>
            <p className="dashboard-card-value">{loading ? '…' : formatCurrency(displayBalance)}</p>
            <span className="dashboard-card-label">USD · trade account</span>
          </div>
          <div className="dashboard-card dashboard-card-equity">
            <div className="dashboard-card-glow" />
            <h3 className="dashboard-card-title">Equity</h3>
            <p className="dashboard-card-value">{loading ? '…' : formatCurrency(displayBalance)}</p>
            <span className="dashboard-card-label">USD</span>
          </div>
          <div className="dashboard-card dashboard-card-margin">
            <div className="dashboard-card-glow" />
            <h3 className="dashboard-card-title">Free Margin</h3>
            <p className="dashboard-card-value">{loading ? '…' : formatCurrency(displayBalance)}</p>
            <span className="dashboard-card-label">USD</span>
          </div>
          <div className={`dashboard-card dashboard-card-pnl ${(realizedPnl ?? 0) >= 0 ? 'positive' : 'negative'}`}>
            <div className="dashboard-card-glow" />
            <h3 className="dashboard-card-title">Realized P&L</h3>
            <p className="dashboard-card-value">{loading ? '…' : formatCurrency(realizedPnl)}</p>
            <span className="dashboard-card-label">From ledger</span>
          </div>
        </div>
        <div className="dashboard-grid mt-8">
          <div className="dashboard-section section-block rounded-xl p-6">
            <h2 className="dashboard-section-title">
              <ChartBarIcon size={22} />
              Analytics
            </h2>
            <div className="dashboard-analytics">
              <div className="dashboard-analytics-item">
                <span className="dashboard-analytics-label">Win rate</span>
                <span className="dashboard-analytics-value">—</span>
              </div>
              <div className="dashboard-analytics-item">
                <span className="dashboard-analytics-label">Open positions</span>
                <span className="dashboard-analytics-value">0</span>
              </div>
              <div className="dashboard-analytics-item">
                <span className="dashboard-analytics-label">Trades this month</span>
                <span className="dashboard-analytics-value">—</span>
              </div>
            </div>
            <Link to="/trading" className="dashboard-section-link">
              View trading analytics <ArrowRightIcon size={16} />
            </Link>
          </div>

          <div className="dashboard-section section-block rounded-xl p-6">
            <h2 className="dashboard-section-title">
              <ShareNetworkIcon size={22} />
              PAMM opportunities
            </h2>
            <ul className="dashboard-pamm-list">
              {PAMM_OPPORTUNITIES.map((p) => (
                <li key={p.id}>
                  <Link to={p.link} className="dashboard-pamm-item">
                    <span className="dashboard-pamm-name">{p.name}</span>
                    <span className="dashboard-pamm-roi">{p.roi}</span>
                    <span className="dashboard-pamm-risk">{p.risk}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/pamm" className="dashboard-section-link">
              Explore all PAMM funds <ArrowRightIcon size={16} />
            </Link>
          </div>

          <div className="dashboard-section section-block rounded-xl p-6">
            <h2 className="dashboard-section-title">
              <GraduationCapIcon size={22} />
              Learning center
            </h2>
            <ul className="dashboard-learning-list">
              {LEARNING_ITEMS.map((l, i) => (
                <li key={i}>
                  <Link to={l.link} className="dashboard-learning-item">
                    <span className="dashboard-learning-title">{l.title}</span>
                    <span className="dashboard-learning-desc">{l.desc}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="dashboard-section section-block rounded-xl p-6 dashboard-support-card">
            <h2 className="dashboard-section-title">
              <PhoneIcon size={22} />
              Customer support
            </h2>
            <a href={`tel:${SUPPORT_PHONE.replace(/\D/g, '')}`} className="dashboard-support-phone">
              {SUPPORT_PHONE}
            </a>
            <p className="dashboard-support-desc">24/7 support · Mon–Fri 9am–6pm local</p>
          </div>
        </div>

        <div className="section-block rounded-xl p-6 mt-8">
          <h2 className="text-lg font-semibold mb-4">Recent activity</h2>
          {!isAuthenticated ? (
            <p className="muted">Sign in to see recent activity.</p>
          ) : entries.length === 0 ? (
            <p className="muted">No ledger activity yet. <Link to="/wallet">Deposit</Link> or <Link to="/trading">trade</Link> to get started.</p>
          ) : (
            <ul className="list-placeholder">
              {entries.slice(0, 5).map((e) => {
                const amt = (e.debit || 0) > 0 ? (e.debit || 0) : -(e.credit || 0);
                return (
                  <li key={e.id}>
                    {e.accountName || e.accountCode}: {amt >= 0 ? '+' : ''}{formatCurrency(amt)} — {e.referenceType || '—'}
                  </li>
                );
              })}
              <li><Link to="/finance">View all in Finance →</Link></li>
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
