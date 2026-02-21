import React, { useState } from 'react';

const MOCK_LEDGER = [
  { id: 1, tradeId: 'T-8821', ibCode: 'IB_Alpha', clientAccount: '10001234', symbol: 'XAUUSD', lots: 0.5, commission: 12.5, status: 'Paid', paidAt: '2025-02-20' },
  { id: 2, tradeId: 'T-8822', ibCode: 'IB_Alpha', clientAccount: '10005678', symbol: 'EURUSD', lots: 1.0, commission: 8.0, status: 'Paid', paidAt: '2025-02-20' },
  { id: 3, tradeId: 'T-8825', ibCode: 'IB_Beta', clientAccount: '10009999', symbol: 'XAUUSD', lots: 2.0, commission: 50.0, status: 'Pending', paidAt: '—' },
];

const MOCK_IB_WALLETS = [
  { ibCode: 'IB_Alpha', pending: 0, paid: 12500, totalEarned: 45200 },
  { ibCode: 'IB_Beta', pending: 1850, paid: 8200, totalEarned: 10050 },
];

export default function AdminIbCommission() {
  const [statusFilter, setStatusFilter] = useState('');
  const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

  const filteredLedger = statusFilter ? MOCK_LEDGER.filter((r) => r.status.toLowerCase() === statusFilter) : MOCK_LEDGER;

  return (
    <div className="page admin-page admin-ib-commission">
      <header className="page-header">
        <h1>IB & commission</h1>
        <p className="page-subtitle">Commission ledger per trade, IB wallet and payout workflow, pending vs paid</p>
      </header>

      <section className="admin-section-block">
        <h2 className="section-title">IB wallets summary</h2>
        <div className="kpi-cards kpi-cards-overview">
          {MOCK_IB_WALLETS.map((w) => (
            <div key={w.ibCode} className="kpi-card">
              <h3>{w.ibCode}</h3>
              <p className="kpi-value">{formatCurrency(w.pending + w.paid)}</p>
              <span className="kpi-meta">Pending: {formatCurrency(w.pending)} · Paid: {formatCurrency(w.paid)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Commission ledger</h2>
        <div className="settings-card">
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table kpi-table">
            <thead>
              <tr>
                <th>Trade</th>
                <th>IB</th>
                <th>Client account</th>
                <th>Symbol</th>
                <th>Lots</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Paid at</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.map((r) => (
                <tr key={r.id}>
                  <td>{r.tradeId}</td>
                  <td><strong>{r.ibCode}</strong></td>
                  <td>{r.clientAccount}</td>
                  <td>{r.symbol}</td>
                  <td>{r.lots}</td>
                  <td>{formatCurrency(r.commission)}</td>
                  <td><span className={`status-badge status-${r.status.toLowerCase()}`}>{r.status}</span></td>
                  <td>{r.paidAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section-block">
        <h2 className="section-title">Payout workflow</h2>
        <div className="settings-card">
          <p className="muted">Approve pending commission for payout. Requests are logged in Audit. (Connect to backend for real workflow.)</p>
          <button type="button" className="btn btn-primary">Process pending payouts</button>
        </div>
      </section>
    </div>
  );
}
