import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAccount } from '../../context/AccountContext';
import * as pammApi from '../../api/pammApi';
import { ProfileAvatar } from '../../components/ui';

const formatCurrency = (n, decimals = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n ?? 0);

const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n || 0).toFixed(1)}%`;

export default function PammAi() {
  const { isAuthenticated } = useAuth();
  const { refreshLiveBalance } = useAccount();
  const [fund, setFund] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const managers = await pammApi.listManagers().catch(() => []);
      const list = Array.isArray(managers) ? managers : [];
      const bullRun =
        list.find(
          (m) =>
            (m.name || '').toUpperCase() === 'BULL RUN' ||
            (m.fundType || '').toLowerCase() === 'ai'
        ) || list[0] || null;
      if (!bullRun) {
        setFund(null);
        setStats(null);
        setError('No PAMM AI fund is configured yet.');
      } else {
        const aiFund = { ...bullRun, name: 'BULL RUN' };
        setFund(aiFund);
        const detail = await pammApi.getFundDetail(aiFund.id).catch(() => null);
        const effectiveStats = detail?.stats || {
          aum: aiFund.aum ?? aiFund.fundSize ?? 0,
          investors: aiFund.investors ?? 0,
          fundGrowthRate: aiFund.fundGrowthRate ?? aiFund.pnlPercent ?? 0,
          cumulativePnl: aiFund.cumulativePnl ?? 0,
        };
        setStats(effectiveStats);
      }
    } catch (e) {
      setError(e.message || 'Failed to load PAMM AI fund');
      setFund(null);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="page pamm-page pamm-ai-page">
      <header className="page-header">
        <h1>PAMM AI</h1>
        <p className="page-subtitle">
          AI-assisted portfolio management · Bull Run fund
        </p>
      </header>

      {loading && <p className="muted">Loading…</p>}
      {error && !loading && <p className="form-error">{error}</p>}

      {!loading && fund && (
        <>
          <section className="pamm-section pamm-ai-hero">
            <div className="pamm-ai-profile">
              <div className="pamm-ai-profile-header">
                <ProfileAvatar name={fund.name || 'BULL RUN'} size={56} />
                <div>
                  <h2 className="pamm-section-title" style={{ marginBottom: '0.25rem' }}>
                    {fund.name || 'BULL RUN'} · AI PAMM fund
                  </h2>
                  <p className="muted">
                    Daily profit cap 1%. Compound trading. Withdrawals and unfollow are blocked while the fund has an active trade.
                  </p>
                </div>
              </div>
              <div className="pamm-ai-hero-stats">
                <div className="pamm-ai-hero-stat">
                  <span className="label">Fund growth</span>
                  <span className={`value ${(stats?.fundGrowthRate ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(stats?.fundGrowthRate ?? 0)}
                  </span>
                </div>
                <div className="pamm-ai-hero-stat">
                  <span className="label">Total fund pool</span>
                  <span className="value">{formatCurrency(stats?.aum ?? 0)}</span>
                </div>
                <div className="pamm-ai-hero-stat">
                  <span className="label">Investors</span>
                  <span className="value">{stats?.investors ?? 0}</span>
                </div>
              </div>
              <div className="pamm-ai-hero-actions">
                {isAuthenticated ? (
                  <Link to={`/pamm-ai/fund/${fund.id}`} className="btn btn-primary">
                    View full fund details
                  </Link>
                ) : (
                  <Link to="/auth" className="btn btn-primary">
                    Sign in to follow
                  </Link>
                )}
              </div>
            </div>
          </section>
          <section className="pamm-section">
            <Link to={`/pamm-ai/fund/${fund.id}`} className="btn btn-secondary">
              View full fund details · Add funds · Withdraw · Unfollow
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
