import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAccount } from '../../context/AccountContext';
import { useFinance } from '../../hooks/useFinance';
import OrderConfirmModal from '../../components/OrderConfirmModal';
import OrderConfirmModalAdvanced from '../../components/OrderConfirmModalAdvanced';
import ActiveTradesModal from '../../components/ActiveTradesModal';
import HistoryModal from '../../components/HistoryModal';
import { useMarketData } from '../../hooks/useMarketData';
import { useLivePrices, getPriceForSymbol } from '../../hooks/useLivePrices';
import * as financeApi from '../../api/financeApi';
import * as tradingApi from '../../api/tradingApi';
import * as walletApi from '../../api/walletApi';
import { ACCOUNT_GROUPS, groupBalancesByType } from '../../constants/accountGroups';
import { formatCurrency } from '../../constants/finance';

const formatDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function Finance() {
  const { isAuthenticated } = useAuth();
  const { activeAccount, refreshActiveBalance, refreshLiveBalance } = useAccount();
  const { balances, pnl, entries, walletBalance, realizedPnl, loading, error, refresh } = useFinance();
  const [orderError, setOrderError] = useState('');
  const [modal, setModal] = useState(null);
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [tradesModalOpen, setTradesModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('XAU/USD');
  const [tab, setTab] = useState('overview');
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const { candles, tick } = useMarketData(selectedSymbol, '1m');
  const { prices: livePrices } = useLivePrices();
  const marketPrice = tick?.close ?? tick?.price ?? (candles?.length ? candles[candles.length - 1]?.close : null);

  const [positions, setPositions] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [reconciliation, setReconciliation] = useState(null);

  const accountOpts = activeAccount ? { accountId: activeAccount.id, accountNumber: activeAccount.accountNumber } : {};
  const loadTradingData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [posRes, closedRes, ordRes, reconRes] = await Promise.all([
        tradingApi.getOpenPositions({}, accountOpts).catch(() => []),
        tradingApi.getClosedPositions({ limit: 20 }, accountOpts).catch(() => []),
        tradingApi.listOrders({}, accountOpts).catch(() => []),
        financeApi.getReconciliation().catch(() => null),
      ]);
      const pos = Array.isArray(posRes) ? posRes : [];
      setPositions(pos.map((p) => ({ id: p.id, symbol: p.symbol, type: p.side, lots: p.volume, entryPrice: p.openPrice, currentPrice: p.currentPrice ?? p.openPrice, pnl: p.pnl ?? 0 })));
      const hist = [
        ...(Array.isArray(closedRes) ? closedRes : []).map((p) => ({
          id: p.id,
          time: new Date(p.closedAt || p.updatedAt).toISOString().slice(0, 16).replace('T', ' '),
          symbol: p.symbol,
          type: p.side,
          lots: p.volume ?? p.closedVolume,
          price: p.openPrice,
          pnl: p.pnl,
          status: 'closed',
        })),
        ...(Array.isArray(ordRes) ? ordRes : []).map((o) => ({
          id: o.id,
          time: new Date(o.createdAt).toISOString().slice(0, 16).replace('T', ' '),
          symbol: o.symbol,
          type: `${o.side}_${o.type || 'market'}`,
          lots: o.volume,
          price: o.price,
          pnl: null,
          status: o.status,
        })),
      ].sort((a, b) => (b.time > a.time ? 1 : -1));
      setHistoryItems(hist);
      setReconciliation(reconRes);
    } catch (_) {}
  }, [isAuthenticated, accountOpts.accountId, accountOpts.accountNumber]);

  useEffect(() => {
    loadTradingData();
  }, [loadTradingData]);

  const loadMonthlyReport = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await financeApi.getMonthlyReport(reportYear, reportMonth);
      setMonthlyReport(res);
    } catch (_) {
      setMonthlyReport(null);
    }
  }, [isAuthenticated, reportYear, reportMonth]);

  useEffect(() => {
    if (tab === 'reports') loadMonthlyReport();
  }, [tab, loadMonthlyReport]);

  const handleOrderConfirm = async (order) => {
    setModal(null);
    setOrderError('');
    try {
      await tradingApi.placeOrder({
        symbol: order.symbol,
        side: modal === 'sell' ? 'sell' : 'buy',
        lots: order.lots,
        price: order.price,
        marketOrder: order.marketOrder ?? true,
      }, accountOpts);
      refresh();
      loadTradingData();
      refreshActiveBalance();
    } catch (e) {
      setOrderError(e.message || 'Failed to place order');
    }
  };

  const handleAdvancedOrderConfirm = async (order) => {
    setAdvancedModalOpen(false);
    setOrderError('');
    try {
      const isMarket = order.orderType === 'market';
      const side = (order.orderType || '').startsWith('sell') ? 'sell' : 'buy';
      await tradingApi.placeOrder({ symbol: order.symbol, side, lots: order.lots, price: order.price, marketOrder: isMarket }, accountOpts);
      refresh();
      loadTradingData();
      refreshActiveBalance();
    } catch (e) {
      setOrderError(e.message || 'Failed to place order');
    }
  };

  const handleClosePosition = async (payload) => {
    setOrderError('');
    try {
      const volume = payload.partial ? payload.lots : undefined;
      const closePrice = payload.currentPrice ?? undefined;
      await tradingApi.closePosition(payload.id, volume, closePrice, accountOpts);
      refresh();
      loadTradingData();
      refreshActiveBalance();
      refreshLiveBalance();
    } catch (e) {
      setOrderError(e.message || 'Failed to close position');
    }
  };

  const groupedBalances = groupBalancesByType(balances);
  const hasDiscrepancy = reconciliation?.status === 'discrepancy';

  if (!isAuthenticated) {
    return (
      <div className="page finance-page">
        <header className="page-header">
          <h1>Finance</h1>
          <p className="page-subtitle">Ledger, statements and reports</p>
        </header>
        <p className="muted">Sign in to view your finance data.</p>
      </div>
    );
  }

  return (
    <div className="page finance-page">
      <header className="page-header">
        <div>
          <h1>Finance</h1>
          <p className="page-subtitle">Ledger, statements and reports</p>
        </div>
        <div className="page-header-actions">
          <Link to="/wallet" className="btn btn-secondary btn-sm">Deposit / Withdraw</Link>
        </div>
      </header>

      <section className="page-content">
        {(error || orderError) && <p className="form-error">{error || orderError}</p>}
        {hasDiscrepancy && (
          <div className="alert alert-warning">
            Reconciliation mismatch: Wallet {formatCurrency(reconciliation.walletBalance)} vs Ledger {formatCurrency(reconciliation.ledgerBalance)}. <Link to="/wallet">Wallet</Link>
          </div>
        )}

        <div className="finance-summary-cards">
          <div className="card card-highlight">
            <h3>Trade account equity</h3>
            <p className="card-value">{loading ? '…' : formatCurrency(walletBalance)}</p>
            <p className="card-label muted" style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>Available balance · same as Trading & Wallet</p>
            <div className="card-actions">
              <Link to="/wallet" className="btn btn-sm btn-primary">Manage</Link>
            </div>
          </div>
          <div className="card">
            <h3>Realized P&L</h3>
            <p className={`card-value ${(realizedPnl ?? 0) >= 0 ? 'positive' : 'negative'}`}>{loading ? '…' : formatCurrency(realizedPnl)}</p>
          </div>
          <div className="card">
            <h3>Receivables</h3>
            <p className="card-value">{loading ? '…' : formatCurrency(pnl?.receivables)}</p>
          </div>
        </div>

        <div className="finance-tabs">
          <button type="button" className={`tab-btn ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button type="button" className={`tab-btn ${tab === 'ledger' ? 'active' : ''}`} onClick={() => setTab('ledger')}>Ledger</button>
          <button type="button" className={`tab-btn ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>Reports</button>
        </div>

        {tab === 'overview' && (
          <>
            <div className="section-block">
              <h2>Quick trade</h2>
              <div className="quick-trade-buttons">
                <button type="button" className="btn btn-primary" onClick={() => setModal('buy')}>Buy</button>
                <button type="button" className="btn btn-sell" onClick={() => setModal('sell')}>Sell</button>
                <button type="button" className="btn btn-secondary" onClick={() => setAdvancedModalOpen(true)}>Advanced</button>
                <button type="button" className="btn btn-secondary" onClick={() => setTradesModalOpen(true)}>Active trades</button>
                <button type="button" className="btn btn-secondary" onClick={() => setHistoryModalOpen(true)}>History</button>
              </div>
            </div>

            <div className="section-block">
              <h2>Account summary</h2>
              <p className="muted">Balances by account type.</p>
              {groupedBalances.length === 0 ? (
                <p className="empty-state">No ledger data yet. <Link to="/wallet">Deposit</Link> or trade to generate entries.</p>
              ) : (
                <div className="account-groups">
                  {groupedBalances.map((g) => (
                    <div key={g.id} className="account-group">
                      <h4 className="account-group-title">{g.label}</h4>
                      <div className="account-group-list">
                        {g.accounts.map((a) => (
                          <div key={a.accountCode} className="account-row">
                            <span className="account-name">{a.accountName}</span>
                            <span className={`account-balance ${(a.balance ?? 0) >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(a.balance)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="section-block">
              <h2>Recent activity</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Account</th>
                      <th>Debit</th>
                      <th>Credit</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr><td colSpan={5} className="empty-cell">No entries yet</td></tr>
                    ) : (
                      entries.slice(0, 15).map((e) => (
                        <tr key={e.id}>
                          <td>{formatDate(e.createdAt)}</td>
                          <td>{e.accountName || e.accountCode}</td>
                          <td>{e.debit > 0 ? formatCurrency(e.debit) : '—'}</td>
                          <td>{e.credit > 0 ? formatCurrency(e.credit) : '—'}</td>
                          <td>{e.referenceType || e.referenceId || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Link to="#" onClick={(e) => { e.preventDefault(); setTab('ledger'); }} className="btn-link">View all entries →</Link>
            </div>
          </>
        )}

        {tab === 'ledger' && (
          <div className="section-block">
            <h2>Ledger entries</h2>
            <p className="muted">All journal entries. Filter by account in the API.</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Account</th>
                    <th>Code</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr><td colSpan={6} className="empty-cell">No entries yet</td></tr>
                  ) : (
                    entries.map((e) => (
                      <tr key={e.id}>
                        <td>{formatDate(e.createdAt)}</td>
                        <td>{e.accountName || e.accountCode}</td>
                        <td><code className="account-code">{e.accountCode}</code></td>
                        <td>{e.debit > 0 ? formatCurrency(e.debit) : '—'}</td>
                        <td>{e.credit > 0 ? formatCurrency(e.credit) : '—'}</td>
                        <td>{e.referenceType || e.referenceId || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'reports' && (
          <div className="section-block">
            <h2>Monthly report</h2>
            <div className="report-filters">
              <select value={reportMonth} onChange={(e) => setReportMonth(Number(e.target.value))} className="form-input form-input-sm">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString(undefined, { month: 'long' })}</option>
                ))}
              </select>
              <select value={reportYear} onChange={(e) => setReportYear(Number(e.target.value))} className="form-input form-input-sm">
                {[2024, 2025, 2026].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadMonthlyReport}>Load</button>
            </div>
            {monthlyReport && (
              <div className="report-content">
                <p className="muted">Period: {monthlyReport.from} to {monthlyReport.to}</p>
                <div className="cards-row" style={{ marginTop: '1rem' }}>
                  <div className="card">
                    <h3>Entries</h3>
                    <p className="card-value">{monthlyReport.entries?.length ?? 0}</p>
                  </div>
                  <div className="card">
                    <h3>Realized P&L</h3>
                    <p className={`card-value ${(monthlyReport.pnl?.realized ?? 0) >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(monthlyReport.pnl?.realized)}</p>
                  </div>
                </div>
                {monthlyReport.balances?.length > 0 && (
                  <div className="table-wrap" style={{ marginTop: '1rem' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyReport.balances.filter((b) => Math.abs(b.balance) > 0.001).map((b) => (
                          <tr key={b.accountCode}>
                            <td>{b.accountName}</td>
                            <td className={(b.balance ?? 0) >= 0 ? 'positive' : 'negative'}>{formatCurrency(b.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <OrderConfirmModal
        isOpen={!!modal}
        type={modal || 'buy'}
        symbol={selectedSymbol}
        marketPrice={marketPrice}
        onConfirm={(o) => { setSelectedSymbol(o.symbol); handleOrderConfirm(o); }}
        onClose={() => setModal(null)}
      />
      <OrderConfirmModalAdvanced
        isOpen={advancedModalOpen}
        type="advanced"
        symbol={selectedSymbol}
        marketPrice={marketPrice}
        onConfirm={(o) => { setSelectedSymbol(o.symbol); handleAdvancedOrderConfirm(o); }}
        onClose={() => setAdvancedModalOpen(false)}
      />
      <ActiveTradesModal
        isOpen={tradesModalOpen}
        positions={positions.map((p) => {
          const livePrice = getPriceForSymbol(livePrices, p.symbol);
          const chartMatch = (p.symbol || '').replace(/\//g, '').toUpperCase() === (selectedSymbol || '').replace(/\//g, '').toUpperCase();
          const currentPrice = livePrice ?? (chartMatch ? marketPrice : null) ?? p.currentPrice ?? p.entryPrice;
          return { ...p, currentPrice };
        })}
        onClose={() => setTradesModalOpen(false)}
        onClosePosition={handleClosePosition}
      />
      <HistoryModal
        isOpen={historyModalOpen}
        history={historyItems}
        onClose={() => setHistoryModalOpen(false)}
      />
    </div>
  );
}
