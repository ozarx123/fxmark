import React, { useState } from 'react';

const MOCK_ACCOUNTS = [
  { accountNumber: '10001234', name: 'John Doe', balance: 12500, equity: 12800, margin: 1200, freeMargin: 11600 },
  { accountNumber: '10005678', name: 'Jane Smith', balance: 8200, equity: 8150, margin: 800, freeMargin: 7350 },
  { accountNumber: '10009999', name: 'Alex Trader', balance: 45600, equity: 46100, margin: 4200, freeMargin: 41900 },
];

const MOCK_POSITIONS = [
  { id: 1, symbol: 'XAUUSD', type: 'Buy', lots: 0.5, openPrice: 2620.5, currentPrice: 2625.2, sl: 2615, tp: 2635, pnl: 235, openTime: '2025-02-21 09:15' },
  { id: 2, symbol: 'EURUSD', type: 'Sell', lots: 1.0, openPrice: 1.0850, currentPrice: 1.0842, sl: 1.0900, tp: 1.0780, pnl: 80, openTime: '2025-02-21 10:00' },
];

const MOCK_PENDING = [
  { id: 101, symbol: 'XAUUSD', type: 'Buy Limit', lots: 0.2, price: 2610, sl: 2605, tp: 2620, expiry: '2025-02-22' },
];

export default function AdminTradingMonitor() {
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [actionLog, setActionLog] = useState([]);

  const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

  const accounts = accountSearch
    ? MOCK_ACCOUNTS.filter((a) => a.accountNumber.includes(accountSearch) || a.name.toLowerCase().includes(accountSearch.toLowerCase()))
    : MOCK_ACCOUNTS;

  const logAction = (action, detail) => {
    setActionLog((prev) => [{ time: new Date().toLocaleString(), action, detail }, ...prev.slice(0, 19)]);
  };

  const handleClose = (pos) => {
    logAction('Close position', `${pos.symbol} ${pos.type} ${pos.lots} lots`);
    alert(`Close ${pos.symbol} (logged; backend not connected)`);
  };

  const handlePartialClose = (pos) => {
    logAction('Partial close', `${pos.symbol} ${pos.lots} lots`);
    alert(`Partial close ${pos.symbol} (logged)`);
  };

  const handleCloseAll = () => {
    logAction('Close all', selectedAccount?.accountNumber || '');
    alert('Close all positions (logged)');
  };

  const handleCancelOrder = (order) => {
    logAction('Cancel pending', `${order.symbol} ${order.type} @ ${order.price}`);
    alert(`Cancel order ${order.id} (logged)`);
  };

  const handleModifySLTP = (pos) => {
    logAction('Modify SL/TP', pos.symbol);
    alert(`Modify SL/TP for ${pos.symbol} (logged)`);
  };

  return (
    <div className="page admin-page admin-trading-monitor">
      <header className="page-header">
        <h1>Trading monitor</h1>
        <p className="page-subtitle">Search trader account, view positions and orders, admin actions (all logged to audit)</p>
      </header>

      <section className="admin-section-block">
        <div className="settings-card">
          <div className="filter-group">
            <label>Search by account number or client name</label>
            <input
              type="text"
              placeholder="Account # or name..."
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              className="filter-input search-input"
            />
          </div>
          <div className="account-picker">
            {accounts.map((acc) => (
              <button
                key={acc.accountNumber}
                type="button"
                className={`btn btn-secondary account-pill ${selectedAccount?.accountNumber === acc.accountNumber ? 'active' : ''}`}
                onClick={() => setSelectedAccount(acc)}
              >
                {acc.accountNumber} – {acc.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {selectedAccount && (
        <>
          <section className="admin-section-block">
            <h2 className="section-title">Account summary</h2>
            <div className="kpi-cards kpi-cards-overview">
              <div className="kpi-card">
                <h3>Balance</h3>
                <p className="kpi-value">{formatCurrency(selectedAccount.balance)}</p>
              </div>
              <div className="kpi-card">
                <h3>Equity</h3>
                <p className="kpi-value">{formatCurrency(selectedAccount.equity)}</p>
              </div>
              <div className="kpi-card">
                <h3>Margin</h3>
                <p className="kpi-value">{formatCurrency(selectedAccount.margin)}</p>
              </div>
              <div className="kpi-card">
                <h3>Free margin</h3>
                <p className="kpi-value">{formatCurrency(selectedAccount.freeMargin)}</p>
              </div>
            </div>
          </section>

          <section className="admin-section-block">
            <h2 className="section-title">Live positions</h2>
            <div className="table-wrap">
              <table className="table kpi-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Lots</th>
                    <th>Open / Current</th>
                    <th>SL / TP</th>
                    <th>P&L</th>
                    <th>Open time</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_POSITIONS.map((pos) => (
                    <tr key={pos.id}>
                      <td><strong>{pos.symbol}</strong></td>
                      <td>{pos.type}</td>
                      <td>{pos.lots}</td>
                      <td>{pos.openPrice} / {pos.currentPrice}</td>
                      <td>{pos.sl} / {pos.tp}</td>
                      <td className={pos.pnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(pos.pnl)}</td>
                      <td>{pos.openTime}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn-link" onClick={() => handlePartialClose(pos)}>Partial close</button>
                          <button type="button" className="btn-link" onClick={() => handleModifySLTP(pos)}>Modify SL/TP</button>
                          <button type="button" className="btn-link btn-link-danger" onClick={() => handleClose(pos)}>Close</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="section-actions">
              <button type="button" className="btn btn-primary" onClick={handleCloseAll}>Close all positions</button>
            </div>
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
                    <th>SL / TP</th>
                    <th>Expiry</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_PENDING.map((ord) => (
                    <tr key={ord.id}>
                      <td><strong>{ord.symbol}</strong></td>
                      <td>{ord.type}</td>
                      <td>{ord.lots}</td>
                      <td>{ord.price}</td>
                      <td>{ord.sl} / {ord.tp}</td>
                      <td>{ord.expiry}</td>
                      <td>
                        <button type="button" className="btn-link btn-link-danger" onClick={() => handleCancelOrder(ord)}>Cancel</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section-block">
            <h2 className="section-title">Trade history</h2>
            <p className="muted">Last 50 closed trades. (Connect to backend for real data.)</p>
          </section>

          <section className="admin-section-block">
            <h2 className="section-title">Action log (this session)</h2>
            <div className="audit-preview">
              {actionLog.length === 0 ? (
                <p className="muted">Admin actions will appear here and in Audit Log.</p>
              ) : (
                <ul className="audit-list">
                  {actionLog.map((e, i) => (
                    <li key={i}><strong>{e.time}</strong> – {e.action}: {e.detail}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
