import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAccount } from '../../context/AccountContext';
import { usePammUpdate } from '../../context/MarketDataContext';
import * as pammApi from '../../api/pammApi';
import { ProfileAvatar } from '../../components/ui';
import PammFollowModal from './PammFollowModal';
import PammAddFundsModal from './PammAddFundsModal';
import PammWithdrawModal from './PammWithdrawModal';
import PammUnfollowModal from './PammUnfollowModal';

const formatCurrency = (n, decimals = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`;

const valueClass = (num) => (num == null || num === '') ? '' : (Number(num) >= 0 ? 'positive' : 'negative');

export default function PammFundDetail() {
  const { fundId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { refreshLiveBalance } = useAccount();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [followModal, setFollowModal] = useState(false);
  const [addFundsModal, setAddFundsModal] = useState(null);
  const [withdrawModal, setWithdrawModal] = useState(null);
  const [unfollowModal, setUnfollowModal] = useState(null);

  const loadDetail = useCallback(async () => {
    if (!fundId) return;
    setLoading(true);
    setError('');
    try {
      const data = await pammApi.getFundDetail(fundId);
      setDetail(data);
    } catch (e) {
      setError(e.message || 'Failed to load fund');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  const { pammUpdateAt, pammUpdateFundId } = usePammUpdate();
  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Real-time profit/earnings: refetch fund detail when this fund's allocation was updated
  useEffect(() => {
    if (pammUpdateAt && pammUpdateFundId === fundId) loadDetail();
  }, [pammUpdateAt, pammUpdateFundId, fundId, loadDetail]);

  const handleFollow = async (managerId, amount) => {
    await pammApi.follow(managerId, amount);
    refreshLiveBalance?.();
    loadDetail();
  };

  const handleAddFunds = async (allocationId, amount) => {
    await pammApi.addFunds(allocationId, amount);
    refreshLiveBalance?.();
    loadDetail();
    setAddFundsModal(null);
  };

  const handleWithdraw = async (allocationId, amount) => {
    await pammApi.withdraw(allocationId, amount);
    refreshLiveBalance?.();
    loadDetail();
    setWithdrawModal(null);
  };

  const handleUnfollow = async (allocationId) => {
    await pammApi.unfollow(allocationId);
    refreshLiveBalance?.();
    loadDetail();
    setUnfollowModal(null);
    navigate('/pamm');
  };

  if (loading) {
    return (
      <div className="page pamm-page">
        <p className="muted">Loading fund…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="page pamm-page">
        <p className="form-error">{error || 'Fund not found'}</p>
        <Link to="/pamm" className="btn btn-secondary">Back to PAMM</Link>
      </div>
    );
  }

  const { fund, stats, recentTrades, myAllocation } = detail;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await pammApi.getFundDetail(fundId);
      setDetail(data);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="page pamm-page pamm-fund-detail-page">
      <header className="page-header">
        <div className="pamm-fund-detail-header-top">
          <Link to="/pamm" className="btn-link back-link">← Back to PAMM</Link>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className="pamm-fund-detail-header">
          <ProfileAvatar name={fund.name} size={56} />
          <div>
            <h1>{fund.name}</h1>
            <p className="page-subtitle">{fund.strategy || fund.fundType || 'PAMM fund'}</p>
          </div>
        </div>
      </header>

      <section className="pamm-section">
        <h2 className="pamm-section-title">Fund parameters</h2>
        <div className="pamm-summary-cards pamm-fund-params">
          <div className="pamm-card pamm-card--neutral">
            <h3>AUM</h3>
            <p className="pamm-value pamm-value--amount">{formatCurrency(stats.aum)}</p>
          </div>
          <div className="pamm-card pamm-card--neutral">
            <h3>No. of followers</h3>
            <p className="pamm-value pamm-value--count">{stats.investors}</p>
          </div>
          <div className="pamm-card">
            <h3>Fund growth</h3>
            <p className={`pamm-value ${valueClass(stats.fundGrowthRate)}`}>
              {formatPercent(stats.fundGrowthRate ?? 0)}
            </p>
          </div>
          <div className="pamm-card">
            <h3>Cumulative P&L</h3>
            <p className={`pamm-value ${valueClass(stats.cumulativePnl)}`}>
              {formatCurrency(stats.cumulativePnl ?? 0, 2)}
            </p>
          </div>
          <div className="pamm-card pamm-card--neutral">
            <h3>Performance fee</h3>
            <p className="pamm-value pamm-value--fee">{stats.performanceFeePercent ?? 0}%</p>
          </div>
        </div>
      </section>

      {myAllocation && (
        <section className="pamm-section">
          <h2 className="pamm-section-title">Your allocation</h2>
          <div className="pamm-allocation-summary cards-row">
            <div className="card card--neutral">
              <h3>Allocated</h3>
              <p className="card-value pamm-value--amount">{formatCurrency(myAllocation.allocatedBalance)}</p>
            </div>
            <div className="card card--neutral">
              <h3>Your share</h3>
              <p className="card-value pamm-value--share">{Number(myAllocation.allocationPercent ?? 0).toFixed(1)}%</p>
            </div>
            <div className="card">
              <h3>Profit / earnings</h3>
              <p className={`card-value ${valueClass(myAllocation.realizedPnl)}`}>
                {formatCurrency(myAllocation.realizedPnl ?? 0, 2)}
              </p>
            </div>
          </div>
          <div className="pamm-fund-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setAddFundsModal({ id: myAllocation.id, managerName: fund.name, allocatedBalance: myAllocation.allocatedBalance })}>
              Add funds
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setWithdrawModal({ id: myAllocation.id, managerName: fund.name, allocatedBalance: myAllocation.allocatedBalance })}>
              Withdraw
            </button>
            <button type="button" className="btn btn-outline-danger" onClick={() => setUnfollowModal({ id: myAllocation.id, managerName: fund.name })}>
              Unfollow
            </button>
          </div>
        </section>
      )}

      {!myAllocation && fund.isPublic !== false && (
        <section className="pamm-section">
          <h2 className="pamm-section-title">Follow this fund</h2>
          <p className="muted">Allocate part of your wallet to this fund to participate in its performance.</p>
          {isAuthenticated ? (
            <button type="button" className="btn btn-primary" onClick={() => setFollowModal(true)}>
              Follow {fund.name}
            </button>
          ) : (
            <Link to="/auth" className="btn btn-primary">Sign in to follow</Link>
          )}
        </section>
      )}

      <section className="pamm-section">
        <h2 className="pamm-section-title">Trading activity</h2>
        <div className="table-wrap">
          <table className="table pamm-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Volume</th>
                <th>Price</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {!recentTrades?.length ? (
                <tr><td colSpan={6} className="empty-cell">No trades yet</td></tr>
              ) : (
                recentTrades.map((t) => (
                  <tr key={t.id}>
                    <td>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
                    <td>{t.symbol || '—'}</td>
                    <td><span className={`type-badge type-${(t.side || '').toLowerCase()}`}>{t.side || '—'}</span></td>
                    <td>{t.volume != null ? t.volume : '—'}</td>
                    <td>{t.price != null ? formatCurrency(t.price) : '—'}</td>
                    <td className={t.pnl != null ? (t.pnl >= 0 ? 'positive' : 'negative') : ''}>
                      {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}${formatCurrency(t.pnl, 2)}` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {followModal && (
        <PammFollowModal
          managerName={fund.name}
          managerId={fundId}
          onConfirm={handleFollow}
          onClose={() => setFollowModal(false)}
        />
      )}
      {addFundsModal && (
        <PammAddFundsModal
          allocationId={addFundsModal.id}
          managerName={addFundsModal.managerName}
          currentBalance={addFundsModal.allocatedBalance}
          onConfirm={handleAddFunds}
          onClose={() => setAddFundsModal(null)}
        />
      )}
      {withdrawModal && (
        <PammWithdrawModal
          allocationId={withdrawModal.id}
          managerName={withdrawModal.managerName}
          maxAmount={withdrawModal.allocatedBalance}
          onConfirm={handleWithdraw}
          onClose={() => setWithdrawModal(null)}
        />
      )}
      {unfollowModal && (
        <PammUnfollowModal
          managerName={unfollowModal.managerName}
          onConfirm={() => handleUnfollow(unfollowModal.id)}
          onClose={() => setUnfollowModal(null)}
        />
      )}
    </div>
  );
}
