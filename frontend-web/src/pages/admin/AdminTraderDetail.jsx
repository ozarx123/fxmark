import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import {
  getAdminTradingUserSummary,
  getAdminTradingAccounts,
  getAdminTradingWallet,
  getAdminTradingPositions,
  getAdminTradingClosedPositions,
  getAdminTradingOrders,
  adminClosePosition,
  adminCancelOrder,
  getAdminTradingLimits,
  updateAdminTradingLimits,
} from '../../api/adminApi';
import { useLivePrices, getPriceForSymbol, computePnL } from '../../hooks/useLivePrices';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n ?? 0);

const formatDate = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function AdminTraderDetail() {
  const { userId } = useParams();
  const { state: locationState } = useLocation();
  const { prices: livePrices } = useLivePrices();
  const [accounts, setAccounts] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [positions, setPositions] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLog, setActionLog] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [limits, setLimits] = useState({ blocked: false, maxDrawdownPercent: null, maxDailyLoss: null });
  const [limitsForm, setLimitsForm] = useState({ maxDrawdownPercent: '', maxDailyLoss: '' });
  const passedUser = locationState?.user;
  const [userInfo, setUserInfo] = useState({ email: '', name: '' });

  useEffect(() => {
    if (passedUser?.email || passedUser?.name) {
      setUserInfo((prev) => ({
        ...prev,
        email: passedUser.email || prev.email,
        name: passedUser.name || prev.name,
      }));
    }
  }, [passedUser?.email, passedUser?.name]);

  const logAction = (action, detail) => {
    setActionLog((prev) => [{ time: new Date().toLocaleString(), action, detail }, ...prev.slice(0, 49)]);
  };

  const loadUserTrading = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [summary, accs, w, pos, ords, closed, lim] = await Promise.all([
        getAdminTradingUserSummary(userId).catch(() => ({ id: userId, email: userId, name: '—' })),
        getAdminTradingAccounts(userId),
        getAdminTradingWallet(userId).catch(() => null),
        getAdminTradingPositions(userId, { accountId: accountId || undefined }),
        getAdminTradingOrders(userId, { accountId: accountId || undefined, limit: 50 }),
        getAdminTradingClosedPositions(userId, { limit: 50, accountId: accountId || undefined }),
        getAdminTradingLimits(userId).catch(() => ({ blocked: false, maxDrawdownPercent: null, maxDailyLoss: null })),
      ]);
      const fromApi = summary && summary.email && summary.email !== userId;
      setUserInfo({
        id: summary?.id || userId,
        email: fromApi ? summary.email : (passedUser?.email || summary?.email || userId),
        name: fromApi ? summary.name : (passedUser?.name || summary?.name || '—'),
      });
      setAccounts(accs);
      setWallet(w);
      setPositions(pos);
      setOrders(ords.filter((o) => ['pending', 'placed', 'partial'].includes(o.status || '')));
      setClosedPositions(closed);
      setLimits(lim);
      setLimitsForm({
        maxDrawdownPercent: lim.maxDrawdownPercent != null ? String(lim.maxDrawdownPercent) : '',
        maxDailyLoss: lim.maxDailyLoss != null ? String(lim.maxDailyLoss) : '',
      });
    } catch (e) {
      setError(e.message);
      setPositions([]);
      setOrders([]);
      setClosedPositions([]);
      setAccounts([]);
      setWallet(null);
      setLimits({ blocked: false, maxDrawdownPercent: null, maxDailyLoss: null });
    } finally {
      setLoading(false);
    }
  }, [userId, accountId, passedUser?.email, passedUser?.name]);

  useEffect(() => {
    if (userId) loadUserTrading();
  }, [userId, loadUserTrading]);

  const handleClose = async (pos) => {
    try {
      const closePrice = pos.currentPrice ?? pos.openPrice;
      await adminClosePosition(userId, pos.id, closePrice != null ? { closePrice } : {});
      logAction('Close position', `${pos.symbol} ${pos.side} ${pos.volume} lots`);
      loadUserTrading();
    } catch (e) {
      setError(e.message);
    }
  };

  const handlePartialClose = async (pos, volume) => {
    const vol = volume ?? pos.volume / 2;
    if (vol <= 0 || vol >= pos.volume) return;
    try {
      const closePrice = pos.currentPrice ?? pos.openPrice;
      await adminClosePosition(userId, pos.id, { volume: vol, ...(closePrice != null && { closePrice }) });
      logAction('Partial close', `${pos.symbol} ${vol} lots`);
      loadUserTrading();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCloseAll = async () => {
    for (const pos of positionsWithLivePnl) {
      try {
        const closePrice = pos.currentPrice ?? pos.openPrice;
        await adminClosePosition(userId, pos.id, closePrice != null ? { closePrice } : {});
        logAction('Close position', `${pos.symbol} ${pos.side} ${pos.volume} lots`);
      } catch (e) {
        setError(e.message);
      }
    }
    loadUserTrading();
  };

  const handleCancelOrder = async (order) => {
    try {
      await adminCancelOrder(userId, order.id);
      logAction('Cancel order', `${order.symbol} ${order.type} @ ${order.price}`);
      loadUserTrading();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleBlock = async () => {
    try {
      const updated = await updateAdminTradingLimits(userId, { blocked: true });
      setLimits(updated);
      logAction('Block trader', userInfo.email);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleUnblock = async () => {
    try {
      const updated = await updateAdminTradingLimits(userId, { blocked: false });
      setLimits(updated);
      logAction('Unblock trader', userInfo.email);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSaveLimits = async () => {
    try {
      const body = {};
      const pct = limitsForm.maxDrawdownPercent.trim();
      const loss = limitsForm.maxDailyLoss.trim();
      if (pct !== '') body.maxDrawdownPercent = parseFloat(pct);
      if (loss !== '') body.maxDailyLoss = parseFloat(loss);
      if (Object.keys(body).length === 0) return;
      const updated = await updateAdminTradingLimits(userId, body);
      setLimits(updated);
      setLimitsForm({
        maxDrawdownPercent: updated.maxDrawdownPercent != null ? String(updated.maxDrawdownPercent) : '',
        maxDailyLoss: updated.maxDailyLoss != null ? String(updated.maxDailyLoss) : '',
      });
      logAction('Update drawdown limits', JSON.stringify(body));
    } catch (e) {
      setError(e.message);
    }
  };

  const scopeAccounts = accountId ? accounts.filter((a) => a.id === accountId) : accounts;
  const nonDemoAccounts = scopeAccounts.filter((a) => a.type !== 'demo');
  const totalBalance = nonDemoAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);

  const positionsWithLivePnl = useMemo(() => {
    return positions.map((p) => {
      const currentPrice = getPriceForSymbol(livePrices, p.symbol) ?? p.currentPrice ?? p.openPrice;
      const pnl = currentPrice != null ? computePnL(p, currentPrice) : (p.pnl ?? 0);
      return { ...p, currentPrice, pnl, hasLivePrice: getPriceForSymbol(livePrices, p.symbol) != null };
    });
  }, [positions, livePrices]);

  const totalEquity = totalBalance + positionsWithLivePnl.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const totalMargin = positionsWithLivePnl.reduce((sum, p) => {
    const vol = Number(p.volume) || 0;
    const price = p.currentPrice ?? p.openPrice ?? 0;
    if (!vol || !price) return sum;
    const isGold = String(p.symbol || '').toUpperCase().includes('XAU');
    const contractSize = isGold ? 100 : 100000;
    const leverage = 100;
    return sum + (vol * contractSize * price) / leverage;
  }, 0);

  if (!userId) {
    return (
      <div className="page admin-page">
        <p className="muted">Invalid trader. <Link to="/admin/trading-monitor">Back to Trading monitor</Link></p>
      </div>
    );
  }

  return (
    <div className="page admin-page admin-trading-monitor">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/admin/trading-monitor" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          ← Back
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0 }}>
            {userInfo.name && userInfo.name !== '—' ? userInfo.name : userInfo.email || 'Trader'} ({userInfo.email || userId})
          </h1>
          <p className="page-subtitle" style={{ margin: '0.25rem 0 0' }}>
            ID: {userId} · View positions, orders, block, drawdown limits
          </p>
        </div>
      </header>

      {error && (
        <div className="admin-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <section className="admin-section-block" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button type="button" className="btn btn-secondary" onClick={loadUserTrading} disabled={loading}>
          Refresh
        </button>
      </section>

      {accounts.length > 1 && (
        <section className="admin-section-block">
          <div className="filter-group">
            <label>Account filter</label>
            <select
              value={accountId || ''}
              onChange={(e) => setAccountId(e.target.value || null)}
              className="filter-select"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountNumber} ({a.type}) {formatCurrency(a.balance)}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <section className="admin-section-block">
        <h2 className="section-title">Account summary</h2>
        <div className="kpi-cards kpi-cards-overview">
          {wallet != null && (
            <div className="kpi-card">
              <h3>Wallet balance</h3>
              <p className="kpi-value">{formatCurrency((wallet?.balance ?? 0) + (wallet?.locked ?? 0))}</p>
              <p className="kpi-meta">Main wallet (deposits, withdrawals, live P&L)</p>
            </div>
          )}
          <div className="kpi-card">
            <h3>Trading balance</h3>
            <p className="kpi-value">{formatCurrency(totalBalance)}</p>
            <p className="kpi-meta">Sum of live & PAMM accounts (excludes demo)</p>
          </div>
          <div className="kpi-card">
            <h3>Equity</h3>
            <p className="kpi-value">{formatCurrency(totalEquity)}</p>
          </div>
          <div className="kpi-card">
            <h3>Margin</h3>
            <p className="kpi-value">{formatCurrency(totalMargin)}</p>
          </div>
          <div className="kpi-card">
            <h3>Open positions</h3>
            <p className="kpi-value">{positions.length}</p>
          </div>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Trader actions</h2>
        <div className="settings-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {limits.blocked ? (
              <button type="button" className="btn btn-secondary" onClick={handleUnblock}>
                Unblock trader
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={handleBlock}>
                Block trader
              </button>
            )}
            {limits.blocked && (
              <span style={{ color: 'var(--fxmark-orange)', fontSize: '0.9rem', fontWeight: 500 }}>Trading blocked</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="filter-group" style={{ marginBottom: 0 }}>
              <label>Max daily loss</label>
              <input
                type="number"
                placeholder="e.g. 500"
                value={limitsForm.maxDailyLoss}
                onChange={(e) => setLimitsForm((f) => ({ ...f, maxDailyLoss: e.target.value }))}
                className="filter-input"
                style={{ width: '8rem' }}
              />
              <span className="muted" style={{ fontSize: '0.8rem', marginLeft: '0.25rem' }}>USD</span>
            </div>
            <div className="filter-group" style={{ marginBottom: 0 }}>
              <label>Max drawdown %</label>
              <input
                type="number"
                placeholder="e.g. 20"
                value={limitsForm.maxDrawdownPercent}
                onChange={(e) => setLimitsForm((f) => ({ ...f, maxDrawdownPercent: e.target.value }))}
                className="filter-input"
                style={{ width: '6rem' }}
              />
            </div>
            <button type="button" className="btn btn-secondary" onClick={handleSaveLimits}>
              Save limits
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
          Block prevents new orders and position closes. Max daily loss limits trading when today&apos;s realized P&L falls below the threshold.
        </p>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">
          Live positions
          {positionsWithLivePnl.some((p) => p.hasLivePrice) && (
            <span className="live-indicator" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#6bcf7f', fontWeight: 500 }}>
              ● Live
            </span>
          )}
        </h2>
        <div className="table-wrap">
          <table className="table kpi-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Symbol</th>
                <th>Type</th>
                <th>Lots</th>
                <th>Open / Current</th>
                <th>P&L</th>
                <th>Open time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {positionsWithLivePnl.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    No open positions
                  </td>
                </tr>
              ) : (
                positionsWithLivePnl.map((pos) => {
                  const acc = accounts.find((a) => a.id === pos.accountId);
                  return (
                    <tr key={pos.id}>
                      <td className="muted" style={{ fontSize: '0.85rem' }}>
                        {acc ? `${acc.accountNumber} (${acc.type})` : pos.accountId ?? '—'}
                      </td>
                      <td><strong>{pos.symbol}</strong></td>
                      <td>{pos.side === 'buy' ? 'Buy' : 'Sell'}</td>
                      <td>{pos.volume}</td>
                      <td>
                        {pos.openPrice} / {pos.currentPrice != null ? pos.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : (pos.openPrice ?? '—')}
                      </td>
                      <td className={(pos.pnl ?? 0) >= 0 ? 'positive' : 'negative'}>{formatCurrency(pos.pnl)}</td>
                      <td>{formatDate(pos.openedAt)}</td>
                      <td>
                        <div className="row-actions">
                          {pos.volume > 0.01 && (
                            <button type="button" className="btn-link" onClick={() => handlePartialClose(pos)}>
                              Partial close
                            </button>
                          )}
                          <button type="button" className="btn-link btn-link-danger" onClick={() => handleClose(pos)}>
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {positionsWithLivePnl.length > 0 && (
          <div className="section-actions">
            <button type="button" className="btn btn-primary" onClick={handleCloseAll}>
              Close all positions
            </button>
          </div>
        )}
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Pending orders</h2>
        <div className="table-wrap">
          <table className="table kpi-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Type</th>
                <th>Lots</th>
                <th>Price</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No pending orders
                  </td>
                </tr>
              ) : (
                orders.map((ord) => (
                  <tr key={ord.id}>
                    <td><strong>{ord.symbol}</strong></td>
                    <td>{ord.side} {ord.type}</td>
                    <td>{ord.volume}</td>
                    <td>{ord.price ?? '—'}</td>
                    <td>{ord.status}</td>
                    <td>{formatDate(ord.createdAt)}</td>
                    <td>
                      <button type="button" className="btn-link btn-link-danger" onClick={() => handleCancelOrder(ord)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Trade history</h2>
        <div className="table-wrap">
          <table className="table kpi-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Type</th>
                <th>Lots</th>
                <th>Open / Close</th>
                <th>P&L</th>
                <th>Closed</th>
              </tr>
            </thead>
            <tbody>
              {closedPositions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No closed trades
                  </td>
                </tr>
              ) : (
                closedPositions.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.symbol}</strong></td>
                    <td>{p.side === 'buy' ? 'Buy' : 'Sell'}</td>
                    <td>{p.closedVolume ?? p.volume}</td>
                    <td>{p.openPrice} / {p.closePrice ?? '—'}</td>
                    <td className={(p.pnl ?? 0) >= 0 ? 'positive' : 'negative'}>{formatCurrency(p.pnl)}</td>
                    <td>{formatDate(p.closedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Action log (this session)</h2>
        <div className="audit-preview">
          {actionLog.length === 0 ? (
            <p className="muted">Admin actions will appear here.</p>
          ) : (
            <ul className="audit-list">
              {actionLog.map((e, i) => (
                <li key={i}>
                  <strong>{e.time}</strong> – {e.action}: {e.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {loading && (
        <div className="loading-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Loading…
        </div>
      )}
    </div>
  );
}
