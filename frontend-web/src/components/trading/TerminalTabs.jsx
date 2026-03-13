import React, { useState } from 'react';
import * as tradingApi from '../../api/tradingApi';
import PositionsPanel from './PositionsPanel';
import AnalyticsPanel from './AnalyticsPanel';
import JournalPanel from './JournalPanel';

const TABS = [
  { id: 'positions', label: 'Positions' },
  { id: 'orders', label: 'Orders' },
  { id: 'history', label: 'History' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'journal', label: 'Journal' },
];

export default function TerminalTabs({
  accountId,
  accountNumber,
  orders = [],
  history = [],
  positions,
  positionsWithPnl = [],
  balance,
  equity,
  onPositionsChange,
  onRefresh,
  className = '',
}) {
  const [activeTab, setActiveTab] = useState('positions');

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
          <PositionsPanel
            accountId={accountId}
            accountNumber={accountNumber}
            positions={positions}
            onPositionsChange={onPositionsChange}
            onRefresh={onRefresh}
          />
        )}
        {activeTab === 'orders' && (
          <OrdersPanel
            orders={orders}
            accountId={accountId}
            accountNumber={accountNumber}
            onRefresh={onRefresh}
          />
        )}
        {activeTab === 'history' && (
          <div className="terminal-tabs__panel">
            {Array.isArray(history) && history.length > 0 ? (
              <table className="terminal-positions-panel__table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Volume</th>
                    <th>PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 50).map((h) => (
                    <tr key={h.id || h.time}>
                      <td>{h.time ?? (h.closedAt ? new Date(h.closedAt).toLocaleString() : '—')}</td>
                      <td>{h.symbol}</td>
                      <td>{h.side}</td>
                      <td>{h.volume ?? h.closedVolume}</td>
                      <td className={(h.pnl ?? 0) >= 0 ? 'terminal-position-row__pnl--profit' : 'terminal-position-row__pnl--loss'}>
                        {(h.pnl ?? 0) >= 0 ? '+' : ''}{(h.pnl ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
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
        {activeTab === 'journal' && (
          <JournalPanel orders={orders} positions={positions} />
        )}
      </div>
    </div>
  );
}
