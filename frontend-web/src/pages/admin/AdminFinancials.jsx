import React, { useState } from 'react';
import {
  financialSummary,
  profitLoss,
  balanceSheet,
  brokerPnl,
  exposureBySymbol,
  pendingPayouts,
  payoutHistory,
  reportTypes,
} from './mockFinancialsData';

function toDateString(d) {
  return d.toISOString().slice(0, 10);
}

export default function AdminFinancials() {
  const today = toDateString(new Date());
  const [dateFrom, setDateFrom] = useState('2025-02-01');
  const [dateTo, setDateTo] = useState('2025-02-21');
  const [reportType, setReportType] = useState('financial_summary');
  const [preset, setPreset] = useState('');

  const formatCurrency = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const formatNum = (n) => new Intl.NumberFormat('en-US').format(n);

  const applyPreset = (period) => {
    setPreset(period);
    const end = new Date();
    const start = new Date();
    if (period === 'daily') {
      start.setTime(end.getTime());
      setDateFrom(toDateString(start));
      setDateTo(toDateString(end));
    } else if (period === 'weekly') {
      start.setDate(start.getDate() - 6);
      setDateFrom(toDateString(start));
      setDateTo(toDateString(end));
    } else if (period === 'monthly') {
      start.setDate(start.getDate() - 29);
      setDateFrom(toDateString(start));
      setDateTo(toDateString(end));
    }
  };

  const handleExportCSV = () => {
    // TODO: call API or generate client-side
    alert(`Export CSV: ${reportType} (${dateFrom} to ${dateTo})`);
  };

  const handleExportPDF = () => {
    // TODO: call API or generate client-side
    alert(`Export PDF: ${reportType} (${dateFrom} to ${dateTo})`);
  };

  return (
    <div className="page admin-page admin-financials">
      <header className="page-header">
        <h1>Financials</h1>
        <p className="page-subtitle">Financial data, payouts and reports</p>
      </header>

      {/* Date range filter */}
      <section className="financials-filters">
        <div className="filter-group date-presets">
          <label>Period</label>
          <div className="date-preset-btns">
            <button
              type="button"
              className={`btn btn-preset ${preset === 'daily' ? 'active' : ''}`}
              onClick={() => applyPreset('daily')}
            >
              Daily
            </button>
            <button
              type="button"
              className={`btn btn-preset ${preset === 'weekly' ? 'active' : ''}`}
              onClick={() => applyPreset('weekly')}
            >
              Weekly
            </button>
            <button
              type="button"
              className={`btn btn-preset ${preset === 'monthly' ? 'active' : ''}`}
              onClick={() => applyPreset('monthly')}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className="filter-group">
          <label>From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPreset(''); }}
            className="filter-input date-picker"
            max={dateTo}
          />
        </div>
        <div className="filter-group">
          <label>To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPreset(''); }}
            className="filter-input date-picker"
            min={dateFrom}
          />
        </div>
      </section>

      {/* Financial data summary */}
      <section className="financials-section">
        <h2 className="section-title">Financial summary</h2>
        <div className="kpi-cards kpi-cards-overview">
          <div className="kpi-card">
            <h3>Total deposits</h3>
            <p className="kpi-value">{formatCurrency(financialSummary.totalDeposits)}</p>
            <span className="kpi-meta">{formatNum(financialSummary.depositCount)} transactions</span>
          </div>
          <div className="kpi-card">
            <h3>Total withdrawals</h3>
            <p className="kpi-value">{formatCurrency(financialSummary.totalWithdrawals)}</p>
            <span className="kpi-meta">{formatNum(financialSummary.withdrawalCount)} transactions</span>
          </div>
          <div className="kpi-card">
            <h3>Total revenue</h3>
            <p className="kpi-value">{formatCurrency(financialSummary.totalRevenue)}</p>
            <span className="kpi-meta">Gross</span>
          </div>
          <div className="kpi-card">
            <h3>Total earnings</h3>
            <p className="kpi-value">{formatCurrency(financialSummary.totalEarnings)}</p>
            <span className="kpi-meta">Net after costs</span>
          </div>
          <div className="kpi-card">
            <h3>Commission pending</h3>
            <p className="kpi-value">{formatCurrency(financialSummary.commissionPending)}</p>
            <span className="kpi-meta">Awaiting payout</span>
          </div>
          <div className="kpi-card">
            <h3>Net balance</h3>
            <p className="kpi-value">{formatCurrency(financialSummary.netBalance)}</p>
            <span className="kpi-meta">Deposits − Withdrawals</span>
          </div>
        </div>
      </section>

      {/* Broker P&L dashboard */}
      <section className="financials-section">
        <h2 className="section-title">Broker P&L dashboard</h2>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>Spread, commission, LP cost and net broker revenue.</p>
        <div className="kpi-cards kpi-cards-overview">
          <div className="kpi-card">
            <h3>Spread</h3>
            <p className="kpi-value">{formatCurrency(brokerPnl.spread)}</p>
          </div>
          <div className="kpi-card">
            <h3>Commission</h3>
            <p className="kpi-value">{formatCurrency(brokerPnl.commission)}</p>
          </div>
          <div className="kpi-card">
            <h3>LP cost</h3>
            <p className="kpi-value">{formatCurrency(brokerPnl.lpCost)}</p>
          </div>
          <div className="kpi-card">
            <h3>Net broker revenue</h3>
            <p className="kpi-value">{formatCurrency(brokerPnl.netBrokerRevenue)}</p>
          </div>
        </div>
      </section>

      {/* Exposure dashboard */}
      <section className="financials-section">
        <h2 className="section-title">Exposure dashboard</h2>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>Buy/Sell per symbol (lots). Settlement and reconciliation reporting.</p>
        <div className="table-wrap">
          <table className="table kpi-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Buy (lots)</th>
                <th>Sell (lots)</th>
                <th>Net exposure</th>
              </tr>
            </thead>
            <tbody>
              {exposureBySymbol.map((row) => (
                <tr key={row.symbol}>
                  <td><strong>{row.symbol}</strong></td>
                  <td>{row.buyLots}</td>
                  <td>{row.sellLots}</td>
                  <td className={row.netExposure >= 0 ? 'positive' : 'negative'}>{row.netExposure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* P&L */}
      <section className="financials-section">
        <h2 className="section-title">P&L (Profit & Loss)</h2>
        <div className="financial-report-block pnl-block">
          <div className="report-half">
            <h3 className="subsection-title">Income</h3>
            <table className="table financial-table">
              <tbody>
                {profitLoss.income.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="amount">{formatCurrency(row.value)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td><strong>Total income</strong></td>
                  <td className="amount"><strong>{formatCurrency(profitLoss.totalIncome)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="report-half">
            <h3 className="subsection-title">Expenses</h3>
            <table className="table financial-table">
              <tbody>
                {profitLoss.expenses.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="amount">({formatCurrency(row.value)})</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td><strong>Total expenses</strong></td>
                  <td className="amount"><strong>({formatCurrency(profitLoss.totalExpenses)})</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="pnl-net">
          <span className="pnl-net-label">Net P&L</span>
          <span className="pnl-net-value">{formatCurrency(profitLoss.netPnL)}</span>
        </div>
      </section>

      {/* Balance sheet */}
      <section className="financials-section">
        <h2 className="section-title">Balance sheet</h2>
        <div className="financial-report-block balance-sheet-block">
          <div className="report-third">
            <h3 className="subsection-title">Assets</h3>
            <table className="table financial-table">
              <tbody>
                {balanceSheet.assets.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="amount">{formatCurrency(row.value)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td><strong>Total assets</strong></td>
                  <td className="amount"><strong>{formatCurrency(balanceSheet.totalAssets)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="report-third">
            <h3 className="subsection-title">Liabilities</h3>
            <table className="table financial-table">
              <tbody>
                {balanceSheet.liabilities.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="amount">{formatCurrency(row.value)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td><strong>Total liabilities</strong></td>
                  <td className="amount"><strong>{formatCurrency(balanceSheet.totalLiabilities)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="report-third">
            <h3 className="subsection-title">Equity</h3>
            <table className="table financial-table">
              <tbody>
                {balanceSheet.equity.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="amount">{formatCurrency(row.value)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td><strong>Total equity</strong></td>
                  <td className="amount"><strong>{formatCurrency(balanceSheet.totalEquity)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Payout data */}
      <section className="financials-section">
        <h2 className="section-title">Payout data</h2>
        <div className="payouts-grid">
          <div className="payout-block">
            <h3 className="subsection-title">Pending payouts</h3>
            <div className="table-wrap">
              <table className="table kpi-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Recipient</th>
                    <th>Amount</th>
                    <th>Requested</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPayouts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>{p.type}</td>
                      <td><strong>{p.recipient}</strong></td>
                      <td>{formatCurrency(p.amount)}</td>
                      <td>{p.requestedAt}</td>
                      <td><span className="status-badge status-pending">{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="payout-block">
            <h3 className="subsection-title">Payout history</h3>
            <div className="table-wrap">
              <table className="table kpi-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Recipient</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutHistory.map((p) => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>{p.type}</td>
                      <td><strong>{p.recipient}</strong></td>
                      <td>{formatCurrency(p.amount)}</td>
                      <td>{p.paidAt}</td>
                      <td><span className="status-badge status-paid">{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Report options */}
      <section className="financials-section report-options-section">
        <h2 className="section-title">Report options</h2>
        <div className="report-options-card">
          <p className="report-options-desc">Generate and download reports for the selected period. Choose report type and export as CSV or PDF.</p>
          <div className="report-options-row">
            <div className="filter-group">
              <label>Report type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="filter-select report-type-select"
              >
                {reportTypes.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="filter-group date-presets">
              <label>Period</label>
              <div className="date-preset-btns">
                <button
                  type="button"
                  className={`btn btn-preset ${preset === 'daily' ? 'active' : ''}`}
                  onClick={() => applyPreset('daily')}
                >
                  Daily
                </button>
                <button
                  type="button"
                  className={`btn btn-preset ${preset === 'weekly' ? 'active' : ''}`}
                  onClick={() => applyPreset('weekly')}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  className={`btn btn-preset ${preset === 'monthly' ? 'active' : ''}`}
                  onClick={() => applyPreset('monthly')}
                >
                  Monthly
                </button>
              </div>
            </div>
            <div className="filter-group">
              <label>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPreset(''); }}
                className="filter-input date-picker"
                max={dateTo}
              />
            </div>
            <div className="filter-group">
              <label>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPreset(''); }}
                className="filter-input date-picker"
                min={dateFrom}
              />
            </div>
          </div>
          <div className="report-actions">
            <button type="button" className="btn btn-primary" onClick={handleExportCSV}>
              Export CSV
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleExportPDF}>
              Export PDF
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
