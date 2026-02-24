import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useAccount } from '../../context/AccountContext';
import * as pammApi from '../../api/pammApi';
import { equityCurveData } from './pammMockData';
import { ProfileAvatar } from '../../components/ui';
import PammFollowModal from './PammFollowModal';
import PammAddFundsModal from './PammAddFundsModal';
import PammWithdrawModal from './PammWithdrawModal';
import PammUnfollowModal from './PammUnfollowModal';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`;

function RiskBadge({ profile }) {
  if (!profile) return null;
  const c = profile === 'Conservative' ? 'low' : profile === 'Aggressive' ? 'high' : 'mid';
  return <span className={`risk-badge risk-badge--${c}`}>{profile}</span>;
}

export default function Pamm() {
  const { isAuthenticated } = useAuth();
  const { refreshLiveBalance } = useAccount();
  const [managers, setManagers] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [followerTrades, setFollowerTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followModal, setFollowModal] = useState(null);
  const [addFundsModal, setAddFundsModal] = useState(null);
  const [withdrawModal, setWithdrawModal] = useState(null);
  const [unfollowModal, setUnfollowModal] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [managersRes, allocationsRes, tradesRes] = await Promise.all([
        pammApi.listManagers(),
        isAuthenticated ? pammApi.getMyAllocations().catch(() => []) : Promise.resolve([]),
        isAuthenticated ? pammApi.getMyFollowerTrades({ limit: 20 }).catch(() => []) : Promise.resolve([]),
      ]);
      setManagers(Array.isArray(managersRes) ? managersRes : []);
      setAllocations(Array.isArray(allocationsRes) ? allocationsRes : []);
      setFollowerTrades(Array.isArray(tradesRes) ? tradesRes : []);
    } catch (e) {
      setError(e.message || 'Failed to load data');
      setManagers([]);
      setAllocations([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeAllocationManagerIds = new Set(
    allocations.filter((a) => a.status === 'active').map((a) => a.managerId)
  );

  const totalInvested = allocations
    .filter((a) => a.status === 'active')
    .reduce((s, a) => s + (a.allocatedBalance || 0), 0);

  const pammSummary = {
    totalInvested,
    currentValue: totalInvested,
    totalPnl: 0,
    pnlPercent: 0,
    growthYtd: 0,
    growthMtd: 0,
    riskScore: '-',
    riskProfile: '-',
    currentDrawdown: 0,
    maxDrawdown: 0,
    openPnl: 0,
    closedPnl: 0,
  };

  const handleFollow = async (managerId, amount) => {
    await pammApi.follow(managerId, amount);
    refreshLiveBalance?.();
    loadData();
  };

  const handleUnfollow = async (allocationId) => {
    await pammApi.unfollow(allocationId);
    refreshLiveBalance?.();
    loadData();
  };

  const handleAddFunds = async (allocationId, amount) => {
    await pammApi.addFunds(allocationId, amount);
    refreshLiveBalance?.();
    loadData();
  };

  const handleWithdraw = async (allocationId, amount) => {
    await pammApi.withdraw(allocationId, amount);
    refreshLiveBalance?.();
    loadData();
  };

  return (
    <div className="page pamm-page">
      <header className="page-header">
        <h1>PAMM</h1>
        <p className="page-subtitle">Managers, allocation, risk, growth and P&L</p>
        <Link to="/pamm/manager" className="pamm-manager-cta">
          Manage your fund (PAMM Managers) →
        </Link>
      </header>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && (
        <>
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
            <p className="muted" style={{ marginBottom: '1rem' }}>Browse approved PAMM funds. Sign in to follow.</p>
            <div className="pamm-manager-cards grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {managers.length === 0 && !loading && <p className="muted">No approved managers yet.</p>}
              {managers.map((m) => {
                const fundId = m.id;
                const alreadyFollowing = activeAllocationManagerIds.has(fundId) || activeAllocationManagerIds.has(m.userId);
                return (
                  <div key={m.id || m.userId} className="pamm-manager-card rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="pamm-manager-header">
                      <ProfileAvatar name={m.name} size={40} verified={m.approvalStatus === 'approved'} />
                      <div className="pamm-manager-header-text">
                        <h3>{m.name}</h3>
                        <RiskBadge profile={m.riskProfile} />
                      </div>
                    </div>
                    <p className="pamm-manager-strategy">{m.strategy || m.fundType || '-'}</p>
                    <div className="pamm-manager-stats">
                      <div><span className="label">Fund size</span><span>{formatCurrency(m.fundSize || m.aum || 0)}</span></div>
                      <div><span className="label">AUM</span><span>{formatCurrency(m.aum || 0)}</span></div>
                      <div><span className="label">Investors</span><span>{m.investors ?? 0}</span></div>
                    </div>
                    <p className="pamm-manager-meta">AUM {formatCurrency(m.aum || 0)} · {m.investors ?? 0} investors</p>
                    {!isAuthenticated ? (
                      <Link to="/login" className="btn btn-sm btn-primary">Sign in to follow</Link>
                    ) : alreadyFollowing ? (
                      <span className="btn btn-sm btn-secondary" style={{ cursor: 'default', opacity: 0.8 }}>Following</span>
                    ) : (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => setFollowModal({ managerId: fundId, name: m.name })}>
                        Follow
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="pamm-section">
            <h2 className="pamm-section-title">Recent trades (funds I follow)</h2>
            {!isAuthenticated && <p className="muted">Sign in to view trades.</p>}
            {isAuthenticated && (
              <div className="table-wrap">
                <table className="table pamm-table">
                  <thead>
                    <tr>
                      <th>Trade ID</th>
                      <th>Fund</th>
                      <th>Time</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followerTrades.length === 0 ? (
                      <tr><td colSpan={6} className="empty-cell">No trades yet.</td></tr>
                    ) : (
                      followerTrades.slice(0, 15).map((t) => (
                        <tr key={t.id}>
                          <td><code className="trade-id">{t.positionId || t.id}</code></td>
                          <td>{t.managerName}</td>
                          <td>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
                          <td>{t.symbol || '—'}</td>
                          <td><span className={`type-badge type-${(t.side || '').toLowerCase()}`}>{t.side || '—'}</span></td>
                          <td className={t.pnl != null && t.pnl >= 0 ? 'positive' : t.pnl != null ? 'negative' : ''}>
                            {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}${formatCurrency(t.pnl)}` : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="pamm-section">
            <h2 className="pamm-section-title">My allocations</h2>
            {!isAuthenticated && <p className="muted">Sign in to view your allocations.</p>}
            {isAuthenticated && (
              <div className="table-wrap">
                <table className="table pamm-table">
                  <thead>
                    <tr>
                      <th>Manager</th>
                      <th>Amount</th>
                      <th>Allocation ID</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.filter((a) => a.status === 'active' || a.status === 'withdrawing').length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty-cell">No active allocations</td>
                      </tr>
                    ) : (
                      allocations
                        .filter((a) => a.status === 'active' || a.status === 'withdrawing')
                        .map((a) => (
                          <tr key={a.id}>
                            <td>
                              <div className="pamm-allocation-manager-cell">
                                <ProfileAvatar name={a.managerName} size={36} />
                                <strong>{a.managerName}</strong>
                              </div>
                            </td>
                            <td>{formatCurrency(a.allocatedBalance)}</td>
                            <td><code className="allocation-id">{a.id}</code></td>
                            <td>
                              <span className={`status-badge status-${a.status === 'active' ? 'approved' : 'pending'}`}>
                                {a.status}
                              </span>
                            </td>
                            <td>
                              {a.status === 'active' && (
                                <>
                                  <button type="button" className="btn-link" onClick={() => setAddFundsModal(a)}>Add funds</button>
                                  {' '}
                                  <button type="button" className="btn-link" onClick={() => setWithdrawModal(a)}>Withdraw</button>
                                  {' '}
                                  <button type="button" className="btn-link btn-link-danger" onClick={() => setUnfollowModal(a)}>Unfollow</button>
                                </>
                              )}
                              {a.status === 'withdrawing' && <span className="muted">Withdrawal pending</span>}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {followModal && (
        <PammFollowModal
          managerName={followModal.name}
          managerId={followModal.managerId}
          onConfirm={handleFollow}
          onClose={() => setFollowModal(null)}
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
