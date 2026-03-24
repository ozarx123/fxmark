import React from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ProfileAvatar } from '../../components/ui';
import * as pammApi from '../../api/pammApi';
import PammTermsModal from './PammTermsModal';
import PammFollowModal from './PammFollowModal';
import PammAddFundsModal from './PammAddFundsModal';
import PammWithdrawModal from './PammWithdrawModal';
import PammUnfollowModal from './PammUnfollowModal';
import InvestorDetailModal from './InvestorDetailModal';

const formatCurrency = (n, decimals = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n ?? 0);

const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n || 0).toFixed(1)}%`;

/** Name → email → userId (followerId), per Bull Run manager spec */
function investorRowLabel(inv) {
  const name = String(inv?.investorFullName || inv?.investorName || '').trim();
  if (name) return name;
  if (inv?.investorEmail) return inv.investorEmail;
  const fid = inv?.followerId != null ? String(inv.followerId) : '';
  return fid || '—';
}

function followerIdStr(inv) {
  if (!inv?.followerId && inv?.followerId !== 0) return '';
  const v = inv.followerId;
  if (typeof v === 'object' && v?.$oid) return String(v.$oid);
  return String(v);
}

export default function BullRunFundDetailView({
  fundId,
  fund,
  stats,
  myAllocation,
  bullRun,
  onRefresh,
  onReload,
  refreshing,
  onFollow,
  onAddFunds,
  onWithdraw,
  onUnfollow,
  refreshLiveBalance,
  isManager = false,
}) {
  const hasActiveTrade = bullRun?.hasActiveTrade === true;
  const [termsModal, setTermsModal] = React.useState(false);
  const [followModal, setFollowModal] = React.useState(false);
  const [addFundsModal, setAddFundsModal] = React.useState(null);
  const [withdrawModal, setWithdrawModal] = React.useState(null);
  const [unfollowModal, setUnfollowModal] = React.useState(null);
  const [investorsList, setInvestorsList] = React.useState([]);
  const [investorsLoading, setInvestorsLoading] = React.useState(false);
  const [selectedInvestor, setSelectedInvestor] = React.useState(null);
  const [investorSearch, setInvestorSearch] = React.useState('');
  const [investorSort, setInvestorSort] = React.useState('deposit_desc');

  React.useEffect(() => {
    if (!isManager || !fundId) return;
    let cancelled = false;
    setInvestorsLoading(true);
    pammApi.getMyInvestors(fundId).then((list) => {
      if (!cancelled) setInvestorsList(Array.isArray(list) ? list : []);
    }).catch(() => {
      if (!cancelled) setInvestorsList([]);
    }).finally(() => {
      if (!cancelled) setInvestorsLoading(false);
    });
    return () => { cancelled = true; };
  }, [isManager, fundId]);

  const investorsSummary = React.useMemo(() => {
    if (!investorsList.length) return null;
    const totalCapital = investorsList.reduce((s, x) => s + (Number(x.allocatedBalance) || 0), 0);
    const totalRealizedPnl = investorsList.reduce((s, x) => s + (Number(x.realizedPnl) || 0), 0);
    return { count: investorsList.length, totalCapital, totalRealizedPnl };
  }, [investorsList]);

  const filteredSortedInvestors = React.useMemo(() => {
    let list = [...investorsList];
    const q = investorSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((inv) => {
        const name = String(inv.investorFullName || inv.investorName || '').toLowerCase();
        const email = String(inv.investorEmail || '').toLowerCase();
        const id = followerIdStr(inv).toLowerCase();
        return name.includes(q) || email.includes(q) || id.includes(q);
      });
    }
    const dep = (x) => Number(x.allocatedBalance) || 0;
    const prof = (x) => Number(x.realizedPnl) || 0;
    switch (investorSort) {
      case 'deposit_asc':
        list.sort((a, b) => dep(a) - dep(b));
        break;
      case 'profit_desc':
        list.sort((a, b) => prof(b) - prof(a));
        break;
      case 'profit_asc':
        list.sort((a, b) => prof(a) - prof(b));
        break;
      case 'deposit_desc':
      default:
        list.sort((a, b) => dep(b) - dep(a));
    }
    return list;
  }, [investorsList, investorSearch, investorSort]);

  const pool = bullRun?.total_fund_pool ?? stats?.aum ?? 0;
  const investors = bullRun?.total_investors ?? stats?.investors ?? 0;
  const strategyType = bullRun?.strategy_type ?? 'AI Bull Run';
  const todayProfit = bullRun?.today_profit ?? bullRun?.today_earnings ?? 0;
  const monthlyProfit = bullRun?.monthly_profit ?? bullRun?.monthly_earnings ?? 0;
  const fundGrowthData = bullRun?.fund_growth_data ?? [];
  const monthlyPerformance = bullRun?.monthly_performance ?? [];
  const transactionHistory = bullRun?.transaction_history ?? [];
  const reserveBalance = bullRun?.reserve_balance ?? 0;
  const fundGrowthRate = stats?.fundGrowthRate ?? 0;
  const cumulativePnl = stats?.cumulativePnl ?? 0;
  const allocationPercent = myAllocation?.allocationPercent ?? 0;
  const currentMonthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  const hasCurrentMonthPerformance = monthlyPerformance.some((row) =>
    String(row?.month || '').trim().startsWith(currentMonthKey)
  );
  // Monthly earnings reset to 0% for investor UI when past/test data is detected.
  const investorMonthlyEarnings =
    !hasCurrentMonthPerformance || !Number.isFinite(Number(monthlyProfit))
      ? 0
      : Number(monthlyProfit);

  const investorOverviewCards = myAllocation ? (
    <>
      <div className="pamm-card pamm-card--neutral">
        <h3>My investment</h3>
        <p className="pamm-value pamm-value--amount">{formatCurrency(myAllocation.allocatedBalance)}</p>
      </div>
      <div className="pamm-card pamm-card--neutral">
        <h3>Current balance</h3>
        <p className="pamm-value pamm-value--amount">{formatCurrency(myAllocation.allocatedBalance, 2)}</p>
      </div>
      {/* Investor UI intentionally hides share-of-fund and realized P&L cards. */}
      <div className="pamm-card pamm-card--neutral">
        <h3>Today&apos;s earnings</h3>
        <p className={`pamm-value ${(todayProfit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
          {formatPercent(todayProfit)}
        </p>
      </div>
      <div className="pamm-card pamm-card--neutral">
        <h3>Monthly earnings</h3>
        <p className={`pamm-value ${(investorMonthlyEarnings ?? 0) >= 0 ? 'positive' : 'negative'}`}>
          {formatPercent(investorMonthlyEarnings)}
        </p>
      </div>
    </>
  ) : null;

  return (
    <div className="page pamm-page pamm-ai-fund-detail">
      <header className="page-header">
        <div className="pamm-fund-detail-header-top">
          <Link to="/pamm-ai" className="btn-link back-link">← Back to PAMM AI</Link>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onRefresh?.()}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className="pamm-fund-detail-header">
          <ProfileAvatar name={fund?.name || 'BULL RUN'} size={56} />
          <div>
            <h1>{fund?.name || 'BULL RUN'}</h1>
            <p className="page-subtitle">{strategyType}</p>
          </div>
        </div>
      </header>

      {/* Overview: managers see fund-level metrics; investors see only their allocation metrics */}
      <section className="pamm-section">
        <h2 className="pamm-section-title">
          {isManager ? 'Fund overview' : myAllocation ? 'Your investment' : 'Fund overview'}
        </h2>
        {hasActiveTrade && (
          <p className="muted" style={{ marginBottom: '1rem' }}>
            <span className="status-badge status-pending">Active trade running</span>
            {' '}
            {isManager
              ? 'Investors cannot withdraw or unfollow until the trade closes.'
              : 'Withdraw and Unfollow are unavailable until the trade closes.'}
          </p>
        )}
        {isManager && (
          <div className="pamm-summary-cards pamm-fund-params">
            <div className="pamm-card pamm-card--neutral">
              <h3>Total fund pool</h3>
              <p className="pamm-value pamm-value--amount">{formatCurrency(pool)}</p>
            </div>
            <div className="pamm-card pamm-card--neutral">
              <h3>Total investors</h3>
              <p className="pamm-value pamm-value--count">{investors}</p>
            </div>
            <div className="pamm-card pamm-card--neutral">
              <h3>Strategy type</h3>
              <p className="pamm-value">{strategyType}</p>
            </div>
            <div className="pamm-card pamm-card--neutral">
              <h3>Fund growth</h3>
              <p className={`pamm-value ${fundGrowthRate >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(fundGrowthRate)}
              </p>
            </div>
            <div className="pamm-card pamm-card--neutral">
              <h3>Cumulative P&amp;L</h3>
              <p className={`pamm-value ${(cumulativePnl ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(cumulativePnl, 2)}
              </p>
            </div>
            <div className="pamm-card pamm-card--neutral">
              <h3>Today&apos;s return</h3>
              <p className={`pamm-value ${(todayProfit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(todayProfit)}
              </p>
            </div>
            <div className="pamm-card pamm-card--neutral">
              <h3>Monthly return</h3>
              <p className={`pamm-value ${(monthlyProfit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(monthlyProfit)}
              </p>
            </div>
          </div>
        )}
        {!isManager && myAllocation && (
          <>
            <div className="pamm-summary-cards pamm-fund-params">{investorOverviewCards}</div>
            <div className="pamm-fund-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setAddFundsModal({
                    id: myAllocation.id,
                    managerName: fund?.name,
                    allocatedBalance: myAllocation.allocatedBalance,
                  })
                }
              >
                Add funds
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setWithdrawModal({
                    id: myAllocation.id,
                    managerName: fund?.name,
                    allocatedBalance: myAllocation.allocatedBalance,
                  })
                }
                disabled={hasActiveTrade}
                title={hasActiveTrade ? 'Withdrawal is blocked while the fund has an active trade' : ''}
              >
                Withdraw
              </button>
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => setUnfollowModal({ managerName: fund?.name, id: myAllocation.id })}
                disabled={hasActiveTrade}
                title={hasActiveTrade ? 'Unfollow is blocked while the fund has an active trade' : ''}
              >
                Unfollow
              </button>
            </div>
            {hasActiveTrade && (
              <p className="form-error" style={{ marginTop: '0.5rem' }}>
                Withdraw and Unfollow are blocked while the fund has an active trade.
              </p>
            )}
          </>
        )}
        {!isManager && !myAllocation && (
          <div className="pamm-summary-cards pamm-fund-params">
            <div className="pamm-card pamm-card--neutral">
              <h3>Strategy type</h3>
              <p className="pamm-value">{strategyType}</p>
            </div>
          </div>
        )}
      </section>

      {/* Manager only: Investors & followers */}
      {isManager && (
        <section className="pamm-section pamm-investors-section">
          <h2 className="pamm-section-title">Investors &amp; followers</h2>
          <p className="muted pamm-investors-lead">
            Followers allocated to this fund. Click a row to open deposit/withdraw activity and profit details.
          </p>
          {investorsLoading && <p className="muted">Loading investors…</p>}
          {!investorsLoading && investorsList.length === 0 && (
            <p className="muted pamm-investors-empty">No investors yet</p>
          )}
          {!investorsLoading && investorsList.length > 0 && (
            <>
              {investorsSummary && (
                <div className="pamm-investors-summary" aria-label="Investors summary">
                  <div className="pamm-investors-summary-item">
                    <span className="pamm-investors-summary-label">Total investors</span>
                    <span className="pamm-investors-summary-value">{investorsSummary.count}</span>
                  </div>
                  <div className="pamm-investors-summary-item">
                    <span className="pamm-investors-summary-label">Total invested capital</span>
                    <span className="pamm-investors-summary-value">{formatCurrency(investorsSummary.totalCapital, 2)}</span>
                  </div>
                  <div className="pamm-investors-summary-item">
                    <span className="pamm-investors-summary-label">Sum realized P&amp;L (allocations)</span>
                    <span
                      className={`pamm-investors-summary-value ${investorsSummary.totalRealizedPnl >= 0 ? 'positive' : 'negative'}`}
                    >
                      {formatCurrency(investorsSummary.totalRealizedPnl, 2)}
                    </span>
                  </div>
                </div>
              )}
              <div className="pamm-investors-toolbar">
                <input
                  type="search"
                  className="input pamm-investors-search"
                  placeholder="Search by name, email, or user ID…"
                  value={investorSearch}
                  onChange={(e) => setInvestorSearch(e.target.value)}
                  aria-label="Search investors"
                />
                <label className="pamm-investors-sort-label muted">
                  Sort
                  <select
                    className="input input--sm pamm-investors-sort"
                    value={investorSort}
                    onChange={(e) => setInvestorSort(e.target.value)}
                  >
                    <option value="deposit_desc">Deposit amount (high → low)</option>
                    <option value="deposit_asc">Deposit amount (low → high)</option>
                    <option value="profit_desc">Realized P&amp;L (high → low)</option>
                    <option value="profit_asc">Realized P&amp;L (low → high)</option>
                  </select>
                </label>
              </div>
              {filteredSortedInvestors.length === 0 && (
                <p className="muted">No investors match your search.</p>
              )}
              <div className="pamm-investors-table-wrap table-wrap hide-mobile">
                <table className="table pamm-table pamm-investors-table">
                  <thead>
                    <tr>
                      <th>Investor name</th>
                      <th>Deposit amount</th>
                      <th>Email</th>
                      <th>Join date</th>
                      <th>Current active capital</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSortedInvestors.map((inv, idx) => {
                      const label = investorRowLabel(inv);
                      const topThree = investorSort === 'deposit_desc' && idx < 3;
                      return (
                        <tr
                          key={inv.id || followerIdStr(inv)}
                          className={`pamm-investor-row${topThree ? ' pamm-investor-row--top' : ''}`}
                          onClick={() => setSelectedInvestor(inv)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && setSelectedInvestor(inv)}
                        >
                          <td>{label}</td>
                          <td>{formatCurrency(inv.allocatedBalance, 2)}</td>
                          <td>{inv.investorEmail || '—'}</td>
                          <td>
                            {inv.createdAt
                              ? new Date(inv.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
                              : '—'}
                          </td>
                          <td>{formatCurrency(inv.allocatedBalance, 2)}</td>
                          <td>{inv.status || 'active'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="pamm-investors-cards show-mobile">
                {filteredSortedInvestors.map((inv, idx) => {
                  const label = investorRowLabel(inv);
                  const topThree = investorSort === 'deposit_desc' && idx < 3;
                  const rp = Number(inv.realizedPnl) || 0;
                  return (
                    <div
                      key={inv.id || followerIdStr(inv)}
                      className={`pamm-investor-card card card--neutral${topThree ? ' pamm-investor-card--top' : ''}`}
                      onClick={() => setSelectedInvestor(inv)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedInvestor(inv)}
                    >
                      <div className="pamm-investor-card-name">{label}</div>
                      <div className="pamm-investor-card-amount">{formatCurrency(inv.allocatedBalance, 2)}</div>
                      <div className="pamm-investor-card-meta muted">
                        Deposit · {formatCurrency(inv.allocatedBalance, 2)}
                        {inv.createdAt && (
                          <> · Joined {new Date(inv.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</>
                        )}
                      </div>
                      {inv.investorEmail && <div className="pamm-investor-card-email muted">{inv.investorEmail}</div>}
                      <div className={`pamm-investor-card-pnl ${rp >= 0 ? 'positive' : 'negative'}`}>
                        Realized P&amp;L {formatCurrency(rp, 2)}
                      </div>
                      <div className="pamm-investor-card-status muted">Status: {inv.status || 'active'}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* My investment — fund managers only (investors see allocation above) */}
      {isManager && myAllocation && (
        <section className="pamm-section">
          <h2 className="pamm-section-title">My investment</h2>
          <div className="pamm-allocation-summary cards-row">
            <div className="card card--neutral">
              <h3>My investment</h3>
              <p className="card-value pamm-value--amount">
                {formatCurrency(myAllocation.allocatedBalance)}
              </p>
            </div>
            <div className="card card--neutral">
              <h3>Current balance</h3>
              <p className="card-value pamm-value--amount">
                {formatCurrency(myAllocation.allocatedBalance, 2)}
              </p>
            </div>
            <div className="card card--neutral">
              <h3>Your share of fund</h3>
              <p className="card-value">{Number(allocationPercent).toFixed(2)}%</p>
            </div>
            <div className="card card--neutral">
              <h3>Today&apos;s earnings</h3>
              <p className={`card-value ${(todayProfit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(todayProfit)}
              </p>
            </div>
            <div className="card card--neutral">
              <h3>Monthly earnings</h3>
              <p className={`card-value ${(monthlyProfit ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(monthlyProfit)}
              </p>
            </div>
            <div className="card">
              <h3>Realized P&amp;L</h3>
              <p className={`card-value ${(myAllocation.realizedPnl ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(myAllocation.realizedPnl ?? 0, 2)}
              </p>
            </div>
          </div>
          <div className="pamm-fund-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setAddFundsModal({
                  id: myAllocation.id,
                  managerName: fund?.name,
                  allocatedBalance: myAllocation.allocatedBalance,
                })
              }
            >
              Add funds
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setWithdrawModal({
                  id: myAllocation.id,
                  managerName: fund?.name,
                  allocatedBalance: myAllocation.allocatedBalance,
                })
              }
              disabled={hasActiveTrade}
              title={hasActiveTrade ? 'Withdrawal is blocked while the fund has an active trade' : ''}
            >
              Withdraw
            </button>
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={() => setUnfollowModal({ managerName: fund?.name, id: myAllocation.id })}
              disabled={hasActiveTrade}
              title={hasActiveTrade ? 'Unfollow is blocked while the fund has an active trade' : ''}
            >
              Unfollow
            </button>
          </div>
          {hasActiveTrade && (
            <p className="form-error" style={{ marginTop: '0.5rem' }}>
              Withdraw and Unfollow are blocked while the fund has an active trade.
            </p>
          )}
        </section>
      )}

      {/* Fund growth chart */}
      <section className="pamm-section">
        <h2 className="pamm-section-title">Fund growth chart</h2>
        {fundGrowthData.length > 0 ? (
          <div className="pamm-chart-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={fundGrowthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="month" tick={{ fill: '#aaa', fontSize: 11 }} />
                <YAxis tick={{ fill: '#aaa', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: '#2a1515', border: '1px solid rgba(255,255,255,0.12)' }}
                  formatter={(v) => [`${v}%`, 'Growth']}
                />
                <Line type="monotone" dataKey="value" stroke="var(--fxmark-orange)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="muted">No growth data yet. Performance will appear after the fund has trading history.</p>
        )}
      </section>

      {/* Monthly performance table */}
      <section className="pamm-section">
        <h2 className="pamm-section-title">Monthly performance</h2>
        {monthlyPerformance.length > 0 ? (
          <div className="table-wrap">
            <table className="table pamm-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Profit %</th>
                </tr>
              </thead>
              <tbody>
                {monthlyPerformance.map((row, i) => (
                  <tr key={i}>
                    <td>{row.month}</td>
                    <td className={(row.profitPercent ?? 0) >= 0 ? 'positive' : 'negative'}>
                      {formatPercent(row.profitPercent ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No monthly data yet.</p>
        )}
      </section>

      {/* Transaction history */}
      <section className="pamm-section">
        <h2 className="pamm-section-title">Transaction history</h2>
        <p className="muted">Withdrawals are sent to your Live Trading Account.</p>
        <div className="table-wrap">
          <table className="table pamm-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {!transactionHistory?.length ? (
                <tr>
                  <td colSpan={4} className="empty-cell">No transactions yet</td>
                </tr>
              ) : (
                transactionHistory.map((t, i) => (
                  <tr key={i}>
                    <td>{t.type || '—'}</td>
                    <td>{formatCurrency(t.amount, 2)}</td>
                    <td>{t.date ? new Date(t.date).toLocaleString() : '—'}</td>
                    <td>{t.liveAccount === 'Live' ? 'Live Trading Account' : (t.liveAccount || 'Live Trading Account')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Follow (when not allocated) */}
      {!myAllocation && fund?.isPublic !== false && (
        <section className="pamm-section">
          <h2 className="pamm-section-title">Follow this fund</h2>
          <p className="muted">Allocate from your Live Trading Account to participate.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setTermsModal(true)}
          >
            Follow {fund?.name || 'BULL RUN'}
          </button>
        </section>
      )}

      {termsModal && (
        <PammTermsModal
          fundName={fund?.name || 'BULL RUN'}
          onAccept={async () => {
            await pammApi.acceptTerms(fundId);
            setTermsModal(false);
            setFollowModal(true);
          }}
          onClose={() => setTermsModal(false)}
        />
      )}
      {followModal && (
        <PammFollowModal
          managerName={fund?.name || 'BULL RUN'}
          managerId={fundId}
          onConfirm={onFollow}
          onClose={() => { setFollowModal(false); onReload?.(); refreshLiveBalance?.(); }}
        />
      )}
      {addFundsModal && (
        <PammAddFundsModal
          allocationId={addFundsModal.id}
          managerName={addFundsModal.managerName}
          currentBalance={addFundsModal.allocatedBalance}
          onConfirm={onAddFunds}
          onClose={() => { setAddFundsModal(null); onReload?.(); refreshLiveBalance?.(); }}
        />
      )}
      {withdrawModal && (
        <PammWithdrawModal
          allocationId={withdrawModal.id}
          managerName={withdrawModal.managerName}
          maxAmount={withdrawModal.allocatedBalance}
          onConfirm={onWithdraw}
          onClose={() => { setWithdrawModal(null); onReload?.(); refreshLiveBalance?.(); }}
        />
      )}
      {unfollowModal && (
        <PammUnfollowModal
          managerName={unfollowModal.managerName}
          onConfirm={() => onUnfollow(unfollowModal.id)}
          onClose={() => { setUnfollowModal(null); onReload?.(); refreshLiveBalance?.(); }}
        />
      )}
      {selectedInvestor && (
        <InvestorDetailModal fundId={fundId} investor={selectedInvestor} onClose={() => setSelectedInvestor(null)} />
      )}
    </div>
  );
}
