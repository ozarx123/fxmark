import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as adminApi from '../../api/adminApi';

function toDateString(d) {
  return d.toISOString().slice(0, 10);
}

/** Drill-down to platform ledger for selected period */
function ledgerDrillUrl(from, to, extra = {}) {
  const q = new URLSearchParams({ from, to });
  Object.entries(extra).forEach(([k, v]) => {
    if (v != null && v !== '') q.set(k, v);
  });
  return `/admin/financials/ledger?${q.toString()}`;
}

export default function AdminFinancials() {
  const [dateFrom, setDateFrom] = useState(() => {
    const s = new Date();
    s.setDate(s.getDate() - 29);
    return toDateString(s);
  });
  const [dateTo, setDateTo] = useState(() => toDateString(new Date()));
  const [preset, setPreset] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [companyWallet, setCompanyWallet] = useState(null);
  const [companyWalletLoading, setCompanyWalletLoading] = useState(false);
  const [companyWalletError, setCompanyWalletError] = useState(null);

  const formatCurrency = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
      n ?? 0
    );
  const formatNum = (n) => new Intl.NumberFormat('en-US').format(n ?? 0);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const json = await adminApi.getCompanyFinancials({ from: dateFrom, to: dateTo });
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load company financials');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      try {
        setCompanyWalletLoading(true);
        setCompanyWalletError(null);
        const json = await adminApi.getCompanyWallet();
        if (!cancelled) setCompanyWallet(json);
      } catch (e) {
        if (!cancelled) setCompanyWalletError(e.message || 'Failed to load company wallet');
      } finally {
        if (!cancelled) setCompanyWalletLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const s = data?.summary;
  const period = data?.period;

  const handleExportCompanyCsv = () => {
    if (!data?.periodActivity?.length) return;
    const headers = ['Account code', 'Account name', 'Debits (period)', 'Credits (period)', 'Entry count'];
    const rows = data.periodActivity.map((r) => [
      r.accountCode,
      `"${String(r.accountName).replace(/"/g, '""')}"`,
      r.debit,
      r.credit,
      r.entryCount,
    ]);
    const csv = [headers.join(','), ...rows.map((c) => c.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `company-ledger-activity-${period?.from || dateFrom}_to_${period?.to || dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page admin-page admin-financials">
      <header className="page-header">
        <h1>Company financials</h1>
        <p className="page-subtitle">
          Platform-wide ledger aggregates — client wallet liability, company cash, revenue/expense by account, and IB
          commission obligations. Not your personal account.
        </p>
      </header>

      <section className="financials-filters" aria-label="Reporting period">
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
          <label htmlFor="fin-from">From</label>
          <input
            id="fin-from"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPreset('');
            }}
            className="filter-input date-picker"
            max={dateTo}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="fin-to">To</label>
          <input
            id="fin-to"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPreset('');
            }}
            className="filter-input date-picker"
            min={dateFrom}
          />
        </div>
      </section>

      {loading && <p className="muted">Loading company financials…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && s && (
        <>
          <section className="financials-section financials-section-super-wallet">
            <h2 className="section-title">Company super wallet</h2>
            <p className="muted section-lead">
              Main ledger and wallet of the platform. All company income, expenses, liabilities and assets connect here.
              Not owned by any user; superadmins and admin-panel roles have full access.
            </p>
            {companyWalletLoading && <p className="muted">Loading company wallet…</p>}
            {companyWalletError && <p className="form-error">{companyWalletError}</p>}
            {!companyWalletLoading && !companyWalletError && companyWallet && (
              <div className="super-wallet-summary">
                <div className="super-wallet-wallet">
                  <h3>Wallet (company entity)</h3>
                  <p className="super-wallet-balance">
                    <strong>{formatCurrency(companyWallet.wallet?.balance)}</strong> {companyWallet.wallet?.currency ?? 'USD'}
                    {companyWallet.wallet?.locked != null && companyWallet.wallet.locked !== 0 && (
                      <span className="muted"> (locked: {formatCurrency(companyWallet.wallet.locked)})</span>
                    )}
                  </p>
                </div>
                <div className="super-wallet-ledger">
                  <h3>Ledger balances (company entity)</h3>
                  <ul className="super-wallet-balance-list">
                    {companyWallet.ledgerBalances?.map((b) => (
                      <li key={b.accountCode}>
                        <span className="account-code">{b.accountCode}</span> {b.accountName}: {formatCurrency(b.balance)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>

          <section className="financials-section">
            <h2 className="section-title">Company overview — key metrics</h2>
            <p className="muted section-lead">
              Period {period?.from} → {period?.to}. Balance sheet as of <strong>{period?.asOf}</strong>.{' '}
              <strong>Click any metric</strong> to open platform ledger lines for this period.
            </p>
            <div className="kpi-cards kpi-cards-overview">
              <Link
                className="kpi-card kpi-card--ledger"
                to={ledgerDrillUrl(dateFrom, dateTo, {
                  accountCode: '2110',
                  title: encodeURIComponent('Client wallet — account 2110'),
                })}
              >
                <h3>Client wallet liability</h3>
                <p className="kpi-value">{formatCurrency(s.clientWalletLiabilityUsd)}</p>
                <span className="kpi-meta">Platform owes clients (ledger 2110)</span>
              </Link>
              <Link
                className="kpi-card kpi-card--ledger"
                to={ledgerDrillUrl(dateFrom, dateTo, {
                  accountCode: '1200',
                  title: encodeURIComponent('Company cash / bank — 1200'),
                })}
              >
                <h3>Company cash / bank</h3>
                <p className="kpi-value">{formatCurrency(s.companyCashBankUsd)}</p>
                <span className="kpi-meta">
                  Asset — ledger 1200 (company entity)
                  {s.companyCashBankPlatformTotalUsd != null &&
                    Math.abs(s.companyCashBankPlatformTotalUsd - s.companyCashBankUsd) > 0.01 && (
                      <span className="kpi-meta-warn" title="Platform total 1200 (all entities) differs; run scripts/inspect-ledger-1200-by-entity.js">
                        {' '}
                        — Platform total: {formatCurrency(s.companyCashBankPlatformTotalUsd)}
                      </span>
                    )}
                </span>
              </Link>
              <Link
                className="kpi-card kpi-card--ledger"
                to={ledgerDrillUrl(dateFrom, dateTo, {
                  accountCode: '2110',
                  referenceType: 'deposit',
                  title: encodeURIComponent('Deposits — wallet legs'),
                })}
              >
                <h3>Deposits (period)</h3>
                <p className="kpi-value">{formatCurrency(s.depositsInPeriodUsd)}</p>
                <span className="kpi-meta">Wallet credits — deposits</span>
              </Link>
              <Link
                className="kpi-card kpi-card--ledger"
                to={ledgerDrillUrl(dateFrom, dateTo, {
                  accountCode: '2110',
                  referenceType: 'withdrawal',
                  title: encodeURIComponent('Withdrawals — wallet legs'),
                })}
              >
                <h3>Withdrawals (period)</h3>
                <p className="kpi-value">{formatCurrency(s.withdrawalsInPeriodUsd)}</p>
                <span className="kpi-meta">Wallet debits — withdrawals</span>
              </Link>
              <Link
                className="kpi-card kpi-card--ledger"
                to={ledgerDrillUrl(dateFrom, dateTo, {
                  accountCode: '1300',
                  referenceType: 'commission',
                  title: encodeURIComponent('IB commission — receivable legs (1300)'),
                })}
              >
                <h3>IB commission pending</h3>
                <p className="kpi-value">{formatCurrency(s.ibCommissionPendingUsd)}</p>
                <span className="kpi-meta">{formatNum(s.ibCommissionPendingCount)} open items — accrual ledger</span>
              </Link>
              <Link
                className="kpi-card kpi-card--ledger"
                to={ledgerDrillUrl(dateFrom, dateTo, {
                  accountCode: '1300',
                  title: encodeURIComponent('Receivables — 1300'),
                })}
              >
                <h3>Receivables</h3>
                <p className="kpi-value">{formatCurrency(s.receivablesUsd)}</p>
                <span className="kpi-meta">Ledger 1300</span>
              </Link>
              <Link
                className="kpi-card kpi-card--ledger"
                to={ledgerDrillUrl(dateFrom, dateTo, {
                  accountClass: 'revenue',
                  title: encodeURIComponent('Revenue accounts (4xxx)'),
                })}
              >
                <h3>Revenue (period, 4xxx)</h3>
                <p className="kpi-value">{formatCurrency(s.revenueRecognizedPeriodUsd)}</p>
                <span className="kpi-meta">Net credit activity</span>
              </Link>
              <Link
                className="kpi-card kpi-card--ledger"
                to={ledgerDrillUrl(dateFrom, dateTo, {
                  accountClass: 'expense',
                  title: encodeURIComponent('Expense accounts (5xxx)'),
                })}
              >
                <h3>Expenses (period, 5xxx)</h3>
                <p className="kpi-value">{formatCurrency(s.expensesRecognizedPeriodUsd)}</p>
                <span className="kpi-meta">Net debit activity</span>
              </Link>
              <Link
                className="kpi-card kpi-card--ledger"
                to={ledgerDrillUrl(dateFrom, dateTo, {
                  accountClass: 'pl',
                  title: encodeURIComponent('Revenue & expense lines (4xxx / 5xxx)'),
                })}
              >
                <h3>Net operating (period)</h3>
                <p className={`kpi-value ${s.netOperatingPeriodUsd >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(s.netOperatingPeriodUsd)}
                </p>
                <span className="kpi-meta">Revenue − expenses (ledger)</span>
              </Link>
            </div>
          </section>

          <section className="financials-section">
            <div className="section-title-row">
              <h2 className="section-title">Company ledger activity by account</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportCompanyCsv}>
                Export CSV
              </button>
            </div>
            <p className="muted section-lead">
              Total debits and credits posted in the period, grouped by chart account (all clients).
            </p>
            <div className="table-wrap">
              <table className="table financial-table">
                <thead>
                  <tr>
                    <th scope="col">Account code</th>
                    <th scope="col">Account name</th>
                    <th scope="col" className="amount">
                      Debits
                    </th>
                    <th scope="col" className="amount">
                      Credits
                    </th>
                    <th scope="col" className="amount">
                      Entries
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!data.periodActivity?.length ? (
                    <tr>
                      <td colSpan={5} className="empty-cell">
                        No ledger activity in this period.
                      </td>
                    </tr>
                  ) : (
                    data.periodActivity.map((r) => (
                      <tr key={r.accountCode}>
                        <td>
                          <Link
                            to={ledgerDrillUrl(dateFrom, dateTo, {
                              accountCode: r.accountCode,
                              title: encodeURIComponent(`${r.accountName} (${r.accountCode})`),
                            })}
                            className="financials-ledger-account-link"
                          >
                            <code>{r.accountCode}</code>
                          </Link>
                        </td>
                        <td>
                          <Link
                            to={ledgerDrillUrl(dateFrom, dateTo, {
                              accountCode: r.accountCode,
                              title: encodeURIComponent(`${r.accountName} (${r.accountCode})`),
                            })}
                            className="financials-ledger-account-link"
                          >
                            {r.accountName}
                          </Link>
                        </td>
                        <td className="amount">{Number(r.debit || 0).toFixed(2)}</td>
                        <td className="amount">{Number(r.credit || 0).toFixed(2)}</td>
                        <td className="amount">{formatNum(r.entryCount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="financials-section">
            <h2 className="section-title">Company P&amp;L — period summary</h2>
            <p className="muted section-lead">Revenue (4xxx) and expense (5xxx) accounts with movement in the selected range.</p>
            <div className="financial-report-block pnl-block">
              <div className="report-half">
                <h3 className="subsection-title">Revenue accounts</h3>
                <table className="table financial-table">
                  <thead>
                    <tr>
                      <th scope="col">Line</th>
                      <th scope="col" className="amount">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pl?.income?.length ? (
                      data.pl.income.map((row) => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td className="amount">{formatCurrency(row.value)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="empty-cell muted">
                          No revenue account activity
                        </td>
                      </tr>
                    )}
                    <tr className="total-row">
                      <th scope="row">Total revenue (period)</th>
                      <td className="amount">
                        <strong>{formatCurrency(data.pl?.totalIncome ?? 0)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="report-half">
                <h3 className="subsection-title">Expense accounts</h3>
                <table className="table financial-table">
                  <thead>
                    <tr>
                      <th scope="col">Line</th>
                      <th scope="col" className="amount">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pl?.expenses?.length ? (
                      data.pl.expenses.map((row) => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td className="amount">{formatCurrency(row.value)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="empty-cell muted">
                          No expense account activity
                        </td>
                      </tr>
                    )}
                    <tr className="total-row">
                      <th scope="row">Total expenses (period)</th>
                      <td className="amount">
                        <strong>{formatCurrency(data.pl?.totalExpenses ?? 0)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="pnl-net">
              <span className="pnl-net-label">Net P&amp;L (period)</span>
              <span className={`pnl-net-value ${(data.pl?.netPnL ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(data.pl?.netPnL ?? 0)}
              </span>
            </div>
          </section>

          <section className="financials-section">
            <h2 className="section-title">Company balance sheet — position as of {period?.asOf}</h2>
            <p className="muted section-lead">Cumulative signed balance per account (platform-wide).</p>
            <div className="financial-report-block balance-sheet-block">
              <div className="report-third">
                <h3 className="subsection-title">Assets</h3>
                <table className="table financial-table">
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col" className="amount">
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.balanceSheet?.assets?.length ? (
                      data.balanceSheet.assets.map((row) => (
                        <tr key={row.accountCode}>
                          <td>{row.accountName}</td>
                          <td className="amount">{formatCurrency(row.balance)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="empty-cell muted">
                          —
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="report-third">
                <h3 className="subsection-title">Liabilities</h3>
                <table className="table financial-table">
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col" className="amount">
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.balanceSheet?.liabilities?.length ? (
                      data.balanceSheet.liabilities.map((row) => (
                        <tr key={row.accountCode}>
                          <td>{row.accountName}</td>
                          <td className="amount">{formatCurrency(row.balance)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="empty-cell muted">
                          —
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="report-third">
                <h3 className="subsection-title">Equity</h3>
                <table className="table financial-table">
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col" className="amount">
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.balanceSheet?.equity?.length ? (
                      data.balanceSheet.equity.map((row) => (
                        <tr key={row.accountCode}>
                          <td>{row.accountName}</td>
                          <td className="amount">{formatCurrency(row.balance)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="empty-cell muted">
                          —
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="financials-section">
            <h2 className="section-title">IB commission — platform obligation</h2>
            <p className="muted section-lead">
              Pending IB commissions across all introducing brokers. Manage payouts in{' '}
              <Link to="/admin/ib-commission">IB &amp; commission</Link>.
            </p>
            <div className="kpi-cards kpi-cards-overview" style={{ maxWidth: '28rem' }}>
              <div className="kpi-card">
                <h3>Total pending</h3>
                <p className="kpi-value">{formatCurrency(s.ibCommissionPendingUsd)}</p>
                <span className="kpi-meta">{formatNum(s.ibCommissionPendingCount)} commission records</span>
              </div>
            </div>
          </section>

          <section className="financials-section report-options-section">
            <h2 className="section-title">Exports &amp; other reports</h2>
            <div className="report-options-card">
              <p className="report-options-desc">
                <strong>Company ledger activity</strong> for the selected period can be exported as CSV from the table
                above. Personal account statements (PDF/CSV) are available from the client app under Finance — they are
                not shown here.
              </p>
            </div>
          </section>

          {data.note && (
            <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
              {data.note}
            </p>
          )}
        </>
      )}
    </div>
  );
}
