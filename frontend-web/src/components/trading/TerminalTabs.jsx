import React, { useState, useMemo } from 'react';
import OrdersPanel from './OrdersPanel';
import PositionsPanel from './PositionsPanel';
import AnalyticsPanel from './AnalyticsPanel';
import JournalPanel from './JournalPanel';

const TABS = [
  { id: 'positions', label: 'Positions' },
  { id: 'orders', label: 'Orders' },
  { id: 'history', label: 'History' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'journal', label: 'Journal' },
];

const SYMBOL_OPTIONS = ['', 'XAU/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD'];

export default function TerminalTabs({
  accountId,
  accountNumber,
  /** 'live' | 'demo' | 'pamm' | other — used in export filename */
  accountType,
  orders = [],
  history = [],
  positions,
  positionsWithPnl = [],
  balance,
  equity,
  onPositionsChange,
  onRefresh,
  alerts = [],
  onRemoveAlert,
  className = '',
}) {
  const [activeTab, setActiveTab] = useState('positions');
  const [positionsFilterSymbol, setPositionsFilterSymbol] = useState('');
  const [positionsSortBy, setPositionsSortBy] = useState('symbol');
  const [positionsSortDir, setPositionsSortDir] = useState('asc');
  const [ordersFilterSymbol, setOrdersFilterSymbol] = useState('');
  const [ordersSortBy, setOrdersSortBy] = useState('time');
  const [ordersSortDir, setOrdersSortDir] = useState('desc');
  const [historyFilterSymbol, setHistoryFilterSymbol] = useState('');
  const [historyTimeFilter, setHistoryTimeFilter] = useState('all');
  const [historySortBy, setHistorySortBy] = useState('time');
  const [historySortDir, setHistorySortDir] = useState('desc');

  const filteredAndSortedHistory = useMemo(() => {
    if (!Array.isArray(history)) return [];
    let list = historyFilterSymbol
      ? history.filter((h) => (h.symbol || '').toUpperCase().includes(historyFilterSymbol.toUpperCase().replace(/\//g, '')))
      : [...history];
    if (historyTimeFilter !== 'all') {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const cut = historyTimeFilter === 'today' ? now - day
        : historyTimeFilter === '7d' ? now - 7 * day
        : now - 30 * day;
      list = list.filter((h) => {
        const t = h.closedAt ? new Date(h.closedAt).getTime() : 0;
        return t >= cut;
      });
    }
    const mult = historySortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (historySortBy === 'time') {
        const ta = a.closedAt ? new Date(a.closedAt).getTime() : 0;
        const tb = b.closedAt ? new Date(b.closedAt).getTime() : 0;
        return mult * (ta - tb);
      }
      if (historySortBy === 'pnl') {
        const pa = a.pnl != null && Number.isFinite(a.pnl) ? a.pnl : 0;
        const pb = b.pnl != null && Number.isFinite(b.pnl) ? b.pnl : 0;
        return mult * (pa - pb);
      }
      return 0;
    });
    return list;
  }, [history, historyFilterSymbol, historyTimeFilter, historySortBy, historySortDir]);

  const exportHistoryCsv = () => {
    const rows = filteredAndSortedHistory.map((h) => {
      const time = h.time ?? (h.closedAt ? new Date(h.closedAt).toLocaleString() : '');
      const pnl = (h.realizedPnl ?? h.pnl) != null && Number.isFinite(Number(h.realizedPnl ?? h.pnl)) ? Number(h.realizedPnl ?? h.pnl) : '';
      const isGold = (h.symbol || '').includes('XAU');
      const fmt = (v) => (v != null && Number.isFinite(v) ? Number(v).toFixed(isGold ? 2 : 4) : '');
      return [time, h.symbol ?? '', h.side ?? '', h.volume ?? h.closedVolume ?? '', fmt(h.openPrice), fmt(h.closePrice), pnl];
    });
    const header = ['Time', 'Symbol', 'Side', 'Volume', 'Open', 'Close', 'PnL'];
    const csv = [header.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const acct = (accountType && String(accountType).trim()) || 'account';
    a.download = `trade-history-${acct}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`terminal-tabs ${className}`}>
      <div className="terminal-tabs__head">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`terminal-tabs__tab ${activeTab === t.id ? 'terminal-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="terminal-tabs__body">
        {activeTab === 'positions' && (
          <>
            <div className="terminal-tabs__toolbar">
              <select
                value={positionsFilterSymbol}
                onChange={(e) => setPositionsFilterSymbol(e.target.value)}
                className="terminal-chart-workspace__select"
                title="Filter by symbol"
              >
                <option value="">All symbols</option>
                {SYMBOL_OPTIONS.filter(Boolean).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={positionsSortBy} onChange={(e) => setPositionsSortBy(e.target.value)} className="terminal-chart-workspace__select">
                <option value="symbol">Symbol</option>
                <option value="pnl">PnL</option>
                <option value="volume">Volume</option>
              </select>
              <button type="button" className="terminal-position-row__btn" onClick={() => setPositionsSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                {positionsSortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <PositionsPanel
              accountId={accountId}
              accountNumber={accountNumber}
              positions={positions}
              onPositionsChange={onPositionsChange}
              onRefresh={onRefresh}
              filterSymbol={positionsFilterSymbol}
              sortBy={positionsSortBy}
              sortDir={positionsSortDir}
            />
          </>
        )}
        {activeTab === 'orders' && (
          <>
            <div className="terminal-tabs__toolbar">
              <select value={ordersFilterSymbol} onChange={(e) => setOrdersFilterSymbol(e.target.value)} className="terminal-chart-workspace__select" title="Filter by symbol">
                <option value="">All symbols</option>
                {SYMBOL_OPTIONS.filter(Boolean).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={ordersSortBy} onChange={(e) => setOrdersSortBy(e.target.value)} className="terminal-chart-workspace__select">
                <option value="time">Time</option>
                <option value="symbol">Symbol</option>
                <option value="volume">Volume</option>
              </select>
              <button type="button" className="terminal-position-row__btn" onClick={() => setOrdersSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                {ordersSortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <OrdersPanel
              orders={orders}
              accountId={accountId}
              accountNumber={accountNumber}
              onRefresh={onRefresh}
              filterSymbol={ordersFilterSymbol}
              sortBy={ordersSortBy}
              sortDir={ordersSortDir}
            />
          </>
        )}
        {activeTab === 'history' && (
          <div className="terminal-tabs__panel">
            <div className="terminal-tabs__toolbar">
              <select value={historyFilterSymbol} onChange={(e) => setHistoryFilterSymbol(e.target.value)} className="terminal-chart-workspace__select" title="Filter by symbol">
                <option value="">All symbols</option>
                {SYMBOL_OPTIONS.filter(Boolean).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select value={historyTimeFilter} onChange={(e) => setHistoryTimeFilter(e.target.value)} className="terminal-chart-workspace__select" title="Filter by time">
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
              <select value={historySortBy} onChange={(e) => setHistorySortBy(e.target.value)} className="terminal-chart-workspace__select">
                <option value="time">Time</option>
                <option value="pnl">PnL</option>
              </select>
              <button type="button" className="terminal-position-row__btn" onClick={() => setHistorySortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                {historySortDir === 'asc' ? '↑' : '↓'}
              </button>
              <button type="button" className="terminal-chart-workspace__select terminal-tabs__export-btn" onClick={exportHistoryCsv}>
                Export CSV
              </button>
            </div>
            {filteredAndSortedHistory.length > 0 ? (
              <table className="terminal-positions-panel__table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Volume</th>
                    <th>Open</th>
                    <th>Close</th>
                    <th>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedHistory.slice(0, 50).map((h) => {
                    const pnl = (h.realizedPnl ?? h.pnl) != null && Number.isFinite(Number(h.realizedPnl ?? h.pnl)) ? Number(h.realizedPnl ?? h.pnl) : null;
                    const pnlDisplay = pnl != null ? `${pnl >= 0 ? '+' : ''}${Number(pnl).toFixed(2)}` : '—';
                    const isGold = (h.symbol || '').includes('XAU');
                    const fmt = (v) => (v != null && Number.isFinite(v) ? Number(v).toFixed(isGold ? 2 : 4) : '—');
                    return (
                      <tr key={h.id || h.time}>
                        <td>{h.time ?? (h.closedAt ? new Date(h.closedAt).toLocaleString() : '—')}</td>
                        <td>{h.symbol ?? '—'}</td>
                        <td>{h.side ?? '—'}</td>
                        <td>{h.volume ?? h.closedVolume ?? '—'}</td>
                        <td>{fmt(h.openPrice)}</td>
                        <td>{fmt(h.closePrice)}</td>
                        <td className={pnl != null ? (pnl >= 0 ? 'terminal-position-row__pnl--profit' : 'terminal-position-row__pnl--loss') : ''}>
                          {pnlDisplay}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="terminal-tabs__empty">No history</p>
            )}
          </div>
        )}
        {activeTab === 'analytics' && (
          <AnalyticsPanel
            positionsWithPnl={positionsWithPnl}
            history={history}
            balance={balance}
            equity={equity}
          />
        )}
        {activeTab === 'alerts' && (
          <div className="terminal-tabs__panel">
            <p className="terminal-tabs__muted">Price alerts. Add from chart toolbar (Alert button). Trade and SL/TP alerts show as toasts.</p>
            {alerts.length === 0 ? (
              <p className="terminal-tabs__empty">No alerts</p>
            ) : (
              <ul className="terminal-alerts-list">
                {alerts.map((a) => (
                  <li key={a.id} className="terminal-alerts-list__item">
                    <span className="terminal-alerts-list__text">{a.symbol} {a.type === 'price' ? `price ${a.condition} ${a.price}` : a.type}</span>
                    {onRemoveAlert && (
                      <button type="button" className="terminal-alerts-list__remove" onClick={() => onRemoveAlert(a.id)} aria-label="Remove alert">×</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {activeTab === 'journal' && (
          <JournalPanel orders={orders} positions={positions} history={history} />
        )}
      </div>
    </div>
  );
}
