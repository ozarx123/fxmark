import React, { useState } from 'react';


// Mock history for demo; replace with API data
const MOCK_HISTORY = [
  { id: 1, time: '2025-02-21 14:32', symbol: 'EUR/USD', type: 'buy', lots: 0.5, price: 1.0845, pnl: 12.50, status: 'closed' },
  { id: 2, time: '2025-02-21 13:18', symbol: 'XAU/USD', type: 'sell', lots: 0.1, price: 2618.20, pnl: -5.20, status: 'closed' },
  { id: 3, time: '2025-02-21 11:05', symbol: 'GBP/USD', type: 'buy', lots: 1, price: 1.2642, pnl: 28.00, status: 'closed' },
  { id: 4, time: '2025-02-20 16:44', symbol: 'USD/JPY', type: 'sell', lots: 0.5, price: 150.25, pnl: 0, status: 'closed' },
  { id: 5, time: '2025-02-20 10:22', symbol: 'EUR/USD', type: 'buy_limit', lots: 0.25, price: 1.0800, pnl: null, status: 'cancelled' },
];

function formatPnl(pnl) {
  if (pnl == null) return { text: '—', cls: '' };
  const n = Number(pnl);
  if (n > 0) return { text: `+${n.toFixed(2)}`, cls: 'pnl-profit' };
  if (n < 0) return { text: n.toFixed(2), cls: 'pnl-loss' };
  return { text: '0.00', cls: '' };
}

export default function HistoryModal({ isOpen, history: propHistory, onClose }) {
  const history = propHistory ?? MOCK_HISTORY;
  const [filter, setFilter] = useState('all'); // all | closed | orders

  if (!isOpen) return null;

  const filtered = history.filter((h) => {
    if (filter === 'orders') return h.status === 'cancelled' || (h.type && h.type.includes('limit') || h.type?.includes('stop'));
    if (filter === 'closed') return h.status === 'closed';
    return true;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-dialog-history" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>History</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="history-content">
          <div className="history-tabs">
            <button
              type="button"
              className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`tab-btn ${filter === 'closed' ? 'active' : ''}`}
              onClick={() => setFilter('closed')}
            >
              Closed
            </button>
            <button
              type="button"
              className={`tab-btn ${filter === 'orders' ? 'active' : ''}`}
              onClick={() => setFilter('orders')}
            >
              Orders
            </button>
          </div>
          {filtered.length === 0 ? (
            <p className="empty-history">No history</p>
          ) : (
            <div className="history-table-wrap">
              <table className="trades-table history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Lots</th>
                    <th>Price</th>
                    <th>P&L</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((h) => {
                    const { text: pnlText, cls: pnlCls } = formatPnl(h.pnl);
                    const typeLabel = (h.type || '').replace('_', ' ');
                    return (
                      <tr key={h.id}>
                        <td>{h.time}</td>
                        <td className="symbol-cell">{h.symbol}</td>
                        <td>
                          <span className={`type-badge type-${h.type?.replace('_limit', '').replace('_stop', '') || 'buy'}`}>
                            {typeLabel}
                          </span>
                        </td>
                        <td>{h.lots}</td>
                        <td>{h.price != null ? h.price.toFixed(h.symbol?.includes('XAU') ? 2 : 4) : '—'}</td>
                        <td className={`pnl-cell ${pnlCls}`}>{pnlText}</td>
                        <td>
                          <span className={`status-badge status-${h.status}`}>{h.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
